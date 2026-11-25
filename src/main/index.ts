// Oriel: the main process starts here.

import { app, ipcMain, session, nativeTheme, protocol, type Session } from 'electron'
import { appIcon } from './win/icon'
import { setupPaths, probe } from './paths'
import { setupUserAgent, applyUserAgent } from './ua'
import { model } from './model/model'
import { flushJSON } from './model/persist'
import { run } from './router'
import { IPC } from '../shared/ipc'
import { allControllers, controllerFor, isInterfacePage, type WindowController } from './views/window'
import { hooks } from './views/tabs'
import { openWindow, setSessions } from './context'
import './modules'
import { onLeftover, wireKeys } from './keys'
import { setupExtensions } from './extensions'
import { attachNet } from './net'
import { startBench } from './bench/server'
import './bench/checks'
import type { Command } from '../shared/commands'
import { testEnv } from './testhooks'
import { linkArgs } from './settings/browser'
import { launchAction, doLaunch, frontController, setupJumpList } from './launch'

setupPaths()
setupUserAgent()
// Windows names the taskbar button, its jump list and notifications by this
// id (the installer's appId), not by the executable's path.
if (process.platform === 'win32') app.setAppUserModelId('app.oriel.browser')
// Every window Electron makes carries Oriel's icon, not its own in the taskbar:
// a pop-up a site opens (a sign-in window), DevTools, an extension's window.
app.on('browser-window-created', (_event, win) => {
  const icon = appIcon()
  if (icon && !win.isDestroyed()) { try { win.setIcon(icon) } catch {} }
})

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
if (process.platform === 'darwin' && testEnv('SEARCH_PROBE') && testEnv('SEARCH_SHOW') !== '1') app.setActivationPolicy('accessory')
// Installed: Oriel's own name with Windows, the one its shortcuts carry (package.json
// build.appId), so the taskbar groups its windows under Oriel's icon, not Electron's.
if (process.platform === 'win32' && app.isPackaged) app.setAppUserModelId('app.oriel.browser')
// Windows 11's thin scrollbars that fade in, as Chrome has them. One switch: a
// second enable-features would replace the first. (No elastic overscroll: it
// only ever moved under a precision touchpad, so Bounce at the top and bottom
// is not offered on Windows.)
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

/** The window whose interface sent this: only the main frame of a window's
 * interface or overlay, showing the interface's own file. Anything else (a
 * page, a frame, a view Oriel didn't make for the interface) gets nothing
 * (studio/09 §1.1). */
function controllerOf(event: Electron.IpcMainInvokeEvent): WindowController | null {
  const sender = event.sender
  const c = allControllers().find(c => c.ui.webContents === sender || c.overlay.webContents === sender)
  const frame = event.senderFrame
  if (!c || !frame || frame !== sender.mainFrame || !isInterfacePage(frame.url)) return null
  return c
}

ipcMain.handle(IPC.command, async (event, command: Command) => {
  const window = controllerOf(event)
  if (!window) throw new Error('not an Oriel interface')
  try {
    return await run(command as never, { window })
  } catch (error) {
    console.warn('[command]', command?.do, error)
    throw error
  }
})

ipcMain.handle(IPC.overlayNow, event => controllerOf(event)?.overlayLayer ?? null)

ipcMain.handle(IPC.hello, event => {
  const c = controllerOf(event)
  return c ? { rev: 0, set: c.state() } : null
})

// Keys a page left alone come back from the page preload.
ipcMain.on('search:leftover-key', (event, key) => {
  for (const c of allControllers()) {
    if (c.base.contentView.children.some(v => (v as Electron.WebContentsView).webContents === event.sender)) onLeftover(c, key)
  }
})

/** Links and files from another app, in order (studio/03 §3.1). */
async function arriveAll(urls: string[], c: WindowController): Promise<void> {
  for (const url of urls) await run({ do: 'link.arrive', url } as never, { window: c }).catch(e => keep('link.arrive', e))
}

app.on('second-instance', (_e, argv) => {
  // A link from another app goes where Settings › Browsing and Spaces say
  // (a small window, a space, a tab: the tabs module's link.arrive); a file
  // Windows hands over (Oriel opening .html, settings/browser.ts) too.
  const urls = linkArgs(argv.slice(1))
  // The Jump List's New Window and New Private Tab.
  const action = launchAction(argv.slice(1))
  if (action && !urls.length) { void doLaunch(action).catch(e => keep('launch', e)); return }
  const c = frontController() ?? openWindow({ restore: false })
  if (urls.length) { void arriveAll(urls, c); return }
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
  const look = testEnv('SEARCH_LOOK')
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

  const urls = linkArgs(process.argv.slice(1))
  if (urls.length) void arriveAll(urls, first)
  // Opened by the Jump List's New Private Tab: its window, a private tab in it.
  else if (launchAction(process.argv.slice(1)) === 'privateTab') void doLaunch('privateTab', first).catch(e => keep('launch', e))
  setupJumpList()

  if (probe) startBench(probe)
})
