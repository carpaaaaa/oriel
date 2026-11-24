// The blocker's engine without Electron: which lists, how they are put
// together and compiled, and how a compiled engine is read back. Shared by
// the main process (src/main/pages/blocker/index.ts), the worker that
// compiles a day's lists off the main thread and the build, which compiles
// the snapshot bundled with Oriel (scripts/build.mjs). The engine is
// @ghostery/adblocker (MPL-2.0): uBlock Origin's filter syntax, network,
// cosmetic and procedural filters, scriptlets and redirects. Two engines in
// one file: the lists' filters, and their $popup filters (which the engine
// would drop), asked when a page opens a tab or a window.

import { createHash } from 'node:crypto'
import { FiltersEngine, ENGINE_VERSION as GHOSTERY_ENGINE } from '@ghostery/adblocker'
import sources from './lists.json'

/** The engine's own format version and this file's: either changing makes
 * a kept engine.bin unreadable, and it is made again from the lists. */
const FORMAT = 2
export const ENGINE_VERSION = GHOSTERY_ENGINE * 100 + FORMAT

/** `sha256` pins a source to one exact text (the resources). */
export interface Source { id: string; title: string; license: string; urls: string[]; sha256?: string }

/** uBlock Origin's default lists, as uBlock Origin has them on (lists.json). */
export const listSources: Source[] = sources.lists
/** uBlock Origin's scriptlets and redirect resources, pinned. */
export const resourceSource: Source = sources.resources

/** What the engine takes from the lists. HTML filtering needs the response
 * body, which Electron's webRequest never gives: off, as cap_html_filtering. */
export const CONFIG = {
  loadNetworkFilters: true,
  loadCosmeticFilters: true,
  loadGenericCosmeticsFilters: true,
  loadExtendedSelectors: true,
  loadCSPFilters: true,
  loadExceptionFilters: true,
  loadPreprocessors: true,
  enableHtmlFiltering: false,
  enableMutationObserver: true,
  enableOptimizations: true,
  integrityCheck: true,
}

/** The pop-up engine: network filters and their exceptions only. */
const POPUP_CONFIG = { ...CONFIG, loadCosmeticFilters: false, loadGenericCosmeticsFilters: false, loadExtendedSelectors: false, loadCSPFilters: false }

/** The !#if names the lists test, answered as uBlock Origin answers them in
 * Chrome: what a list keeps for Chromium, for uBlock Origin's own syntax
 * and for a browser that can add a user stylesheet. */
export function env(): Map<string, boolean> {
  return new Map([
    ['env_chromium', true],
    ['ext_ublock', true],
    ['cap_user_stylesheet', true],
    ['cap_html_filtering', false],
    ['env_mobile', false],
    ['env_mv3', false],
    ['ext_ubol', false],
    ['adguard', false],
    ['ext_abp', false],
  ])
}

export const checksum = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16)
export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** A pinned source's text is exactly the one pinned; any other source's is
 * whatever its server gives. */
export const pinned = (s: Source, text: string): boolean => !s.sha256 || sha256(text) === s.sha256

/** uBlock Origin's `!#include name.txt`: a file beside the list, nowhere
 * else, put in place of the line (inside the `!#if` around it, if any). */
export async function withIncludes(text: string, from: string, get: (url: string) => Promise<string>): Promise<string> {
  if (!text.includes('!#include')) return text
  const base = new URL(from)
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = /^!#include\s+(\S+)\s*$/.exec(lines[i])
    if (!m) continue
    const target = new URL(m[1], base)
    const sameFolder = target.origin === base.origin && target.pathname.slice(0, target.pathname.lastIndexOf('/')) === base.pathname.slice(0, base.pathname.lastIndexOf('/'))
    if (!sameFolder) { lines[i] = ''; continue }
    const part = await get(target.href)
    if (!looksLikeList(part, false)) throw new Error(`${target.href} isn't a filter list`)
    lines[i] = part.replace(/!#include[^\n]*/g, '')
  }
  return lines.join('\n')
}

/** A filter list, not an error page or a captive portal's sign-in. */
export function looksLikeList(text: string, whole = true, least = 20): boolean {
  if (typeof text !== 'string') return false
  const head = text.slice(0, 512).trimStart().toLowerCase()
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return false
  if (!whole) return true
  let filters = 0
  for (const line of text.split('\n', 2000)) if (line && line[0] !== '!' && line[0] !== '[' && line[0] !== '#') filters++
  return filters >= least
}

/** uBlock Origin's resources in the form the engine reads (JSON, with scriptlets). */
export function looksLikeResources(text: string, least = 20): boolean {
  try {
    const r = JSON.parse(text) as { scriptlets?: unknown[]; redirects?: unknown[] }
    return Array.isArray(r.scriptlets) && r.scriptlets.length >= least && Array.isArray(r.redirects) && r.redirects.length >= Math.min(least, 10)
  } catch { return false }
}

