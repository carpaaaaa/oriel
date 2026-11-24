// Oriel: the main process starts here.

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
import { attachNet } from './net'
import { startBench } from './bench/server'
import type { Command } from '../shared/commands'

setupPaths()
setupUserAgent()

// An error nobody caught in the main process: Electron would show a dialog
// (on top of everything, even for an invisible test window). Oriel logs it,
// keeps it for the bench (state.errors) and goes on.
export const mainErrors: string[] = []
;(globalThis as { orielErrors?: string[] }).orielErrors = mainErrors
const keep = (kind: string, e: unknown) => {
  const text = `${kind}: ${(e as Error)?.stack ?? String(e)}`
  console.error(`[oriel] ${text}`)
  mainErrors.push(text)
  if (mainErrors.length > 50) mainErrors.shift()
}
process.on('uncaughtException', e => keep('uncaughtException', e))
process.on('unhandledRejection', e => keep('unhandledRejection', e))
// A process that went down other than a page's own (the GPU, the interface,
// the overlay): logged, and kept for the bench (state.gone).
const gone: string[] = []
;(globalThis as { orielGone?: string[] }).orielGone = gone
const lost = (text: string) => { console.error(`[oriel] gone: ${text}`); gone.push(text); if (gone.length > 50) gone.shift() }
app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') lost(`${d.type} ${d.reason} (${d.exitCode})`) })
app.on('render-process-gone', (_e, wc, d) => { if (wc.getType() !== 'webview' && /[?&]root=/.test(wc.getURL())) lost(`interface ${wc.getURL().split('root=')[1]} ${d.reason} (${d.exitCode})`) })
// Test worlds on a Mac: no Dock icon, never the active app (see context.ts).
if (process.platform === 'darwin' && process.env.SEARCH_PROBE && process.env.SEARCH_SHOW !== '1') app.setActivationPolicy('accessory')
// Windows 11's thin scrollbars that fade in, as Chrome has them.
if (process.platform === 'win32') app.commandLine.appendSwitch('enable-features', 'FluentScrollbar,FluentOverlayScrollbar')

// One Search at a time per world: a second launch hands its link over.
if (!app.requestSingleInstanceLock({ probe })) {
  app.quit()
  process.exit(0)
}

protocol.registerSchemesAsPrivileged([{ scheme: 'oriel', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let profile: Session

const shySessions = new Map<string, Session>()

function pageSession(shy: boolean, windowID: string): Session {
  if (!shy) return profile
  let s = shySessions.get(windowID)
  if (!s) {
    s = session.fromPartition(`shy-${windowID}`) // not persisted: private
    applyUserAgent(s)
    attachNet(s)
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

ipcMain.handle(IPC.overlayNow, event => controllerOf(event.sender)?.overlayLayer ?? null)

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
  // A link from another app goes where Settings › Browsing and Spaces say
  // (a small window, a space, a tab: the tabs module's link.arrive).
  const url = argv.find(a => /^(https?|file|mailto):/i.test(a))
  const c = allControllers()[0] ?? openWindow({ restore: false })
  if (url) { void run({ do: 'link.arrive', url } as never, { window: c }); return }
  if (c.base.isMinimized()) c.base.restore()
  c.base.focus()
})

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => flushJSON())
// Ended from outside (Ctrl+C in a terminal, Task Manager, Windows logging
// off): write what's pending first, so no change is lost.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => { try { flushJSON() } finally { app.exit(0) } })
}

app.whenReady().then(async () => {
  const look = process.env.SEARCH_LOOK
  nativeTheme.themeSource = look === 'light' || look === 'dark' ? look : 'system'
  profile = session.fromPartition('persist:personal')
  applyUserAgent(profile)
  attachNet(profile)
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

  const url = process.argv.slice(1).find(a => /^(https?|file|mailto):/i.test(a))
  if (url) void run({ do: 'link.arrive', url } as never, { window: first })

  if (probe) startBench(probe)
})
