// Developer Mode, site by site (Search 1.0.22, DevMode.swift; byearc's
// "developer view", Cra's Developer Mode): the page's whole address and a
// slim bar of the tools you reach for while building a site, Developer
// Tools, a reload that skips the cache, and the cache kept off for the
// site's reloads.
//
// On by itself for a site on this computer (localhost and its subdomains,
// 127.0.0.0/8, [::1], 0.0.0.0, names ending in .test) unless Settings ›
// About › Developer says otherwise (developer.local); turned on or off for
// any site from its tab's menu (the Mac's site card) or with Shift+F12
// (the Mac's ⇧⌥⌘I: Alt+Shift+I is Chrome's feedback form, Ctrl+Shift+I its
// Developer Tools), and remembered for that site (developer.sites). A
// private tab remembers nothing: its choices last until Oriel quits. The
// cache kept off is a switch for while you work, not a setting: until Oriel
// quits, for every page of the site, private ones too.
//
// The bar floats over the page's bottom corner, as the link bubble does,
// rather than taking a line of the window: the page keeps its size, which
// is what a developer is looking at. It is a little view of its own above
// the page and under the overlay, never something put in the page. ✕ turns
// it off for the site. Owned by the pages module.

import { WebContentsView, nativeTheme } from 'electron'
import type { ID, Rect } from '../../shared/state'
import { addDefaults } from '../../shared/prefs'
import { model } from '../model/model'
import { handle, handled } from '../router'
import { need } from '../context'
import { probe } from '../paths'
import { TabRuntime, runtimes } from '../views/tabs'
import { allControllers, controllerFor, registerSlice, type WindowController } from '../views/window'
import { bindings, keysOf, live, wireKeys } from '../keys'
import { benchRequest } from '../bench/server'
import { keepOnPage } from '../views/guard'
import { peekInfo } from './peek'
import { groundOffer } from './float'

// On by default, but off in a test world unless a test asks, so no other
// test's pages on 127.0.0.1 wear the bar (Prefs.swift developerLocal).
addDefaults({ 'developer.local': !probe, 'developer.sites': {} })

// sites (DevMode)

/** The host as kept: lowercased, without IPv6's brackets; http(s) only. */
export function devHost(address: string | null | undefined): string | null {
  try {
    const u = new URL(String(address ?? ''))
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return null
    let host = u.hostname.toLowerCase()
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
    return host
  } catch { return null }
}

/** A name or address that only ever means this computer, or one a developer
 * gave a site of their own: localhost and its subdomains, the loopback
 * addresses, and .test, which is never a real site (RFC 6761). */
export function isLocalHost(name: string): boolean {
  let host = name.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true
  if (host.endsWith('.localhost') || host.endsWith('.test')) return true
  // 127.0.0.0/8, written out in full.
  const parts = host.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

const local = () => model.pref<boolean>('developer.local') !== false
function sites(): Record<string, boolean> {
  const v = model.pref<unknown>('developer.sites')
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, on]) => typeof on === 'boolean')) as Record<string, boolean>
}
/** The same for private tabs, for as long as Oriel runs. */
const shySites = new Map<string, boolean>()
/** Sites whose reloads skip the cache, until Oriel quits. */
const cacheOff = new Set<string>()

/** Whether the page at `address` is in Developer Mode. */
export function devOn(address: string | null | undefined, shy: boolean): boolean {
  const host = devHost(address)
  if (!host) return false
  if (shy && shySites.has(host)) return shySites.get(host)!
  const chosen = sites()[host]
  if (chosen !== undefined) return chosen
  return local() && isLocalHost(host)
}

/** On or off for the site at `address`. Back to what it would be by itself,
 * nothing is kept. */
function setOn(on: boolean, address: string | null | undefined, shy: boolean): void {
  const host = devHost(address)
  if (!host) return
  if (shy) { shySites.set(host, on); changed(); return }
  const next = { ...sites() }
  if (on === (local() && isLocalHost(host))) delete next[host]
  else next[host] = on
  // prefs.json keeps only what differs: no site chosen, no key.
  model.setPref('developer.sites', Object.keys(next).length ? next : undefined)
}

export const skipsCache = (address: string | null | undefined) => { const h = devHost(address); return !!h && cacheOff.has(h) }
function setSkipsCache(on: boolean, address: string | null | undefined): void {
  const host = devHost(address)
  if (!host) return
  if (on) cacheOff.add(host); else cacheOff.delete(host)
  changed()
}

