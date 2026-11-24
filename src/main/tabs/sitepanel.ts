// Websites in the side panel (`panel.sites`, always there; SidePanel.swift
// SidePanelContent.site, idea 365): Claude or ChatGPT kept beside the page
// without an extension. Right-click a tab › Open in Side Panel, or Show Side
// Panel (a key of your own in Keyboard & Mouse › Shortcuts: Oriel has no
// View menu) for the site last there, or Claude. The same site again closes
// it. It is an ordinary page of the window's space, signed in where that
// space's tabs are, never a private window's; the window going to another
// space brings it again, signed in as that space is. Its address is on the
// panel's own line, with Open in a Tab and Close, since it stays beside
// every tab. A window it opens goes to a tab. It takes the room the
// extensions' panel uses (one panel at a time), as wide as it was last left.

import { View, WebContentsView, nativeTheme } from 'electron'
import { handle } from '../router'
import { need } from '../context'
import { model, newID, type TabRecord, type WindowRecord } from '../model/model'
import { controllerFor, type WindowController } from '../views/window'
import { pagePreload, sessionFor } from '../views/tabs'
import { closePanel, panelOf, PANEL } from '../extensions/sidepanel'
import { benchRequest } from '../bench/server'
import { pageMayNotOpen } from '../settings/openers'
import { keepOnPage } from '../views/guard'

const LINE = 34

/** The sites offered (PanelSites.offered). */
export const panelSites: [string, string][] = [
  ['Claude', 'https://claude.ai/new'],
  ['ChatGPT', 'https://chatgpt.com/'],
  ['Gemini', 'https://gemini.google.com/app'],
  ['Perplexity', 'https://www.perplexity.ai/'],
]

/** Only the web: never a file, a script or an extension's page. */
const allowed = (url?: string) => !!url && /^https?:\/\//i.test(url)
const host = (url?: string | null) => { try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return '' } }

/** The line's words: the site that arrived, "(not secure)" for http. */
function lineName(url: string | null): string {
  if (!url) return ''
  return host(url) + (/^http:/i.test(url) ? ' (not secure)' : '')
}

interface Site { box: View; line: WebContentsView; page: WebContentsView; space: string; first: string; arrived: string | null; place: (r: Electron.Rectangle | null) => void }
const open = new Map<string, Site>()
const hooked = new WeakSet<WindowController>()

const linePage = (dark: boolean) => `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;height:100%;background:${dark ? '#1c1c1c' : '#ffffff'};font:600 12.5px system-ui,"Segoe UI",sans-serif;color:${dark ? '#ededed' : '#171717'};-webkit-user-select:none}
body{display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;box-sizing:border-box}
#site{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
button{width:24px;height:24px;border:0;border-radius:6px;background:none;color:inherit;display:grid;place-items:center;padding:0}
button:hover{background:${dark ? '#2d2d2d' : '#efefef'}}
svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
</style><div id=site></div>
<button id=tab title="Open in a Tab" aria-label="Open in a Tab"><svg viewBox="0 0 16 16"><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/></svg></button>
<button id=close title="Close" aria-label="Close"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
<script>
for (const id of ['tab','close']) document.getElementById(id).onclick = () => { document.title = id + ':' + Date.now() }
window.site = t => { document.getElementById('site').textContent = t }
</script>`

function width(): number {
  return Math.max(PANEL.min, Math.min(PANEL.max, Math.round(model.pref<number>('sidepanel.width') || PANEL.start)))
}

function lay(s: Site, r: Electron.Rectangle): void {
  s.box.setBounds(r)
  s.line.setBounds({ x: 0, y: 0, width: r.width, height: LINE })
  s.page.setBounds({ x: 0, y: LINE, width: r.width, height: Math.max(0, r.height - LINE) })
}

/** The page and its line out of the window, let go. */
function drop(c: WindowController, s: Site): void {
  if (open.get(c.record.id) === s) open.delete(c.record.id)
  for (const v of [s.page, s.line]) if (!v.webContents.isDestroyed()) v.webContents.close()
  if (!c.base.isDestroyed()) { try { c.base.contentView.removeChildView(s.box) } catch { /* already out */ } }
}

