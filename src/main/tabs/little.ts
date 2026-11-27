// Little windows (Little.swift; studio/01 §10.27-§10.31): a link from another
// app, with Settings › Browsing › Open links from other apps in a small
// window (`links.little`, on as it comes), opens in a small window of its
// own, the page and a thin line above it with the page's site and Open in
// Oriel. Oriel's own windows stay where they are. Ctrl+O, or the pill, keeps
// the page: it moves into the window in front, after the tab on screen, in
// front, not loaded again; Ctrl+W or Escape closes the small window.
// 900 x 640 the first time, then where the last one was moved or sized
// (`little.frame`); each new one a step down and right of the last one up.

import { BaseWindow, WebContentsView, nativeTheme, screen } from 'electron'
import { iconOption } from '../win/icon'
import { brand } from '../../shared/brand'
import { model, newID, type TabRecord, type WindowRecord } from '../model/model'
import { frameString, parseFrame } from '../model/formats'
import { pagePreload, runtimeFor, sessionFor } from '../views/tabs'
import { controllerFor, allControllers } from '../views/window'
import { quietTests, someWindow } from '../context'
import { benchRequest } from '../bench/server'
import { handle } from '../router'
import { need } from '../context'
import { pageMayNotOpen } from '../settings/openers'
import { keepOnPage } from '../views/guard'
import { groundPage } from '../pages/ground'

const LINE = 34
const MIN = { width: 420, height: 320 }

export interface Little { id: string; base: BaseWindow; line: WebContentsView; page: WebContentsView | null; space: string; url: string; opened: number }
export const littles: Little[] = []

/** The site a line shows (Little.swift:573-596). */
function siteLine(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'about:') return ''
    if (u.protocol === 'chrome-extension:') return 'Extension page'
    const host = u.hostname.replace(/^www\./, '')
    if (u.protocol === 'https:') return host
    if (u.protocol === 'http:') return `Not secure: ${host}`
    return 'Not a website'
  } catch { return '' }
}

const linePage = (dark: boolean, windows: boolean) => `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;height:100%;background:${dark ? '#1c1c1c' : '#ffffff'};font:500 12.5px system-ui,"Segoe UI",sans-serif;color:${dark ? '#949494' : '#8c8c8c'};-webkit-user-select:none}
body{display:flex;align-items:center;gap:10px;padding:0 10px;box-sizing:border-box;-webkit-app-region:drag}
#site{flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl}
#keep{-webkit-app-region:no-drag;font:inherit;font-size:12px;color:${dark ? '#ededed' : '#171717'};background:${dark ? '#2d2d2d' : '#efefef'};border:0;border-radius:999px;height:24px;padding:0 12px}
#keep:hover{background:${dark ? '#363636' : '#e4e4e4'}}
.room{width:${windows ? 0 : 64}px;flex:none}.end{width:${windows ? 138 : 0}px;flex:none}
</style><div class=room></div><div id=site></div><button id=keep title="Open in ${brand.name}   Ctrl+O">Open in ${brand.name}</button><div class=end></div>
<script>document.getElementById('keep').onclick=()=>{document.title='keep:'+Date.now()};window.site=t=>{document.getElementById('site').textContent=t}</script>`

function where(): Electron.Rectangle {
  const recent = [...littles].reverse().find(l => !l.base.isDestroyed() && l.base.isVisible())
  if (recent) {
    const b = recent.base.getBounds()
    return { ...b, x: b.x + 20, y: b.y + 20 }
  }
  const saved = parseFrame(model.pref<string>('little.frame'))
  if (saved && saved.width >= MIN.width && saved.height >= MIN.height) {
    const area = screen.getDisplayMatching(saved).workArea
    const seen = Math.max(0, Math.min(saved.x + saved.width, area.x + area.width) - Math.max(saved.x, area.x)) *
      Math.max(0, Math.min(saved.y + saved.height, area.y + area.height) - Math.max(saved.y, area.y))
    if (seen >= saved.width * saved.height * 0.6) return saved
  }
  const area = screen.getPrimaryDisplay().workArea
  return { x: Math.round(area.x + (area.width - 900) / 2), y: Math.round(area.y + (area.height - 640) / 2), width: 900, height: 640 }
}