const addressOf = (id: ID) => runtimes.get(id)?.contents?.getURL() || model.tabs.get(id)?.url || ''

// A reload of a site with the cache kept off skips it, whichever way it
// came (Ctrl+R, F5, the page menu, the switcher), as Tab.reload asks
// DevMode.skipsCache on the Mac. Wrapped here rather than in the tabs
// module's TabRuntime, which stays as it was.
const plainReload = TabRuntime.prototype.reload
TabRuntime.prototype.reload = function (this: TabRuntime, hard = false): void {
  plainReload.call(this, hard || skipsCache(this.contents?.getURL() || this.record?.url))
}

// Developer Tools (Web Inspector, F12 and Ctrl+Shift+I): Chromium's own,
// docked as Chrome docks them. A test world never opens them: it writes
// down what would have opened.

export const inspected: { id: ID; open: boolean }[] = []
function inspect(id: ID): { open: boolean } {
  const rt = runtimes.get(id)
  const wc = rt?.contents
  if (!wc || wc.isDestroyed() || rt?.record?.empty || rt?.record?.internal) return { open: false }
  const open = probe ? !inspected.filter(x => x.id === id).slice(-1)[0]?.open : !wc.isDevToolsOpened()
  if (probe) { inspected.push({ id, open }); if (inspected.length > 20) inspected.shift() } else if (open) wc.openDevTools(); else wc.closeDevTools()
  return { open }
}

/** The key a command has now ("Shift+F12"), if it has one. */
function keyOf(id: string): string | null {
  const b = bindings.find(x => x.id === id)
  return b && live(b) ? keysOf(b)[0] ?? null : null
}

// the bar (DevBar)

const MARGIN = 8 // room round the capsule for its shadow
const INSET = 10 // from the page's bottom right corner (DevBar .padding(10))

/** The bar's own page: the address, then the tools (DevBar's layout). It
 * says what was pressed and its size with console lines the main process
 * reads ("oriel-dev:"). */
const barPage = `<!doctype html><meta charset=utf-8><style>
:root{--ground:#FFFFFF;--ink:#171717;--muted:#8C8C8C;--hairline:#E8E8E8;--wash:#EFEFEF;--hover:#F6F6F6;color-scheme:light}
:root.dark{--ground:#1C1C1C;--ink:#EDEDED;--muted:#949494;--hairline:#333333;--wash:#2D2D2D;--hover:#262626;color-scheme:dark}
html,body{margin:0;background:transparent;overflow:hidden}
body{font:12px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#bar{position:absolute;left:${MARGIN}px;top:${MARGIN}px;display:flex;align-items:center;gap:2px;height:26px;box-sizing:border-box;
 padding-right:3px;border:1px solid var(--hairline);border-radius:13px;background:var(--ground);box-shadow:0 3px 8px rgba(0,0,0,.08);white-space:nowrap}
#mark{display:grid;place-items:center;color:var(--muted);padding:0 4px 0 9px}
#mark svg{width:11px;height:11px;stroke-width:1.9}
#url{display:flex;min-width:0;max-width:420px;padding-right:6px;font:11px "JetBrains Mono","Cascadia Mono",Consolas,monospace;color:var(--ink);
 -webkit-user-select:text;user-select:text;cursor:text}
#url .a{overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}
#url .b{flex:none}
.div{width:1px;height:14px;background:var(--hairline);margin:0 2px}
button{width:22px;height:22px;border:0;border-radius:6px;background:none;color:var(--muted);display:grid;place-items:center;padding:0;cursor:default}
button:hover{background:var(--hover)}
button.on{color:var(--ink);background:var(--wash)}
svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
button.on #cache-body{fill:currentColor;fill-opacity:.25}
</style>
<div id=bar role=toolbar aria-label="Developer Mode">
<span id=mark title="Developer Mode"><svg viewBox="0 0 16 16"><path d="M4.6 4.4 1.4 8l3.2 3.6M11.4 4.4 14.6 8l-3.2 3.6M9.4 2.8 6.6 13.2"/></svg></span>
<span id=url><span class=a></span><span class=b></span></span>
<span class=div></span>
<button id=inspector><svg viewBox="0 0 16 16"><path d="M9.4 5.4 3 11.8a1.1 1.1 0 0 0 1.6 1.6l6.4-6.4M7.2 3.6 9.6 2l3.6 3.6-1.6 1.6z"/></svg></button>
<button id=reload><svg viewBox="0 0 16 16"><path d="M12.8 8a4.8 4.8 0 1 1-1.4-3.4M12.6 2.6v2.6H10"/></svg></button>
<button id=cache><svg viewBox="0 0 16 16"><path id=cache-body d="M1.8 8.6h9.4v4.6H1.8z"/><path d="M3 8.6l1.2-2.6h4.6M9.6 11h.01M11.8 2.4l3 3m0-3-3 3"/></svg></button>
<button id=off><svg viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7"/></svg></button>
</div>
<script>
const $ = id => document.getElementById(id)
for (const id of ['inspector', 'reload', 'cache', 'off']) $(id).onclick = () => console.log('oriel-dev:' + id)
const tip = (id, text) => { $(id).title = text; $(id).setAttribute('aria-label', text) }
let last = ''
const size = () => { const r = $('bar').getBoundingClientRect(); const s = Math.ceil(r.width) + ',' + Math.ceil(r.height); if (s !== last) { last = s; console.log('oriel-dev:size,' + s) } }
window.set = d => {
  document.documentElement.classList.toggle('dark', !!d.dark)
  // The middle of a long address goes, its end stays (truncationMode(.middle)).
  const cut = Math.max(0, d.url.length - 18)
  document.querySelector('#url .a').textContent = d.url.slice(0, cut)
  document.querySelector('#url .b').textContent = d.url.slice(cut)
  $('url').title = d.url
  $('cache').classList.toggle('on', !!d.cacheOff)
  tip('inspector', d.tips.inspector); tip('reload', d.tips.reload); tip('cache', d.tips.cache); tip('off', d.tips.off)
  requestAnimationFrame(size)
  return true
}
document.fonts && document.fonts.ready.then(size)
</script>`

