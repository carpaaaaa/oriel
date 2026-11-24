// What a page may open (studio/09 §1.4). Apart from internal.ts, with no
// imports of Oriel's own, so the tabs, peek, small windows and site panel
// can ask it without a cycle.

import { brand } from '../../shared/brand'

export const isInternal = (url: string | undefined | null) => !!url && url.startsWith(`${brand.scheme}:`)

const schemeOf = (url: string) => /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase() ?? ''

/** A page asking for a tab or a window (window.open, target=_blank, a link
 * Oriel opens for it): a website gets none of Oriel's pages (Chrome refuses
 * chrome:// the same way), nor script or data: (Chromium refuses those to a
 * page; opened by Oriel they would load as if typed), nor a file of this
 * computer unless it is a file itself. An Oriel page may open anything; the
 * interface and the field don't ask here. */
export function refusesInternal(fromURL: string, toURL: string): boolean {
  if (isInternal(fromURL)) return false
  if (isInternal(toURL)) return true
  const to = schemeOf(toURL)
  if (to === 'javascript' || to === 'data') return true
  return to === 'file' && schemeOf(fromURL) !== 'file'
}

/** Pages refused, for the bench. */
export const refusedOpens: { from: string; url: string; how: string }[] = []

/** refusesInternal, kept for the bench when it says no. */
export function pageMayNotOpen(fromURL: string, toURL: string, how: string): boolean {
  if (!refusesInternal(fromURL, toURL)) return false
  refusedOpens.push({ from: fromURL, url: toURL, how })
  if (refusedOpens.length > 50) refusedOpens.shift()
  return true
}
