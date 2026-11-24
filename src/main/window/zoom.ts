// Page zoom, kept for each site (studio/01 §2.22): Ctrl+= / Ctrl+- multiply
// or divide by 1.1 between 40% and 300%, Ctrl+0 goes back to the default
// (pref pageZoom). The zoom of a host is the pref zoom.<host>, as on the Mac;
// one equal to the default is forgotten, private tabs read it but never write
// it. It is applied at every main-frame navigation and when a page comes on
// screen; Ctrl+wheel goes the same way.

import type { WebContents } from 'electron'
import { handle } from '../router'
import { model } from '../model/model'
import { need, tabRuntime } from '../context'
import { addDefaults } from '../../shared/prefs'
import { pageAttached } from '../views/window'

const STEP = 1.1
const LEAST = 0.4
const MOST = 3
/** Changes under this are ignored (Tab.swift: 0.004). */
const NOTHING = 0.004

addDefaults({ pageZoom: 1 })

const defaultZoom = () => {
  const z = Number(model.pref<number>('pageZoom'))
  return z > 0 ? z : 1
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, '') : ''
  } catch { return '' }
}

export function zoomFor(url: string): number {
  const host = hostOf(url)
  const kept = host ? Number(model.pref<number>(`zoom.${host}`)) : NaN
  return kept > 0 ? kept : defaultZoom()
}

function apply(wc: WebContents): void {
  if (wc.isDestroyed()) return
  const z = zoomFor(wc.getURL())
  if (Math.abs(wc.getZoomFactor() - z) >= NOTHING) wc.setZoomFactor(z)
}

/** A page the window shows: its site's zoom now and at each navigation. */
export function watchZoom(id: string, wc: WebContents): void {
  apply(wc)
  wc.on('did-navigate', () => apply(wc))
  wc.on('zoom-changed', (_e, direction) => zoomTab(id, wc, direction === 'in' ? STEP : 1 / STEP))
}

function zoomTab(id: string, wc: WebContents, by?: number, reset = false): number {
  const before = wc.getZoomFactor()
  const next = reset ? defaultZoom() : Math.min(MOST, Math.max(LEAST, before * (by ?? 1)))
  if (Math.abs(next - before) < NOTHING && !reset) return before
  wc.setZoomFactor(next)
  const host = hostOf(wc.getURL())
  const tab = model.tabs.get(id)
  if (host && !tab?.shy) model.setPref(`zoom.${host}`, Math.abs(next - defaultZoom()) < 0.01 ? undefined : Math.round(next * 1000) / 1000)
  return next
}

pageAttached.push(watchZoom)

handle('view.zoom', ({ by, reset, id }, ctx) => {
  const c = need(ctx)
  const tabID = id ?? c.record.active[c.record.space]
  const wc = tabID ? tabRuntime(c, tabID)?.contents : null
  if (!tabID || !wc || wc.isDestroyed()) return null
  return zoomTab(tabID, wc, by, !!reset)
})