/** A website into the window's panel; the same site again closes it. */
export function showSite(c: WindowController, url: string): boolean {
  if (!allowed(url) || c.record.shy) return false
  const current = open.get(c.record.id)
  if (current && host(current.arrived ?? current.first) === host(url)) { closeSite(c); return true }
  if (panelOf(c)) closePanel(c)
  if (current) { drop(c, current); c.setSideRoom(null) }
  const dark = nativeTheme.shouldUseDarkColors
  const box = new View()
  box.setBackgroundColor(dark ? '#1c1c1c' : '#ffffff')
  box.setBorderRadius(PANEL.radius)
  const line = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true } })
  line.setBackgroundColor(dark ? '#1c1c1c' : '#ffffff')
  keepOnPage(line.webContents)
  void line.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(linePage(dark)))
  const space = c.record.space
  const pseudo = { id: newID(), space, win: c.record.id, shy: false } as unknown as TabRecord
  const page = new WebContentsView({ webPreferences: { session: sessionFor(pseudo), preload: pagePreload, sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInSubFrames: true, spellcheck: true } })
  page.setBackgroundColor('#FFFFFF')
  box.addChildView(page)
  box.addChildView(line)
  // Above the pages, under the overlay.
  c.base.contentView.addChildView(box, c.base.contentView.children.indexOf(c.overlay))
  const s: Site = {
    box, line, page, space, first: url, arrived: null,
    // Another panel taking the room lets this one go.
    place: r => { if (r) lay(s, r); else if (open.get(c.record.id) === s) drop(c, s) },
  }
  open.set(c.record.id, s)
  // The window closing lets its panel's pages go.
  if (!hooked.has(c)) {
    hooked.add(c)
    c.base.once('closed', () => { const now = open.get(c.record.id); if (now) drop(c, now) })
  }
  const wc = page.webContents
  const tell = () => {
    if (wc.isDestroyed() || line.webContents.isDestroyed()) return
    void line.webContents.executeJavaScript(`site(${JSON.stringify(lineName(s.arrived))})`).catch(() => {})
  }
  wc.on('did-navigate', (_e, to) => { s.arrived = to; tell() })
  wc.on('did-navigate-in-page', (_e, to, main) => { if (main) { s.arrived = to; tell() } })
  line.webContents.on('did-finish-load', tell)
  line.webContents.on('page-title-updated', (_e, title) => {
    if (title.startsWith('tab:')) toTab(c)
    else if (title.startsWith('close:')) closeSite(c)
  })
  wc.setWindowOpenHandler(({ url: target }) => {
    if (allowed(target) && !pageMayNotOpen(wc.getURL(), target, 'site panel')) model.open(c.record, target, { foreground: true })
    return { action: 'deny' }
  })
  void wc.loadURL(url).catch(() => {})
  model.setPref('panel.site', url)
  c.setSideRoom({ side: c.record.sidebar.side !== 'right' ? 'right' : 'left', width: width(), place: s.place })
  return true
}

export function closeSite(c: WindowController): void {
  const s = open.get(c.record.id)
  if (!s) return
  open.delete(c.record.id)
  drop(c, s)
  if (!c.base.isDestroyed()) c.setSideRoom(null)
}

/** Open in a Tab: the page the panel is on, a tab in front, the panel closed. */
function toTab(c: WindowController): string | null {
  const s = open.get(c.record.id)
  if (!s) return null
  const url = s.arrived ?? s.first
  closeSite(c)
  return model.open(c.record, url, { foreground: true }).id
}

/** Show Side Panel: closes whatever is there, else the site last there, or Claude. */
function toggle(c: WindowController): void {
  if (open.has(c.record.id) || panelOf(c)) { closeSite(c); if (panelOf(c)) closePanel(c); return }
  const last = model.pref<string>('panel.site')
  showSite(c, allowed(last) ? last : panelSites[0][1])
}

// The window went to another space: the site comes again, signed in as that space is.
model.on('space-changed', (win: WindowRecord, space: string) => {
  const s = open.get(win.id)
  const c = controllerFor(win.id)
  if (!s || !c || s.space === space) return
  const url = s.arrived ?? s.first
  open.delete(win.id)
  drop(c, s)
  c.setSideRoom(null)
  showSite(c, url)
})

handle('view.sidePanel', (_a, ctx) => { toggle(need(ctx)) })
handle('panel.site', ({ url }, ctx) => showSite(need(ctx), String(url)))
handle('panel.siteToTab', (_a, ctx) => toTab(need(ctx)))
handle('panel.siteClose', (_a, ctx) => closeSite(need(ctx)))

benchRequest('settingsb.sitePanel', req => {
  const c = controllerFor(String(req.window ?? '')) ?? [...open.keys()].map(id => controllerFor(id)).find(Boolean)
  const s = c ? open.get(c.record.id) : undefined
  if (!c || !s) return { open: false }
  return {
    open: true, space: s.space, url: s.page.webContents.getURL(), arrived: s.arrived, line: lineName(s.arrived),
    bounds: s.box.getBounds(), partition: (s.page.webContents.session as unknown as { storagePath?: string }).storagePath ?? null,
    room: c.sideRoom(),
  }
})
benchRequest('settingsb.sitePanelLine', async req => {
  const c = controllerFor(String(req.window ?? '')) ?? [...open.keys()].map(id => controllerFor(id)).find(Boolean)
  const s = c ? open.get(c.record.id) : undefined
  if (!s) throw new Error('no site panel')
  // The click can close the line before the answer comes back.
  if (req.click) { void s.line.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(String(req.click))}).click()`).catch(() => {}); return {} }
  return { text: await s.line.webContents.executeJavaScript("document.getElementById('site').textContent") }
})
benchRequest('settingsb.sitePanelEval', async req => {
  const c = controllerFor(String(req.window ?? '')) ?? [...open.keys()].map(id => controllerFor(id)).find(Boolean)
  const s = c ? open.get(c.record.id) : undefined
  if (!s) throw new Error('no site panel')
  return { value: await s.page.webContents.executeJavaScript(String(req.js), true) }
})
