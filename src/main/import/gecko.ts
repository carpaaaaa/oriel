// What a Gecko browser (Firefox, Zen) keeps: places.sqlite for bookmarks and
// history, logins.json and key4.db for passwords (Import.swift Mozilla,
// studio/05 §1.5). Identical on Windows and on a Mac.

import path from 'node:path'
import { existsSync } from 'node:fs'
import type { BookmarkNode } from '../../shared/modules/data'
import { folder, site } from '../data/bookmarks'
import type { GeckoSource, Profile } from './sources'
import { geckoProfiles } from './sources'
import { count, query, readJSONIn } from './read'
import type { Place } from './chromium'

export function profilesFor(source: GeckoSource, only: string | null): Profile[] {
  const all = geckoProfiles(source)
  return only ? all.filter(p => p.id === only) : all
}

const web = (u: string) => /^https?:\/\//i.test(u)

interface Raw { id: number; type: number; parent: number; title: string; url: string | null; guid: string }

/** The tree rebuilt from moz_bookmarks: the toolbar's first, then the
 * menu's, then Other and Mobile; tags left out; no folder taken twice, no
 * deeper than 64. */
function bookmarkNodes(p: Profile): BookmarkNode[] | null {
  const rows = query<Raw>(path.join(p.dir, 'places.sqlite'), p.root, `
    SELECT b.id AS id, b.type AS type, b.parent AS parent, b.title AS title, p.url AS url, b.guid AS guid
    FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id
    WHERE b.type IN (1, 2) ORDER BY b.position ASC`)
  if (!rows) return null
  const byParent = new Map<number, Raw[]>()
  const byGuid = new Map<string, Raw>()
  for (const r of rows) {
    const list = byParent.get(Number(r.parent)) ?? []
    list.push(r)
    byParent.set(Number(r.parent), list)
    if (r.guid) byGuid.set(r.guid, r)
  }
  const taken = new Set<number>()
  const children = (parent: number, depth = 0): BookmarkNode[] => {
    if (depth >= 64) return []
    return (byParent.get(parent) ?? []).flatMap(item => {
      if (Number(item.type) === 1) {
        if (!item.url || !web(item.url)) return []
        try { new URL(item.url) } catch { return [] }
        return [site(item.title ?? '', item.url)]
      }
      if (Number(item.type) !== 2 || item.guid === 'tags________' || taken.has(Number(item.id))) return []
      taken.add(Number(item.id))
      return [folder(item.title || 'Folder', children(Number(item.id), depth + 1))]
    })
  }
  const out: BookmarkNode[] = []
  const toolbar = byGuid.get('toolbar_____'), menu = byGuid.get('menu________')
  if (toolbar) out.push(...children(Number(toolbar.id)))
  if (menu) out.push(...children(Number(menu.id)))
  for (const [guid, name] of [['unfiled_____', 'Other'], ['mobile______', 'Mobile']] as const) {
    const at = byGuid.get(guid)
    const kids = at ? children(Number(at.id)) : []
    if (kids.length) out.push(folder(name, kids))
  }
  return out
}

export function bookmarkRead(source: GeckoSource, only: string | null): { nodes: BookmarkNode[]; complete: boolean } {
  const profiles = profilesFor(source, only)
  let complete = profiles.length > 0
  const out: BookmarkNode[] = []
  for (const p of profiles) {
    const read = bookmarkNodes(p)
    if (read) out.push(...read)
    else complete = false
  }
  return { nodes: out, complete }
}

/** Microseconds since 1970: no 1601 offset, unlike Chromium. */
export function places(source: GeckoSource, only: string | null, limit = 3000): Place[] {
  const out: Place[] = []
  for (const p of profilesFor(source, only)) {
    const rows = query<{ url: string; title: string | null; visit_count: number; last_visit_date: number }>(
      path.join(p.dir, 'places.sqlite'), p.root,
      `SELECT url, title, visit_count, CAST(last_visit_date AS REAL) AS last_visit_date FROM moz_places
       WHERE hidden = 0 AND visit_count > 0 AND last_visit_date IS NOT NULL
       ORDER BY last_visit_date DESC LIMIT ${limit}`) ?? []
    for (const r of rows) {
      if (typeof r.url !== 'string' || !web(r.url)) continue
      const stamp = Number(r.last_visit_date)
      out.push({ url: r.url, title: r.title ?? '', count: Math.max(1, Number(r.visit_count) || 1), last: stamp > 0 ? stamp / 1000 : Date.now() })
    }
  }
  return out.sort((a, b) => b.last - a.last).slice(0, limit)
}

/** The logins logins.json lists, from the files alone: key4.db isn't
 * opened, so a primary password is only found out at the click. */
export function preview(source: GeckoSource, only: string | null, limit = 3000) {
  let found = 0, passwords = 0
  for (const p of profilesFor(source, only)) {
    found += count(path.join(p.dir, 'places.sqlite'), p.root,
      "SELECT COUNT(*) FROM moz_places WHERE hidden = 0 AND visit_count > 0 AND last_visit_date IS NOT NULL AND (url LIKE 'http:%' OR url LIKE 'https:%')")
    if (!existsSync(path.join(p.dir, 'key4.db'))) continue
    const doc = readJSONIn<{ logins?: { hostname?: unknown; encryptedPassword?: unknown }[] }>(path.join(p.dir, 'logins.json'), p.root)
    passwords += (doc?.logins ?? []).filter(l => typeof l.hostname === 'string' && typeof l.encryptedPassword === 'string' && l.encryptedPassword).length
  }
  const nodes = bookmarkRead(source, only).nodes
  const countMarks = (n: BookmarkNode[]): number => n.reduce((s, x) => s + (x.url == null ? countMarks(x.children ?? []) : 1), 0)
  return { bookmarks: countMarks(nodes), places: Math.min(limit, found), passwords, extensions: [] as string[] }
}
