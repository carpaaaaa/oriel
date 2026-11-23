// Which browsers there are to bring things over from, and where each keeps
// its profiles: on Windows under %LOCALAPPDATA% or %APPDATA%, on a Mac under
// ~/Library/Application Support (Import.swift Chromium.known / Mozilla.known,
// studio/05 §1.2 and §8, studio/07 §2.1). A test world reads made-up profiles
// from its own Import folder, never a real browser's.

import { app } from 'electron'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { probe } from '../paths'
import { readJSONIn, inside } from './read'

type Where = { base: 'local' | 'roaming'; folder: string }

export interface ChromiumSource {
  family: 'chromium'
  name: string
  win: Where[]
  mac: string[]
  /** Its passwords can be read at all (Yandex, Atlas: no). */
  importsPasswords: boolean
  /** Locks passwords to itself on Windows (App-Bound Encryption, v20):
   * Chrome, Edge, Brave (studio/07 §2.3). Others are found out from the data. */
  appBound: boolean
  /** Where its own passwords page is, for the CSV steps. */
  exportAt: string
}

export interface GeckoSource {
  family: 'gecko'
  name: string
  win: Where[]
  mac: string[]
  exportAt: string
}

export type Source = ChromiumSource | GeckoSource

const chromium = (name: string, win: Where[], mac: string[], exportAt: string, appBound = false): ChromiumSource =>
  ({ family: 'chromium', name, win, mac, importsPasswords: true, appBound, exportAt })
const local = (folder: string): Where => ({ base: 'local', folder })
const roaming = (folder: string): Where => ({ base: 'roaming', folder })

/** P0 browsers (studio/05 §7): Chrome, Edge, Brave, Opera, Opera GX,
 * Vivaldi, Arc, Firefox, Zen. */
export const known: Source[] = [
  chromium('Chrome', [local('Google/Chrome/User Data')], ['Google/Chrome'], 'chrome://password-manager/settings', true),
  chromium('Arc', [local('Packages/TheBrowserCompany.Arc_*/LocalCache/Local/Arc/User Data')], ['Arc/User Data'], 'arc://password-manager/settings'),
  chromium('Brave', [local('BraveSoftware/Brave-Browser/User Data')], ['BraveSoftware/Brave-Browser'], 'brave://password-manager/settings', true),
  chromium('Edge', [local('Microsoft/Edge/User Data')], ['Microsoft Edge'], 'edge://wallet/passwords', true),
  chromium('Vivaldi', [local('Vivaldi/User Data')], ['Vivaldi'], 'vivaldi://password-manager/settings'),
  // Opera keeps its first profile in its own folder, others in _side_profiles.
  chromium('Opera', [roaming('Opera Software/Opera Stable')], ['com.operasoftware.Opera'], 'opera://password-manager/settings'),
  chromium('Opera GX', [roaming('Opera Software/Opera GX Stable')], ['com.operasoftware.OperaGX'], 'opera://password-manager/settings'),
  { family: 'gecko', name: 'Firefox', exportAt: 'about:logins',
    win: [roaming('Mozilla/Firefox/Profiles'), roaming('Mozilla/Firefox'), local('Packages/Mozilla.Firefox_*/LocalCache/Roaming/Mozilla/Firefox/Profiles')],
    mac: ['Firefox/Profiles', 'Firefox'] },
  { family: 'gecko', name: 'Zen', exportAt: 'about:logins',
    win: [roaming('zen/Profiles'), roaming('zen')],
    mac: ['zen/Profiles', 'Zen/Profiles', 'zen', 'Zen'] },
]

/** The folders the browsers' data sits under, by platform; in a test world
 * all three made-up ones, so both layouts are tried on any machine. */
export function bases(): { local?: string; roaming?: string; mac?: string } {
  if (probe) {
    const home = process.env.SEARCH_IMPORT_HOME || path.join(app.getPath('userData'), 'Import')
    return {
      local: path.join(home, 'AppData', 'Local'),
      roaming: path.join(home, 'AppData', 'Roaming'),
      mac: path.join(home, 'Library', 'Application Support'),
    }
  }
  if (process.platform === 'win32') return { local: process.env.LOCALAPPDATA, roaming: process.env.APPDATA }
  if (process.platform === 'darwin') return { mac: path.join(os.homedir(), 'Library', 'Application Support') }
  return {}
}

/** A folder spelled with one * in a part (a packaged app's id), expanded. */
function expand(base: string, folder: string): string[] {
  let found = [base]
  for (const part of folder.split('/')) {
    const next: string[] = []
    for (const dir of found) {
      if (!part.includes('*')) { next.push(path.join(dir, part)); continue }
      const [before, after] = part.split('*')
      let names: string[] = []
      try { names = readdirSync(dir) } catch {}
      for (const n of names) if (n.startsWith(before) && n.endsWith(after)) next.push(path.join(dir, n))
    }
    found = next
  }
  return found.filter(f => isDir(f))
}

function isDir(p: string): boolean { try { return statSync(p).isDirectory() } catch { return false } }

/** Every root folder a browser may keep its data in, found on this machine. */
export function roots(source: Source): string[] {
  const b = bases()
  const out: string[] = []
  for (const w of source.win) { const base = b[w.base]; if (base) out.push(...expand(base, w.folder)) }
  if (b.mac) for (const f of source.mac) out.push(...expand(b.mac, f))
  // One folder once, however it was spelled ("zen" and "Zen" on a Mac's disk).
  const seen = new Set<string>()
  return out.filter(r => { const k = real(r); if (seen.has(k)) return false; seen.add(k); return true })
}

function real(p: string): string { try { return realpathSync(p) } catch { return p } }

