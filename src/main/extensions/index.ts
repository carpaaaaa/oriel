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

let extensions: ElectronChromeExtensions | null = null

export function getExtensions(): ElectronChromeExtensions | null { return extensions }

export async function setupExtensions(profile: Session): Promise<void> {
  rememberProfile(profile)
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

  await installChromeWebStore({
    session: profile,
    extensionsPath: path.join(app.getPath('userData'), 'Extensions'),
    autoUpdate: true,
  })
}

// Bench: install from the Web Store by id, list what's loaded.
import { benchRequest } from '../bench/server'
import { installExtension } from 'electron-chrome-web-store'

let profileSession: Session | null = null
export function rememberProfile(s: Session): void { profileSession = s }

benchRequest('extensions.install', async req => {
  if (!profileSession) throw new Error('no profile')
  const ext = await installExtension(String(req.id), { session: profileSession })
  return { id: ext.id, name: ext.name, version: ext.version }
})
benchRequest('extensions.list', () => ({
  extensions: (profileSession?.extensions.getAllExtensions() ?? []).map(e => ({ id: e.id, name: e.name, version: e.version, manifest_version: e.manifest.manifest_version })),
}))
