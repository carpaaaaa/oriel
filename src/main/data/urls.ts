// Addresses as the data module reads them: a page's identity, what the field
// matches against, a site's host and registrable domain (History.swift,
// Vault.swift, Address.swift on the Mac).

import { randomUUID } from 'node:crypto'
import { getDomain } from 'tldts'
import { resolveInput } from '../address'

export function parse(text: string): URL | null {
  try { return new URL(text) } catch { return null }
}

export const isWeb = (u: URL | null): u is URL => !!u && (u.protocol === 'http:' || u.protocol === 'https:')

/** A page as it is kept: without a name and password written into its
 * address (History.kept, 05 §3.5). */
export function kept(text: string): URL | null {
  const u = parse(text)
  if (!u) return null
  u.username = ''
  u.password = ''
  return u
}

/** URL identity: scheme and host lowercased, no fragment, no user, an empty
 * path is "/" (History.identity, 05 §3.5). */
export function identity(text: string): string {
  const u = parse(text)
  if (!u) return text
  u.username = ''
  u.password = ''
  u.hash = ''
  return u.href
}

/** Lowercased, without scheme and www: what the field matches (History.stripped). */
export function stripped(address: string): string {
  let t = address.trim().toLowerCase()
  for (const s of ['https://', 'http://']) if (t.startsWith(s)) t = t.slice(s.length)
  if (t.startsWith('www.')) t = t.slice(4)
  return t
}

/** The address as it would be typed back in: without https:// when that
 * comes back the same (Address.editable). */
export function editable(text: string): string {
  const u = parse(text)
  if (!u) return text
  const full = u.href
  const scheme = u.protocol.slice(0, -1)
  if (!full.toLowerCase().startsWith(scheme + '://')) return full
  const short = full.slice(scheme.length + 3)
  const candidates = [short]
  if (u.pathname === '/' && !u.search && !u.hash && short.endsWith('/')) candidates.unshift(short.slice(0, -1))
  for (const c of candidates) {
    const back = parse(resolveInput(c).url)
    if (back && (back.href === full || back.href + '/' === full)) return c
  }
  return full
}

/** The site's front door: same scheme, host and port, path "/". */
export function homepage(text: string): string | null {
  const u = parse(text)
  if (!u) return null
  u.username = ''
  u.password = ''
  u.pathname = '/'
  u.search = ''
  u.hash = ''
  return u.href
}

/** A site's host as passwords are kept under it: lowercased, no www, only
 * http and https (Vault.host, 05 §2.1). "" for anything else, an Android
 * app's login included. */
export function siteHost(text: string): string {
  let value = text.trim()
  if (!value.includes('://')) value = 'https://' + value
  const u = parse(value)
  if (!isWeb(u) || !u.hostname) return ''
  const host = u.hostname.toLowerCase()
  return host.startsWith('www.') ? host.slice(4) : host
}

/** example.com for www.example.com and accounts.example.com; bbc.co.uk stays
 * bbc.co.uk; a site on github.io is its own (Vault.registrable, with the
 * Public Suffix List from tldts, private suffixes included). An address or a
 * single label is itself. */
export function registrable(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '')
  return getDomain(h, { allowPrivateDomains: true }) ?? h
}

export const newID = () => randomUUID().toUpperCase()
