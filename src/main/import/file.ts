// A file another browser exported (ImportFile.swift, BookmarksFile.swift,
// Vault.take(csv:); studio/05 §1.8): passwords as CSV, the universal way in
// on Windows, bookmarks as a Netscape HTML page, and a spaces file Export
// Spaces… wrote (Search 1.0.22, spacesfile.ts). Read once, never kept.

import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { BookmarkNode, ImportSaid } from '../../shared/modules/data'
import { bookmarks } from '../data/store'
import { records, top } from '../data/meta'
import { folder, site } from '../data/bookmarks'
import { siteHost } from '../data/urls'
import { vault } from '../data/vault'
import { n } from './bring'
import { LIMIT, readBundle, spacesSaid, takeSpaces } from './spacesfile'

const maxFile = 64 * 1024 * 1024

/** Quoted fields, doubled quotes inside them, and newlines inside those. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f)) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f)) rows.push(row)
  return rows
}

/** A CSV as Chrome, Edge, Brave, Opera, Vivaldi, Firefox and Bitwarden write
 * it: the columns found by name (Vault.take(csv:)). */
export function takeCSV(text: string): { kept: number; skipped: number } {
  const rows = parseCSV(text.replace(/^\uFEFF/, ''))
  if (!rows.length) return { kept: 0, skipped: 0 }
  const header = rows.shift()!.map(h => h.trim().toLowerCase())
  const column = (names: string[]) => header.findIndex(h => names.includes(h))
  const urlAt = column(['url', 'login_uri', 'website', 'site']), userAt = column(['username', 'login_username', 'user', 'email'])
  const passAt = column(['password', 'login_password'])
  if (urlAt < 0 || userAt < 0 || passAt < 0) return { kept: 0, skipped: rows.length }
  let skipped = 0
  const list: { host: string; user: string; password: string; clear: boolean }[] = []
  for (const row of rows) {
    if (row.length <= Math.max(urlAt, userAt, passAt)) { skipped++; continue }
    const host = siteHost(row[urlAt]), password = row[passAt]
    if (!host || !password) { skipped++; continue }
    list.push({ host, user: row[userAt], password, clear: /^http:\/\//i.test(row[urlAt].trim()) })
  }
  const kept = vault.saveMany(list)
  return { kept, skipped: skipped + (list.length - kept) }
}

// Netscape bookmarks (BookmarksFile.parse)

const tagExpression = /<(H3|A)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<(\/?)DL\b[^>]*>/gi
const attribute = (name: string, text: string): string | null => {
  const m = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(text)
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null
}

function decode(text: string): string {
  if (!text.includes('&')) return text
  let out = text
  for (const [e, ch] of [['&lt;', '<'], ['&gt;', '>'], ['&quot;', '"'], ['&#39;', "'"], ['&apos;', "'"], ['&nbsp;', ' ']]) out = out.replace(new RegExp(e, 'gi'), ch)
  out = out.replace(/&#(x?)([0-9a-fA-F]+);/g, (whole, hex, digits) => {
    const code = parseInt(digits, hex ? 16 : 10)
    try { return String.fromCodePoint(code) } catch { return whole }
  })
  return out.replace(/&amp;/gi, '&')
}

const clean = (text: string) => decode(text.replace(/<[^>]*>/g, '')).trim()

export function parseBookmarksHTML(text: string): BookmarkNode[] | null {
  if (!/<DL/i.test(text)) return null
  const stack: { title: string | null; nodes: BookmarkNode[] }[] = []
  const root: BookmarkNode[] = []
  let heading: string | null = null
  let bar = false
  const append = (node: BookmarkNode) => { if (!stack.length) root.push(node); else stack[stack.length - 1].nodes.push(node) }
  const close = (list: { title: string | null; nodes: BookmarkNode[] }) => {
    if (list.title != null) append(folder(list.title, list.nodes))
    else if (!stack.length) root.push(...list.nodes)
    else stack[stack.length - 1].nodes.push(...list.nodes)
  }
  for (const m of text.matchAll(tagExpression)) {
    if (m[1]) {
      const tag = m[1].toUpperCase(), attrs = m[2], title = clean(m[3])
      if (tag === 'H3') {
        heading = title
        bar = attribute('PERSONAL_TOOLBAR_FOLDER', attrs)?.toLowerCase() === 'true'
      } else {
        const href = attribute('HREF', attrs)
        if (href && /^https?:\/\//i.test(href)) {
          try { const u = new URL(href); append(site(title || u.hostname, u.href)) } catch {}
        }
      }
    } else if (!m[4]) {
      // <DL>: the list of the folder just named, or of the file itself.
      if (stack.length >= 64 || (heading == null && !stack.length && !root.length) || (bar && stack.length <= 1)) stack.push({ title: null, nodes: [] })
      else stack.push({ title: heading ?? 'Folder', nodes: [] })
      heading = null
      bar = false
    } else {
      const list = stack.pop()
      if (list) close(list)
    }
  }
  // A file cut short: what was open still counts.
  while (stack.length) close(stack.pop()!)
  return root
}

/** Brought in, and said in a line (Browser.importFile, takeFile). The name
 * it is recorded under is the file's, without its extension. */
export function bringFile(file: string, recordAs?: string): { said: ImportSaid[]; passwords: number; bookmarks: number } {
  const name = recordAs ?? path.basename(file).replace(/\.[^.]+$/, '')
  let text: string
  try {
    if (statSync(file).size > maxFile) throw new Error('too big')
    text = readFileSync(file, 'utf8')
  } catch {
    return { said: [{ ok: false, text: "That file couldn't be read" }], passwords: 0, bookmarks: 0 }
  }
  const ext = path.extname(file).toLowerCase()
  // Export Spaces…'s own file, Oriel's or Search's: its spaces come in (Search 1.0.22).
  if (ext === '.json') {
    const bundle = text.length <= LIMIT ? readBundle(text) : null
    if (!bundle) return { said: [{ ok: false, text: "That file couldn't be read" }], passwords: 0, bookmarks: 0 }
    return { said: [{ ok: true, text: spacesSaid(takeSpaces(bundle)) }], passwords: 0, bookmarks: 0 }
  }
  if (ext === '.csv' || ext === '.txt' || (!/<DL/i.test(text) && text.includes(','))) {
    const { kept, skipped } = takeCSV(text)
    if (!kept && !skipped) return { said: [{ ok: false, text: 'Nothing to bring in from that file' }], passwords: 0, bookmarks: 0 }
    records.note(name, { passwords: kept })
    const said: ImportSaid[] = [{ ok: kept > 0, text: skipped ? `${n(kept)} passwords, ${n(skipped)} skipped` : `${n(kept)} passwords` }]
    if (kept) said.push({ ok: false, text: 'The exported file holds your passwords in the clear: delete it now' })
    return { said, passwords: kept, bookmarks: 0 }
  }
  const nodes = parseBookmarksHTML(text)
  if (nodes == null) return { said: [{ ok: false, text: "That file couldn't be read" }], passwords: 0, bookmarks: 0 }
  if (!nodes.length) return { said: [{ ok: false, text: 'Nothing to bring in from that file' }], passwords: 0, bookmarks: 0 }
  const taken = bookmarks().takeNoting(nodes, name, top)
  records.note(name, { ids: taken.ids, bookmarks: taken.added })
  return {
    said: [{ ok: true, text: taken.already ? `${n(taken.added)} new bookmarks, ${n(taken.already)} already here` : `${n(taken.added)} bookmarks` }],
    passwords: 0,
    bookmarks: taken.added,
  }
}
