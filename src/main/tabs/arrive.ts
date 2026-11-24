// A link from another app (Oriel as the default browser), the rows that
// decide where it goes (Links.swift take/little, SpaceRoutes.swift,
// LinkChooser*.swift; studio/01 §7.28-§7.30, §10.27), and the address field
// from any app (Launcher.swift, HotKey.swift):
//  - Send links to a space (`spaces.links`, `spaces.links.rules`): a site's
//    links open in its space, from another app or from a page of another
//    space opening a new tab; the most specific site wins;
//  - Go to a tab that has the page (`links.little.tabs`);
//  - Ask which space for links from other apps (`links.ask`, remembering
//    where each site went in `links.ask.last`);
//  - Open links from other apps in a small window (`links.little`);
//  - Open the address field from any app (`launcher.on`, `launcher.key`), and
//    Open in a small window (`launcher.little`). Windows has no field over
//    another app: the key brings Oriel's window in front with its field up.

import { app, globalShortcut } from 'electron'
import { handle, run } from '../router'
import { model, samePage, type WindowRecord } from '../model/model'
import { runtimeFor } from '../views/tabs'
import { controllerFor, type WindowController } from '../views/window'
import { openWindow, quietTests } from '../context'
import { probe } from '../paths'
import { closeField } from '../field/commands'
import { showPanel, hidePanel } from '../settings/slice'
import { benchRequest } from '../bench/server'
import { compose } from './pagelinks'
import { openLittle, littleWith, front as littleFront, frontWindow } from './little'

// Send links to a space (SpaceRoutes.swift)

export interface Route { site: string; space: string }

/** What was typed, as the site a rule keeps: "https://www.Notion.so/x",
 * "notion.so" and "*.notion.so" are all "notion.so". */
export function siteOf(typed: string): string | null {
  let text = typed.trim().toLowerCase()
  if (text.startsWith('*.')) text = text.slice(2)
  if (!text) return null
  if (!text.includes('://')) text = 'https://' + text
  try { return clean(new URL(text).hostname) } catch { return null }
}

function hostSite(url: string): string | null {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? clean(u.hostname.toLowerCase()) : null } catch { return null }
}

function clean(host: string): string | null {
  let h = host.replace(/^\[|\]$/g, '')
  if (h.endsWith('.')) h = h.slice(0, -1)
  if (h.startsWith('www.') && h.slice(4).includes('.')) h = h.slice(4)
  if (!h || h.length > 253 || !/^[\p{L}\p{N}.:-]+$/u.test(h)) return null
  if (h.includes(':')) return h
  if (h.split('.').some(l => !l) || (!h.includes('.') && h !== 'localhost')) return null
  return h
}

export function routes(): Route[] {
  const raw = model.pref<unknown[]>('spaces.links.rules') ?? []
  return raw.flatMap(r => {
    const e = r as { site?: string; space?: string }
    const site = e?.site ? siteOf(e.site) : null
    return site && typeof e.space === 'string' ? [{ site, space: e.space.toUpperCase() }] : []
  })
}

/** The space a rule sends an address to: only with the row and spaces on,
 * and only a space that is still there. */
export function routedSpace(url: string): string | null {
  if (!model.pref<boolean>('spaces.links') || !model.spacesOn()) return null
  const host = hostSite(url)
  if (!host) return null
  const rule = routes().filter(r => host === r.site || (!host.includes(':') && host.endsWith('.' + r.site)))
    .sort((a, b) => b.site.length - a.site.length)[0]
  return rule && model.spaceOf(rule.space) ? rule.space : null
}

/** One site to one space, in place of any rule it had; null takes it away. */
function setRoute(site: string, space: string | null): void {
  const kept = routes().filter(r => r.site !== site)
  if (space) kept.push({ site, space })
  model.setPref('spaces.links.rules', kept.length ? kept : undefined)
}

/** The window to show `space`: one already on it, the one in front first;
 * otherwise the one in front, switched to it. */
function windowFor(space: string | null): WindowRecord | null {
  const wins = [...model.windows.values()].filter(w => !w.shy)
  const fronted = model.front ? model.windows.get(model.front) : undefined
  if (space) {
    const shown = [fronted, ...wins.reverse()].find(w => w && !w.shy && w.space === space)
    if (shown) return shown
  }
  const target = (fronted && !fronted.shy ? fronted : null) ?? frontWindow()
  if (target && space && target.space !== space) model.switchSpace(target, space)
  return target
}

function forward(c: WindowController | undefined): void {
  if (!c || c.base.isDestroyed()) return
  if (c.base.isMinimized()) c.base.restore()
  c.base.show()
  c.base.focus()
}

/** As Browser.arrive opens a link: in the empty tab on screen with nothing
 * typed in it, else a new tab in front after the one on screen. */
