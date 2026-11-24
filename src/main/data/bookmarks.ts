// Bookmarks: folders and sites, kept in bookmarks.json in the Mac's format,
// an array of { id, title, url?, children? } (Bookmarks.swift, studio/05 §3.1).

import { existsSync, readFileSync, renameSync } from 'node:fs'
import type { BookmarkNode } from '../../shared/modules/data'
import { writeJSON, writeJSONNow } from '../model/persist'
import { dataFile } from '../paths'
import * as Fuzzy from './fuzzy'
import { editable, newID, parse, stripped } from './urls'

export interface Place { key: string; title: string; url: string }

interface Site { name: string; title: string; address: string; url: string; findable: string }

export const isFolder = (n: BookmarkNode) => n.url == null

/** How many sites, folders not counted. */
export function count(nodes: BookmarkNode[]): number {
  return nodes.reduce((sum, n) => sum + (isFolder(n) ? count(n.children ?? []) : 1), 0)
}

/** Every site, in order, folders opened. */
export function urls(nodes: BookmarkNode[]): string[] {
  return nodes.flatMap(n => isFolder(n) ? urls(n.children ?? []) : n.url ? [n.url] : [])
}

/** Every id in a tree, folders and all. */
export function ids(nodes: BookmarkNode[]): string[] {
  return nodes.flatMap(n => [n.id, ...ids(n.children ?? [])])
}

/** A site as Bookmark.site makes it: its title, or its address without one. */
export function site(title: string, url: string): BookmarkNode {
  const u = parse(url)
  const href = u?.href ?? url
  return { id: newID(), title: title || (u ? pretty(u) : url), url: href }
}

export function folder(title: string, children: BookmarkNode[]): BookmarkNode {
  return { id: newID(), title, children }
}

function pretty(u: URL): string {
  const host = u.hostname.replace(/^www\./, '')
  return u.pathname === '/' || !u.pathname ? host : host + u.pathname
}

/** The Mac's key order, and no empty optionals. */
function clean(n: BookmarkNode): BookmarkNode {
  const out: BookmarkNode = { id: n.id, title: n.title }
  if (n.url != null) out.url = n.url
  if (n.children) out.children = n.children.map(clean)
  return out
}

export class Bookmarks {
  roots: BookmarkNode[] = []
  private keptSet = new Set<string>()
  private sites: Site[] | null = null
  /** Told whenever the list changes. */
  onChange: () => void = () => {}

  constructor(readonly fileName = 'bookmarks.json') { this.load() }

  private load(): void {
    const file = dataFile(this.fileName)
    if (!existsSync(file)) return
    try {
      const list = JSON.parse(readFileSync(file, 'utf8'))
      if (!Array.isArray(list)) throw new Error('not a list')
      this.set(list.map(clean), false)
    } catch {
      try { renameSync(file, dataFile(this.fileName.replace(/\.json$/, '') + `.unreadable-${Math.floor(Date.now() / 1000)}.json`)) } catch {}
    }
  }

  private set(roots: BookmarkNode[], save = true): void {
    this.roots = roots
    this.keptSet = new Set(urls(roots).map(u => parse(u)?.href ?? u))
    this.sites = null
    if (save) {
      writeJSON(this.fileName, () => this.roots.map(clean), 400)
      this.onChange()
    }
  }

  flush(): void { writeJSONNow(this.fileName, this.roots.map(clean)) }

  /** The whole list as Sync with your other computers merged it (Bookmarks.adopt). */
  adopt(roots: BookmarkNode[]): void { this.set(roots.map(clean)) }

  get count(): number { return count(this.roots) }

  contains(url: string): boolean { return this.keptSet.has(parse(url)?.href ?? url) }

  find(test: (n: BookmarkNode) => boolean): BookmarkNode | undefined {
    const walk = (nodes: BookmarkNode[]): BookmarkNode | undefined => {
      for (const n of nodes) {
        if (test(n)) return n
        const found = walk(n.children ?? [])
        if (found) return found
      }
    }
    return walk(this.roots)
  }

  bookmark(id: string) { return this.find(n => n.id === id) }
  forURL(url: string) { const href = parse(url)?.href ?? url; return this.find(n => n.url === href) }

