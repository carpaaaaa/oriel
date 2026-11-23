// Chrome extensions: electron-chrome-extensions gives tabs, windows, action
// and popups; electron-chrome-web-store installs from the Chrome Web Store and
// keeps them updated. What Chromium in Electron still lacks (side panel,
// offscreen, downloads, identity, commands, tab groups, static
// declarativeNetRequest rules, native messaging) comes in this folder, as
// ExtensionShims.swift does on the Mac (studio/04).

import { app, session as electronSession, type Session } from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { installChromeWebStore } from 'electron-chrome-web-store'
import path from 'node:path'
import { model } from '../model/model'
import { focusedController } from '../views/window'
import { runtimeFor, runtimes, hooks } from '../views/tabs'
import { net } from '../net'
import { setupBridge, onExtensionCall } from './bridge'
import { dnr } from './dnr/engine'
import { apiConstants } from './dnr/types'
import { bindCommands, unbindCommands, setupCommands } from './commands'
import { setBadge } from './lib'

let extensions: ElectronChromeExtensions | null = null
let profileSession: Session | null = null

export function getExtensions(): ElectronChromeExtensions | null { return extensions }
export function getProfile(): Session | null { return profileSession }

// declarativeNetRequest sees every request through the one owner of
// session.webRequest (studio/04 §5.2: coordinated with Shield at 100).
net.onBeforeRequest('dnr', 200, d => dnr.beforeRequest(d))
net.onBeforeSendHeaders('dnr', 200, (d, headers) => { dnr.beforeSendHeaders(d, headers) })
net.onHeadersReceived('dnr', 200, (d, headers) => dnr.headersReceived(d, headers))
for (const name of Object.keys(dnr.api)) onExtensionCall(`dnr.${name}`, (id, args) => dnr.api[name](id, ...args))
app.on('before-quit', () => dnr.flush())

export async function setupExtensions(profile: Session): Promise<void> {
  profileSession = profile
  const extensionsPath = path.join(app.getPath('userData'), 'Extensions')
  dnr.profile = profile
  dnr.extensionsRoot = extensionsPath
  // Before electron-chrome-extensions: its preload freezes `chrome`.
  setupBridge(profile, apiConstants(), Object.keys(dnr.api))
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

  ElectronChromeExtensions.handleCRXProtocol(electronSession.defaultSession)
  extensions = new ElectronChromeExtensions({
    session: profile,
    async createTab(details: chrome.tabs.CreateProperties) {
      const c = focusedController()
      if (!c) throw new Error('no window')
      const tab = model.addTab(c.record, { url: details.url, empty: !details.url, background: details.active === false })
      const rt = runtimeFor(tab.id, c.pageSession)
      const view = rt.ensure()
      c.placePages()
      return [view.webContents, c.base as never]
    },
    selectTab(contents: Electron.WebContents) {
      for (const [id, rt] of runtimes) if (rt.contents === contents) {
        const c = focusedController()
        if (c) model.selectTab(c.record, id)
      }
    },
    removeTab(contents: Electron.WebContents) {
      for (const [id, rt] of runtimes) if (rt.contents === contents) {
        const win = model.windowOf(id)
        if (win) model.closeTab(win, id)
      }
    },
  } as never)
  setupCommands(extensions)
  dnr.onCount = (id, tabId, count) => { if (extensions) setBadge(extensions, id, tabId, count ? String(count) : null) }

  const previous = hooks.created
  hooks.created = (tab, contents) => {
    previous?.(tab, contents)
    const c = focusedController()
    if (c && extensions) extensions.addTab(contents, c.base as never)
  }
  model.on('selected', (_win, id: string) => {
    const wc = runtimes.get(id)?.contents
    if (wc && extensions) extensions.selectTab(wc)
  })

  await installChromeWebStore({ session: profile, extensionsPath, autoUpdate: true })
}

import './bench'