function deliver(url: string, space: string | null): string | null {
  let win = windowFor(space)
  if (!win) win = openWindow({ restore: false }).record
  const c = controllerFor(win.id)
  const active = model.activeTab(win)
  let id: string
  if (active?.empty && !active.shy && !win.field.text) {
    runtimeFor(active.id).load(url)
    id = active.id
  } else {
    id = model.open(win, url, { foreground: true }).id
  }
  if (c) { closeField(c); c.placePages(); forward(c) }
  return id
}

/** The page already open: a small window that has it comes forward, or a
 * tab that has it (each window's space on screen, the one in front first). */
function goToOpen(url: string): boolean {
  const little = littleWith(url)
  if (little) { littleFront(little); return true }
  const wins = [model.front ? model.windows.get(model.front) : undefined, ...[...model.windows.values()].reverse()]
  for (const w of wins) {
    if (!w || w.shy) continue
    const tab = model.spaceTabs(w).map(id => model.tabs.get(id)!).find(t => t && !t.empty && samePage(t.url, url))
    if (!tab) continue
    model.selectTab(w, tab.id)
    forward(controllerFor(w.id))
    return true
  }
  return false
}

/** Whether to ask which space: on, spaces on, a web address, more than one space. */
function asksSpace(url: string): boolean {
  return model.pref<boolean>('links.ask') && model.spacesOn() && /^https?:/i.test(url) && model.spaces.length > 1
}

export type Arrival = { went: 'tab' | 'little' | 'ask' | 'open' | 'nowhere'; id?: string | null }

/** A link from another app (Links.take). */
export function arrive(url: string, sender?: string): Arrival {
  // An email link: the webmail's compose page, then as any link; with no
  // webmail chosen, the system's mail app (never Oriel again).
  if (/^mailto:/i.test(url)) {
    const page = compose(url)
    if (!page) return { went: 'nowhere' }
    url = page
  }
  const route = routedSpace(url)
  if (!route) {
    if (model.pref<boolean>('links.little') && model.pref<boolean>('links.little.tabs') && goToOpen(url)) return { went: 'open' }
    if (asksSpace(url)) { ask(url, sender); return { went: 'ask' } }
    if (model.pref<boolean>('links.little')) return { went: 'little', id: openLittle(url).id }
  }
  return { went: 'tab', id: deliver(url, route) }
}

handle('link.arrive', ({ url, sender }) => arrive(url, sender))

// Ask which space (LinkChooserPanel.swift)

interface Asked { url: string; sender?: string }
const waiting: Asked[] = []
let askingIn: string | null = null

interface Choice { site: string; space: string }
function memory(): Choice[] {
  return (model.pref<unknown[]>('links.ask.last') ?? []).flatMap(x => {
    const c = x as Choice
    return c && typeof c.site === 'string' && typeof c.space === 'string' && model.spaceOf(c.space.toUpperCase()) ? [{ site: c.site, space: c.space.toUpperCase() }] : []
  })
}

function panelData(a: Asked) {
  const site = hostSite(a.url)
  const front = frontWindow()?.space
  const last = memory().find(m => m.site === site)?.space
  const rows = model.spaces.map((s, i) => ({ space: s.id, name: s.name, icon: s.icon ?? (s.id === model.homeSpace ? 'house' : 'briefcase'), colour: s.colour, digit: i < 10 ? (i + 1) % 10 : null }))
  const marked = Math.max(0, rows.findIndex(r => r.space === last) >= 0 ? rows.findIndex(r => r.space === last) : rows.findIndex(r => r.space === front))
  let address = a.url
  try { const u = new URL(a.url); address = u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) } catch {}
  return {
    url: a.url, title: a.sender ? `Open a link from ${a.sender}` : 'Open a link', address, rows, marked,
    site, alwaysShown: !!site && model.pref<boolean>('spaces.links'), queued: waiting.length - 1,
  }
}

function ask(url: string, sender?: string): void {
  waiting.push({ url, sender })
  if (waiting.length === 1) showAsk()
}

function showAsk(): void {
  const a = waiting[0]
  let win = frontWindow()
  if (!win) win = openWindow({ restore: false }).record
  const c = controllerFor(win.id)
  if (!c) return
  askingIn = win.id
  forward(c)
  const data = panelData(a)
  const { width, height } = c.base.getContentBounds()
  const w = 360 + 32, h = Math.min(height - 40, 120 + data.rows.length * 34 + 32)
  showPanel(c, 'tabs.ask', { x: Math.round((width - w) / 2), y: Math.round(Math.max(20, height * 0.18)), width: w, height: h }, data)
  c.setOverlayRegion({ x: Math.round((width - w) / 2), y: Math.round(Math.max(20, height * 0.18)), width: w, height: h }, true)
}