function lay(l: Little): void {
  if (l.base.isDestroyed()) return
  const { width, height } = l.base.getContentBounds()
  l.line.setBounds({ x: 0, y: 0, width, height: LINE })
  l.page?.setBounds({ x: 0, y: LINE, width, height: Math.max(0, height - LINE) })
}

/** The window in front, the one whose space and sign-ins a small window takes. */
export function frontWindow() {
  const id = model.front && model.windows.has(model.front) ? model.front : [...model.windows.values()].find(w => !w.shy)?.id
  return id ? model.windows.get(id) ?? null : null
}

/** A small window for `url`: the space and sign-ins of the window in front,
 * or of `space` when one was chosen. */
export function openLittle(url: string, space?: string): Little {
  const win = frontWindow()
  const chosen = space ?? win?.space ?? model.homeSpace
  const windows = process.platform !== 'darwin'
  const dark = nativeTheme.shouldUseDarkColors
  const base = new BaseWindow({
    ...where(), minWidth: MIN.width, minHeight: MIN.height, show: false, title: '', ...iconOption(),
    backgroundColor: dark ? '#1c1c1c' : '#ffffff', titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 12, y: 10 } }
      : { titleBarOverlay: { color: dark ? '#1c1c1c' : '#ffffff', symbolColor: dark ? '#ededed' : '#171717', height: LINE } }),
  })
  const line = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } })
  line.setBackgroundColor(dark ? '#1c1c1c' : '#ffffff')
  keepOnPage(line.webContents)
  void line.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(linePage(dark, windows)))
  const pseudo = { id: newID(), space: chosen, win: win?.id ?? '', shy: false } as unknown as TabRecord
  const page = new WebContentsView({
    webPreferences: { session: sessionFor(pseudo), preload: pagePreload, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true, spellcheck: true },
  })
  groundPage(page)
  base.contentView.addChildView(page)
  base.contentView.addChildView(line)
  const l: Little = { id: newID(), base, line, page, space: chosen, url, opened: Date.now() }
  littles.push(l)
  lay(l)
  base.on('resize', () => { lay(l); remember(l) })
  base.on('move', () => remember(l))
  base.on('closed', () => {
    const at = littles.indexOf(l)
    if (at >= 0) littles.splice(at, 1)
    if (l.page && !l.page.webContents.isDestroyed()) l.page.webContents.close()
  })
  const wc = page.webContents
  // The page can outlive its line (kept as a tab, or the window closing).
  const tell = () => {
    if (wc.isDestroyed() || line.webContents.isDestroyed() || l.page !== page) return
    l.url = wc.getURL() || l.url
    void line.webContents.executeJavaScript(`site(${JSON.stringify(siteLine(l.url))})`).catch(() => {})
  }
  wc.on('did-navigate', tell)
  wc.on('did-navigate-in-page', tell)
  line.webContents.on('did-finish-load', tell)
  line.webContents.on('page-title-updated', (_e, title) => { if (title.startsWith('keep:')) keep(l) })
  // A page in a small window that opens another opens another small window.
  wc.setWindowOpenHandler(details => {
    if (pageMayNotOpen(wc.getURL(), details.url, 'little')) return { action: 'deny' }
    if (details.disposition === 'new-window' && details.features) return { action: 'allow' }
    openLittle(details.url, l.space)
    return { action: 'deny' }
  })
  for (const w of [wc, line.webContents]) {
    w.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const ctrl = process.platform === 'darwin' ? input.meta || input.control : input.control
      const key = input.key.toLowerCase()
      if (ctrl && !input.shift && !input.alt && key === 'o') { event.preventDefault(); keep(l) }
      else if (ctrl && !input.shift && !input.alt && key === 'w') { event.preventDefault(); base.close() }
      else if (input.key === 'Escape' && !ctrl && !input.shift && !input.alt) { event.preventDefault(); base.close() }
    })
  }
  void wc.loadURL(url).catch(() => {})
  // A test world's window stays out of sight (context.ts quietTests).
  if (quietTests) { base.setOpacity(0); base.setIgnoreMouseEvents(true); base.showInactive() }
  else { base.show(); base.focus(); wc.focus() }
  return l
}

function remember(l: Little): void {
  if (l.base.isDestroyed() || l.base.isFullScreen() || l.base.isMinimized()) return
  model.setPref('little.frame', frameString(l.base.getBounds()))
}

/** Open in Oriel: the page into the window in front, after the tab on
 * screen, in front, as it is (Little.keep, §10.31). */
