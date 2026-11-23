// Addresses as the data module reads them: a page's identity, what the field
// matches against, a site's host and registrable domain (History.swift,
// Vault.swift, Address.swift on the Mac).

import { randomUUID } from 'node:crypto'
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

// Second-level suffixes under which a registrable domain takes three labels.
// A short stand-in for the Public Suffix List (05 §2.11: tldts is the real one).
const twoPart = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  'co.nz', 'org.nz', 'net.nz', 'govt.nz', 'ac.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'gr.jp',
  'com.br', 'net.br', 'org.br', 'gov.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.tr', 'com.cn', 'net.cn', 'org.cn',
  'com.hk', 'com.sg', 'com.tw', 'com.my', 'co.in', 'net.in', 'org.in', 'co.za', 'co.kr', 'or.kr', 'co.il', 'co.id',
  'gouv.fr', 'gov.it', 'edu.it', 'co.it', 'gv.at', 'co.at', 'or.at', 'com.es', 'org.es', 'com.pl', 'net.pl', 'com.ua',
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'blogspot.com',
  'azurewebsites.net', 'cloudfront.net', 'appspot.com', 'web.app', 'firebaseapp.com',
])

/** example.com for www.example.com and accounts.example.com; bbc.co.uk stays
 * bbc.co.uk (Vault.registrable). An address or a single label is itself. */
export function registrable(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (/^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return h
  const labels = h.split('.')
  if (labels.length <= 2) return h
  const lastTwo = labels.slice(-2).join('.')
  return twoPart.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo
}

/** An id as Swift writes a UUID. */
export const newID = () => randomUUID().toUpperCase()
