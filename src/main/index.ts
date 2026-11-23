// Search for Windows: the main process starts here.

import { app, ipcMain, session, nativeTheme, protocol, type Session } from 'electron'
import { setupPaths, probe } from './paths'
import { setupUserAgent, applyUserAgent } from './ua'
import { model } from './model/model'
import { flushJSON } from './model/persist'
import { run } from './router'
import { IPC } from '../shared/ipc'
import { allControllers, controllerFor } from './views/window'
import { hooks } from './views/tabs'
import { openWindow, setSessions } from './context'
import './modules'
import { onLeftover, wireKeys } from './keys'
import { setupExtensions } from './extensions'
import { startBench } from './bench/server'
import type { Command } from '../shared/commands'

setupPaths()
setupUserAgent()

// One Search at a time per world: a second launch hands its link over.
if (!app.requestSingleInstanceLock({ probe })) {
  app.quit()
  process.exit(0)
}

protocol.registerSchemesAsPrivileged([{ scheme: 'search', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let profile: Session

const shySessions = new Map<string, Session>()

function pageSession(shy: boolean, windowID: string): Session {
  if (!shy) return profile
  let s = shySessions.get(windowID)
  if (!s) {
    s = session.fromPartition(`shy-${windowID}`) // not persisted: private
    applyUserAgent(s)
    shySessions.set(windowID, s)
  }
  return s
}

function controllerOf(sender: Electron.WebContents) {
  return allControllers().find(c => c.ui.webContents === sender || c.overlay.webContents === sender) ?? null
}

ipcMain.handle(IPC.command, async (event, command: Command) => {
  try {
    return await run(command as never, { window: controllerOf(event.sender) })
  } catch (error) {
    console.warn('[command]', command?.do, error)
    throw error
  }
})

ipcMain.handle(IPC.hello, event => {
  const c = controllerOf(event.sender)
  return c ? { rev: 0, set: c.state() } : null
})

// Keys a page left alone come back from the page preload.
ipcMain.on('search:leftover-key', (event, key) => {
  for (const c of allControllers()) {
    if (c.base.contentView.children.some(v => (v as Electron.WebContentsView).webContents === event.sender)) onLeftover(c, key)
  }
})

app.on('second-instance', (_e, argv) => {
  const url = argv.find(a => /^(https?|file):/i.test(a))
  const c = allControllers()[0] ?? openWindow({ restore: false })
  if (url) void run({ do: 'tab.new', url } as never, { window: c })
  if (c.base.isMinimized()) c.base.restore()
  c.base.focus()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => flushJSON())

app.whenReady().then(async () => {
  const look = process.env.SEARCH_LOOK
  nativeTheme.themeSource = look === 'light' || look === 'dark' ? look : 'system'
  profile = session.fromPartition('persist:personal')
  applyUserAgent(profile)
  applyUserAgent(session.defaultSession)
  setSessions(pageSession)
  model.load()

  hooks.created = (tab, contents) => {
    const win = model.windowOf(tab.id)
    const c = win && controllerFor(win.id)
    if (c) wireKeys(c, contents, true)
  }
  hooks.open = (opener, url, disposition) => {
    const win = model.windowOf(opener.id)
    const c = win && controllerFor(win.id)
    if (!c || !win) return
    const background = disposition === 'background-tab'
    void run({ do: 'tab.new', url, background, after: opener.id } as never, { window: c })
  }

  await setupExtensions(profile).catch(error => console.warn('[extensions]', error))

  const first = openWindow({ restore: !model.pref<boolean>('start.fresh') })

  const url = process.argv.slice(1).find(a => /^(https?|file):/i.test(a))
  if (url) void run({ do: 'tab.new', url } as never, { window: first })

  if (probe) startBench(probe)
})