  /** Every site and folder whose title or address holds all the words, with
   * the folders it sits in (Bookmarks.matches). */
  matches(text: string): { node: BookmarkNode; path: string[] }[] {
    const words = text.toLowerCase().split(' ').filter(Boolean)
    if (!words.length) return []
    const walk = (nodes: BookmarkNode[], path: string[]): { node: BookmarkNode; path: string[] }[] =>
      nodes.flatMap(n => {
        const hay = (n.title + ' ' + (n.url ?? '')).toLowerCase()
        const hit = words.every(w => hay.includes(w)) ? [{ node: n, path }] : []
        return [...hit, ...walk(n.children ?? [], [...path, n.title])]
      })
    return walk(this.roots, [])
  }

  /** The sites for what is typed in the field, the best `limit` first; those
   * found only through a typo come apart (Bookmarks.places). */
  places(typed: string, limit: number): { found: Place[]; slips: Place[] } {
    const needle = typed.trim().toLowerCase()
    const words = needle.split(/\s+/).filter(Boolean)
    if ([...needle].length < 2 || !words.length) return { found: [], slips: [] }
    const bare = stripped(needle)
    this.sites ??= sitesOf(this.roots)
    const best: { site: Site; score: number }[] = []
    for (const s of this.sites) {
      const found = Fuzzy.match(words, s.findable)
      if (found == null) continue
      const score = found === 0 ? 0
        : s.address.startsWith(bare) ? 3
        : s.title.startsWith(needle) || s.title.split(' ').some(w => w.startsWith(words[0])) ? 2
        : 1
      let at = best.findIndex(b => score > b.score || (score === b.score && s.address.length < b.site.address.length))
      if (at < 0) at = best.length
      if (at >= limit) continue
      best.splice(at, 0, { site: s, score })
      if (best.length > limit) best.pop()
    }
    const place = (b: { site: Site }) => ({ key: editable(b.site.url), title: b.site.name, url: b.site.url })
    return { found: best.filter(b => b.score > 0).map(place), slips: best.filter(b => b.score === 0).map(place) }
  }

  // changing (05 §3.2)

  /** The page at the end of the list, or in a folder; never twice. */
  add(url: string, title: string, into?: string | null): BookmarkNode | null {
    if (this.contains(url)) return null
    const made = site(title, url)
    const roots = structuredClone(this.roots)
    if (!(into && place(made, into, undefined, roots))) roots.push(made)
    this.set(roots)
    return made
  }

  remove(id: string): void { this.set(prune(id, this.roots)) }

  rename(id: string, title: string): void {
    const roots = structuredClone(this.roots)
    const walk = (nodes: BookmarkNode[]) => nodes.forEach(n => { if (n.id === id) n.title = title; walk(n.children ?? []) })
    walk(roots)
    this.set(roots)
  }

  newFolder(title: string, parent?: string | null): BookmarkNode | null {
    if (!title.trim()) return null
    const made = folder(title.trim(), [])
    const roots = structuredClone(this.roots)
    if (!(parent && place(made, parent, undefined, roots))) roots.push(made)
    this.set(roots)
    return made
  }

  /** Into a folder (the top for null) at `index`, counted as the list reads
   * before the move. A folder never into itself. */
  move(id: string, into: string | null, index?: number): void {
    if (id === into) return
    let at = index
    const siblings = into ? this.bookmark(into)?.children ?? [] : this.roots
    const from = siblings.findIndex(n => n.id === id)
    if (at != null && from >= 0 && from < at) at -= 1
    const roots = structuredClone(this.roots)
    const node = detach(id, roots)
    if (!node) return
    if (into && holds(into, node)) return
    if (!placeOrTop(node, into, at, roots)) return
    this.set(roots)
  }

  /** Another browser's, in a folder of its name unless there was nothing here
   * yet (Bookmarks.takeNoting, 05 §1.10). `top` is the browser that filled
   * the empty top level the first time. */
  takeNoting(nodes: BookmarkNode[], name: string, top: { get(): string | undefined; set(name: string): void }): { added: number; already: number; ids: string[] } {
    if (!nodes.length) return { added: 0, already: 0, ids: [] }
    const tally = { added: 0, already: 0, ids: [] as string[] }
    const roots = structuredClone(this.roots)
    if (!roots.length) {
      this.set(nodes)
      top.set(name)
      return { added: count(nodes), already: 0, ids: ids(nodes) }
    }
    if (this.intoTop(nodes, name, top)) {
      merge(nodes, roots, tally)
    } else {
      const at = roots.findIndex(n => isFolder(n) && n.title === name)
      const kids = at >= 0 ? roots[at].children ?? [] : []
      merge(nodes, kids, tally)
      if (at >= 0) roots[at].children = kids
      else {
        const f = folder(name, kids)
        tally.ids.push(f.id)
        roots.push(f)
      }
    }
    this.set(roots)
    return tally
  }

