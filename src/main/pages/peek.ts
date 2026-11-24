// Peek at a link (studio/01 §10.19-§10.22, studio/06 §1.11 #125-#126;
// Peek.swift), Arc's way: the peek's click (Shift-click unless Settings ›
// Keyboard & Mouse says otherwise) opens a link's page in a panel over the
// one you are reading, which stays where it was underneath. Escape, a
// click beside the panel or its cross puts it away; its other button (or
// Ctrl+O, Ctrl+Enter) keeps it as a tab beside this one, loaded as it is;
// with Split View, the third keeps it beside this page (Ctrl+Alt+Enter).
// With Peek stays with its tab, another tab hides it, its video and sound
// paused, and coming back shows it; otherwise another tab puts it away.
//
// The panel's page is a page of the tab's own sessions (a private tab's
// peek is private); the dimming and the knobs are the overlay's
// (src/ui/pagetools/Peek.tsx), the page sits above it.

import { WebContentsView, type WebContents } from 'electron'
import type { ID, Rect } from '../../shared/state'
import type { PeekState } from '../../shared/modules/pages'
import { model, type WindowRecord } from '../model/model'
import { handle } from '../router'
import { need } from '../context'
import { pagePreload, runtimeFor, runtimes, sessionFor } from '../views/tabs'
import { controllerFor, registerSlice, type WindowController } from '../views/window'
import { hidePanel, showPanel } from '../settings/slice'
import { pref } from './facts'
import { pageMayNotOpen } from '../settings/openers'

const PRELOAD_WORLD = 999

interface Peek {
  win: ID
  from: ID
  view: WebContentsView
  url: string
  title: string
  loading: boolean
  shown: boolean
}

const peeks = new Map<ID, Peek>()

export function peekOf(wc: WebContents): Peek | null {
  for (const p of peeks.values()) if (p.view.webContents === wc) return p
  return null
}

/** The page of the tab it came from, where the panel goes. */
function sourceRect(c: WindowController, p: Peek): Rect | null {
  const b = runtimes.get(p.from)?.view?.getBounds()
  return b && b.width > 0 && b.height > 0 ? b : null
}

/** PeekPanel: 82% of the page across with the knobs, 86% down, nudged 21 right. */
export function panelRect(page: Rect): Rect {
  const total = page.width * 0.82
  const width = Math.max(120, Math.round(total - 38))
  const height = Math.round(page.height * 0.86)
  const x = Math.round(page.x + (page.width - total) / 2 + 21)
  const y = Math.round(page.y + (page.height - height) / 2)
  return { x, y, width, height }
}

function state(p: Peek, c: WindowController): PeekState | null {
  const page = sourceRect(c, p)
  if (!page) return null
  const panel = panelRect(page)
  return {
    from: p.from, url: p.url, title: p.title, loading: p.loading, shown: p.shown,
    panel: { x: panel.x - page.x, y: panel.y - page.y, width: panel.width, height: panel.height },
    beside: pref<boolean>('splitView') !== false,
  }
}

registerSlice('peek', c => { const p = peeks.get(c.record.id); return p ? state(p, c) : null })

/** Where everything goes now: the page over the dimming over the tab. */
function place(p: Peek): void {
  const c = controllerFor(p.win)
  if (!c) return
  const page = sourceRect(c, p)
  const on = p.shown && !!page
  const kids = c.base.contentView.children
  if (!on) {
    if (kids.includes(p.view)) c.base.contentView.removeChildView(p.view)
    hidePanel(c, 'pages.peek')
    c.mark('peek')
    return
  }
  const s = state(p, c)!
  showPanel(c, 'pages.peek', page!, s)
  const r = panelRect(page!)
  // Above the overlay, so the page takes its own clicks and keys.
  if (!kids.includes(p.view) || kids[kids.length - 1] !== p.view) c.base.contentView.addChildView(p.view)
  p.view.setBounds(r)
  p.view.setBorderRadius(12)
  c.mark('peek')
}

function told(p: Peek): void {
  const c = controllerFor(p.win)
  if (!c) return
  const s = state(p, c)
  if (s && p.shown && c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'pages.peek') c.sendOverlay({ kind: 'panel', name: 'pages.peek', data: s })
  c.mark('peek')
}

export function openPeek(win: WindowRecord, from: ID, url: string): void {
  const c = controllerFor(win.id)
  const source = model.tabs.get(from)
  if (!c || !source) return
  closePeek(win.id)
  const view = new WebContentsView({
    webPreferences: { session: sessionFor(source), preload: pagePreload, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true, scrollBounce: false },
  })
  view.setBackgroundColor('#FFFFFF')
  const p: Peek = { win: win.id, from, view, url, title: '', loading: true, shown: true }
  peeks.set(win.id, p)
  wire(p)
  view.webContents.loadURL(url).catch(() => {})
  place(p)
  view.webContents.focus()
}

