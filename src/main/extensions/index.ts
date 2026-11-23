// Chrome extensions: electron-chrome-extensions gives tabs, windows, action
// state and the rest of its list; electron-chrome-web-store installs from the
// Chrome Web Store and keeps them updated. What Chromium in Electron still
// lacks (declarativeNetRequest's static rules, commands, side panel,
// offscreen, identity, tab groups, sound native messaging) and the whole
// interface come from this folder, as ExtensionShims.swift and Extensions.swift
// do on the Mac (studio/04).
//
// Extensions live in the profile's session only. A private tab or a space
// with its own cookies is another session: extensions don't see it, as on
// the Mac where an extension stays out of private tabs until allowed
// (studio/04 §2.5); Electron can't load them in a session that isn't kept.

import { app, session as electronSession, type Session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore } from 'electron-chrome-web-store'
import path from 'node:path'
import { model } from '../model/model'
import { controllerFor, focusedController } from '../views/window'
import { runtimeFor, runtimes, hooks } from '../views/tabs'
import { net } from '../net'
import { setupBridge, onExtensionCall } from './bridge'
import { dnr } from './dnr/engine'
import { apiConstants } from './dnr/types'
import { bindCommands, unbindCommands, setupCommands } from './commands'
import { setBadge, handleApiFrom } from './lib'
import { prepare } from './dnr/war'
import { setupUI, restoreAtStart, beforeStoreInstall } from './ui'
import { popupByContents, closePopup } from './popup'
import { setupSidePanel, sidePanelApi, panelByContents, closePanel } from './sidepanel'
import { setupOffscreen, offscreenApi } from './offscreen'
import { connectNative, disconnectNative, sendNativeMessage } from './native'
import { setupIdentity, identityApi, tabGroupsApi } from './identity'

let extensions: ElectronChromeExtensions | null = null
let profileSession: Session | null = null

export function getExtensions(): ElectronChromeExtensions | null { return extensions }
export function getProfile(): Session | null { return profileSession }
/** Where unpacked extensions are copied (studio/04 §2.2, 5). */
export function unpackedPath(): string { return path.join(app.getPath('userData'), 'Unpacked') }

// declarativeNetRequest sees every request through the one owner of
// session.webRequest (studio/04 §5.2: coordinated with Shield at 100).
net.onBeforeRequest('dnr', 200, d => dnr.beforeRequest(d))
net.onBeforeSendHeaders('dnr', 200, (d, headers) => { dnr.beforeSendHeaders(d, headers) })
net.onHeadersReceived('dnr', 200, (d, headers) => dnr.headersReceived(d, headers))
for (const name of Object.keys(dnr.api)) onExtensionCall(`dnr.${name}`, (id, args) => dnr.api[name](id, ...args))

// The namespaces the preload adds, by name (studio/04 §3.1).
const spaces: Record<string, Record<string, (id: string, ...args: any[]) => unknown>> = {
  sidePanel: sidePanelApi, offscreen: offscreenApi, identity: identityApi, tabGroups: tabGroupsApi,
}
const apis: string[] = []
for (const [ns, api] of Object.entries(spaces)) for (const [m, f] of Object.entries(api)) {
  apis.push(`${ns}.${m}`)
  onExtensionCall(`${ns}.${m}`, (id, args) => f(id, ...args))
}
// window.close() in a popup or a side panel.
onExtensionCall('ui.close', (_id, _args, sender) => {
  if (!sender) return false
  const p = popupByContents(sender)
  if (p) { closePopup(p.c); return true }
  const s = panelByContents(sender)
  if (s) { closePanel(s.c); return true }
  return false
})
app.on('before-quit', () => dnr.flush())