  private intoTop(nodes: BookmarkNode[], name: string, top: { get(): string | undefined; set(name: string): void }): boolean {
    const was = top.get()
    if (was) return was === name
    const theirs = urls(nodes)
    if (!theirs.length) return false
    const ours = new Set(urls(this.roots))
    if (theirs.filter(u => ours.has(u)).length * 2 < theirs.length) return false
    top.set(name)
    return true
  }

  /** Takes back out what an import added: its bookmarks wherever they now
   * sit, then its folders left empty. A folder you put something of yours in
   * stays (Bookmarks.withdraw). */
  withdraw(list: string[]): number {
    const ours = new Set(list)
    let gone = 0
    const strip = (nodes: BookmarkNode[]): BookmarkNode[] => nodes.flatMap(n => {
      if (!isFolder(n) && ours.has(n.id)) { gone++; return [] }
      if (!n.children) return [n]
      const copy = { ...n, children: strip(n.children) }
      if (ours.has(n.id) && !copy.children.length) return []
      return [copy]
    })
    this.set(strip(this.roots))
    return gone
  }
}

function sitesOf(nodes: BookmarkNode[]): Site[] {
  return nodes.flatMap(n => {
    if (isFolder(n)) return sitesOf(n.children ?? [])
    const u = parse(n.url ?? '')
    // Only places to go: a bookmarklet's javascript: is no address.
    if (!u || !['http:', 'https:', 'file:'].includes(u.protocol)) return []
    const title = n.title.trim() ? n.title : ''
    const lowered = title.toLowerCase(), address = stripped(u.href)
    return [{ name: title, title: lowered, address, url: u.href, findable: lowered + ' ' + address }]
  })
}

function prune(id: string, nodes: BookmarkNode[]): BookmarkNode[] {
  return nodes.filter(n => n.id !== id).map(n => n.children ? { ...n, children: prune(id, n.children) } : n)
}

function detach(id: string, nodes: BookmarkNode[]): BookmarkNode | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes.splice(i, 1)[0]
    const kids = nodes[i].children
    if (kids) { const found = detach(id, kids); if (found) return found }
  }
  return null
}

function place(node: BookmarkNode, into: string, at: number | undefined, nodes: BookmarkNode[]): boolean {
  for (const n of nodes) {
    if (n.id === into && isFolder(n)) {
      const kids = n.children ?? (n.children = [])
      kids.splice(Math.min(Math.max(at ?? kids.length, 0), kids.length), 0, node)
      return true
    }
    if (n.children && place(node, into, at, n.children)) return true
  }
  return false
}

function placeOrTop(node: BookmarkNode, into: string | null, at: number | undefined, roots: BookmarkNode[]): boolean {
  if (!into) { roots.splice(Math.min(Math.max(at ?? roots.length, 0), roots.length), 0, node); return true }
  return place(node, into, at, roots)
}

/** `id` is `node` itself or somewhere inside it. */
function holds(id: string, node: BookmarkNode): boolean {
  return node.id === id || (node.children ?? []).some(c => holds(id, c))
}

/** Level by level: a folder into the folder of the same name, a page only if
 * the same address isn't already at that level. */
function merge(incoming: BookmarkNode[], nodes: BookmarkNode[], tally: { added: number; already: number; ids: string[] }): void {
  const folders = new Map<string, number>()
  nodes.forEach((n, i) => { if (isFolder(n) && !folders.has(n.title)) folders.set(n.title, i) })
  const pages = new Set(nodes.filter(n => !isFolder(n)).map(n => n.url))
  for (const n of incoming) {
    if (isFolder(n)) {
      const at = folders.get(n.title)
      if (at != null) {
        const kids = nodes[at].children ?? (nodes[at].children = [])
        merge(n.children ?? [], kids, tally)
      } else {
        folders.set(n.title, nodes.length)
        nodes.push(n)
        tally.added += count([n])
        tally.ids.push(...ids([n]))
      }
    } else if (pages.has(n.url)) {
      tally.already++
    } else {
      pages.add(n.url)
      nodes.push(n)
      tally.added++
      tally.ids.push(n.id)
    }
  }
}
