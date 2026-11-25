// A tab's page: one WebContentsView, made only when the tab is first shown
// (Tab.swift makes its WKWebView lazily too, studio/01 §2.2), put to sleep by
// destroying it and brought back with its history (navigationHistory.restore,
// §2.28-§2.29). Its cookies are its space's, or a private tab's own (§2.35,
// §7.26). What the page does goes into the model (§2.4-§2.34).

import { WebContentsView, session as electronSession, type Session, type WebContents } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ID } from '../../shared/state'
import { model, internalKind, internalURL, type TabRecord, type Keepsake } from '../model/model'
import { resolveInput } from '../address'
import { applyUserAgent } from '../ua'
import { attachNet } from '../net'
import { data } from '../data/api'
import { pageMayNotOpen } from '../settings/openers'
import { groundPage } from '../pages/ground'

const here = path.dirname(fileURLToPath(import.meta.url))
export const pagePreload = path.join(here, '../preload/page.cjs')

type Hooks = {
  /** A page asked for a new tab or window, when no window holds it. */
  open?: (opener: TabRuntime, url: string, disposition: string) => void
  /** A key the page didn't use, or one Search takes first. */
  input?: (tab: TabRuntime, event: Electron.Event, input: Electron.Input) => void
  created?: (tab: TabRuntime, contents: WebContents) => void
  contextMenu?: (tab: TabRuntime, params: Electron.ContextMenuParams) => void
  /** Block ads and trackers: a $popup filter for what the page opens (pages/shield.ts). */
  refusePopup?: (pageURL: string, url: string, referrer: string) => boolean
}

export const hooks: Hooks = {}

/** Sized pop-ups (the tabs module's popups.ts): what to answer Chromium. */
export const popups = {
  open: (_opener: TabRuntime, _details: Electron.HandlerDetails): Electron.WindowOpenHandlerResponse | null => ({ action: 'allow' }),
}

/** Every key and click a page sees (the tabs module's ⌘Z listens). */
export const pageInput: ((id: ID, kind: 'key' | 'mouse', input: Electron.Input | Electron.MouseInputEvent) => void)[] = []
/** Modules told when a tab's page stops loading (tabs/previews.ts). */
export const pageLoaded: ((id: ID) => void)[] = []

/** The window view holding a page, if any (set by the tabs module's wiring). */
export const viewHost = { parentOf: (_view: WebContentsView): Electron.View | null => null }

// sessions: the profile's, a space's own, a private tab's

const prepared = new Map<string, Session>()

function sessionNamed(partition: string): Session {
  let s = prepared.get(partition)
  if (!s) {
    s = electronSession.fromPartition(partition)
    applyUserAgent(s)
    attachNet(s)
    prepared.set(partition, s)
    sessionMade.forEach(f => f(s!, partition))
  }
  return s
}

/** Other modules hear of each page session as it is first made (extensions,
 * downloads, permissions): a space signed out has its own. */
const sessionMade: ((s: Session, partition: string) => void)[] = []
export function onPageSession(f: (s: Session, partition: string) => void): void {
  sessionMade.push(f)
  for (const [p, s] of prepared) f(s, p)
}

export function partitionFor(t: TabRecord): string {
  if (t.shy) return `shy-${t.store ?? t.win}`
  if (model.ownsStore(t.space)) return `persist:space-${t.space.toLowerCase()}`
  return 'persist:personal'
}

/** A page's history: every entry, with the state each one keeps. */
function historyOf(wc: WebContents): Keepsake | undefined {
  const nav = wc.navigationHistory
  const entries = nav.getAllEntries()
  return entries.length ? { entries, index: nav.getActiveIndex() } : undefined
}

/** Has the page tell its history entry its scroll and typed fields now.
 * Chromium hears them only on a timer, 1 s while the page shows and 5 s
 * while it is hidden (a tab behind, a window minimized or covered), so a
 * page let go sooner came back without them. replaceState of the same state
 * and address, in the tabs module's own world (the page's patched history
 * never sees it), commits them at once: told once the browser has the
 * commit, or after `wait` at most. */
