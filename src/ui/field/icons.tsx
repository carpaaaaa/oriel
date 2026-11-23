// The field's own symbols, drawn to SF Symbols' boxes (studio/02 §7.2):
// magnifyingglass, command, clock.arrow.circlepath, bookmark, pin,
// chevron.up/down, ellipsis, xmark. One stroke, round caps, currentColor.

import type { JSX } from 'solid-js'

type P = { size?: number; weight?: number; class?: string }

const svg = (d: JSX.Element) => (p: P) => (
  <svg width={p.size ?? 11} height={p.size ?? 11} viewBox="0 0 16 16" fill="none" stroke="currentColor"
    stroke-width={p.weight ?? 1.6} stroke-linecap="round" stroke-linejoin="round" class={p.class} aria-hidden="true">{d}</svg>
)

export const Lens = svg(<><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.6 3.6" /></>)
export const CommandKey = svg(<path d="M6 6V4.2A1.7 1.7 0 1 0 4.2 6H6Zm0 0h4m-4 0v4m4-4V4.2A1.7 1.7 0 1 1 11.8 6H10Zm0 0v4m0 0h1.8A1.7 1.7 0 1 1 10 11.8V10Zm0 0H6m0 0v1.8A1.7 1.7 0 1 1 4.2 10H6Z" />)
export const History = svg(<><path d="M3.2 8a4.8 4.8 0 1 0 1.4-3.4" /><path d="M2.8 2.8v2.6h2.6" /><path d="M8 5.4V8l1.8 1.2" /></>)
export const Bookmark = svg(<path d="M4.6 2.6h6.8v10.8L8 11l-3.4 2.4Z" />)
export const Pin = svg(<><path d="M6 2.6h4l-.6 4 2 2H4.6l2-2Z" /><path d="M8 8.6v4.8" /></>)
export const ChevronUp = svg(<path d="m4 10 4-4 4 4" />)
export const ChevronDown = svg(<path d="m4 6 4 4 4-4" />)
export const Ellipsis = (p: P) => (
  <svg width={p.size ?? 11} height={p.size ?? 11} viewBox="0 0 16 16" fill="currentColor" class={p.class} aria-hidden="true">
    <circle cx="3" cy="8" r="1.35" /><circle cx="8" cy="8" r="1.35" /><circle cx="13" cy="8" r="1.35" />
  </svg>
)
export const XMark = svg(<path d="m4 4 8 8m0-8-8 8" />)