interface Bar {
  view: WebContentsView
  tab: ID
  /** The page view it follows, watched for its moves. */
  page: WebContentsView | null
  data: string
  size: { width: number; height: number } | null
  ready: boolean
}

const barsByWindow = new WeakMap<WindowController, Map<ID, Bar>>()
const barsOf = (c: WindowController) => { let m = barsByWindow.get(c); if (!m) barsByWindow.set(c, (m = new Map())); return m }

function tips(address: string): Record<string, string> {
  const withKey = (text: string, id: string) => { const k = keyOf(id); return k ? `${text} (${k})` : text }
  return {
    inspector: withKey('Developer Tools', 'view.inspector'),
    reload: withKey('Reload Ignoring Cache', 'view.reloadOrigin'),
    cache: skipsCache(address) ? "Cache Off for This Site's Reloads: Turn On" : "Turn Cache Off for This Site's Reloads",
    off: withKey('Turn Off Developer Mode for This Site', 'view.developerMode'),
  }
}

function tell(bar: Bar, address: string): void {
  const data = JSON.stringify({ url: address, cacheOff: skipsCache(address), dark: nativeTheme.shouldUseDarkColors, tips: tips(address) })
  if (data === bar.data && bar.ready) return
  bar.data = data
  const wc = bar.view.webContents
  if (bar.ready && !wc.isDestroyed()) void wc.executeJavaScript(`window.set ? set(${data}) : false`).catch(() => {})
}

/** Windows whose closing is watched, to let their bars go. */
const hooked = new WeakSet<WindowController>()

function make(c: WindowController, id: ID): Bar {
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true } })
  view.setBackgroundColor('#00000000')
  const bar: Bar = { view, tab: id, page: null, data: '', size: null, ready: false }
  const wc = view.webContents
  keepOnPage(wc)
  // Shortcuts work with the keys in the bar (its address selected) too.
  wireKeys(c, wc, false)
  wc.on('console-message', e => {
    const m = (e as unknown as { message?: string }).message ?? ''
    if (m.startsWith('oriel-dev:')) heard(c, bar, m.slice(10))
  })
  wc.once('did-finish-load', () => {
    bar.ready = true
    const data = bar.data
    if (data && !wc.isDestroyed()) void wc.executeJavaScript(`window.set ? set(${data}) : false`).catch(() => {})
  })
  void wc.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(barPage)).catch(() => {})
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  barsOf(c).set(id, bar)
  // The window closing lets its bars' pages go.
  if (!hooked.has(c)) {
    hooked.add(c)
    c.base.once('closed', () => { for (const b of [...barsOf(c).values()]) drop(c, b); keepWatching() })
  }
  return bar
}

