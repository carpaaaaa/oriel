// The blocker's engine without Electron: which lists, how they are put
// together and compiled, and how a compiled engine is read back. Shared by
// the main process (src/main/pages/blocker/index.ts), the worker that
// compiles a day's lists off the main thread and the build, which compiles
// the snapshot bundled with Oriel (scripts/build.mjs). The engine is
// @ghostery/adblocker (MPL-2.0): uBlock Origin's filter syntax, network,
// cosmetic and procedural filters, scriptlets and redirects.

import { createHash } from 'node:crypto'
import { FiltersEngine, ENGINE_VERSION } from '@ghostery/adblocker'
import sources from './lists.json'

export { ENGINE_VERSION }

export interface Source { id: string; title: string; license: string; urls: string[] }

/** uBlock Origin's default lists, as uBlock Origin has them on (lists.json). */
export const listSources: Source[] = sources.lists
/** uBlock Origin's scriptlets and redirect resources. */
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

/** The lists, compiled with their resources, as bytes for engine.bin. */
export function compile(lists: string[], resources: string): Uint8Array {
  const engine = FiltersEngine.parse(lists.join('\n'), CONFIG)
  if (resources && !engine.updateResources(resources, checksum(resources))) throw new Error('the resources were refused')
  return engine.serialize()
}

/** An engine read back from engine.bin; throws on bytes of another engine
 * version or damaged ones (the engine checks both). */
export function load(bytes: Uint8Array): FiltersEngine {
  const engine = FiltersEngine.deserialize(bytes)
  engine.updateEnv(env())
  return engine
}

/** A small engine from filters given here (a test world's own list), with
 * another engine's resources, or ones given as text. */
export function fromText(filters: string, resources?: string | FiltersEngine | null): FiltersEngine {
  const engine = FiltersEngine.parse(filters, CONFIG)
  if (typeof resources === 'string' && resources) engine.updateResources(resources, checksum(resources))
  else if (resources && typeof resources === 'object') engine.resources = resources.resources
  engine.updateEnv(env())
  return engine
}
