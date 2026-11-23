// Where a redirect rule sends a request (url, extensionPath, transform,
// regexSubstitution), and upgradeScheme.

import type { URLTransform } from './types'

function editQuery(query: string, t: NonNullable<URLTransform['queryTransform']>): string {
  // Raw pairs, so the parameters left alone keep their exact spelling.
  let pairs = query.replace(/^\?/, '').split('&').filter(p => p !== '')
  const keyOf = (p: string) => { const i = p.indexOf('='); return i < 0 ? p : p.slice(0, i) }
  if (t.removeParams?.length) {
    const drop = new Set(t.removeParams)
    pairs = pairs.filter(p => !drop.has(keyOf(p)))
  }
  for (const { key, value, replaceOnly } of t.addOrReplaceParams ?? []) {
    const at = pairs.findIndex(p => keyOf(p) === key)
    if (at >= 0) pairs[at] = `${key}=${value}`
    else if (!replaceOnly) pairs.push(`${key}=${value}`)
  }
  return pairs.length ? '?' + pairs.join('&') : ''
}

export function applyTransform(url: string, t: URLTransform): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (t.host !== undefined) u.hostname = t.host
  if (t.port !== undefined) u.port = t.port
  if (t.path !== undefined) u.pathname = t.path === '' ? '/' : t.path
  if (t.query !== undefined) u.search = t.query
  else if (t.queryTransform) u.search = editQuery(u.search, t.queryTransform)
  if (t.fragment !== undefined) u.hash = t.fragment
  if (t.username !== undefined) u.username = t.username
  if (t.password !== undefined) u.password = t.password
  let out = u.href
  // The URL setter can't move between special and other schemes.
  if (t.scheme !== undefined) out = t.scheme + out.slice(out.indexOf(':'))
  return out
}

export function upgrade(url: string): string | null {
  if (url.startsWith('http:')) return 'https:' + url.slice(5)
  if (url.startsWith('ws:')) return 'wss:' + url.slice(3)
  return null
}
