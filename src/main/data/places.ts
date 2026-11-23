// History and bookmarks for the rest of Search: what the field offers, what
// the tabs record, the bookmark commands (studio/05 §3).

import type { Suggestion } from '../../shared/state'
import { data, provideData, type Bookmark, type HistoryVisit } from './api'
import { handle } from '../router'
import { need } from '../context'
import { model } from '../model/model'
import { benchRequest } from '../bench/server'
import { bookmarks, history, mark } from './store'
import { getMeta, setMeta } from './meta'
import { editable, identity } from './urls'
import { isFolder } from './bookmarks'
import type { BookmarkNode } from '../../shared/modules/data'

/** What the field offers for what is typed: your bookmarks first, then where
 * you have been; one place of history stays (the front door the field
 * completes towards), a page that is both is one row, the bookmark's, and a
 * bookmark found only through a typo comes under history
 * (Browser.placeOffers, idea 417). */
export function placeOffers(typed: string, limit = 3): Suggestion[] {
  const visited = history().suggestions(typed, limit)
  const list: Suggestion[] = []
  const seen = new Set<string>()
  const add = (s: Suggestion) => {
    if (list.length < limit && !seen.has(identity(s.url))) { seen.add(identity(s.url)); list.push(s) }
  }
  const front = visited[0] ? identity(visited[0].url) : null
  const kept = bookmarks().places(typed, limit)
  const asBookmark = (p: { key: string; title: string; url: string }): Suggestion => ({ kind: 'bookmark', title: p.title || p.key, detail: p.key, url: p.url })
  for (const p of kept.found) {
    if (list.length === limit - 1 && front && !seen.has(front) && identity(p.url) !== front) break
    add(asBookmark(p))
  }
  for (const v of visited) add({ kind: v.kind === 'known' ? 'url' : 'history', title: v.title || v.key, detail: v.key, url: v.url })
  kept.slips.forEach(p => add(asBookmark(p)))
  return list
}

/** data.suggest: each kind on its own, up to `limit` of each; the field
 * puts them in order (05 §3.5, studio/03 §1.3). */
export function kindsFor(typed: string, limit: number): Suggestion[] {
  const visited = history().suggestions(typed, limit).map((v): Suggestion =>
    ({ kind: v.kind === 'known' ? 'url' : 'history', title: v.title, detail: v.key, url: v.url }))
  const kept = bookmarks().places(typed, limit)
  const marks = [...kept.found, ...kept.slips].slice(0, limit).map((p): Suggestion => ({ kind: 'bookmark', title: p.title, detail: p.key, url: p.url }))
  return [...visited, ...marks]
}

provideData({
  async suggest(text, limit) { return kindsFor(text, limit) },
  visits(sites) { return history().visitsTo(sites) },
  everything(matching, limit = 500) {
    return history().everything(matching).slice(0, limit).map(v => ({ url: v.url, title: v.title, lastVisit: v.last, visits: v.count }))
  },
  recordVisit(visit: HistoryVisit) { history().record(visit.url, visit.title) },
  recordTitle(url, title) { history().retitle(url, title) },
  isBookmarked(url) { return bookmarks().contains(url) },
  async bookmarks() {
    const out: Bookmark[] = []
    const walk = (nodes: BookmarkNode[], folder?: string) => nodes.forEach(n => {
      if (isFolder(n)) walk(n.children ?? [], folder ? `${folder}/${n.title}` : n.title)
      else out.push({ id: n.id, url: n.url!, title: n.title, folder })
    })
    walk(bookmarks().roots)
    return out
  },
})

// bookmark commands (05 §3.2)

const lastFolderKey = 'bookmarks.lastFolder.bookmarks.json'
function lastFolder(): string | null {
  const id = getMeta<string>(lastFolderKey)
  return id && bookmarks().bookmark(id) && isFolder(bookmarks().bookmark(id)!) ? id : null
}

handle('bookmark.add', ({ url, title, folder }, ctx) => {
  const tab = url ? null : model.activeTab(need(ctx).record)
  const page = url ?? (tab && !tab.empty ? tab.url : '')
  if (!page) return null
  const into = folder === undefined ? lastFolder() : folder
  if (folder !== undefined) setMeta(lastFolderKey, folder ?? undefined)
  const made = bookmarks().add(page, title ?? tab?.title ?? '', into)
  return made ? { added: true, bookmark: made } : { added: false, bookmark: bookmarks().forURL(page) ?? null }
})

/** Ctrl+D: the page in front kept, or let go if it already is. */
handle('bookmark.toggle', ({ id }, ctx) => {
  const c = need(ctx)
  const tab = id ? model.tabs.get(id) : model.activeTab(c.record)
  if (!tab || tab.empty) return null
  const there = bookmarks().forURL(tab.url)
  if (there) { bookmarks().remove(there.id); return { bookmarked: false } }
  bookmarks().add(tab.url, tab.title, lastFolder())
  mark(c)
  return { bookmarked: true }
})

handle('bookmark.remove', ({ id }) => { bookmarks().remove(id) })
handle('bookmark.move', ({ id, folder, index }) => {
  bookmarks().move(id, folder, index)
  setMeta(lastFolderKey, folder ?? undefined)
})
handle('bookmark.rename', ({ id, title }) => { bookmarks().rename(id, title) })
handle('bookmark.folder', ({ title, parent }) => bookmarks().newFolder(title, parent))
handle('bookmark.list', ({ query }) => query
  ? bookmarks().matches(query).map(m => ({ ...m.node, path: m.path }))
  : bookmarks().roots)

// history commands (05 §3.5)

handle('history.list', ({ query }) => history().everything(query ?? '').slice(0, 500)
  .map(v => ({ url: v.url, title: v.title, address: v.address, count: v.count, last: v.last })))
handle('history.forget', ({ url }) => { history().forget(url) })
handle('history.clear', () => { history().clear() })

// bench (test worlds only)

benchRequest('data.visit', req => {
  history().record(String(req.url), String(req.title ?? ''))
  return {}
})
benchRequest('data.title', req => { history().retitle(String(req.url), String(req.title)); return {} })
benchRequest('data.take', req => {
  for (const p of req.places as { url: string; title?: string; count?: number; daysAgo?: number }[]) {
    history().take(p.url, p.title ?? '', p.count ?? 1, Date.now() - (p.daysAgo ?? 0) * 86_400_000)
  }
  history().settle()
  return { size: history().size }
})
benchRequest('data.suggest', async req => ({ offers: placeOffers(String(req.text), Number(req.limit ?? 3)) }))
benchRequest('data.kinds', async req => ({ rows: await data.suggest(String(req.text), Number(req.limit ?? 12)) }))
benchRequest('data.visitsTo', req => ({ counts: data.visits((req.sites ?? []) as string[]) }))
benchRequest('data.everything', req => ({ traces: data.everything(String(req.text ?? ''), Number(req.limit ?? 50)) }))
benchRequest('data.historyOffers', req => ({ offers: history().suggestions(String(req.text), Number(req.limit ?? 5)) }))
benchRequest('data.history', () => ({ size: history().size, file: history().fileList() }))
benchRequest('data.bookmarks', () => ({ roots: bookmarks().roots, count: bookmarks().count }))
benchRequest('data.isBookmarked', req => ({ value: bookmarks().contains(String(req.url)) }))
benchRequest('data.flush', () => { history().flush(); bookmarks().flush(); return {} })
benchRequest('data.editable', req => ({ value: editable(String(req.url)) }))