export function tellHistory(wc: WebContents, wait = 500): Promise<void> {
  return new Promise(resolve => {
    if (wc.isDestroyed() || wc.isCrashed() || wc.isLoading()) { resolve(); return }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (!wc.isDestroyed()) wc.off('did-navigate-in-page', heard)
      resolve()
    }
    const heard = (_e: unknown, _url: string, main: boolean) => { if (main) finish() }
    const timer = setTimeout(finish, wait)
    wc.on('did-navigate-in-page', heard)
    wc.executeJavaScriptInIsolatedWorld(1001, [{ code: 'try { history.replaceState(history.state, ""); true } catch { false }' }])
      .then(ok => { if (!ok) finish() }, finish)
  })
}

export function sessionFor(t: TabRecord): Session {
  return sessionNamed(partitionFor(t))
}

// what a failed load says (Browser.swift:9761-9776, §2.33)

export function failure(code: number): string {
  if (code === -105 || code === -137 || code === -800 || code === -803) return 'No site at that address.'
  if (code === -106 || code === -21 || code === -100 || code === -101 || code === -109 || code === -130) return 'No connection.'
  if (code === -7 || code === -118) return 'The site took too long to answer.'
  if (code === -102) return 'The site refused the connection.'
  if (code === -107 || code === -113 || code === -117 || (code <= -200 && code > -300)) return "The connection isn't secure."
  // ERR_BLOCKED_BY_CLIENT: a list's filter for pages (Block ads and trackers) or an extension's rule.
  if (code === -20) return 'A block list stopped this page.'
  return "The page didn't load."
}

/** Visits handed to the data module, the latest last (the bench reads them). */
export const visits: { url: string; title: string; visitedAt: number }[] = []
const recordable = (t: TabRecord | undefined, url: string) => !!t && !t.shy && !t.bench && /^(https?|file):/i.test(url)

export class TabRuntime {
  view: WebContentsView | null = null
  partition: string | null = null
  private lastVisit = ''

  constructor(public id: ID, public session?: Session) {}

  get record(): TabRecord | undefined { return model.tabs.get(this.id) }
  get contents(): WebContents | null {
    const wc = this.view?.webContents
    return wc && !wc.isDestroyed() ? wc : null
  }

  /** A page that is up and holds the tab's page (not an empty shell). */
  get awake(): boolean { return !!this.contents && !this.shell }

  /** Made for a window that still had a place for an asleep tab no longer
   * on screen: an empty view, never loaded, gone once the window lets go. */
  private shell = false

  /** Make the page if it isn't there, and load what the tab holds. */
  ensure(): WebContentsView {
    const tab = this.record
    const wanted = !tab || !tab.asleep || model.onScreen(this.id)
    if (this.view && !this.view.webContents.isDestroyed()) {
      if (this.shell && wanted) { this.shell = false; this.fill(this.view.webContents) }
      return this.view
    }
    this.partition = tab ? partitionFor(tab) : null
    const view = new WebContentsView({
      webPreferences: {
        session: tab ? sessionFor(tab) : this.session,
        preload: pagePreload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // The preload's frame part (blocking, GPC, cross-site cookies) runs
        // in frames too; nothing of Node's is there (sandboxed).
        nodeIntegrationInSubFrames: true,
        spellcheck: true,
      },
    })
    // Dark until it paints, while Oriel is dark (studio/01 §2.6).
    groundPage(view)
    this.view = view
    const wc = view.webContents
    // A tab muted asleep never lets out its first sound (§2.19).
    if (tab?.muted) wc.setAudioMuted(true)
    this.wire(wc)
    model.making++
    // Another module's trouble with this page (extensions take only the
    // profile's session) mustn't take the page down with it.
    try { hooks.created?.(this, wc) } catch (error) { console.warn('[tabs] page made:', (error as Error).message) } finally { model.making-- }
    if (!wanted) { this.shell = true; this.reap(); return view }
    this.fill(wc)
    return view
  }

  /** A page made elsewhere (a peek kept as a tab, studio/01 §10.22) becomes
   * this tab's as it is, nothing loaded again. Asked of the pages module. */
  adopt(view: WebContentsView): void {
    if (this.view && this.view !== view) this.destroy()
    this.view = view
    this.shell = false
    const tab = this.record
    this.partition = tab ? partitionFor(tab) : null
    this.wire(view.webContents)
    model.making++
    try { hooks.created?.(this, view.webContents) } catch (error) { console.warn('[tabs] page adopted:', (error as Error).message) } finally { model.making-- }
  }

