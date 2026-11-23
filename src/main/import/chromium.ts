// What a Chromium browser keeps: Bookmarks (JSON), History (SQLite),
// Preferences for its extensions, Login Data for passwords (Import.swift
// Chromium, studio/05 §1.3). The same files on Windows and on a Mac.

import path from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import type { BookmarkNode } from '../../shared/modules/data'
import { folder, site } from '../data/bookmarks'
import type { ChromiumSource, Profile } from './sources'
import { chromiumProfiles } from './sources'
import { bytes, count, query, readJSONIn, snapshot, unreadableJSON } from './read'

export interface Place { url: string; title: string; count: number; last: number }

/** Microseconds since 1601, Chromium's idea of a date, in ms since 1970.
 * Read as REAL: the integers are past what a JavaScript number holds exactly. */
export const fromChromiumTime = (stamp: number) => stamp / 1000 - 11_644_473_600_000

export function profilesFor(source: ChromiumSource, only: string | null): Profile[] {
  const all = chromiumProfiles(source)
  return only ? all.filter(p => p.id === only) : all
}

const web = (u: string) => /^https?:\/\//i.test(u)

function nodes(raw: unknown[]): BookmarkNode[] {
  const out: BookmarkNode[] = []
  for (const e of raw as Record<string, any>[]) {
    const name = typeof e?.name === 'string' ? e.name : ''
    if (e?.type === 'folder') out.push(folder(name, nodes(Array.isArray(e.children) ? e.children : [])))
    else if (e?.type === 'url' && typeof e.url === 'string' && web(e.url)) {
      try { new URL(e.url); out.push(site(name, e.url)) } catch {}
    }
  }
  return out
}

/** The bar's first, then Other and Mobile as folders; and whether every
 * profile read cleanly (Replace needs that, #375). */
export function bookmarkRead(source: ChromiumSource, only: string | null): { nodes: BookmarkNode[]; complete: boolean } {
  const profiles = profilesFor(source, only)
  let complete = profiles.length > 0
  const out: BookmarkNode[] = []
  for (const p of profiles) {
    const file = path.join(p.dir, 'Bookmarks')
    if (!existsSync(file)) continue
    if (unreadableJSON(file, p.root)) { complete = false; continue }
    const top = readJSONIn<Record<string, any>>(file, p.root)
    const roots = top?.roots
    if (!roots || typeof roots !== 'object') { complete = false; continue }
    out.push(...nodes(roots.bookmark_bar?.children ?? []))
    for (const key of ['other', 'synced']) {
      const kids = nodes(roots[key]?.children ?? [])
      if (kids.length) out.push(folder(key === 'other' ? 'Other' : 'Mobile', kids))
    }
  }
  return { nodes: out, complete }
}

/** The last places it went, newest first (Chromium.places). */
export function places(source: ChromiumSource, only: string | null, limit = 3000): Place[] {
  const out: Place[] = []
  for (const p of profilesFor(source, only)) {
    const rows = query<{ url: string; title: string; visit_count: number; last_visit_time: number }>(
      path.join(p.dir, 'History'), p.root,
      `SELECT url, title, visit_count, CAST(last_visit_time AS REAL) AS last_visit_time FROM urls WHERE hidden = 0 AND visit_count > 0 ORDER BY last_visit_time DESC LIMIT ${limit}`) ?? []
    for (const r of rows) {
      if (typeof r.url !== 'string' || !web(r.url)) continue
      const stamp = Number(r.last_visit_time)
      out.push({ url: r.url, title: r.title ?? '', count: Math.max(1, Number(r.visit_count) || 1), last: stamp > 0 ? fromChromiumTime(stamp) : Date.now() })
    }
  }
  return out.sort((a, b) => b.last - a.last).slice(0, limit)
}

/** Thirty-two letters from a to p: a store extension's id. */
const storeID = (id: string) => /^[a-p]{32}$/.test(id)

/** The extensions a profile has from the Chrome Web Store, to be installed
 * fresh from the store, never copied: only those the person added, not built
 * in, not by policy, not themes, not from another store (05 §1.3). */
export function extensions(source: ChromiumSource, only: string | null): string[] {
  const out: string[] = []
  for (const p of profilesFor(source, only)) {
    const settings: Record<string, Record<string, any>> = {}
    for (const name of ['Preferences', 'Secure Preferences']) {
      const top = readJSONIn<Record<string, any>>(path.join(p.dir, name), p.root)
      const all = top?.extensions?.settings
      if (!all || typeof all !== 'object') continue
      for (const [id, entry] of Object.entries(all as Record<string, any>)) {
        if (entry && typeof entry === 'object') settings[id] = { ...entry, ...(settings[id] ?? {}) }
      }
    }
    let ids: string[]
    if (!Object.keys(settings).length) {
      ids = []
      try { ids = readdirSync(path.join(p.dir, 'Extensions')) } catch {}
    } else {
      ids = Object.entries(settings).filter(([, e]) => {
        if (!(e.location === 1 || e.from_webstore === true)) return false
        if (e.was_installed_by_default === true || e.was_installed_by_oem === true) return false
        const manifest = e.manifest ?? {}
        if (manifest.theme != null) return false
        if (typeof manifest.update_url === 'string') {
          let host = ''
          try { host = new URL(manifest.update_url).hostname.toLowerCase() } catch {}
          if (!(host === 'google.com' || host.endsWith('.google.com'))) return false
        }
        return true
      }).map(([id]) => id)
    }
    for (const id of ids.sort()) if (storeID(id) && !out.includes(id)) out.push(id)
  }
  return out
}

