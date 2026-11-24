// Where the bookmark button is. On Windows always up, beside the window's
// buttons, the minimize one next to it (carpa, 24 Nov 2026: "always on top,
// beside the button that minimizes the window"): the strip's last door with
// the tabs across the top; otherwise in the band above the page, 12 left of
// the window's buttons, whatever the column does (left, right, icons only,
// folded away with Ctrl+S). The Mac's places (Side.swift:1706-1747), the
// column's foot, only where there is no such band: the Mac's own frame, and
// full screen with the tabs down a side. Owned by the data module.

import { state } from '../lib/store'
import { P, pref } from '../sidebar/derive'

/** The band above the page that the window's buttons sit in (Windows,
 * Oriel's frame or Windows' own), gone in full screen. */
export const capBand = () => state.chrome === 'windows' && !state.fullScreen && state.frame?.state !== 'fullScreen'

export type DoorPlace = 'strip' | 'corner' | 'foot'

export function bookmarkPlace(): DoorPlace {
  if (state.sidebar.layout === 'top' && !state.sidebar.folded) return 'strip'
  return capBand() ? 'corner' : 'foot'
}

/** 12 between the button and the window's buttons, as before the strip's end. */
export const CORNER_GAP = 12

/** The column on the right, drawn with its band: the window's buttons at the
 * band's far end, back, forward and reload at its start. */
const columnRight = () => state.sidebar.layout === 'side' && state.sidebar.side === 'right' && !state.sidebar.folded && !P.iconColumn()

/** There, whether the button fits between them: 2 after the helm (10 in,
 * doors of 26 and 4 between, the sidebar button's 30), 12 before Minimize.
 * Inline's buttons leave just that in a column of 232; Classic's 46s don't. */
function fitsInBand(): boolean {
  const helm = ['back', 'forward', 'reload'].filter(d => !pref(`helm.${d}.hidden`, false)).length
  const used = 10 + helm * 26 + Math.max(0, helm - 1) * 4 + (P.foldButton() ? 30 : 0)
  return state.sidebar.width - used - state.controlsWidth >= 2 + 26 + CORNER_GAP
}

/** The button shown up beside the window's buttons, in the column's band on
 * the right: what that band keeps free for it (Foot.tsx capRoom). */
export const bookmarkInColumnBand = () =>
  bookmarkPlace() === 'corner' && !state.prefs?.['foot.bookmarks.hidden'] && columnRight() && fitsInBand()

/** How far from the window's right edge the corner's doors end: 12 before
 * the window's buttons; with the column on the right too narrow to hold
 * them beside its helm, still up in the band above the page, 12 before the
 * column, never over back, forward and reload. */
export function cornerRight(): number {
  return columnRight() && !fitsInBand() ? state.sidebar.width + CORNER_GAP : state.controlsWidth + CORNER_GAP
}
