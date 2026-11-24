// Where an extension runs: "Runs on" (ExtensionSiteAccess.swift, studio/04
// §2.5). On the Mac it lives in WebKit's permissions; Chromium in Electron
// has no grants to change while an extension runs, so here the copy Oriel
// keeps of the extension says it: its content scripts and host permissions
// are narrowed to the sites it may run on, and it is loaded again. A site it
// isn't let onto gets none of its scripts, as on the Mac. The manifest as it
// came is kept beside it (.oriel-manifest.json), and put back for "All sites".

import fs from 'node:fs'
import path from 'node:path'
import { writeFileAtomic } from '../model/persist'
import type { SiteAccess } from '../../shared/modules/extensions'

export const ORIGINAL = '.oriel-manifest.json'

type Manifest = Record<string, any>

interface Pattern { scheme: string; host: string; path: string }

/** A match pattern's parts; null for what isn't one. */
export function parsePattern(p: string): Pattern | null {
  if (p === '<all_urls>') return { scheme: '*', host: '*', path: '/*' }
  const m = /^(\*|[a-z][a-z0-9+.-]*):\/\/([^/]*)(\/.*)$/i.exec(p)
  return m ? { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), path: m[3] } : null
}

/** A pattern that reaches websites: http(s), ws(s) or any scheme. Files and
 * the rest are left as they are. */
const web = (p: Pattern) => ['*', 'http', 'https', 'ws', 'wss'].includes(p.scheme)
const hostish = (p: string) => p === '<all_urls>' || p.includes('://')

/** An IP address or a one-word host (localhost): no subdomains. */
const isAddress = (host: string) => !host.includes('.') || /^[0-9.]+$/.test(host)

/** What is left of one asked-for pattern on `host` (and under it with
 * `subdomains`): its scheme and path kept, null when the two don't meet
 * (SiteAccess.narrow). */
export function narrow(p: Pattern, host: string, subdomains: boolean): string | null {
  const mine = subdomains && !isAddress(host) ? `*.${host}` : host
  if (p.host === '*') return `${p.scheme}://${mine}${p.path}`
  if (p.host.startsWith('*.')) {
    const base = p.host.slice(2)
    if (host === base || host.endsWith(`.${base}`)) return `${p.scheme}://${mine}${p.path}`
    if (subdomains && base.endsWith(`.${host}`)) return `${p.scheme}://${p.host}${p.path}`
    return null
  }
  if (p.host === host || (subdomains && p.host.endsWith(`.${host}`))) return `${p.scheme}://${p.host}${p.path}`
  return null
}

/** Every pattern a manifest asks for: hosts, content scripts. */
function requested(m: Manifest): string[] {
  const perms: string[] = m.manifest_version === 2 ? (m.permissions ?? []).filter((x: unknown) => typeof x === 'string' && hostish(x)) : []
  return [
    ...(m.host_permissions ?? []),
    ...perms,
    ...((m.content_scripts ?? []) as { matches?: string[] }[]).flatMap(c => c.matches ?? []),
  ].filter((x): x is string => typeof x === 'string')
}

/** It asks for a website at all; one that doesn't has nothing for "Runs on"
 * to choose (Extensions.asksForSites). */
export function asksForSites(m: Manifest): boolean {
  return requested(m).some(x => { const p = parsePattern(x); return !!p && web(p) })
}

/** Whether anything it asks for reaches `host`: a click there gives it
 * something (Extensions.grantClick). */
export function reaches(m: Manifest, host: string): boolean {
  return requested(m).some(x => { const p = parsePattern(x); return !!p && web(p) && narrow(p, host, false) !== null })
}

/** The manifest held to `access`, plus the sites clicks gave (without their
 * subdomains). */
export function narrowManifest(original: Manifest, access: SiteAccess, clicks: string[]): Manifest {
  const m: Manifest = JSON.parse(JSON.stringify(original))
  const named = access.mode === 'some' ? access.hosts : []
  const fit = (x: string): string[] => {
    const p = parsePattern(x)
    if (!p || !web(p)) return [x]
    const out: string[] = []
    for (const h of named) { const n = narrow(p, h, true); if (n) out.push(n) }
    for (const h of clicks) { const n = narrow(p, h, false); if (n) out.push(n) }
    return out
  }
  const list = (xs: string[]) => [...new Set(xs.flatMap(fit))]
  if (Array.isArray(m.host_permissions)) m.host_permissions = list(m.host_permissions)
  if (m.manifest_version === 2 && Array.isArray(m.permissions)) {
    m.permissions = [...new Set((m.permissions as unknown[]).flatMap(x => (typeof x === 'string' && hostish(x) ? fit(x) : [x])))]
  }
  if (Array.isArray(m.content_scripts)) {
    m.content_scripts = (m.content_scripts as { matches?: string[] }[])
      .map(c => ({ ...c, matches: list(c.matches ?? []) }))
      .filter(c => c.matches.length > 0)
    if (!m.content_scripts.length) delete m.content_scripts
  }
  return m
}

/** The manifest as it came, before any narrowing. */
export function originalManifest(folder: string): Manifest | null {
  for (const f of [ORIGINAL, 'manifest.json']) {
    try { return JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8')) } catch { /* next */ }
  }
  return null
}

/** The kept copy's manifest made what `access` and the clicks allow. */
export function writeSites(folder: string, access: SiteAccess, clicks: string[]): void {
  const file = path.join(folder, 'manifest.json')
  const kept = path.join(folder, ORIGINAL)
  const restricted = access.mode !== 'all'
  if (!restricted) {
    if (fs.existsSync(kept)) { writeFileAtomic(file, fs.readFileSync(kept, 'utf8')); fs.rmSync(kept, { force: true }) }
    return
  }
  const text = fs.existsSync(kept) ? fs.readFileSync(kept, 'utf8') : fs.readFileSync(file, 'utf8')
  // Atomic, the original first: a manifest cut short would leave an extension that won't load (studio/09 §3).
  if (!fs.existsSync(kept)) writeFileAtomic(kept, text)
  writeFileAtomic(file, JSON.stringify(narrowManifest(JSON.parse(text), access, clicks), null, 2))
}

/** A page's address against a match pattern ('*' = http or https). */
export function matchesUrl(pattern: string, url: string): boolean {
  const p = parsePattern(pattern)
  let u: URL
  try { u = new URL(url) } catch { return false }
  if (!p) return false
  const scheme = u.protocol.slice(0, -1)
  if (p.scheme === '*' ? !['http', 'https'].includes(scheme) : p.scheme !== scheme) return false
  const host = u.hostname.toLowerCase()
  const want = p.host.replace(/:\d+$/, '')
  if (want !== '*' && !(want.startsWith('*.') ? host === want.slice(2) || host.endsWith(want.slice(1)) : host === want)) return false
  const re = new RegExp(`^${p.path.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*')}$`)
  return re.test(u.pathname + u.search)
}

/** Whether any of its content scripts (as it came) is for this page. */
export function scriptsFor(m: Manifest, url: string): boolean {
  return ((m.content_scripts ?? []) as { matches?: string[] }[]).some(c => (c.matches ?? []).some(x => matchesUrl(x, url)))
}