export function keep(l: Little): string | null {
  const page = l.page
  if (!page || page.webContents.isDestroyed()) return null
  // No browser window (Oriel started by the link, or its windows closed while
  // this one stayed): one is made, last time's tabs back in it as at a plain
  // launch, and the page joins them (the user's report, 27 Nov 2026: Open in
  // Oriel did nothing with Oriel closed).
  const made = !frontWindow()
  const win = [...model.windows.values()].find(w => !w.shy && w.space === l.space && w.id === model.front)
    ?? [...model.windows.values()].find(w => !w.shy && w.space === l.space)
    ?? frontWindow()
    ?? someWindow().record
  if (!win) return null
  if (win.space !== l.space) model.switchSpace(win, l.space)
  l.base.contentView.removeChildView(page)
  l.page = null
  const wc = page.webContents
  wc.removeAllListeners('did-navigate')
  wc.removeAllListeners('did-navigate-in-page')
  wc.removeAllListeners('before-input-event')
  const tab = model.adoptPage(win, wc.getURL() || l.url, wc.getTitle())
  runtimeFor(tab.id).adopt(page)
  model.updateTab(tab.id, { asleep: false, canGoBack: wc.navigationHistory.canGoBack(), canGoForward: wc.navigationHistory.canGoForward() })
  l.base.close()
  const c = controllerFor(win.id)
  if (c) {
    c.placePages()
    if (c.base.isMinimized()) c.base.restore()
    // A window just made shows itself once its interface has loaded (views/window.ts).
    if (!made || c.base.isVisible()) { c.base.show(); c.base.focus() }
  }
  return tab.id
}

/** A small window already showing the page, for Go to a tab that has the page. */
export function littleWith(url: string): Little | undefined {
  const same = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')
  return [...littles].reverse().find(l => !l.base.isDestroyed() && l.page && same(l.page.webContents.getURL() || l.url, url))
}

/** A tab's menu › Open in Small Window (Browser.openInLittleWindow, with
 * links.little on): the tab out of its row, its page in a small window
 * beside this one. Not a pin, a private tab or one of Oriel's pages. The
 * page loads again there: Electron moves a tab's page between windows
 * only with what the tabs module wired to it. */
export function liftTab(win: WindowRecord, id: string): Little | null {
  const t = model.tabs.get(id)
  if (!t || win.shy || t.shy || t.pinID || t.internal || !/^https?:/i.test(t.url)) return null
  const url = t.url
  const back = win.active[win.space] === id ? model.tabBefore(win, id) : null
  model.closeParked(win, id)
  if (back) model.selectTab(win, back)
  else if (!win.active[win.space]) model.newTab(win)
  return openLittle(url, t.space)
}

export function front(l: Little): void {
  if (l.base.isMinimized()) l.base.restore()
  if (quietTests) l.base.showInactive(); else { l.base.show(); l.base.focus() }
}

benchRequest('settingsb.littles', () => ({
  littles: littles.filter(l => !l.base.isDestroyed()).map(l => ({ id: l.id, url: l.page?.webContents.getURL() ?? l.url, space: l.space, bounds: l.base.getBounds() })),
  windows: allControllers().length,
}))
benchRequest('settingsb.littleEval', async req => {
  const l = littles.find(x => x.id === req.id)
  if (!l?.page) throw new Error('no small window')
  return { value: await l.page.webContents.executeJavaScript(String(req.js), true) }
})
benchRequest('settingsb.littleKeep', req => {
  const l = littles.find(x => x.id === req.id)
  if (!l) throw new Error('no small window')
  if (req.pill) { void l.line.webContents.executeJavaScript("document.getElementById('keep').click()"); return { tab: null } }
  return { tab: keep(l) }
})
benchRequest('settingsb.littleKey', req => {
  const l = littles.find(x => x.id === req.id)
  if (!l?.page) throw new Error('no small window')
  const mods = (req.modifiers ?? []) as Electron.InputEvent['modifiers']
  const wc = l.page.webContents
  wc.sendInputEvent({ type: 'keyDown', keyCode: String(req.key), modifiers: mods })
  if (!wc.isDestroyed()) wc.sendInputEvent({ type: 'keyUp', keyCode: String(req.key), modifiers: mods })
  return {}
})

handle('tab.little', ({ id }, ctx) => !!liftTab(need(ctx).record, String(id)))
