// Passwords from another browser (studio/05 §1.3, §1.5, §1.13; studio/07
// §2.2-2.6):
//  - Chromium on Windows: only values starting "v10" (or the old bare DPAPI
//    blobs), with the key from Local State opened by DPAPI, and only after
//    the person said yes in the panel. Values starting "v20" are bound to
//    their browser by App-Bound Encryption: counted, never tried, and the
//    panel leads to that browser's CSV export instead.
//  - Firefox and Zen: logins.json and key4.db, without a primary password.
// Everything lands in Search's vault; an import only ever adds passwords.

import path from 'node:path'
import { createDecipheriv } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { ImportSaid } from '../../shared/modules/data'
import { never, vault } from '../data/vault'
import { records } from '../data/meta'
import { siteHost } from '../data/urls'
import type { ChromiumSource, GeckoSource, Source } from './sources'
import { loginFiles, loginRows } from './chromium'
import { profilesFor as geckoProfiles } from './gecko'
import { localState } from './sources'
import { Locked, readJSONIn } from './read'
import { available as dpapiAvailable, unprotect } from './dpapi'
import { decryptLogin, masterKey, PrimaryPassword } from './nss'
import { n } from './bring'
import { appName } from '../../shared/modules/data'

export interface Login { host: string; user: string; password: string; used: number | null; clear: boolean }

export interface Found {
  logins: Login[]
  never: string[]
  /** No site to go with. */
  skipped: number
  /** There, but didn't open with the browser's key. */
  undecrypted: number
  /** Bound to the browser itself (v20): only its CSV brings them. */
  locked: number
}

export type Outcome =
  | { ok: true; found: Found; kept: number }
  | { ok: false; error: 'consent' | 'noKey' | 'primary' | 'unreadable' | 'locked' | 'busy' }

/** How a browser's passwords come: read here, read after a yes, only by its
 * CSV export, or not at all. */
export function passwordMode(source: Source): 'read' | 'consent' | 'csv' | 'none' {
  if (source.family === 'gecko') return 'read'
  if (!source.importsPasswords) return 'none'
  return dpapiAvailable() ? 'consent' : 'csv'
}

const utf8 = new TextDecoder('utf-8', { fatal: true })
const dpapiHeader = Buffer.from('01000000d08c9ddf0115d1118c7a00c04fc297eb', 'hex')

/** v10/v11: AES-256-GCM, nonce 12, tag 16. Newer builds put a 32-byte hash
 * of the site before the password. */
function openGCM(blob: Buffer, key: Buffer): string | null {
  if (blob.length < 3 + 12 + 16) return null
  try {
    const d = createDecipheriv('aes-256-gcm', key, blob.subarray(3, 15))
    d.setAuthTag(blob.subarray(blob.length - 16))
    const plain = Buffer.concat([d.update(blob.subarray(15, blob.length - 16)), d.final()])
    try { return utf8.decode(plain) } catch {}
    return plain.length > 32 ? utf8.decode(plain.subarray(32)) : null
  } catch { return null }
}

/** The browser's own key, from Local State, opened by DPAPI. */
function chromiumKey(root: string): Buffer | null {
  const encrypted = (localState(root).raw as any)?.os_crypt?.encrypted_key
  if (typeof encrypted !== 'string') return null
  const raw = Buffer.from(encrypted, 'base64')
  if (raw.subarray(0, 5).toString() !== 'DPAPI') return null
  const key = unprotect(raw.subarray(5))
  return key && key.length === 32 ? key : null
}

