// What a line typed in the field means: an address to open, a file, a site
// shortcut ("yt cats") or words for the engine. Address.swift, ported rule
// for rule (studio/03 §1.2); the engines and shortcuts are in field/engines.ts.

import { brand } from '../shared/brand'
import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { destination } from './field/engines'

/** The internal pages' scheme (the Mac's search://). */
export const PAGE_SCHEME = brand.scheme

/** Schemes the window shows itself (Address.ours); anything else typed with
 * a scheme is somebody else's job. chrome-extension: is Windows' own
 * addition, for the extensions' pages. */
const ours = new Set(['http', 'https', 'file', 'about', 'data', PAGE_SCHEME, 'chrome-extension'])

const letters = /^\p{L}+$/u
const labelChars = /^[\p{L}\p{N}-]+$/u

function byte(s: string): number | null {
  if (!/^\d{1,3}$/.test(s)) return null
  const n = Number(s)
  return n <= 255 ? n : null
}

function looksLikeHost(host: string): boolean {
  if (host === 'localhost') return true
  const parts = host.split('.')
  // Four numbers is an address on the local network as often as not.
  if (parts.length === 4 && parts.every(p => byte(p) != null)) return true
  if (parts.length < 2) return false
  if (!parts.every(l => l.length > 0 && !l.startsWith('-') && !l.endsWith('-') && labelChars.test(l))) return false
  // A dotted thing ending in letters is a domain; ending in digits, a version.
  const tld = parts[parts.length - 1]
  return tld.length >= 2 && letters.test(tld)
}

/** The private ranges, four numbers and nothing more: 10.io is a website. */
function privateRange(host: string): boolean {
  const parts = host.split('.')
  const o = parts.map(byte)
  if (parts.length !== 4 || o.some(x => x == null)) return false
  return o[0] === 10 || (o[0] === 192 && o[1] === 168) || (o[0] === 172 && o[1]! >= 16 && o[1]! <= 31)
}

function parse(text: string): string | null {
  try { return new URL(text).href } catch { return null }
}

/** Address.url(from:): an address, or null when the words aren't one. */
export function addressURL(typed: string): string | null {
  const text = typed.trim()
  if (!text) return null
  // about: and data: are taken as they are, a data: page with its spaces
  // (the Mac checks for a space first; Windows opens a pasted data: page).
  const lower = text.toLowerCase()
  if (lower.startsWith('about:') || lower.startsWith('data:')) return parse(text)
  if (/\s/.test(text)) return null
  // Written with a scheme, it is taken at its word.
  const split = text.indexOf('://')
  if (split >= 0) {
    if (!ours.has(text.slice(0, split).toLowerCase())) return null
    return parse(text)
  }
  // Everything else has to look like a host before it gets a scheme.
  const head = text.split(/[/?#]/, 1)[0]
  if (head.includes('@')) return null // an email address
  if (head.startsWith('[::1]')) return parse('http://' + text)
  // Names are not case sensitive: LOCALHOST:3000 is a local address like localhost:3000 (Search 1.0.21).
  const host = head.split(':', 1)[0].toLowerCase()
  if (!looksLikeHost(host)) return null
  const local = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host === '127.0.0.1' || host === '0.0.0.0' || privateRange(host)
  return parse((local ? 'http://' : 'https://') + text)
}

/** Address.file(from:): a path to a file on this computer, checked on the
 * disk, so only when Return is pressed. Windows paths too: C:\…, \\server\…,
 * %USERPROFILE% for ~. */
export function fileURL(typed: string): string | null {
  const text = typed.trim()
  let path: string | null = null
  if ((text.startsWith('/') && !text.startsWith('//')) || /^[A-Za-z]:[\\/]/.test(text) || /^\\\\[^\\]/.test(text)) path = text
  else if (text.startsWith('~/') || text.startsWith('~\\')) path = homedir() + text.slice(1)
  if (!path) return null
  try {
    if (!statSync(path).isFile()) return null
  } catch { return null }
  return pathToFileURL(path).href
}

/** Dev servers say 0.0.0.0; it is opened as localhost (Address.reachable). */
export function reachable(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === '0.0.0.0' && (u.protocol === 'http:' || u.protocol === 'https:')) { u.hostname = 'localhost'; return u.href }
  } catch { /* not a URL */ }
  return url
}

/** A page's address as the field shows it for editing (Address.editable):
 * the scheme left off only when the field would put that scheme back. */
export function editable(page: string): string {
  let u: URL
  try { u = new URL(page) } catch { return page }
  const full = u.href
  const scheme = u.protocol.slice(0, -1)
  if (!full.toLowerCase().startsWith(scheme + '://')) return full
  const short = full.slice(scheme.length + 3)
  const candidates = [short]
  if (u.pathname === '/' && !u.search && !u.hash && short.endsWith('/')) candidates.unshift(short.slice(0, -1))
  for (const candidate of candidates) {
    const back = addressURL(candidate)
    if (back && (back === full || back + '/' === full)) return candidate
  }
  return full
}

/** An address as a row shows it: without a leading www. */
export function withoutWWW(address: string): string {
  return address.toLowerCase().startsWith('www.') ? address.slice(4) : address
}

/** Host without www and the path, as a tab says it before its title. */
export function pretty(url: string): string {
  try {
    const u = new URL(url)
    if (!u.host) return url
    const bare = u.host.replace(/^www\./, '')
    return u.pathname === '' || u.pathname === '/' ? bare : bare + safeDecode(u.pathname)
  } catch { return url }
}

function safeDecode(s: string): string {
  try { return decodeURI(s) } catch { return s }
}

/** History.identity: no fragment, no name and password, scheme and host
 * lowercased, an absent path is "/". */
export function identity(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.username = ''
    u.password = ''
    return u.href
  } catch { return url }
}

/** The address ⌘L brings up: the page's, never a name and password. */
export function shownAddress(url: string): string {
  try {
    const u = new URL(url)
    if (!u.username && !u.password) return url
    u.username = ''
    u.password = ''
    return u.href
  } catch { return url }
}

/** What the field and the column show: no scheme, no www. */
export function displayAddress(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === PAGE_SCHEME + ':') return url
    return (u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search).replace(/\/$/, '')
  } catch {
    return url
  }
}

/** Where a line typed somewhere other than the field goes (a link from
 * another app, tab.go): a file, an address, a shortcut, else the engine
 * (Browser.destination without a chip). */
export function resolveInput(input: string, _engine?: string): { url: string; searched: boolean } {
  const text = input.trim()
  if (!text) return { url: '', searched: false }
  const place = fileURL(text) ?? addressURL(text)
  if (place) return { url: reachable(place), searched: false }
  const url = destination(text)
  return { url: url ?? '', searched: !!url }
}
