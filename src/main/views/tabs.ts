// A tab's page: one WebContentsView, made only when the tab is first shown
// (Tab.swift makes its WKWebView lazily too), put to sleep by destroying it
// and brought back with its history (navigationHistory.restore).

import { WebContentsView, type Session, type WebContents } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ID } from '../../shared/state'
import { model, type TabRecord } from '../model/model'
import { resolveInput } from '../address'

const here = path.dirname(fileURLToPath(import.meta.url))
export const pagePreload = path.join(here, '../preload/page.cjs')

type Hooks = {
  /** A page asked for a new tab or window (link with target, window.open). */
  open?: (opener: TabRuntime, url: string, disposition: string) => void
  /** A key the page didn't use, or one Search takes first. */
  input?: (tab: TabRuntime, event: Electron.Event, input: Electron.Input) => void
  created?: (tab: TabRuntime, contents: WebContents) => void
  contextMenu?: (tab: TabRuntime, params: Electron.ContextMenuParams) => void
}

export const hooks: Hooks = {}

export class TabRuntime {
  view: WebContentsView | null = null
  /** History kept while asleep. */
  private kept: { entries: Electron.NavigationEntry[]; index: number } | null = null

  constructor(public id: ID, public session: Session) {}

  get record(): TabRecord | undefined { return model.tabs.get(this.id) }
  get contents(): WebContents | null { return this.view?.webContents ?? null }

  /** Make the page if it isn't there, and load what the tab holds. */
  ensure(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view
    const view = new WebContentsView({
      webPreferences: {
        session: this.session,
        preload: pagePreload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: true,
        scrollBounce: false,
      },
    })
    view.setBackgroundColor('#FFFFFF')
    this.view = view
    this.wire(view.webContents)
    hooks.created?.(this, view.webContents)
    const tab = this.record
    if (this.kept?.entries.length) {
      view.webContents.navigationHistory.restore({ entries: this.kept.entries, index: this.kept.index })
        .catch(() => { if (tab?.url) view.webContents.loadURL(tab.url).catch(() => {}) })
      this.kept = null
    } else if (tab?.url && !tab.empty) {
      view.webContents.loadURL(tab.url).catch(() => {})
    }
    model.updateTab(this.id, { asleep: false })
    return view
  }

  go(input: string): void {
    const { url } = resolveInput(input, model.pref<string>('search.engine'))
    if (!url) return
    model.updateTab(this.id, { url, empty: false, error: undefined, crashed: undefined })
    const view = this.ensure()
    view.webContents.loadURL(url).catch(() => {})
  }

  /** Let the page go, keep its history (Sleep.swift). */
  sleep(): void {
    const wc = this.contents
    if (!wc || wc.isDestroyed()) return
    const nav = wc.navigationHistory
    this.kept = { entries: nav.getAllEntries(), index: nav.getActiveIndex() }
    this.destroy()
    model.updateTab(this.id, { asleep: true, loading: false, audible: false })
  }

  destroy(): void {
    const view = this.view
    this.view = null
    if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
  }

  private wire(wc: WebContents): void {
    const update = (patch: Partial<TabRecord>) => model.updateTab(this.id, patch)
    const nav = () => update({
      url: wc.getURL(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    })
    wc.on('did-start-loading', () => update({ loading: true, error: undefined }))
    wc.on('did-stop-loading', () => { update({ loading: false }); nav() })
    wc.on('did-navigate', nav)
    wc.on('did-navigate-in-page', nav)
    wc.on('page-title-updated', (_e, title) => update({ title }))
    wc.on('page-favicon-updated', (_e, favicons) => update({ favicon: favicons[0] }))
    wc.on('audio-state-changed', e => update({ audible: e.audible }))
    wc.on('render-process-gone', (_e, details) => { if (details.reason !== 'clean-exit') update({ crashed: true, loading: false }) })
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) update({ error: { code, description, url }, loading: false })
    })
    wc.on('before-input-event', (event, input) => hooks.input?.(this, event, input))
    wc.on('context-menu', (_e, params) => hooks.contextMenu?.(this, params))
    wc.setWindowOpenHandler(details => {
      if (details.disposition === 'new-window' && details.features) return { action: 'allow' } // popups (sign-in windows): their own small window
      hooks.open?.(this, details.url, details.disposition)
      return { action: 'deny' }
    })
  }
}

export const runtimes = new Map<ID, TabRuntime>()

export function runtimeFor(id: ID, session: Session): TabRuntime {
  let r = runtimes.get(id)
  if (!r) { r = new TabRuntime(id, session); runtimes.set(id, r) }
  return r
}

model.on('tab-closed', (id: ID) => {
  runtimes.get(id)?.destroy()
  runtimes.delete(id)
})