// What the engine reads differently from uBlock Origin

/** A cosmetic filter's separator (##, #@#, #?#, #$#, #%# and their exceptions). */
const COSMETIC = /#@?(?:\$\??|\?|%)?#/
const DIRECTIVE = /^!#(?:if|else|endif)\b/

/** uBlock Origin's `$all` and `$popup`, put as the engine can read them.
 * The engine reads `$all` as a plain filter, which never stops a page (only
 * a filter for pages does, as in uBlock Origin): it becomes one filter for
 * pages ($document) and one for everything else ($~document), and a pop-up
 * filter. A `$popup` filter, which the engine drops, goes to the pop-up
 * filters without it. The pop-up filters keep the !#if around them. */
export function prepare(text: string): { network: string; popups: string } {
  const network: string[] = []
  const popups: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (DIRECTIVE.test(t)) { network.push(line); popups.push(line); continue }
    if (!t || t[0] === '!' || t[0] === '[' || COSMETIC.test(t)) { network.push(line); continue }
    const at = t.lastIndexOf('$')
    if (at < 0) { network.push(line); continue }
    const options = t.slice(at + 1).split(',')
    const names = options.map(o => o.split('=')[0].trim().toLowerCase())
    const all = names.indexOf('all')
    const popup = names.indexOf('popup')
    if (all < 0 && popup < 0) { network.push(line); continue }
    const pattern = t.slice(0, at)
    const rest = options.filter((_, i) => i !== all && i !== popup)
    const write = (more: string[]) => { const o = [...rest, ...more]; return o.length ? `${pattern}$${o.join(',')}` : pattern }
    if (all >= 0) {
      if (pattern.startsWith('@@')) network.push(write([]))
      else network.push(write(['document']), write(['~document']))
    }
    popups.push(write([]))
  }
  return { network: network.join('\n'), popups: popups.join('\n') }
}

/** The lists' engine and their pop-up filters' (null without any). */
export interface Engines { main: FiltersEngine; popups: FiltersEngine | null }

const MAGIC = 'ORIEL-BLOCKER-' + String(FORMAT).padStart(2, '0')

/** Both engines in one file: a header, the first engine's length, both. */
function pack(main: Uint8Array, popups: Uint8Array): Uint8Array {
  const head = new TextEncoder().encode(MAGIC)
  const out = new Uint8Array(head.length + 4 + main.length + popups.length)
  out.set(head, 0)
  new DataView(out.buffer).setUint32(head.length, main.length, true)
  out.set(main, head.length + 4)
  out.set(popups, head.length + 4 + main.length)
  return out
}

function unpack(bytes: Uint8Array): { main: Uint8Array; popups: Uint8Array } {
  const head = new TextEncoder().encode(MAGIC)
  if (bytes.length < head.length + 4 || new TextDecoder().decode(bytes.subarray(0, head.length)) !== MAGIC) throw new Error('not an engine of this version')
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(head.length, true)
  const start = head.length + 4
  if (start + length > bytes.length) throw new Error('a damaged engine')
  // Copies (a Buffer's slice is a view): the engine reads its bytes through
  // views that want them aligned.
  return { main: new Uint8Array(bytes.subarray(start, start + length)), popups: new Uint8Array(bytes.subarray(start + length)) }
}

function parse(text: string, resources?: string | FiltersEngine | null): Engines {
  const { network, popups } = prepare(text)
  const main = FiltersEngine.parse(network, CONFIG)
  if (typeof resources === 'string' && resources) {
    if (!main.updateResources(resources, checksum(resources))) throw new Error('the resources were refused')
  } else if (resources && typeof resources === 'object') main.resources = resources.resources
  return { main, popups: FiltersEngine.parse(popups, POPUP_CONFIG) }
}

/** The lists, compiled with their resources, as bytes for engine.bin. */
export function compile(lists: string[], resources: string): Uint8Array {
  const e = parse(lists.join('\n'), resources)
  return pack(e.main.serialize(), e.popups!.serialize())
}

/** The engines read back from engine.bin; throws on bytes of another
 * version or damaged ones (the engine checks its own too). */
export function load(bytes: Uint8Array): Engines {
  const parts = unpack(bytes)
  const main = FiltersEngine.deserialize(parts.main)
  const popups = FiltersEngine.deserialize(parts.popups)
  main.updateEnv(env())
  popups.updateEnv(env())
  return { main, popups }
}

/** Small engines from filters given here (a test world's own list), with
 * another engine's resources, or ones given as text. */
export function fromText(filters: string, resources?: string | FiltersEngine | null): Engines {
  const e = parse(filters, resources)
  e.main.updateEnv(env())
  e.popups?.updateEnv(env())
  return e
}
