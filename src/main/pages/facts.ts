// What the pages module asks about a request or a page: the site at the top
// of its frame tree, whether it is private, Shield paused for it, and the
// test worlds' stand-ins for YouTube and Reddit (as the Mac's
// test.youtubeHosts and test.redditHosts, only in a test world).

import type { WebContents } from 'electron'
import { model } from '../model/model'
import { probe } from '../paths'
import { siteOf } from './lists'

export const pref = <T = unknown>(key: string): T => model.pref<T>(key)

/** Hosts a test world names for a site's stand-in. */
export function testHosts(key: 'test.youtubeHosts' | 'test.redditHosts'): string[] {
  if (!probe) return []
  const v = model.pref<unknown>(key)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** A page of a private tab: its session is kept nowhere. */
export function shyContents(wc: WebContents | undefined | null): boolean {
  try { return !!wc && !wc.isDestroyed() && !wc.session.isPersistent() } catch { return false }
}

export function hostOf(address: string | undefined | null): string | null {
  if (!address) return null
  try { return new URL(address).hostname.toLowerCase() || null } catch { return null }
}

type Details = { url: string; resourceType?: string; frame?: Electron.WebFrameMain | null; webContents?: WebContents; referrer?: string }

/** The address of the page at the top of the request's frame tree; for a
 * page being loaded, that page. */
export function topAddress(d: Details): string | null {
  if (d.resourceType === 'mainFrame') return d.url
  try {
    const top = d.frame?.top
    if (top && top.url) return top.url
  } catch {}
  try {
    const u = d.webContents && !d.webContents.isDestroyed() ? d.webContents.getURL() : ''
    if (u) return u
  } catch {}
  return null
}

/** A request to another site than the page at the top (WebKit's load-type
 * third-party: registrable domains differ). Unknown tops count as first. */
export function thirdParty(d: Details): boolean {
  if (d.resourceType === 'mainFrame') return false
  const top = hostOf(topAddress(d))
  const here = hostOf(d.url)
  if (!top || !here) return false
  return siteOf(top) !== siteOf(here)
}

/** Shield's pause for a site: hosts without www (shield.paused, Shield.isPaused). */
export function shieldPaused(host: string | null): boolean {
  if (!host) return false
  const list = model.pref<unknown>('shield.paused')
  return Array.isArray(list) && list.includes(host.replace(/^www\./, ''))
}

/** Shield works for a page on `host` (on, not paused there). */
export function shieldOn(host: string | null): boolean {
  return model.pref<boolean>('shield') !== false && !shieldPaused(host)
}