  private fill(wc: WebContents): void {
    const tab = this.record
    const keep = model.keeps.get(this.id)
    model.keeps.delete(this.id)
    if (tab && !tab.internal && keep?.entries.length && !/^file:/i.test(tab.url)) {
      // The page can be gone by the time this settles (closed or put back to
      // sleep): touching a destroyed WebContents throws.
      wc.navigationHistory.restore({ entries: keep.entries, index: keep.index })
        .catch(() => { if (tab.url && !wc.isDestroyed()) wc.loadURL(tab.url).catch(() => {}) })
    } else if (tab?.url && !tab.empty && !tab.internal) {
      wc.loadURL(tab.url).catch(() => {})
    }
    model.updateTab(this.id, { asleep: false, resting: undefined })
  }

  private reap(): void {
    setTimeout(() => {
      if (!this.shell || !this.view) return
      if (viewHost.parentOf(this.view)) this.reap()
      else this.destroy()
    }, 2000).unref?.()
  }

  /** An address typed or picked for this tab (Tab.go, §2.7). */
  go(input: string): void {
    const url = internalKind(input.trim()) ? input.trim() : resolveInput(input, model.pref<string>('search.engine')).url
    if (url) this.load(url)
  }

  load(url: string): void {
    const kind = internalKind(url)
    model.keeps.delete(this.id)
    if (kind) {
      // Search's own page: no web view behind it (§2.10).
      this.destroy()
      model.updateTab(this.id, { url: internalURL(url), title: '', internal: kind, empty: false, asleep: false, error: undefined, crashed: undefined, dead: undefined, stale: undefined, loading: false })
      return
    }
    const t = this.record
    model.updateTab(this.id, {
      url, empty: false, internal: undefined, error: undefined, crashed: undefined, dead: undefined, stale: undefined,
      asleep: false, resting: undefined,
      ...(t && t.url !== url ? { title: '' } : {}),
    })
    if (this.shell && this.contents) { this.shell = false; this.fill(this.contents); return }
    if (!this.contents) { this.ensure(); return }
    this.contents.loadURL(url).catch(() => {})
  }

  /** History as it is now, unless the page is still arriving (Tab.keepsake). */
  keepsake(): Keepsake | undefined {
    const wc = this.contents
    if (!wc || this.shell || wc.isLoading()) return undefined
    return historyOf(wc)
  }

  /** Let the page go, keep its history (Sleep.swift, §2.28): as it is now,
   * then as the page tells it once asked (its scroll and what was typed,
   * §2.29), unless the tab woke meanwhile. */
  sleep(): boolean {
    const wc = this.contents
    if (!wc || this.shell) return false
    const now = historyOf(wc)
    if (now) model.keeps.set(this.id, now)
    this.letGo(fresh => { if (fresh && now && model.keeps.get(this.id) === now) model.keeps.set(this.id, fresh) })
    model.updateTab(this.id, { asleep: true, loading: false, audible: false })
    return true
  }