function readChromium(source: ChromiumSource, profile: string | null): Found | Outcome {
  const logins: Login[] = []
  const neverHosts: string[] = []
  let skipped = 0, undecrypted = 0, locked = 0, readAny = false, keyless = false
  const seen = new Set<string>()
  const keys = new Map<string, Buffer | null>()
  for (const { file, profile: p } of loginFiles(source, profile)) {
    let rows
    try { rows = loginRows(file, p.root) } catch (e) { if (e instanceof Locked) return { ok: false, error: 'busy' }; throw e }
    if (!rows) continue
    readAny = true
    if (!keys.has(p.root)) keys.set(p.root, chromiumKey(p.root))
    const key = keys.get(p.root)!
    for (const row of rows) {
      const host = siteHost(row.origin)
      if (!host) { if (!row.never && row.blob.length) skipped++; continue }
      if (row.never) { neverHosts.push(host); continue }
      if (!row.blob.length) continue
      const prefix = row.blob.subarray(0, 3).toString('latin1')
      let password: string | null = null
      if (prefix === 'v20') { locked++; continue }
      if (prefix === 'v10' || prefix === 'v11') {
        if (!key) { keyless = true; undecrypted++; continue }
        password = openGCM(row.blob, key)
      } else if (row.blob.subarray(0, dpapiHeader.length).equals(dpapiHeader)) {
        // Before Chrome 80: the password itself sealed by DPAPI.
        const plain = unprotect(row.blob)
        try { password = plain ? utf8.decode(plain) : null } catch { password = null }
      }
      // Anything else is no browser's: a password in the clear in a profile
      // can only have been put there by a program wanting it kept.
      if (password == null) { undecrypted++; continue }
      if (!password) continue
      const login = { host, user: row.user, password, used: row.used, clear: /^http:\/\//i.test(row.origin) }
      const id = host + '\u0001' + row.user
      if (seen.has(id)) continue
      seen.add(id)
      logins.push(login)
    }
  }
  if (!readAny) return { ok: false, error: 'unreadable' }
  if (!logins.length && keyless && !locked) return { ok: false, error: 'noKey' }
  if (!logins.length && locked && !undecrypted) return { ok: false, error: 'locked' }
  return { logins, never: neverHosts, skipped, undecrypted, locked }
}

function readGecko(source: GeckoSource, profile: string | null): Found | Outcome {
  const logins: Login[] = []
  const neverHosts: string[] = []
  let skipped = 0, undecrypted = 0, readAny = false, primary = false
  const seen = new Set<string>()
  for (const p of geckoProfiles(source, profile)) {
    const key4 = path.join(p.dir, 'key4.db'), store = path.join(p.dir, 'logins.json')
    if (!existsSync(key4) || !existsSync(store)) continue
    let master: Buffer
    try { master = masterKey(key4, p.root) } catch (e) {
      if (e instanceof PrimaryPassword) primary = true
      else if (e instanceof Locked) return { ok: false, error: 'busy' }
      continue
    }
    readAny = true
    const doc = readJSONIn<{ logins?: Record<string, unknown>[]; disabledHosts?: unknown[] }>(store, p.root)
    for (const h of doc?.disabledHosts ?? []) { const clean = siteHost(String(h)); if (clean) neverHosts.push(clean) }
    for (const entry of doc?.logins ?? []) {
      if (typeof entry.hostname !== 'string') continue
      const host = siteHost(entry.hostname)
      if (!host) { skipped++; continue }
      if (typeof entry.encryptedUsername !== 'string' || typeof entry.encryptedPassword !== 'string') continue
      const user = decryptLogin(entry.encryptedUsername, master), password = decryptLogin(entry.encryptedPassword, master)
      if (user == null || password == null) { undecrypted++; continue }
      if (!password) continue
      const id = host + '\u0001' + user
      if (seen.has(id)) continue
      seen.add(id)
      logins.push({ host, user, password, used: typeof entry.timeLastUsed === 'number' ? entry.timeLastUsed : null, clear: /^http:\/\//i.test(entry.hostname) })
    }
  }
  // A primary password only matters when nothing else could be read.
  if (!readAny && primary) return { ok: false, error: 'primary' }
  if (!readAny) return { ok: false, error: 'unreadable' }
  return { logins, never: neverHosts, skipped, undecrypted, locked: 0 }
}

/** Read, and kept in the vault; the sites it was told never to ask about
 * join ours (Browser.keep). Never without a yes for a Chromium browser. */
export async function readPasswords(source: Source, profile: string | null, consent: boolean): Promise<Outcome> {
  const mode = passwordMode(source)
  if (mode === 'none' || mode === 'csv') return { ok: false, error: 'locked' }
  if (mode === 'consent' && !consent) return { ok: false, error: 'consent' }
  const found = source.family === 'chromium' ? readChromium(source, profile) : readGecko(source, profile)
  if ('ok' in found) return found
  const kept = vault.saveMany(found.logins)
  never.add(found.never)
  records.note(source.name, { passwords: kept })
  return { ok: true, found, kept }
}

/** The line said after (ImportPanel.bring, adapted for Windows). */
export function passwordsSaid(source: Source, o: Outcome): ImportSaid {
  const name = source.name
  if (!o.ok) {
    switch (o.error) {
      case 'consent': return { ok: false, text: `Passwords not read: allow ${appName} to read ${name}'s passwords, or bring in its CSV file` }
      case 'noKey': return { ok: false, text: `Windows didn't hand over ${name}'s key: export your passwords from it and bring in the CSV file` }
      case 'primary': return { ok: false, text: `${name} has a primary password: export your passwords from it and bring in the CSV file` }
      case 'locked': return { ok: false, text: `${name} locks its passwords to itself: export them from it and bring in the CSV file` }
      case 'busy': return { ok: false, text: `${name} is using its files: close ${name} and try again` }
      default: return { ok: false, text: `No passwords readable in ${name}` }
    }
  }
  const { found, kept } = o
  const skipped = found.skipped > 0 ? ` (${n(found.skipped)} skipped: no address)` : ''
  const undecrypted = found.undecrypted > 0 ? `; ${n(found.undecrypted)} couldn't be decrypted with ${name}'s key` : ''
  const locked = found.locked > 0 ? `; ${n(found.locked)} locked to ${name}: bring those in from its CSV file` : ''
  return {
    ok: kept > 0 || (found.undecrypted === 0 && found.locked === 0),
    text: (kept === 1 ? '1 password' : `${n(kept)} passwords`) + skipped + undecrypted + locked,
  }
}