/** Every profile's passwords files: Chrome signed in without sync keeps a
 * second one beside the first. */
export function loginFiles(source: ChromiumSource, only: string | null): { file: string; profile: Profile }[] {
  if (!source.importsPasswords) return []
  return profilesFor(source, only).flatMap(p => ['Login Data', 'Login Data For Account']
    .map(f => ({ file: path.join(p.dir, f), profile: p }))
    .filter(x => existsSync(x.file)))
}

export interface LoginRow { origin: string; user: string; blob: Buffer; never: boolean; used: number | null }

export function loginRows(file: string, root: string): LoginRow[] | null {
  const rows = query<Record<string, unknown>>(file, root,
    'SELECT origin_url, username_value, password_value, blacklisted_by_user, CAST(date_last_used AS REAL) AS date_last_used FROM logins')
  if (!rows) return null
  return rows.map(r => {
    const stamp = Number(r.date_last_used) || 0
    return {
      origin: String(r.origin_url ?? ''),
      user: String(r.username_value ?? ''),
      blob: bytes(r.password_value),
      never: Number(r.blacklisted_by_user) !== 0,
      used: stamp > 0 ? fromChromiumTime(stamp) : null,
    }
  })
}

/** How much there is, from the files alone: nothing decrypted, no key asked
 * for (Chromium.preview, 05 §1.1 point 1). Passwords also counted by how
 * they are locked: v10 readable with the user's key, v20 bound to the
 * browser itself (studio/07 §2.3). */
export function preview(source: ChromiumSource, only: string | null, limit = 3000) {
  let placesFound = 0, passwords = 0, readable = 0, locked = 0
  for (const p of profilesFor(source, only)) {
    placesFound += count(path.join(p.dir, 'History'), p.root,
      "SELECT COUNT(*) FROM urls WHERE hidden = 0 AND visit_count > 0 AND (url LIKE 'http:%' OR url LIKE 'https:%')")
  }
  for (const { file, profile } of loginFiles(source, only)) {
    const rows = query<{ p: string; n: number }>(file, profile.root,
      "SELECT CAST(substr(password_value, 1, 3) AS TEXT) AS p, COUNT(*) AS n FROM logins WHERE blacklisted_by_user = 0 AND length(password_value) > 0 GROUP BY p") ?? []
    for (const r of rows) {
      const n = Number(r.n) || 0
      passwords += n
      if (r.p === 'v20') locked += n
      else readable += n
    }
  }
  return {
    bookmarks: countMarks(bookmarkRead(source, only).nodes),
    places: Math.min(limit, placesFound),
    passwords,
    passwordsReadable: readable,
    passwordsLocked: locked,
    extensions: extensions(source, only),
  }
}

function countMarks(nodes: BookmarkNode[]): number {
  return nodes.reduce((s, n) => s + (n.url == null ? countMarks(n.children ?? []) : 1), 0)
}

/** The browser's icons for these pages: the largest bitmap it kept for the
 * page, or else for the site's front door; at most 400 sites
 * (Chromium.icons, studio/05 §1.3). */
export function icons(source: ChromiumSource, only: string | null, urls: string[], limit = 400): Map<string, Buffer> {
  return iconsFrom(profilesFor(source, only).map(p => ({ file: path.join(p.dir, 'Favicons'), root: p.root })), urls, limit, `
    SELECT b.image_data AS data FROM icon_mapping m JOIN favicon_bitmaps b ON b.icon_id = m.icon_id
    WHERE m.page_url = ? AND b.width BETWEEN 16 AND 256 ORDER BY b.width DESC LIMIT 1`)
}

/** One query per page and per front door, on a copy of each icons file;
 * one icon per site. */
export function iconsFrom(files: { file: string; root: string }[], urls: string[], limit: number, sql: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const wanted: { url: string; door: string }[] = []
  const seen = new Set<string>()
  for (const url of urls) {
    let u: URL
    try { u = new URL(url) } catch { continue }
    if (!web(u.href) || seen.has(u.host)) continue
    seen.add(u.host)
    wanted.push({ url: u.href, door: `${u.protocol}//${u.host}/` })
    if (wanted.length >= limit) break
  }
  for (const { file, root } of files) {
    if (!wanted.length || !existsSync(file)) continue
    const snap = snapshot(file, root)
    if (!snap) continue
    try {
      const statement = snap.db.prepare(sql)
      for (const w of wanted) {
        if (out.has(w.url)) continue
        for (const page of [w.url, w.door]) {
          const data = bytes((statement.get(page) as { data?: unknown } | undefined)?.data)
          if (data.length > 60) { out.set(w.url, data); break }
        }
      }
    } catch { /* an icons file of another shape: no icons */ } finally { snap.close() }
  }
  return out
}