  /** The page out of its window and silent at once, then let go once it has
   * told its history entry what it holds (tellHistory); `then` gets the
   * history as it is after. A page already gone: then(undefined). */
  letGo(then: (keep: Keepsake | undefined) => void): void {
    const view = this.view
    const wc = view && !view.webContents.isDestroyed() && !this.shell ? view.webContents : null
    if (!view || !wc) { this.destroy(); then(undefined); return }
    if (this.record?.capturing) model.updateTab(this.id, { capturing: undefined })
    this.view = null
    this.shell = false
    this.lastVisit = ''
    viewHost.parentOf(view)?.removeChildView(view)
    wc.setAudioMuted(true)
    // A page still arriving has no history to keep yet (keepsake). Read
    // after the commit, the page counts as loading for a moment: its
    // entries are already the ones told.
    const arriving = wc.isLoading()
    void tellHistory(wc).then(() => {
      const keep = wc.isDestroyed() || arriving ? undefined : historyOf(wc)
      try { then(keep) } finally { if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false }) }
    })
  }

  /** Moved to a space with other cookies: built again in that store, its
   * history kept unless it was loading (Tab.rehome, §2.31). */
  rehome(): void {
    const t = this.record
    if (!t || !this.awake || this.partition === partitionFor(t)) return
    const keep = this.keepsake()
    this.destroy()
    if (keep) model.keeps.set(this.id, keep)
    model.updateTab(this.id, { asleep: true, loading: false, audible: false })
    if (model.onScreen(this.id)) this.ensure()
  }

  /** Reload and Reload From Origin (§2.34). */
  reload(hard = false): void {
    const t = this.record
    if (!t || t.internal || t.empty) return
    const wc = this.contents
    if (!wc || this.shell) { this.ensure(); return }
    const url = wc.getURL()
    if (t.dead || t.stale || !url || url === 'about:blank' || /^file:/i.test(t.url)) { this.revive(true); return }
    if (hard) wc.reloadIgnoringCache(); else wc.reload()
  }

  /** A page that died behind, or gave up: asked for its address again. */
  revive(force = false): void {
    const t = this.record
    if (!t || (!t.stale && !force)) return
    model.updateTab(this.id, { stale: undefined, dead: undefined, crashed: undefined, error: undefined, ...(force ? { crashes: [] } : {}) })
    const wc = this.contents
    if (!wc || this.shell) { this.shell = false; if (wc) this.fill(wc); else this.ensure(); return }
    wc.loadURL(t.url).catch(() => {})
  }

  destroy(): void {
    if (this.record?.capturing) model.updateTab(this.id, { capturing: undefined })
    const view = this.view
    this.view = null
    this.shell = false
    // Out of its window first: a closed page left there stays in its place.
    if (view) viewHost.parentOf(view)?.removeChildView(view)
    if (view && !view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false })
    this.lastVisit = ''
  }

  private visit(url: string): void {
    const t = this.record
    if (!recordable(t, url) || url === this.lastVisit) return
    this.lastVisit = url
    const v = { url, title: t!.title, visitedAt: Date.now() }
    visits.push(v)
    if (visits.length > 200) visits.shift()
    data.recordVisit(v)
  }

  private wire(wc: WebContents): void {
    // A page being let go (letGo) still answers for a moment: it no longer
    // speaks for the tab.
    const mine = () => this.view?.webContents === wc
    const update = (patch: Partial<TabRecord>) => { if (mine()) model.updateTab(this.id, patch) }
    const nav = () => update({
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    })
    // A page's source (View Page Source) is told by its inner address:
    // the tab keeps saying view-source:, as Chrome's address does.
    const shown = (url: string) => (this.record?.url === `view-source:${url}` ? this.record.url : url)
    wc.on('did-start-navigation', details => {
      if (!details.isMainFrame || details.isSameDocument || !details.url || details.url === 'about:blank') return
      const t = this.record
      if (!t || details.url.startsWith('chrome-error:')) return
      // The address goes forward as soon as the load starts; the title waits
      // for the page (§2.7, §2.8).
      const url = shown(details.url)
      update({ url, ...(t.url !== url ? { title: '' } : {}) })
    })
    wc.on('did-start-loading', () => update({ loading: true }))
    wc.on('did-stop-loading', () => { update({ loading: false }); nav(); for (const f of pageLoaded) f(this.id) })
    wc.on('did-navigate', (_e, url) => {
      if (!mine()) return
      // A new document: whatever the last one captured has ended with it.
      if (url && url !== 'about:blank' && !url.startsWith('chrome-error:')) update({ url: shown(url), error: undefined, dead: undefined, crashed: undefined, capturing: undefined })
      nav()
      this.visit(shown(url))
    })
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (!isMainFrame || !mine()) return
      update({ url: shown(url) })
      nav()
      // Another page by pushState counts; a fragment alone doesn't.
      if (url.split('#')[0] !== this.lastVisit.split('#')[0]) this.visit(url)
    })
    wc.on('page-title-updated', (_e, title, explicitSet) => {
      // Chromium names an untitled page by its address: no title (§2.8).
      if (!mine()) return
      const t = explicitSet ? title : ''
      update({ title: t })
      const tab = this.record
      if (t && recordable(tab, tab!.url)) data.recordTitle(tab!.url, t)
    })
    wc.on('page-favicon-updated', (_e, favicons) => update({ favicon: favicons[0] }))
    wc.on('audio-state-changed', e => update({ audible: e.audible }))
    wc.on('render-process-gone', (_e, details) => { if (mine()) this.gone(details.reason) })
    wc.on('did-fail-load', (_e, code, _description, url, isMainFrame) => {
      // Not errors: a load stopped or replaced, a page become a download (§2.33).
      if (!isMainFrame || code === -3) return
      update({ error: { code, description: failure(code), url }, loading: false })
    })
    wc.on('before-mouse-event', (_e, mouse) => { if (mouse.type === 'mouseDown') for (const f of pageInput) f(this.id, 'mouse', mouse) })
    wc.on('before-input-event', (event, input) => {
      for (const f of pageInput) f(this.id, 'key', input)
      hooks.input?.(this, event, input)
      if (input.type === 'keyUp' && (input.key === 'Control' || input.key === 'Meta')) controlUp(this.id)
    })
    wc.on('context-menu', (_e, params) => hooks.contextMenu?.(this, params))
    wc.setWindowOpenHandler(details => {
      // A website gets no Oriel page, script, data: or file (studio/09 §1.4).
      if (pageMayNotOpen(wc.getURL(), details.url, 'window.open')) return { action: 'deny' }
      // A pop-up the lists name (uBlock Origin's $popup) never opens.
      try { if (hooks.refusePopup?.(wc.getURL(), details.url, details.referrer?.url ?? '')) return { action: 'deny' } } catch {}
      // A sized pop-up (a sign-in, a call): its own small window with Open
      // sized pop-ups in small windows, a tab otherwise (§3.35). Either way
      // its page is the one Chromium made, so the opener can talk to it.
      if (details.disposition === 'new-window' && details.features) {
        const popup = popups.open(this, details)
        if (popup) return popup
      }
      const win = model.windowOf(this.id)
      if (win) model.openFromPage(win, this.id, details.url, details.disposition)
      else hooks.open?.(this, details.url, details.disposition)
      return { action: 'deny' }
    })
  }

  /** The page's process ended (§2.32): on screen, asked for again at once;
   * behind, again when you come back; a third time in a minute, the message. */
  private gone(reason: string): void {
    if (reason === 'clean-exit') return
    const t = this.record
    if (!t) return
    const now = Date.now()
    const crashes = [...(t.crashes ?? []).filter(x => now - x < 60_000), now]
    if (crashes.length > 2) {
      const description = reason === 'oom' ? 'This page kept running out of memory.' : 'This page kept crashing.'
      model.updateTab(this.id, { crashes, dead: true, crashed: true, loading: false, audible: false, error: { code: 0, description, url: t.url } })
      return
    }
    if (model.onScreen(this.id)) {
      model.updateTab(this.id, { crashes, loading: false, audible: false })
      setImmediate(() => this.contents?.loadURL(t.url).catch(() => {}))
    } else {
      model.updateTab(this.id, { crashes, stale: true, loading: false, audible: false })
    }
  }
}

