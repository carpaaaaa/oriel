// The Chrome Web Store (studio/04 §2.2, ways 1 and 2):
//   - the relay: on the store's pages its button says "Add to Oriel" and
//     "Added to Oriel", and its offer to switch to Chrome is hidden, but
//     only that: never an element holding the store's own button (the
//     store keeps its banner and the extension's header in one section;
//     hiding it took the button away, the bug users met);
//   - Oriel's own bar (StoreOffer on the Mac), at the foot of the page on
//     every extension's page, whatever the store shows: the extension's
//     icon and name, "Add to Oriel", then "Adding…", then "Added to Oriel"
//     with Remove. It is the overlay's resting layer on those pages: another
//     layer (the address field, a menu) takes its place and it comes back
//     when that one goes.

import { app, type Session } from 'electron'
import { brand } from '../../shared/brand'
import { CARD_ROOM, type StoreOffer } from '../../shared/modules/extensions'
import { handle } from '../router'
import { need } from '../context'
import { model } from '../model/model'
import { WindowController, allControllers, overlayFree } from '../views/window'
import { runtimes } from '../views/tabs'
import { probe } from '../paths'
import { testEnv } from '../testhooks'

const DETAIL = /^\/detail\/(?:[^/]+\/)?([a-p]{32})(?:\/.*)?$/
const OLD_DETAIL = /^\/webstore\/detail\/(?:[^/]+\/)?([a-p]{32})(?:\/.*)?$/
const BAR = { height: 44, bottom: 30, width: 420 }

/** The extension a store page is about, from its address only (never from
 * what the page says): Crx.storeID on the Mac. A test world may name a
 * local server that stands in for the store (ORIEL_STORE_HOST). */
export function storeIdOf(url: string | undefined): string | null {
  let u: URL
  try { u = new URL(url ?? '') } catch { return null }
  if (u.username || u.password) return null
  const host = u.host.toLowerCase()
  const stand = probe ? testEnv('ORIEL_STORE_HOST')?.toLowerCase() : undefined
  if ((u.protocol === 'https:' && host === 'chromewebstore.google.com') || (stand && host === stand && /^https?:$/.test(u.protocol))) return DETAIL.exec(u.pathname)?.[1] ?? null
  if (u.protocol === 'https:' && host === 'chrome.google.com') return OLD_DETAIL.exec(u.pathname)?.[1] ?? null
  return null
}

export const isStoreHost = (url: string) => {
  try {
    const h = new URL(url).host.toLowerCase()
    return h === 'chromewebstore.google.com' || h === 'chrome.google.com' || (!!probe && h === testEnv('ORIEL_STORE_HOST')?.toLowerCase())
  } catch { return false }
}

// ---- the relay, in the page's own isolated world

const relay = (name: string) => `(() => {
  if (window.__orielRelay) return; window.__orielRelay = true
  const own = t => /^(Add to|Added to|Remove from) /.test(t)
  const holdsButton = e => [...e.querySelectorAll('button')].some(b => own(b.textContent.trim()))
  const fix = () => {
    for (const b of document.querySelectorAll('button')) {
      const spans = [...b.querySelectorAll('span')]
      if (spans.some(s => /^(Install|Switch to) /.test(s.textContent.trim()))) { b.style.display = 'none'; continue }
      const label = spans.find(s => own(s.textContent.trim()))
      if (!label) continue
      const t = label.textContent.trim()
      if (t.startsWith('Add to ') && t !== 'Add to ${name}') label.textContent = 'Add to ${name}'
      if (t.startsWith('Remove from ')) { label.textContent = 'Added to ${name}'; b.disabled = true }
    }
    // The offer to switch: from its words up to the largest box that still
    // holds none of the store's own buttons.
    for (const el of document.querySelectorAll('div, span, p, h2, h3')) {
      if (el.childElementCount || !/^Switch to Chrome/.test(el.textContent.trim())) continue
      let box = el
      while (box.parentElement && box.parentElement !== document.body && !holdsButton(box.parentElement) && box.parentElement.offsetHeight < 240) box = box.parentElement
      if (!holdsButton(box)) box.style.display = 'none'
    }
  }
  let timer = 0
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(fix, 60) }).observe(document, { subtree: true, childList: true, characterData: true })
  fix()
})()`

const pictures = new Map<string, string>()

function watchStore(wc: Electron.WebContents): void {
  const go = () => {
    if (wc.isDestroyed() || !isStoreHost(wc.getURL())) return
    void wc.executeJavaScriptInIsolatedWorld(1999, [{ code: relay(brand.name) }]).catch(() => {})
    const id = storeIdOf(wc.getURL())
    if (!id) return
    // The store's picture of the extension, for the bar: only from Google's
    // own image hosts.
    void wc.executeJavaScriptInIsolatedWorld(1999, [{ code: `document.querySelector('meta[property="og:image"]')?.content || ''` }])
      .then((src: string) => {
        try {
          const u = new URL(src)
          if (u.protocol === 'https:' && /(^|\.)(googleusercontent|gstatic)\.com$/.test(u.hostname)) { pictures.set(id, u.href); refreshFor(wc) }
        } catch { /* none */ }
      }).catch(() => {})
  }
  wc.on('dom-ready', go)
  wc.on('did-navigate-in-page', go)
  wc.on('page-title-updated', () => refreshFor(wc))
}

