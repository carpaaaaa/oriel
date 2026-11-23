// Where Search's own passwords live on Windows (studio/05 §2.1, §2.11 way 1):
// vault.json, one row per account with the site, the name, when it was last
// used and whether it came from plain http, and the password sealed with
// AES-256-GCM under a random key. That key is kept sealed by Windows (DPAPI,
// through Electron's safeStorage), so the file is useless off this account.
//
// Lists never read a secret (Vault.Kept): a secret is opened only for the
// one account being filled, shown or copied.

import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import type { KeptLogin } from '../../shared/modules/data'
import { writeJSONNow } from '../model/persist'
import { model } from '../model/model'
import { dataFile, probe } from '../paths'
import { registrable } from './urls'

interface Row {
  host: string
  user: string
  /** ms since 1970 */
  used?: number
  clear?: boolean
  created: number
  /** base64 of iv (12) + ciphertext + tag (16) */
  secret: string
}

interface VaultFile { format: 1; key: string; logins: Row[] }

const fileName = 'vault.json'
let cache: VaultFile | null = null
let openKey: Buffer | null = null

/** How the vault's own key is sealed: by Windows (DPAPI) through safeStorage.
 * A test world on a Mac or Linux seals it with nothing, and says so, rather
 * than filling the login keychain with test keys. */
const sealer = {
  testing: !!probe && process.platform !== 'win32',
  seal(key: Buffer): string {
    if (this.testing) return 'test:' + key.toString('base64')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('no protection for the key on this system')
    return 'safe:' + safeStorage.encryptString(key.toString('base64')).toString('base64')
  },
  open(sealed: string): Buffer {
    if (sealed.startsWith('test:')) {
      if (!this.testing) throw new Error('a test vault outside a test world')
      return Buffer.from(sealed.slice(5), 'base64')
    }
    if (sealed.startsWith('safe:')) return Buffer.from(safeStorage.decryptString(Buffer.from(sealed.slice(5), 'base64')), 'base64')
    throw new Error('unknown key')
  },
}

function load(): VaultFile {
  if (cache) return cache
  const file = dataFile(fileName)
  if (existsSync(file)) {
    try {
      const v = JSON.parse(readFileSync(file, 'utf8')) as VaultFile
      if (v.format !== 1 || typeof v.key !== 'string' || !Array.isArray(v.logins)) throw new Error('not a vault')
      cache = v
      return v
    } catch {
      // Kept aside, never written over: its passwords may still be opened.
      try { renameSync(file, dataFile(`vault.unreadable-${Math.floor(Date.now() / 1000)}.json`)) } catch {}
    }
  }
  const key = randomBytes(32)
  cache = { format: 1, key: sealer.seal(key), logins: [] }
  openKey = key
  return cache
}

function key(): Buffer {
  const v = load()
  return (openKey ??= sealer.open(v.key))
}

function write(): void { writeJSONNow(fileName, load()) }

const aad = (host: string, user: string) => Buffer.from(host + '\u0001' + user, 'utf8')

function seal(host: string, user: string, password: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  c.setAAD(aad(host, user))
  const body = Buffer.concat([c.update(password, 'utf8'), c.final()])
  return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64')
}

function unseal(row: Row): string | null {
  try {
    const raw = Buffer.from(row.secret, 'base64')
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
    d.setAAD(aad(row.host, row.user))
    d.setAuthTag(raw.subarray(raw.length - 16))
    return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString('utf8')
  } catch { return null }
}

const view = (r: Row): KeptLogin => ({ host: r.host, user: r.user, ...(r.used ? { used: r.used } : {}), ...(r.clear ? { clear: true } : {}) })
const newest = (a: Row, b: Row) => (b.used ?? 0) - (a.used ?? 0)

export const vault = {
  /** Everything kept, without secrets, by site then name. */
  all(): KeptLogin[] {
    return [...load().logins].sort((a, b) => a.host === b.host ? a.user.localeCompare(b.user) : a.host.localeCompare(b.host)).map(view)
  },

  /** The host's own accounts first, then (wide) the same site's other hosts,
   * each group newest first (Vault.kept(matching:wide:)). */
  matching(host: string, wide = true): KeptLogin[] {
    const rows = load().logins
    const exact = rows.filter(r => r.host === host).sort(newest)
    const domain = registrable(host)
    const wider = wide ? rows.filter(r => r.host !== host && registrable(r.host) === domain).sort(newest) : []
    return [...exact, ...wider].map(view)
  },

  has(host: string, user: string): boolean { return load().logins.some(r => r.host === host && r.user === user) },

  /** One account's password, for a fill, a Show or a Copy. */
  secret(host: string, user: string): string | null {
    const row = load().logins.find(r => r.host === host && r.user === user)
    return row ? unseal(row) : null
  },

  /** Saved, or updated when the account is kept: bringing the same in again
   * adds nothing twice (Vault.save). */
  save(host: string, user: string, password: string, used?: number | null, clear = false): boolean {
    if (!host || !password) return false
    try {
      const v = load()
      const secret = seal(host, user, password)
      const row = v.logins.find(r => r.host === host && r.user === user)
      if (row) {
        row.secret = secret
        if (used) row.used = used
        if (clear) row.clear = true
        else delete row.clear
      } else {
        v.logins.push({ host, user, ...(used ? { used } : {}), ...(clear ? { clear: true } : {}), created: Date.now(), secret })
      }
      write()
      return true
    } catch { return false }
  },

  /** Several at once, written once (an import). */
  saveMany(list: { host: string; user: string; password: string; used?: number | null; clear?: boolean }[]): number {
    let kept = 0
    const v = load()
    for (const l of list) {
      if (!l.host || !l.password) continue
      try {
        const secret = seal(l.host, l.user, l.password)
        const row = v.logins.find(r => r.host === l.host && r.user === l.user)
        if (row) { row.secret = secret; if (l.used && (!row.used || l.used > row.used)) row.used = l.used; if (l.clear) row.clear = true }
        else v.logins.push({ host: l.host, user: l.user, ...(l.used ? { used: l.used } : {}), ...(l.clear ? { clear: true } : {}), created: Date.now(), secret })
        kept++
      } catch {}
    }
    if (kept) write()
    return kept
  },

  /** Just used to sign in: lists put it first from now on (Vault.touch). */
  touch(host: string, user: string, clear?: boolean): void {
    const row = load().logins.find(r => r.host === host && r.user === user)
    if (!row) return
    row.used = Date.now()
    if (clear != null) { if (clear) row.clear = true; else delete row.clear }
    write()
  },

  forget(host: string, user: string): boolean {
    const v = load()
    const before = v.logins.length
    v.logins = v.logins.filter(r => !(r.host === host && r.user === user))
    if (v.logins.length === before) return false
    write()
    return true
  },

  /** Read again from the file (a test that changes it from outside). */
  reload(): void { cache = null; openKey = null },
}

// sites told never to ask (05 §2.6): settings key passwords.never

export const never = {
  list(): string[] { return (model.pref<string[]>('passwords.never') ?? []).slice() },
  add(hosts: string[]): void {
    const set = new Set(never.list())
    for (const h of hosts) if (h) set.add(h)
    model.setPref('passwords.never', [...set].sort())
  },
  has(host: string): boolean {
    const set = new Set(never.list())
    return set.has(host) || set.has(registrable(host))
  },
  clear(): void { model.setPref('passwords.never', []) },
}