export async function setupExtensions(profile: Session): Promise<void> {
  profileSession = profile
  const extensionsPath = path.join(app.getPath('userData'), 'Extensions')
  dnr.profile = profile
  dnr.extensionsRoot = extensionsPath
  // Before electron-chrome-extensions: its preload freezes `chrome`.
  setupBridge(profile, apiConstants(), Object.keys(dnr.api), apis)
  // Every package Oriel keeps is prepared before it loads (dnr/war.ts):
  // installs, updates and restarts all come through loadExtension.
  const kept = [extensionsPath, unpackedPath()].map(p => path.resolve(p) + path.sep)
  const load = profile.extensions.loadExtension.bind(profile.extensions)
  profile.extensions.loadExtension = (folder: string, options?: Electron.LoadExtensionOptions) => {
    if (kept.some(k => path.resolve(folder).startsWith(k))) {
      try { prepare(folder) } catch (error) { console.warn('[extensions] prepare', error) }
    }
    return load(folder, options)
  }
  // Rules are ready when an extension loads, before any tab is restored
  // (studio/04 checklist A, "Avvio").
  profile.extensions.on('extension-loaded', (_e, ext) => {
    try { dnr.load(ext) } catch (error) { console.warn('[dnr]', ext.name, error) }
    bindCommands(ext)
  })
  profile.extensions.on('extension-unloaded', (_e, ext) => {
    dnr.unload(ext)
    unbindCommands(ext)
  })

  // The library is told about pages by Oriel; while it is, what it does to
  // the selection is not a choice anybody made (it makes a page active when
  // its window has no live active page, an asleep one say).
  let telling = false
  const tell = (f: () => void) => { telling = true; try { f() } finally { telling = false } }

  ElectronChromeExtensions.handleCRXProtocol(electronSession.defaultSession)
  extensions = new ElectronChromeExtensions({
    session: profile,
    async createTab(details: chrome.tabs.CreateProperties) {
      const c = focusedController()
      if (!c) throw new Error('No current window.')
      const tab = model.addTab(c.record, { url: details.url, empty: !details.url, background: details.active === false })
      const view = runtimeFor(tab.id, c.pageSession).ensure()
      c.placePages()
      return [view.webContents, c.base as never]
    },
    // tabs.update({active: true}) and the like, from an extension.
    selectTab(contents: Electron.WebContents) {
      if (telling) return
      for (const [id, rt] of runtimes) if (rt.contents === contents) {
        const win = model.windowOf(id)
        if (win) model.selectTab(win, id)
      }
    },
    // tabs.remove; a page that went away (a tab put to sleep) is not a
    // tab to close.
    removeTab(contents: Electron.WebContents) {
      if (contents.isDestroyed()) return
      for (const [id, rt] of runtimes) if (rt.contents === contents) {
        const win = model.windowOf(id)
        if (win) model.closeTab(win, id)
      }
    },
  } as never)
  setupCommands(extensions)
  dnr.onCount = (id, tabId, count) => { if (extensions) setBadge(extensions, id, tabId, count ? String(count) : null) }
  setupSidePanel(profile, c => c.mark('ext'))
  setupOffscreen(profile)
  setupIdentity(profile)
  setupUI(extensions, profile, { extensions: extensionsPath, unpacked: unpackedPath() })
  handleApiFrom(extensions, 'runtime.connectNative', (ext, sender, connectionId: string, application: string) => connectNative(ext, sender as never, connectionId, application))
  handleApiFrom(extensions, 'runtime.disconnectNative', (ext, _sender, connectionId: string) => disconnectNative(ext, connectionId))
  handleApiFrom(extensions, 'runtime.sendNativeMessage', (ext, _sender, application: string, message: unknown) => sendNativeMessage(ext, application, message))

  // Pages of the profile's session only, each with its own window.
  const previous = hooks.created
  hooks.created = (tab, contents) => {
    previous?.(tab, contents)
    if (!extensions || contents.session !== profile) return
    const win = model.windowOf(tab.id)
    const c = win && controllerFor(win.id)
    if (c) tell(() => extensions!.addTab(contents, c.base as never))
  }
  model.on('selected', (_win: unknown, id: string) => {
    const wc = runtimes.get(id)?.contents
    if (wc && extensions && wc.session === profile) tell(() => extensions!.selectTab(wc))
  })

  await installChromeWebStore({ session: profile, extensionsPath, autoUpdate: true, beforeInstall: beforeStoreInstall as never })
  await restoreAtStart()
}

import './bench'