// ---- the bar

let profile: Session | null = null
let iconOf: (id: string) => string | null = () => null
let changed: (c: WindowController) => void = () => {}
const offers = new Map<WindowController, StoreOffer & { width: number }>()
const watched = new WeakSet<WindowController>()

export function offerFor(c: WindowController): StoreOffer | null {
  const o = offers.get(c)
  return o ? { id: o.id, name: o.name, icon: o.icon, installed: o.installed } : null
}

function activeOf(c: WindowController): { url: string; title: string; wc: Electron.WebContents | null } | null {
  const id = c.record.active[c.record.space]
  const t = id ? model.tabs.get(id) : undefined
  if (!id || !t) return null
  return { url: t.url ?? '', title: t.title ?? '', wc: runtimes.get(id)?.contents ?? null }
}

function place(c: WindowController): void {
  const o = offers.get(c)
  const id = c.record.active[c.record.space]
  const page = id ? runtimes.get(id)?.view?.getBounds() : null
  if (!o || !page || c.base.isDestroyed()) return
  const w = Math.min(o.width, page.width - 32)
  c.setOverlayRegion({
    x: Math.round(page.x + (page.width - w) / 2 - CARD_ROOM),
    y: Math.round(page.y + page.height - BAR.bottom - BAR.height - CARD_ROOM),
    width: Math.round(w + CARD_ROOM * 2),
    height: BAR.height + CARD_ROOM * 2,
  }, false)
}

function hide(c: WindowController): void {
  if (!offers.delete(c)) return
  if (!c.base.isDestroyed() && c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'ext.store') c.sendOverlay({ kind: 'none' })
  changed(c)
}

/** What the window's tab in front is: a store page about an extension or not. */
export function refreshOffer(c: WindowController): void {
  if (c.base.isDestroyed()) return
  const a = activeOf(c)
  const id = storeIdOf(a?.url)
  if (!id || !a?.wc || a.wc.session !== profile) return hide(c)
  const ext = profile?.extensions.getExtension(id)
  const titled = a.title.replace(/\s+[-–]\s+Chrome Web Store$/, '')
  const before = offers.get(c)
  const offer = {
    id,
    name: ext?.name ?? (titled !== a.title ? titled : ''),
    icon: ext ? iconOf(id) : pictures.get(id) ?? null,
    installed: !!ext,
    width: before?.id === id ? before.width : BAR.width,
  }
  offers.set(c, offer)
  if (!watched.has(c)) { watched.add(c); c.base.on('resize', () => { if (offers.has(c)) place(c) }) }
  // Another layer floats now: the bar waits for it to go.
  const mine = c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'ext.store'
  if (!overlayFree(c.overlayLayer) && !mine) return changed(c)
  if (!mine) c.sendOverlay({ kind: 'panel', name: 'ext.store' })
  place(c)
  changed(c)
}

function refreshFor(wc: Electron.WebContents): void {
  for (const c of allControllers()) {
    const id = c.record.active[c.record.space]
    if (id && runtimes.get(id)?.contents === wc) refreshOffer(c)
  }
}

export function refreshAllOffers(): void { for (const c of allControllers()) refreshOffer(c) }

// When a layer gives the overlay back, the bar returns. TODO(window): an
// event for "the overlay is free".
const proto = WindowController.prototype as unknown as { sendOverlay(layer: { kind: string }): void }
const sendOverlay = proto.sendOverlay
proto.sendOverlay = function (this: WindowController, layer) {
  sendOverlay.call(this, layer as never)
  if (layer.kind === 'none' && offers.has(this)) setImmediate(() => refreshOffer(this))
}

export function setupStore(p: Session, o: { icon: (id: string) => string | null; changed: (c: WindowController) => void }): void {
  profile = p
  iconOf = o.icon
  changed = o.changed
  app.on('web-contents-created', (_e, wc) => { if (wc.session === p) watchStore(wc) })
  model.on('selected', (win: { id: string }) => { for (const c of allControllers()) if (c.record.id === win.id) refreshOffer(c) })
  model.on('tab-changed', (tab: { id: string }, patch: Record<string, unknown>) => {
    if (!('url' in patch) && !('title' in patch)) return
    for (const c of allControllers()) if (c.record.active[c.record.space] === tab.id) refreshOffer(c)
  })
  // While these are told, the extension is still registered: look after.
  p.extensions.on('extension-loaded', () => setImmediate(refreshAllOffers))
  p.extensions.on('extension-unloaded', () => setImmediate(refreshAllOffers))
}

handle('ext.storeFit', ({ width }, ctx) => {
  const c = need(ctx)
  const o = offers.get(c)
  if (!o || !(width > 0)) return
  o.width = Math.ceil(width)
  place(c)
})