function wire(p: Peek): void {
  const wc = p.view.webContents
  const mine = () => peeks.get(p.win) === p
  wc.on('did-start-loading', () => { if (mine()) { p.loading = true; told(p) } })
  wc.on('did-stop-loading', () => { if (mine()) { p.loading = false; told(p) } })
  wc.on('did-navigate', (_e, url) => { if (mine()) { p.url = url; told(p) } })
  wc.on('did-navigate-in-page', (_e, url, main) => { if (mine() && main) { p.url = url; told(p) } })
  wc.on('page-title-updated', (_e, title, explicit) => { if (mine()) { p.title = explicit ? title : ''; told(p) } })
  wc.on('before-input-event', (event, input) => {
    if (!mine() || input.type !== 'keyDown') return
    const ctrl = process.platform === 'darwin' ? input.meta || input.control : input.control
    if (input.key === 'Escape' && !ctrl && !input.alt && !input.shift) { event.preventDefault(); closePeek(p.win); return }
    if (ctrl && !input.shift && (input.key === 'o' || input.key === 'O') && !input.alt) { event.preventDefault(); keepPeek(p.win, false); return }
    if (ctrl && input.key === 'Enter' && !input.shift) { event.preventDefault(); keepPeek(p.win, input.alt) }
  })
  // A window a page in the peek opens goes into the row, from the tab the
  // peek came from.
  wc.setWindowOpenHandler(details => {
    if (pageMayNotOpen(wc.getURL(), details.url, 'peek')) return { action: 'deny' }
    const win = model.windows.get(p.win)
    if (win && model.tabs.has(p.from)) model.openFromPage(win, p.from, details.url, details.disposition)
    return { action: 'deny' }
  })
}

/** Put away: the page goes with the panel. */
export function closePeek(winID: ID): void {
  const p = peeks.get(winID)
  if (!p) return
  peeks.delete(winID)
  const c = controllerFor(winID)
  if (c) {
    if (c.base.contentView.children.includes(p.view)) c.base.contentView.removeChildView(p.view)
    hidePanel(c, 'pages.peek')
    c.mark('peek')
    c.focusPage()
  }
  if (!p.view.webContents.isDestroyed()) p.view.webContents.close({ waitForBeforeUnload: false })
}

/** Kept: a tab beside the one it was opened from, in front, loaded as it
 * is; `beside`, in Split View with that page (Browser.keepPeek). */
export function keepPeek(winID: ID, beside: boolean): void {
  const p = peeks.get(winID)
  const win = model.windows.get(winID)
  const c = controllerFor(winID)
  if (!p || !win || !c) return
  peeks.delete(winID)
  if (c.base.contentView.children.includes(p.view)) c.base.contentView.removeChildView(p.view)
  hidePanel(c, 'pages.peek')
  const wc = p.view.webContents
  const source = model.tabs.get(p.from)
  const tab = model.addTab(win, { url: p.url || wc.getURL(), title: p.title, after: p.from, background: true, groupID: source?.groupID })
  model.updateTab(tab.id, { canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward(), loading: wc.isLoading() })
  runtimeFor(tab.id).adopt(p.view)
  if (beside && pref<boolean>('splitView') !== false && model.tabs.has(p.from)) {
    const at = win.splits.findIndex(s => s.tabs.includes(p.from))
    if (at >= 0 && win.splits[at].tabs.length < 4) {
      const s = win.splits[at]
      const tabs = [...s.tabs]
      tabs.splice(tabs.indexOf(p.from) + 1, 0, tab.id)
      win.splits = win.splits.map((x, i) => (i === at ? { ...x, tabs, sizes: tabs.map(() => 1 / tabs.length), focused: tab.id } : x))
    } else {
      if (at >= 0) win.splits = win.splits.filter((_, i) => i !== at)
      win.splits = [...win.splits, { tabs: [p.from, tab.id], axis: 'horizontal', sizes: [0.5, 0.5], focused: tab.id }]
    }
    model.touch(win, ['splits'])
  }
  model.selectTab(win, tab.id)
  c.mark('peek')
  c.focusPage()
}

/** Hidden behind another tab: its video and sound wait; back, they go on. */
function hold(p: Peek, held: boolean): void {
  const wc = p.view.webContents
  if (wc.isDestroyed()) return
  wc.setAudioMuted(held)
  const code = held
    ? "globalThis.__orielHeld = [...document.querySelectorAll('video, audio')].filter(m => !m.paused); globalThis.__orielHeld.forEach(m => m.pause()); true"
    : "(globalThis.__orielHeld || []).forEach(m => m.play().catch(() => {})); globalThis.__orielHeld = []; true"
  wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code }], !held).catch(() => {})
}

/** Another tab in front (Browser.select, peekInFront). */
model.on('selected', (win: WindowRecord) => setImmediate(() => {
  const p = peeks.get(win.id)
  if (!p) return
  if (!pref<boolean>('links.peek.stays')) { if (!model.onScreen(p.from)) closePeek(win.id); return }
  const shown = model.onScreen(p.from)
  if (shown === p.shown) return
  p.shown = shown
  hold(p, !shown)
  place(p)
  if (shown) p.view.webContents.focus()
}))

model.on('tab-closed', (id: ID) => { for (const [w, p] of peeks) if (p.from === id) closePeek(w) })

// The window moved its pages: the panel goes with them.
model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  c?.base.on('resize', () => setImmediate(() => { const p = peeks.get(id); if (p?.shown) place(p) }))
  c?.base.on('closed', () => closePeek(id))
}))

handle('pages.peek.close', (_a, ctx) => closePeek(need(ctx).record.id))
handle('pages.peek.keep', ({ beside }, ctx) => keepPeek(need(ctx).record.id, !!beside))

/** For the bench: each window's peek and its page. */
export function peekInfo(): { win: ID; from: ID; url: string; shown: boolean; contentsId: number; bounds: Rect; muted: boolean }[] {
  return [...peeks.values()].map(p => ({ win: p.win, from: p.from, url: p.url, shown: p.shown, contentsId: p.view.webContents.id, bounds: p.view.getBounds(), muted: p.view.webContents.isAudioMuted() }))
}
export function peekContents(winID?: ID): WebContents | null {
  const p = winID ? peeks.get(winID) : [...peeks.values()][0]
  return p && !p.view.webContents.isDestroyed() ? p.view.webContents : null
}