function drop(c: WindowController, bar: Bar): void {
  const mine = barsOf(c)
  if (mine.get(bar.tab) === bar) mine.delete(bar.tab)
  if (!c.base.isDestroyed()) { try { c.base.contentView.removeChildView(bar.view) } catch { /* already out */ } }
  if (!bar.view.webContents.isDestroyed()) bar.view.webContents.close()
}

/** A button pressed, or the bar's size measured. */
function heard(c: WindowController, bar: Bar, what: string): void {
  const [name, w, h] = what.split(',')
  if (name === 'size') {
    const width = Number(w), height = Number(h)
    if (width > 0 && height > 0) { bar.size = { width: Math.min(1200, width), height: Math.min(80, height) }; schedule(c) }
    return
  }
  const address = addressOf(bar.tab)
  const t = model.tabs.get(bar.tab)
  if (name === 'inspector') inspect(bar.tab)
  else if (name === 'reload') runtimes.get(bar.tab)?.reload(true)
  else if (name === 'cache') setSkipsCache(!skipsCache(address), address)
  else if (name === 'off') setOn(false, address, !!t?.shy)
  else return
  // The keys back to the page, as a press on a plain button never takes them.
  if (name !== 'inspector') c.focusPage()
}

/** The page's bottom right corner, the capsule 10 in from it. */
function place(c: WindowController, bar: Bar, page: Rect): void {
  const size = bar.size ?? { width: 300, height: 26 }
  const width = Math.min(Math.round(size.width + MARGIN * 2), Math.max(0, page.width - 2 * (INSET - MARGIN)))
  const height = Math.round(size.height + MARGIN * 2)
  const r = { x: Math.round(page.x + page.width - INSET + MARGIN - width), y: Math.round(page.y + page.height - INSET + MARGIN - height), width, height }
  const now = bar.view.getBounds()
  if (now.x !== r.x || now.y !== r.y || now.width !== r.width || now.height !== r.height) bar.view.setBounds(r)
  // Above the pages, under the overlay: a page put back in place goes in just under the overlay too.
  const kids = c.base.contentView.children
  const at = kids.indexOf(c.overlay)
  if (kids.indexOf(bar.view) !== at - 1) {
    if (kids.includes(bar.view)) c.base.contentView.removeChildView(bar.view)
    c.base.contentView.addChildView(bar.view, c.base.contentView.children.indexOf(c.overlay))
  }
}

const watchedPages = new WeakSet<WebContentsView>()

/** The bars a window wants now: one for each page on screen whose site is
 * in Developer Mode; none while a page has the whole window or a peek is up. */
function sync(c: WindowController): void {
  if (c.base.isDestroyed()) return
  const mine = barsOf(c)
  const want = new Map<ID, { rect: Rect; address: string }>()
  const peeking = peekInfo().some(p => p.win === c.record.id && p.shown)
  if (!c.isFilling() && !peeking) {
    for (const { id, rect } of c.pageBounds()) {
      const t = model.tabs.get(id)
      const address = addressOf(id)
      if (!t || t.empty || t.internal || !rect.width || !rect.height || !devOn(address, !!t.shy)) continue
      want.set(id, { rect, address })
    }
  }
  for (const [id, bar] of [...mine]) if (!want.has(id)) drop(c, bar)
  for (const [id, w] of want) {
    const bar = mine.get(id) ?? make(c, id)
    const page = runtimes.get(id)?.view ?? null
    if (page && page !== bar.page) {
      bar.page = page
      if (!watchedPages.has(page)) { watchedPages.add(page); page.on('bounds-changed', () => { for (const x of allControllers()) if (barsOf(x).size) schedule(x) }) }
    }
    tell(bar, w.address)
    place(c, bar, w.rect)
  }
  keepWatching()
}

/** Once the current task is over: the window has placed its pages by then. */
const pending = new WeakSet<WindowController>()
function schedule(c: WindowController): void {
  if (pending.has(c)) return
  pending.add(c)
  setImmediate(() => { pending.delete(c); sync(c) })
}

/** What no event says (a peek opening, a page leaving full screen): looked
 * at twice a second, only while a bar is up somewhere. */
