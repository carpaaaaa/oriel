// What other modules may ask of the data module. The signatures are fixed
// (orchestrator); the data module fills in the bodies. Until it does, these
// answer with nothing, so the field and the rest work against them.

import type { Suggestion } from '../../shared/state'

export interface HistoryVisit { url: string; title: string; visitedAt: number }
export interface Bookmark { id: string; url: string; title: string; folder?: string }

/** A page in the history, as a list of where you have been shows it. */
export interface HistoryTrace { url: string; title: string; lastVisit: number; visits: number }

export const data = {
  /** Places for what was typed, each kind best first and up to `limit` of
   * each (History.suggestions, Bookmarks.places, studio/05 §3.5):
   * kind 'history' (visited), 'url' (a well-known site, the first days) and
   * 'bookmark'; `title` is the page's title ('' when it has none), `detail`
   * its address as the field writes it. Bookmarks found only through a typo
   * come after the others. */
  async suggest(_text: string, _limit: number): Promise<Suggestion[]> { return [] },
  /** How often each site was visited: every page on its host and its
   * subdomains, or under its path for one like google.com/maps
   * (History.visits(to:)), keyed by the site as given. */
  visits(_sites: string[]): Record<string, number> { return {} },
  /** Where you have been, newest first, whose address or title holds the
   * words (History.everything(matching:)): the past searches of a site are
   * read from these (SiteSearch.pastSearches). */
  everything(_matching: string, _limit?: number): HistoryTrace[] { return [] },
  /** The site icon kept for a page, as a data URL, before the page has said
   * anything (studio/01 §2.12-2.13): its own, or its site's. A private tab
   * also sees the icons of its own private pages. */
  icon(_url: string, _shy?: boolean): string | undefined { return undefined },
  /** A page was visited (called by the tabs module on every main-frame navigation). */
  recordVisit(_visit: HistoryVisit): void {},
  /** Title of a page changed after the visit. */
  recordTitle(_url: string, _title: string): void {},
  isBookmarked(_url: string): boolean { return false },
  async bookmarks(): Promise<Bookmark[]> { return [] },
}

/** The data module replaces the bodies with its own at start. */
export function provideData(impl: Partial<typeof data>): void { Object.assign(data, impl) }
