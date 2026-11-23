// What other modules may ask of the data module. The signatures are fixed
// (orchestrator); the data module fills in the bodies. Until it does, these
// answer with nothing, so the field and the rest work against them.

import type { Suggestion } from '../../shared/state'

export interface HistoryVisit { url: string; title: string; visitedAt: number }
export interface Bookmark { id: string; url: string; title: string; folder?: string }

export const data = {
  /** Suggestions from history and bookmarks for what was typed, best first. */
  async suggest(_text: string, _limit: number): Promise<Suggestion[]> { return [] },
  /** A page was visited (called by the tabs module on every main-frame navigation). */
  recordVisit(_visit: HistoryVisit): void {},
  /** Title of a page changed after the visit. */
  recordTitle(_url: string, _title: string): void {},
  isBookmarked(_url: string): boolean { return false },
  async bookmarks(): Promise<Bookmark[]> { return [] },
}

/** The data module replaces the bodies with its own at start. */
export function provideData(impl: Partial<typeof data>): void { Object.assign(data, impl) }
