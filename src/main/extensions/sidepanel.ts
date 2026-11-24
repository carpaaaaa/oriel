// chrome.sidePanel and the panel itself (studio/04 §3.1, §5.6): the
// extension's page beside the page in front, on the side away from the tabs,
// 380 wide to start, kept within 300..640. setOptions per tab or for all,
// setPanelBehavior({openPanelOnActionClick}) so the button opens it, open and
// close; a panel turned off while open closes.
//
// The window gives the panel its room beside the page
// (WindowController.setSideRoom): the card gets narrower and the panel is
// laid where the room is.

import { WebContentsView, type Session } from 'electron'
import { WindowController, allControllers, controllerFor } from '../views/window'
import { runtimes } from '../views/tabs'
import { model } from '../model/model'

export const PANEL = { min: 300, max: 640, start: 380, gap: 8, radius: 10 }
const clampWidth = (width: number) => Math.max(PANEL.min, Math.min(PANEL.max, Math.round(width)))

interface Options { path?: string; enabled?: boolean }
interface ExtPanel { global: Options; tabs: Map<number, Options>; openOnAction: boolean }
interface Open { id: string; view: WebContentsView; width: number; path: string }

const perExt = new Map<string, ExtPanel>()
const open = new Map<WindowController, Open>()
let profile: Session | null = null
let changed: (c: WindowController) => void = () => {}

export function setupSidePanel(p: Session, onChange: (c: WindowController) => void): void { profile = p; changed = onChange }
export function panelOf(c: WindowController): Open | undefined { return open.get(c) }
export function panelByContents(wc: Electron.WebContents): { c: WindowController; panel: Open } | undefined {
  for (const [c, panel] of open) if (panel.view.webContents === wc) return { c, panel }
}

function state(id: string): ExtPanel {
  let s = perExt.get(id)
  if (!s) { s = { global: {}, tabs: new Map(), openOnAction: false }; perExt.set(id, s) }
  return s
}

function defaultPath(id: string): string | undefined {
  const ext = profile?.extensions.getExtension(id)
  return (ext?.manifest as { side_panel?: { default_path?: string } } | undefined)?.side_panel?.default_path
}

function activeTabId(c: WindowController): number {
  const id = c.record.active[c.record.space]
  return (id ? runtimes.get(id)?.contents?.id : undefined) ?? -1
}

/** What the panel shows on a tab: the tab's options over the extension's. */
function effective(id: string, tabId: number): { path?: string; enabled: boolean } {
  const s = state(id)
  const t = s.tabs.get(tabId)
  return { path: t?.path ?? s.global.path ?? defaultPath(id), enabled: (t?.enabled ?? s.global.enabled ?? true) }
}

export const behaviour = (id: string) => state(id).openOnAction

/** Room beside the page, on the side away from the tabs, for the panel. */
function room(c: WindowController, panel: Open): void {
  c.setSideRoom({
    side: c.record.sidebar.side !== 'right' ? 'right' : 'left',
    width: panel.width,
    place: r => { if (r && !panel.view.webContents.isDestroyed()) panel.view.setBounds(r) },
  })
}

export function openPanel(c: WindowController, id: string): void {
  if (!profile) return
  const { path, enabled } = effective(id, activeTabId(c))
  if (!path || !enabled) throw new Error('No active side panel for this window.')
  const url = new URL(path, `chrome-extension://${id}/`).href
  const current = open.get(c)
  if (current?.id === id && current.path === url) return
  closePanel(c)
  const view = new WebContentsView({ webPreferences: { session: profile, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  view.setBackgroundColor('#FFFFFF')
  view.setBorderRadius(PANEL.radius)
  // Above the pages, under the overlay.
  c.base.contentView.addChildView(view, c.base.contentView.children.indexOf(c.overlay))
  // The width last given, kept for the next launch (sidepanel.width, studio/06 §1.15).
  const panel: Open = { id, view, width: clampWidth(model.pref<number>('sidepanel.width') || PANEL.start), path: url }
  open.set(c, panel)
  view.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) model.addTab(c.record, { url: target, empty: false })
    return { action: 'deny' }
  })
  void view.webContents.loadURL(url).catch(() => {})
  room(c, panel)
  changed(c)
}

