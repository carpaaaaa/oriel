// Bringing a browser's things in: where each lands, what is said after, and
// what is remembered of it (ImportPanel.bring, Browser.takeBookmarks,
// takePlaces, ImportRecords; studio/05 §1.10-1.12).

import type { ImportPreview, ImportSaid, BookmarkNode } from '../../shared/modules/data'
import { bookmarks, history } from '../data/store'
import { records, top } from '../data/meta'
import { count as countMarks } from '../data/bookmarks'
import type { Source } from './sources'
import * as chromium from './chromium'
import * as gecko from './gecko'

export const n = (x: number) => x.toLocaleString('en-US')
export const plural = (x: number, one: string) => x === 1 ? `1 ${one}` : `${n(x)} ${one}s`

export function preview(source: Source, profile: string | null): ImportPreview {
  return source.family === 'chromium' ? chromium.preview(source, profile) : gecko.preview(source, profile)
}

export function bookmarkRead(source: Source, profile: string | null): { nodes: BookmarkNode[]; complete: boolean } {
  return source.family === 'chromium' ? chromium.bookmarkRead(source, profile) : gecko.bookmarkRead(source, profile)
}

export function placesOf(source: Source, profile: string | null) {
  return source.family === 'chromium' ? chromium.places(source, profile) : gecko.places(source, profile)
}

/** The bookmarks of a browser, merged in; with `replacing`, what came from it
 * before goes first, but only when every profile read cleanly (#375). */
export function takeBookmarks(source: Source, profile: string | null, replacing: boolean): { added: number; already: number; kept: boolean; found: number } {
  const read = bookmarkRead(source, profile)
  let kept = false
  const earlier = records.of(source.name)
  if (replacing && earlier?.bookmarkIDs.length) {
    if (read.complete) {
      bookmarks().withdraw(earlier.bookmarkIDs)
      records.forgetBookmarks(source.name)
    } else kept = true
  }
  const taken = bookmarks().takeNoting(read.nodes, source.name, top)
  records.note(source.name, { ids: taken.ids, bookmarks: taken.added })
  return { added: taken.added, already: taken.already, kept, found: countMarks(read.nodes) }
}

/** Its history into ours: the larger count, the later date (History.take). */
export function takePlaces(source: Source, profile: string | null): number {
  const list = placesOf(source, profile)
  for (const p of list) history().take(p.url, p.title, p.count, p.last)
  history().settle()
  records.note(source.name, { places: list.length })
  return list.length
}

export function bookmarksSaid(name: string, r: { added: number; already: number; kept: boolean }): ImportSaid {
  if (r.kept) return { ok: false, text: `Couldn't read all of ${name}'s bookmarks: what came from it before was kept, ${n(r.added)} new` }
  return {
    ok: true,
    text: r.added === 0 && r.already === 0 ? `No bookmarks in ${name}`
      : r.already === 0 ? `${n(r.added)} bookmarks`
      : `${n(r.added)} new bookmarks, ${n(r.already)} already here`,
  }
}

/** "312 bookmarks, 1,204 places and 58 passwords, 27 Sep" (broughtBefore). */
export function broughtBefore(r: { date: number; bookmarks: number; places: number; passwords: number }): string {
  const parts = ([[r.bookmarks, 'bookmark'], [r.places, 'place'], [r.passwords, 'password']] as [number, string][])
    .filter(([x]) => x > 0).map(([x, one]) => plural(x, one))
  const what = parts.length ? listed(parts) : 'Nothing new'
  return `${what}, ${dayMonth(r.date)}`
}

export function dayMonth(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(ms))
}

/** "a, b and c", as ListFormatter writes it in English. */
export function listed(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
}

/** Hooks other modules fill in: the extensions module installs from the
 * Chrome Web Store, one confirmation each (05 §1.3). */
export const importHooks: {
  installedExtensions: () => string[]
  installExtensions: (ids: string[]) => void
} = {
  installedExtensions: () => [],
  installExtensions: () => {},
}
