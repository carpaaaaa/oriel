// Settings › Tabs › New tabs, the rows the model alone can't do (studio/08 B):
//  - Open sized pop-ups in small windows (`tabs.popupWindows`, §3.35);
//  - ⌘Z reopens a closed tab (`tabs.undoReopens`, §9.19);
//  - ⌘-click on a pin opens a new tab (`pins.commandNewTab`, §6.13).

import { BrowserWindow, WebContentsView, screen } from 'electron'
import { handle } from '../router'
import { model } from '../model/model'
import { need, quietTests } from '../context'
import { popups, pageInput, runtimeFor } from '../views/tabs'
import { controllerFor, type WindowController } from '../views/window'
import { shortcut } from '../keys'
import { benchRequest } from '../bench/server'

// Sized pop-ups (Browser.swift:8976-8988, Windows.swift:320-324)

/** Asked width or 480, between 200 and the screen; asked height or 600,
 * between 150 and the screen; centred on the opener's screen. */
function popupFrame(features: string, near?: Electron.Rectangle): Electron.Rectangle {
  const asked = (name: string) => {
    const m = new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*(\\d+)`, 'i').exec(features)
    return m ? Number(m[1]) : undefined
  }
  const area = (near ? screen.getDisplayMatching(near) : screen.getPrimaryDisplay()).workArea
  const width = Math.round(Math.max(200, Math.min(asked('width') ?? 480, area.width)))
  const height = Math.round(Math.max(150, Math.min(asked('height') ?? 600, area.height)))
  return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height }
}

popups.open = (opener, details) => {
  const win = model.windowOf(opener.id)
  if (model.pref<boolean>('tabs.popupWindows')) {
    const c = win && controllerFor(win.id)
    const frame = popupFrame(details.features, c?.base.getBounds())
    // A test world's window stays out of sight (context.ts quietTests).
    return { action: 'allow', overrideBrowserWindowOptions: { ...frame, useContentSize: true, autoHideMenuBar: true, ...(quietTests ? { show: false } : {}) } }
  }
  if (!win) return null
  return {
    action: 'allow',
    createWindow: options => {
      const tab = model.popupTab(win, opener.id, details.url)
      const view = new WebContentsView({ webPreferences: options.webPreferences, webContents: (options as { webContents?: Electron.WebContents }).webContents })
      view.setBackgroundColor('#FFFFFF')
      runtimeFor(tab.id).adopt(view)
      model.updateTab(tab.id, { asleep: false })
      controllerFor(win.id)?.placePages()
      return view.webContents
    },
  }
}

// ⌘Z reopens a closed tab: anything else typed or clicked lets it go.

function seen(kind: 'key' | 'mouse', input: Electron.Input | Electron.MouseInputEvent): void {
  if (!model.lastClose) return
  if (kind === 'mouse') { model.forgetClose(); return }
  const key = input as Electron.Input
  if (key.type !== 'keyDown' || ['Control', 'Shift', 'Alt', 'Meta'].includes(key.key)) return
  if ((key.control || key.meta) && !key.shift && !key.alt && key.key.toLowerCase() === 'z') return
  model.forgetClose()
}
pageInput.push((_id, kind, input) => seen(kind, input))

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  for (const wc of [c.ui.webContents, c.overlay.webContents]) {
    wc.on('before-input-event', (_e, input) => seen('key', input))
    wc.on('before-mouse-event', (_e, mouse) => { if (mouse.type === 'mouseDown') seen('mouse', mouse) })
  }
  c.base.on('closed', () => { if (model.lastClose?.win === id) model.forgetClose() })
}))

/** Page first: the page that uses ⌘Z (a document, a drawing) keeps it. */
shortcut('Ctrl+Z', 'later', (c: WindowController) => (model.undoClose(c.record) ? true : false))

// ⌘-click on a pin

handle('pin.commandClick', ({ id }, ctx) => {
  const c = need(ctx)
  if (!model.pref<boolean>('pins.commandNewTab')) { model.pick(c.record, id, 'toggle'); return null }
  return model.commandClickPin(c.record, id)?.id ?? null
})

/** The bench: windows that aren't Oriel's own (sized pop-ups). */
benchRequest('settingsb.popupWindows', () => ({
  windows: BrowserWindow.getAllWindows().map(w => ({ url: w.webContents.getURL(), bounds: w.getContentBounds() })),
}))