function finishAsk(): void {
  const c = askingIn ? controllerFor(askingIn) : undefined
  waiting.shift()
  if (c) hidePanel(c, 'tabs.ask')
  askingIn = null
  if (waiting.length) setImmediate(showAsk)
}

handle('link.choose', ({ space, always }) => {
  const a = waiting[0]
  if (!a || !model.spaceOf(space)) return null
  const site = hostSite(a.url)
  if (site) {
    const list = [{ site, space }, ...memory().filter(m => m.site !== site)].slice(0, 200)
    model.setPref('links.ask.last', list)
    if (always && model.pref<boolean>('spaces.links')) setRoute(site, space)
  }
  finishAsk()
  return deliver(a.url, space)
})
handle('link.cancel', () => { if (waiting.length) finishAsk() })

// Always Open <site> in <space> (§7.29), from a tab's menu

handle('spaces.route', ({ url, space }) => {
  const site = hostSite(url)
  if (site) setRoute(site, space ?? null)
  return site
})

// Open the address field from any app (Launcher.swift, HotKey.swift)

let registered: string | null = null
let launchedFrom: { win: string; until: number; little: boolean } | null = null

/** The key in Settings as Electron names it ("Ctrl+Shift+Space"). */
function accelerator(): string | null {
  try {
    const k = JSON.parse(model.pref<string>('launcher.key') || 'null') as { name?: string } | null
    return k?.name ? k.name.replace(/\bCtrl\b/, 'CommandOrControl') : null
  } catch { return null }
}

/** On with a key: registered with Windows; a test world only says so, never
 * taking a key from whoever works beside it. */
function arm(): void {
  const want = model.pref<boolean>('launcher.on') ? accelerator() : null
  if (want === registered) return
  if (registered && !probe) globalShortcut.unregister(registered)
  registered = null
  if (!want) return
  if (probe) { registered = want; return }
  try { if (globalShortcut.register(want, launch)) registered = want } catch { /* a key Windows won't give */ }
}

/** The key pressed in any app: Oriel's window in front with the field up;
 * the key again puts it away. */
export function launch(): void {
  let win = frontWindow()
  if (!win) win = openWindow({ restore: false }).record
  const c = controllerFor(win.id)
  if (!c) return
  const active = model.activeTab(win)
  // The key again, with the field up in front: put away, as Escape would.
  if (!quietTests && c.base.isFocused() && active?.empty && launchedFrom?.win === win.id) {
    void run({ do: 'field.close' } as never, { window: c })
    launchedFrom = null
    return
  }
  forward(c)
  // Return opens what was typed in a new tab of the window in front: ⌘T's.
  void run({ do: 'tab.new' } as never, { window: c })
  launchedFrom = { win: win.id, until: Date.now() + 60_000, little: model.pref<boolean>('launcher.little') }
}

// Open in a small window: the page Return opens goes into a small window
// rather than staying in Oriel's.
model.on('tab-changed', (t: { id: string; win: string; url: string; pinID?: string }, patch: { url?: string }) => {
  if (!launchedFrom?.little || !('url' in patch) || t.win !== launchedFrom.win || !/^https?:/i.test(t.url) || t.pinID) return
  if (Date.now() > launchedFrom.until) { launchedFrom = null; return }
  launchedFrom = null
  const url = t.url
  const win = model.windows.get(t.win)
  if (!win) return
  // The tab Return was opening goes as if it never was; the small window has the page.
  setImmediate(() => {
    if (!model.tabs.has(t.id)) return
    const back = model.tabBefore(win, t.id)
    model.closeParked(win, t.id)
    if (back) model.selectTab(win, back)
    else if (!win.active[win.space]) model.newTab(win)
    openLittle(url, win.space)
  })
})
model.on('window-changed', (id: string, slices: string[]) => {
  if (!launchedFrom || launchedFrom.win !== id || !slices.includes('field')) return
  const w = model.windows.get(id)
  // Put away without opening anything: a moment more, for the page Return started.
  if (w && !w.field.open) launchedFrom.until = Math.min(launchedFrom.until, Date.now() + 1500)
})

model.on('window-changed', (_id: string, slices: string[]) => { if (slices.includes('prefs')) arm() })
app.whenReady().then(() => setTimeout(arm, 0))
app.on('will-quit', () => { if (registered && !probe) globalShortcut.unregister(registered) })

benchRequest('settingsb.launcher', () => ({ registered }))
benchRequest('settingsb.launch', () => { launch(); return {} })
benchRequest('settingsb.asking', () => ({ waiting: waiting.map(a => a.url), data: waiting[0] ? panelData(waiting[0]) : null }))

// A link a page opens in a new tab, from a page in another space: in its
// space, in front (Browser.sendToSpace).
model.hooks.route = url => routedSpace(url)
