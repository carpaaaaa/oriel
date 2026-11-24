// Your own style for a site (studio/06 §1.5 #87; SiteStyles.swift), as
// Arc's Boosts: CSS you write, worn by every page of that site. CSS only,
// never script. Off until Settings › Browsing › Pages turns it on; then View ›
// Edit Site Style… writes the site in front, and what you type is on the
// page as you type it. Kept by site (no www.) in styles.json; off, every
// style is kept and none is worn.

import { readJSON, writeJSON } from '../model/persist'
import { model } from '../model/model'
import { pref } from './facts'

let byHost: Record<string, string> | null = null

function all(): Record<string, string> {
  if (!byHost) {
    byHost = readJSON<Record<string, string>>('styles.json', {}, raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
      return out
    })
  }
  return byHost
}

/** The host styles are kept by: no www. (Dusk.host). */
export const styleHost = (host: string) => host.toLowerCase().replace(/^www\./, '')

/** What a page of this site wears: nothing while the setting is off. */
export function siteStyle(host: string): string {
  if (!pref<boolean>('sites.styles')) return ''
  return all()[styleHost(host)] ?? ''
}

/** What was written for a site, on or off. */
export const writtenStyle = (host: string) => all()[styleHost(host)] ?? ''
export const styledHosts = () => Object.keys(all()).sort()

/** Whitespace alone is no style, and the site is forgotten. */
export function setStyle(host: string, css: string): void {
  const h = styleHost(host)
  const kept = css.trim() ? css : undefined
  const styles = all()
  if (styles[h] === kept) return
  if (kept === undefined) delete styles[h]
  else styles[h] = kept
  writeJSON('styles.json', () => styles)
  styleChanged.forEach(f => f(h))
}

/** Pages of a site whose style changed hear it at once (page.ts). */
export const styleChanged: ((host: string) => void)[] = []

// View › Edit Site Style… (StylePanel): a card over the page's top right,
// under the strip, the size it was left at.

import { handle } from '../router'
import { need } from '../context'
import { runtimes } from '../views/tabs'
import type { WindowController } from '../views/window'
import { hidePanel, showPanel } from '../settings/slice'
import { hostOf } from './facts'

/** Hide Elements puts its pointing and its list away first (main/hide;
 * Browser.editSiteStyle). */
export const beforeStyle: ((c: WindowController) => void)[] = []

handle('view.style', ({ id }, ctx) => {
  const c = need(ctx)
  if (!pref<boolean>('sites.styles')) return { said: 'Your own style for a site is off in Settings › Browsing' }
  const tab = id ?? c.record.active[c.record.space]
  const rt = tab ? runtimes.get(tab) : undefined
  const host = hostOf(rt?.contents?.getURL() ?? (tab ? model.tabs.get(tab)?.url : ''))
  if (!rt?.view || !host || !/^https?:/i.test(rt.contents?.getURL() ?? '')) return { said: 'Only a website can have a style' }
  for (const f of beforeStyle) f(c)
  const b = rt.view.getBounds()
  const width = Math.min(448, b.width), height = Math.min(340, b.height)
  showPanel(c, 'pages.style', { x: b.x + b.width - width, y: b.y, width, height }, { host: styleHost(host), css: writtenStyle(host) })
  c.overlay.webContents.focus()
  return { host: styleHost(host) }
})

handle('pages.style.set', ({ host, css }) => { setStyle(String(host), String(css ?? '')) })
handle('pages.style.close', (_a, ctx) => { const c = need(ctx); hidePanel(c, 'pages.style'); c.focusPage() })