let watcher: NodeJS.Timeout | null = null
function keepWatching(): void {
  const any = allControllers().some(c => barsOf(c).size > 0)
  if (any && !watcher) watcher = setInterval(() => { for (const c of allControllers()) sync(c) }, 500)
  else if (!any && watcher) { clearInterval(watcher); watcher = null }
}

/** Something about Developer Mode changed: every window's bars and menus. */
function changed(): void {
  for (const c of allControllers()) { schedule(c); c.mark('siteTools') }
}

// what a tab's menu offers (the Mac's site card)

registerSlice('siteTools', c => {
  const dev: Record<ID, boolean> = {}
  const nofloat: Record<ID, boolean> = {}
  for (const id of model.spaceTabs(c.record)) {
    const t = model.tabs.get(id)
    if (!t || t.empty || t.internal) continue
    const address = addressOf(id)
    if (devHost(address)) dev[id] = devOn(address, !!t.shy)
    const g = groundOffer(t, address)
    if (g !== null) nofloat[id] = g
  }
  return { dev, devKey: keyOf('view.developerMode'), nofloat }
})

model.on('window-changed', (id: ID, slices: string[]) => {
  const c = controllerFor(id)
  if (!c) return
  if (slices.some(s => s === 'tabs' || s === 'prefs' || s === 'space' || s === 'activeID')) c.mark('siteTools')
  schedule(c)
})
model.on('window-opened', (id: ID) => setImmediate(() => { const c = controllerFor(id); if (c) c.base.on('resize', () => schedule(c)) }))
nativeTheme.on('updated', () => { for (const c of allControllers()) schedule(c) })

// commands

/** Shift+F12, a tab's menu: Developer Mode for the site in front (or the tab's), on or off. */
handle('view.developerMode', ({ id }, ctx) => {
  const c = need(ctx)
  const tab = id ?? c.record.active[c.record.space]
  const t = tab ? model.tabs.get(tab) : undefined
  const address = tab ? addressOf(tab) : ''
  if (!t || t.internal || !devHost(address)) return { on: false }
  setOn(!devOn(address, !!t.shy), address, !!t.shy)
  return { on: devOn(address, !!t.shy) }
})

handle('view.inspector', ({ id }, ctx) => {
  const c = need(ctx)
  const tab = id ?? c.record.active[c.record.space]
  return tab ? inspect(tab) : { open: false }
})

// the bench (the Mac's `devmode` request, Tests/arc_extras.py)

benchRequest('pages.devmode', req => {
  const c = allControllers()[0]
  const id = String(req.id ?? (c ? c.record.active[c.record.space] : ''))
  const t = model.tabs.get(id)
  const address = addressOf(id)
  const shy = !!t?.shy
  if (typeof req.set === 'boolean') setOn(req.set, address, shy)
  if (req.toggle && c) setOn(!devOn(address, shy), address, shy)
  if (typeof req.cache === 'boolean') setSkipsCache(req.cache, address)
  if (req.reload) runtimes.get(id)?.reload(req.hard === true)
  for (const x of allControllers()) sync(x)
  const bars = allControllers().flatMap(x => [...barsOf(x).values()].map(b => ({
    window: x.record.id, tab: b.tab, bounds: b.view.getBounds(), page: runtimes.get(b.tab)?.view?.getBounds() ?? null, ready: b.ready,
    above: x.base.contentView.children.indexOf(b.view) > x.base.contentView.children.indexOf(runtimes.get(b.tab)?.view as never),
    underOverlay: x.base.contentView.children.indexOf(b.view) === x.base.contentView.children.indexOf(x.overlay) - 1,
  })))
  return {
    on: devOn(address, shy), local: local(), isLocal: !!devHost(address) && isLocalHost(devHost(address)!), command: handled().includes('view.developerMode'),
    sites: sites(), cacheOff: skipsCache(address), bars, inspected: inspected.slice(-5), key: keyOf('view.developerMode'),
  }
})

/** Script in a tab's bar (a press on one of its buttons, what it shows). */
benchRequest('pages.devbar', async req => {
  for (const c of allControllers()) {
    const bar = barsOf(c).get(String(req.id))
    if (bar) return { value: await bar.view.webContents.executeJavaScript(String(req.js), true) }
  }
  throw new Error('no bar on that tab')
})

/** For the bench: whether a host counts as this computer's. */
benchRequest('pages.devlocal', req => ({ local: ((req.hosts as string[] | undefined) ?? []).map(h => [h, isLocalHost(String(h))]) }))
