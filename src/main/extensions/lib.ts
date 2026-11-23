// The few internals of electron-chrome-extensions 4.10.0 (pinned in
// package.json) that Oriel leans on: its router, to answer and send events
// on the channels its preload already listens to (chrome.commands is defined
// there), and its action state (icon, badge, title, popup), which Oriel's
// own buttons draw. All in one place, to fix here if the library changes.

import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import type { WebContents } from 'electron'

interface Router {
  handle(name: string, callback: (event: { extension?: Electron.Extension; type?: string; sender?: unknown }, ...args: any[]) => unknown, opts?: Record<string, unknown>): void
  sendEvent(extensionId: string | undefined, eventName: string, ...args: unknown[]): void
}
interface ActionDetails { text?: string; color?: string; title?: string; popup?: string; iconModified?: number }
interface ActionState extends ActionDetails { tabs: Record<number, ActionDetails> }
interface Internals {
  ctx: { router: Router; store: { getActiveTabOfCurrentWindow(): WebContents | undefined; getTabById(id: number): WebContents | undefined } }
  api: {
    tabs: { getTabDetails(tab: WebContents): unknown }
    browserAction: {
      actionMap: Map<string, ActionState>
      getAction(extensionId: string): ActionState
      getPopupUrl(extensionId: string, tabId: number): string | undefined
      onUpdate(): void
    }
  }
}

const inside = (e: ElectronChromeExtensions) => e as unknown as Internals

/** Replace or add an API handler on the library's channel. */
export function handleApi(e: ElectronChromeExtensions, name: string, f: (extension: Electron.Extension, ...args: any[]) => unknown): void {
  inside(e).ctx.router.handle(name, (event, ...args) => f(event.extension!, ...args))
}

/** The same, with who called: a page (WebContents) or a worker
 * (ServiceWorkerMain); both have `ipc` and `send`. */
export function handleApiFrom(e: ElectronChromeExtensions, name: string, f: (extension: Electron.Extension, sender: { ipc: Electron.IpcMain | Electron.IpcMainServiceWorker; send(channel: string, ...a: unknown[]): void }, ...args: any[]) => unknown): void {
  inside(e).ctx.router.handle(name, (event, ...args) => f(event.extension!, event.sender as never, ...args))
}

export function sendEvent(e: ElectronChromeExtensions, extensionId: string, eventName: string, ...args: unknown[]): void {
  inside(e).ctx.router.sendEvent(extensionId, eventName, ...args)
}

export function activeTab(e: ElectronChromeExtensions): WebContents | undefined {
  return inside(e).ctx.store.getActiveTabOfCurrentWindow()
}

export function tabDetails(e: ElectronChromeExtensions, tab: WebContents | undefined): unknown {
  return tab ? inside(e).api.tabs.getTabDetails(tab) : undefined
}

/** The badge of an extension's button on one tab; null clears it. */
export function setBadge(e: ElectronChromeExtensions, extensionId: string, tabId: number, text: string | null): void {
  const action = inside(e).api.browserAction.getAction(extensionId)
  const tab = action.tabs[tabId] ?? (action.tabs[tabId] = {})
  if (text === null) delete tab.text; else tab.text = text
  inside(e).api.browserAction.onUpdate()
}

export function badgeOf(e: ElectronChromeExtensions, extensionId: string, tabId: number): string | undefined {
  return actionOf(e, extensionId, tabId)?.text
}

/** What the button shows on a tab: the tab's own values over the global ones. */
export function actionOf(e: ElectronChromeExtensions, extensionId: string, tabId: number): ActionDetails | null {
  const action = inside(e).api.browserAction.actionMap.get(extensionId)
  if (!action) return null
  const tab = action.tabs[tabId] ?? {}
  const pick = <K extends keyof ActionDetails>(k: K) => (tab[k] !== undefined ? tab[k] : action[k])
  return { text: pick('text'), color: pick('color'), title: pick('title'), popup: pick('popup'), iconModified: pick('iconModified') }
}

export function popupUrl(e: ElectronChromeExtensions, extensionId: string, tabId: number): string | undefined {
  return inside(e).api.browserAction.getPopupUrl(extensionId, tabId)
}

/** Called after anything an extension changes on its button. */
export function onActionsChanged(e: ElectronChromeExtensions, f: () => void): void {
  const ba = inside(e).api.browserAction
  const original = ba.onUpdate.bind(ba)
  ba.onUpdate = () => { original(); f() }
}