export function closePanel(c: WindowController): void {
  const panel = open.get(c)
  if (!panel) return
  open.delete(c)
  if (!panel.view.webContents.isDestroyed()) panel.view.webContents.close()
  if (c.base.isDestroyed()) return
  c.setSideRoom(null)
  try { c.base.contentView.removeChildView(panel.view) } catch { /* already out */ }
  changed(c)
}

export function togglePanel(c: WindowController, id: string): void {
  if (open.get(c)?.id === id) closePanel(c)
  else openPanel(c, id)
}

export function setPanelWidth(c: WindowController, width: number): void {
  const panel = open.get(c)
  if (!panel) return
  panel.width = clampWidth(width)
  model.setPref('sidepanel.width', panel.width)
  room(c, panel)
}

/** The tab in front changed: a panel turned off for it closes. */
export function followTab(c: WindowController): void {
  const panel = open.get(c)
  if (panel && !effective(panel.id, activeTabId(c)).enabled) closePanel(c)
}

export function forget(id: string): void {
  perExt.delete(id)
  for (const [c, panel] of [...open]) if (panel.id === id) closePanel(c)
}

function windowFor(args: { windowId?: number; tabId?: number }): WindowController | undefined {
  if (args?.tabId !== undefined) {
    for (const [tid, rt] of runtimes) if (rt.contents?.id === args.tabId) { const w = model.windowOf(tid); return w ? controllerFor(w.id) : undefined }
    return undefined
  }
  if (args?.windowId !== undefined) return allControllers().find(c => c.base.id === args.windowId)
  return undefined
}

/** chrome.sidePanel.*, as the extension `id`. */
export const sidePanelApi: Record<string, (id: string, ...args: any[]) => unknown> = {
  setOptions: (id, o: Options & { tabId?: number } = {}) => {
    const s = state(id)
    const target = o.tabId !== undefined ? (s.tabs.get(o.tabId) ?? {}) : s.global
    if (o.path !== undefined) target.path = o.path
    if (o.enabled !== undefined) target.enabled = o.enabled
    if (o.tabId !== undefined) s.tabs.set(o.tabId, target)
    for (const c of allControllers()) if (open.get(c)?.id === id) {
      if (!effective(id, activeTabId(c)).enabled) closePanel(c)
      else { const p = effective(id, activeTabId(c)).path; if (p && new URL(p, `chrome-extension://${id}/`).href !== open.get(c)!.path) openPanel(c, id) }
    }
  },
  getOptions: (id, o: { tabId?: number } = {}) => {
    const s = state(id)
    const t = o.tabId !== undefined ? s.tabs.get(o.tabId) : undefined
    const g = s.global
    return { ...(o.tabId !== undefined ? { tabId: o.tabId } : {}), path: t?.path ?? g.path ?? defaultPath(id), enabled: t?.enabled ?? g.enabled ?? true }
  },
  setPanelBehavior: (id, b: { openPanelOnActionClick?: boolean } = {}) => { if (b.openPanelOnActionClick !== undefined) state(id).openOnAction = b.openPanelOnActionClick },
  getPanelBehavior: id => ({ openPanelOnActionClick: state(id).openOnAction }),
  open: (id, args: { windowId?: number; tabId?: number } = {}) => {
    const c = windowFor(args)
    if (!c) throw new Error(args?.tabId !== undefined ? `No tab with id: ${args.tabId}.` : `No window with id: ${args?.windowId}.`)
    openPanel(c, id)
  },
  close: (id, args: { windowId?: number; tabId?: number } = {}) => {
    const c = windowFor(args)
    if (c && open.get(c)?.id === id) closePanel(c)
  },
}
