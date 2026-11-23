// The few internals of electron-chrome-extensions 4.10.0 (pinned in
// package.json) that Search leans on: its router, to answer and send events
// on the channels its preload already listens to (chrome.commands is defined
// there), and its action state, for the badge and _execute_action. All in
// one place, to fix here if the library changes.

import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import type { WebContents } from 'electron'

interface Router {
  handle(name: string, callback: (event: { extension?: Electron.Extension }, ...args: any[]) => unknown, opts?: Record<string, unknown>): void
  sendEvent(extensionId: string | undefined, eventName: string, ...args: unknown[]): void
}
interface ActionState { tabs: Record<number, { text?: string; color?: string }>; text?: string }
interface Internals {
  ctx: { router: Router; store: { getActiveTabOfCurrentWindow(): WebContents | undefined; getTabById(id: number): WebContents | undefined } }
  api: {
    tabs: { getTabDetails(tab: WebContents): unknown }
    browserAction: {
      getAction(extensionId: string): ActionState
      onUpdate(): void
      activateClick(details: { extensionId: string; tabId: number; anchorRect: { x: number; y: number; width: number; height: number }; alignment?: string }): void
    }
  }
}

const inside = (e: ElectronChromeExtensions) => e as unknown as Internals

/** Replace or add an API handler on the library's channel. */
export function handleApi(e: ElectronChromeExtensions, name: string, f: (extension: Electron.Extension, ...args: any[]) => unknown): void {
  inside(e).ctx.router.handle(name, (event, ...args) => f(event.extension!, ...args))
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
  const action = inside(e).api.browserAction.getAction(extensionId)
  return action.tabs[tabId]?.text ?? action.text
}

/** As if the extension's button was pressed: its popup, or action.onClicked. */
export function pressAction(e: ElectronChromeExtensions, extensionId: string, tabId: number, anchorRect: { x: number; y: number; width: number; height: number }): void {
  inside(e).api.browserAction.activateClick({ extensionId, tabId, anchorRect })
}
