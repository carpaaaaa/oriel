// The interface's symbols. On the Mac these are SF Symbols, which can't ship
// on Windows; these are drawn to the same box and weight (studio/02 §7).
// One stroke width, round caps, currentColor.

import type { JSX } from 'solid-js'

type P = { size?: number; class?: string; style?: JSX.CSSProperties }

const svg = (d: JSX.Element, vb = 16) => (p: P) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox={`0 0 ${vb} ${vb}`} fill="none" stroke="currentColor"
    stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class={p.class} style={p.style} aria-hidden="true">{d}</svg>
)

export const Back = svg(<path d="M10 3.5 5.5 8l4.5 4.5" />)
export const Forward = svg(<path d="M6 3.5 10.5 8 6 12.5" />)
export const Reload = svg(<><path d="M12.6 6.4A4.9 4.9 0 1 0 12.8 9" /><path d="M12.9 3.4v3.2H9.7" /></>)
export const Stop = svg(<path d="m4.5 4.5 7 7m0-7-7 7" />)
export const Close = svg(<path d="m5 5 6 6m0-6-6 6" />)
export const Plus = svg(<path d="M8 3.5v9M3.5 8h9" />)
export const Speaker = svg(<><path d="M3 6.2h2.2L8.4 3.6v8.8L5.2 9.8H3z" /><path d="M10.6 6.1a2.7 2.7 0 0 1 0 3.8" /></>)
export const SpeakerOff = svg(<><path d="M3 6.2h2.2L8.4 3.6v8.8L5.2 9.8H3z" /><path d="m10.5 6.5 3 3m0-3-3 3" /></>)
export const Globe = svg(<><circle cx="8" cy="8" r="5.6" /><path d="M2.6 8h10.8M8 2.4c1.6 1.6 2.4 3.5 2.4 5.6S9.6 12 8 13.6C6.4 12 5.6 10.1 5.6 8S6.4 4 8 2.4" /></>)
export const Search = svg(<><circle cx="7" cy="7" r="4.2" /><path d="m10.2 10.2 3.3 3.3" /></>)
export const Sidebar = svg(<><rect x="2.5" y="3" width="11" height="10" rx="2.2" /><path d="M6.3 3v10" /></>)
export const Puzzle = svg(<path d="M6 2.8a1.4 1.4 0 0 1 2.8 0v1h2.6v2.6h1a1.4 1.4 0 0 1 0 2.8h-1v3.2H8.6v-1a1.4 1.4 0 0 0-2.8 0v1H2.6V9.2h1a1.4 1.4 0 0 0 0-2.8h-1V3.8H6z" />)

/** Windows 11 caption glyphs (Segoe Fluent's shapes at 10 px). */
export const WinMinimize = (p: P) => <svg width={10} height={10} viewBox="0 0 10 10" class={p.class}><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
export const WinMaximize = (p: P) => <svg width={10} height={10} viewBox="0 0 10 10" class={p.class}><rect x=".5" y=".5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1" /></svg>
export const WinRestore = (p: P) => <svg width={10} height={10} viewBox="0 0 10 10" class={p.class}><rect x=".5" y="2.5" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" stroke-width="1" /><path d="M2.5 2.5V1.8c0-.7.6-1.3 1.3-1.3h4.4c.7 0 1.3.6 1.3 1.3v4.4c0 .7-.6 1.3-1.3 1.3h-.7" fill="none" stroke="currentColor" stroke-width="1" /></svg>
export const WinClose = (p: P) => <svg width={10} height={10} viewBox="0 0 10 10" class={p.class}><path d="m.5.5 9 9m0-9-9 9" stroke="currentColor" stroke-width="1" /></svg>
