// What a line typed in the field means: an address to open or words to search.
// The full rules (keywords like "yt cats", commands, search:// pages) are in
// studio/03 §1-3 and belong to the field module; this is the common core.

import { engines } from '../shared/prefs'

const schemes = /^(https?|file|ftp|oriel|search|chrome-extension|about|data|view-source):/i
const hostLike = /^(localhost|\[[0-9a-f:]+\]|(\d{1,3}\.){3}\d{1,3}|([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62})(:\d+)?(\/.*)?$/i

export function resolveInput(input: string, engine = 'google'): { url: string; searched: boolean } {
  const text = input.trim()
  if (!text) return { url: '', searched: false }
  if (schemes.test(text)) return { url: text, searched: false }
  if (!/\s/.test(text) && hostLike.test(text)) {
    const local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[)/i.test(text) || text.endsWith('.local') || /\.(test|localhost)(:\d+)?(\/|$)/.test(text)
    return { url: `${local ? 'http' : 'https'}://${text}`, searched: false }
  }
  const e = engines[engine] ?? engines.google
  return { url: e.search.replace('%s', encodeURIComponent(text)), searched: true }
}

/** The address as the field and the column show it: no scheme, no www. */
export function displayAddress(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'search:') return url
    return (u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search).replace(/\/$/, '')
  } catch {
    return url
  }
}