export const runtimes = new Map<ID, TabRuntime>()

export function runtimeFor(id: ID, session?: Session): TabRuntime {
  let r = runtimes.get(id)
  if (!r) { r = new TabRuntime(id, session); runtimes.set(id, r) }
  return r
}

/** ⌃ let go: the ⌃Tab switcher picks its card (§3.27). */
export function controlUp(tabID: ID): void {
  const win = model.windowOf(tabID)
  if (win?.switcher) model.switchEnd(win)
}

model.hooks.keepsake = id => runtimes.get(id)?.keepsake()
model.hooks.live = id => !!runtimes.get(id)?.awake

model.on('tab-closed', (id: ID) => {
  const r = runtimes.get(id)
  // Closed: ⇧⌘T's copy of its history, as the page tells it once asked
  // (§9.17). A private tab has none, and goes at once with what it kept.
  if (r?.partition?.startsWith('shy-')) r.destroy()
  else r?.letGo(fresh => { if (fresh) model.freshenGhost(id, fresh) })
  runtimes.delete(id)
  // The last tab of a private store gone: what it kept goes too (§2.35).
  const partition = r?.partition
  if (partition?.startsWith('shy-') && ![...runtimes.values()].some(x => x.partition === partition)) {
    const s = prepared.get(partition)
    if (s) { void s.clearStorageData().catch(() => {}); void s.clearCache().catch(() => {}) }
  }
})
model.on('tab-go', (id: ID, url: string) => runtimeFor(id).load(url))
model.on('tab-rest', (id: ID) => runtimes.get(id)?.destroy())
model.on('tab-rehome', (id: ID) => runtimes.get(id)?.rehome())
model.on('tab-revive', (id: ID) => runtimes.get(id)?.revive())
model.on('tab-changed', (tab: TabRecord, patch: Partial<TabRecord>) => {
  if ('muted' in patch) runtimes.get(tab.id)?.contents?.setAudioMuted(tab.muted)
})