export interface Profile { id: string; name: string; dir: string; root: string }

const chromiumMarks = ['Login Data', 'Bookmarks', 'History', 'Extensions']
const never = new Set(['Guest Profile', 'System Profile'])

/** A Chromium browser's profiles: a folder holding passwords, bookmarks,
 * history or extensions; Opera's own folder and its _side_profiles too
 * (Import.swift discovery, studio/05 §1.13 point 8). */
export function chromiumProfiles(source: ChromiumSource): Profile[] {
  const out: Profile[] = []
  for (const root of roots(source)) {
    const state = localState(root)
    const candidates = [root]
    for (const n of safeList(root)) candidates.push(path.join(root, n))
    for (const n of safeList(path.join(root, '_side_profiles'))) candidates.push(path.join(root, '_side_profiles', n))
    for (const dir of candidates) {
      if (!isDir(dir) || !inside(dir, root)) continue
      const id = dir === root ? '' : path.relative(root, dir).split(path.sep).join('/')
      if (never.has(path.basename(dir))) continue
      if (!chromiumMarks.some(m => existsSync(path.join(dir, m)))) continue
      const name = state.names[id] || state.names[path.basename(dir)] || (id || source.name)
      out.push({ id: id || '.', name, dir, root })
    }
  }
  return out
}

function safeList(dir: string): string[] {
  try { return readdirSync(dir).filter(n => !n.startsWith('.')).sort() } catch { return [] }
}

/** What Local State says of the profiles: their names, and the one used last. */
export function localState(root: string): { names: Record<string, string>; last: string[]; raw: Record<string, unknown> | null } {
  const top = readJSONIn<Record<string, any>>(path.join(root, 'Local State'), root)
  const profile = top?.profile ?? {}
  const names: Record<string, string> = {}
  for (const [folder, info] of Object.entries(profile.info_cache ?? {})) {
    const name = (info as { name?: string })?.name
    if (typeof name === 'string' && name) names[folder] = name.slice(0, 60)
  }
  const last = [profile.last_used, ...(Array.isArray(profile.last_active_profiles) ? profile.last_active_profiles : [])].filter((x): x is string => typeof x === 'string')
  return { names, last, raw: top }
}

/** The profile proposed first: last used, else the one most recently changed. */
export function usual(profiles: Profile[]): string | null {
  if (!profiles.length) return null
  for (const p of profiles) {
    const { last } = localState(p.root)
    const hit = last.map(l => profiles.find(x => x.id === l && x.root === p.root)).find(Boolean)
    if (hit) return hit.id
  }
  const newest = [...profiles].sort((a, b) => mtime(b.dir) - mtime(a.dir))[0]
  return newest.id
}

function mtime(dir: string): number {
  let t = 0
  for (const f of ['History', 'Bookmarks', 'Preferences', 'places.sqlite']) {
    try { t = Math.max(t, statSync(path.join(dir, f)).mtimeMs) } catch {}
  }
  return t
}

/** A Gecko browser's profiles: every folder with a places.sqlite, newest
 * first, named from profiles.ini (Mozilla.Source.files and ini). */
export function geckoProfiles(source: GeckoSource): Profile[] {
  const out: Profile[] = []
  const seen = new Set<string>()
  for (const root of roots(source)) {
    const dirs = [root, ...safeList(root).map(n => path.join(root, n))]
    for (const dir of dirs) {
      if (!existsSync(path.join(dir, 'places.sqlite'))) continue
      const key = real(dir)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: path.basename(dir), name: path.basename(dir), dir, root })
    }
  }
  const { names } = geckoIni(source)
  for (const p of out) p.name = names[p.id] ?? p.id
  return out.sort((a, b) => mtime(b.dir) - mtime(a.dir))
}

/** profiles.ini, beside the profiles or one folder up: names, and the one in
 * use (the Install section's Default, else Default=1). */
export function geckoIni(source: GeckoSource): { names: Record<string, string>; usual: string | null } {
  const names: Record<string, string> = {}
  let install: string | null = null, marked: string | null = null
  for (const root of roots(source)) {
    for (const file of [path.join(root, 'profiles.ini'), path.join(path.dirname(root), 'profiles.ini')]) {
      let text = ''
      try { text = readFileSync(file, 'utf8') } catch { continue }
      let section = ''
      let fields: Record<string, string> = {}
      const close = () => {
        const at = fields.Path ? fields.Path.split(/[\\/]/).pop()! : null
        if (section.startsWith('Install') && fields.Default) install ??= fields.Default.split(/[\\/]/).pop()!
        else if (section.startsWith('Profile') && at) {
          if (fields.Name) names[at] = fields.Name
          if (fields.Default === '1') marked ??= at
        }
        fields = {}
      }
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (line.startsWith('[') && line.endsWith(']')) { close(); section = line.slice(1, -1) }
        else { const eq = line.indexOf('='); if (eq > 0) fields[line.slice(0, eq)] = line.slice(eq + 1) }
      }
      close()
    }
  }
  return { names, usual: install ?? marked }
}

export function profilesOf(source: Source): Profile[] {
  return source.family === 'chromium' ? chromiumProfiles(source) : geckoProfiles(source)
}

export function usualOf(source: Source, profiles: Profile[]): string | null {
  if (source.family === 'gecko') {
    const u = geckoIni(source).usual
    return u && profiles.some(p => p.id === u) ? u : profiles[0]?.id ?? null
  }
  return usual(profiles)
}

/** Only the browsers on this machine with something to read. */
export function installed(): Source[] {
  return known.filter(s => profilesOf(s).length > 0)
}

export function byName(name: string): Source | undefined { return known.find(s => s.name === name) }
