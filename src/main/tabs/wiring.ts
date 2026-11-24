// The tabs module joined to the window: its parts of the window's state, its
// keys, the window's focus, last time's windows brought back, and the sleep
// timer. (The window's place for windows.json: persistence/windows.ts.)

import { app, ipcMain } from 'electron'
import { model } from '../model/model'
import { registerSlice, controllerFor, allControllers, type WindowController } from '../views/window'
import { runtimes, onPageSession, viewHost } from '../views/tabs'
import { shortcut } from '../keys'
import { openWindow } from '../context'
import { startSleeping } from './sleep'
import { closeField } from '../field/commands'
import { win32 } from '../win/user32'
import { pictureFront } from './previews'
import { focusPageSoon } from './focus'
import type { Command } from '../../shared/commands'

// the window's state (WindowState keeps its shape: these say how it is made)

registerSlice('tabs', c => model.tabViews(c.record))
registerSlice('pins', c => model.pinViews(c.record))
registerSlice('pinFolders', c => model.folderViews(c.record))
registerSlice('groups', c => c.record.groups)
registerSlice('splits', c => c.record.splits)
registerSlice('picked', c => c.record.picked)
registerSlice('switcher', c => c.record.switcher)
registerSlice('spacesOn', () => model.spacesOn())
registerSlice('reopen', c => ({
  title: model.reopenTitle(c.record),
  can: c.record.ghosts.length > 0 || model.closedWindows.length > 0,
  recent: model.recentlyClosed(c.record).map(g => ({ id: g.id, title: model.closedTitle(c.record, g), url: g.url })),
}))

// keys (studio/03 table "Mac → Windows", studio/01 §3.7, §3.10, §3.22, §3.24, §3.25, §7.16)

const active = (c: WindowController) => c.record.active[c.record.space]
shortcut('Ctrl+Shift+N', 'first', () => ({ do: 'tab.newPrivate' }))
shortcut('Ctrl+W', 'first', () => ({ do: 'tab.closeFront' }))
shortcut('Ctrl+F4', 'first', () => ({ do: 'tab.closeFront' }))
shortcut('Ctrl+Tab', 'first', c => switchKey(c, 1))
shortcut('Ctrl+Shift+Tab', 'first', c => switchKey(c, -1))
shortcut('Ctrl+PageDown', 'first', () => ({ do: 'tab.step', by: 1 }))
shortcut('Ctrl+PageUp', 'first', () => ({ do: 'tab.step', by: -1 }))
shortcut('Ctrl+Shift+]', 'later', () => ({ do: 'tab.step', by: 1 }))
shortcut('Ctrl+Shift+[', 'later', () => ({ do: 'tab.step', by: -1 }))
shortcut('Ctrl+D', 'later', c => { const id = active(c); return id ? { do: 'tab.duplicate', id } : null })

/** Ctrl+Tab, or Ctrl+Shift+Tab: the switcher a step on (§3.25-§3.27). A
 * quick press goes straight to the tab before; held, the switcher shows
 * after 0.15 s (ui/switcher) and Ctrl let go picks its card. */
function switchKey(c: WindowController, by: 1 | -1): Command {
  if (!c.record.switcher) { pictureFront(c.record.id); watchControl(c) }
  return { do: 'tab.switch', by }
}

/** Ctrl let go, on Windows asked of the keyboard itself. Chromium drops a
 * key's keyUp, and every key event after it until the next keyDown, once
 * before-input-event took that keyDown (suppress_events_until_keydown_): so
 * after Ctrl+Tab, or Ctrl+W, Ctrl+R, Ctrl+M in the switcher, the page or the
 * overlay may never hear Ctrl come up, and a quick Ctrl+Tab left the
 * switcher open instead of going back a tab. Every 16 ms while it is open. */
/** Windows being left: the switcher let go without taking the keys back. */
const leaving = new WeakSet<WindowController>()

const VK_CONTROL = 0x11
const watching = new WeakSet<WindowController>()
function watchControl(c: WindowController): void {
  const w = win32()
  if (!w || watching.has(c)) return
  watching.add(c)
  const tick = setInterval(() => {
    const done = () => { clearInterval(tick); watching.delete(c) }
    if (c.base.isDestroyed() || !c.record.switcher) return done()
    if (!w.keyHeld(VK_CONTROL)) { done(); model.switchEnd(c.record) }
  }, 16)
}

/** ⌘1-⌘9 the tabs and ⌃1-⌃9 the spaces; swapped with ⌘1-⌘9 switch spaces,
 * as in Arc. On Windows: Ctrl for tabs, Alt for spaces, and with Settings ›
 * Spaces & Pins › Ctrl+1 to Ctrl+9 switch spaces, Ctrl for spaces and Alt for
 * tabs (§7.16). Taken before the page, as the table's own Ctrl+1-9 are:
 * these win over them (keys.ts findAction), so the switch really swaps. A
 * space's key moved in Settings › Shortcuts still wins (changedOwner). */
const swapped = () => model.spacesOn() && model.pref<boolean>('spaces.commandNumbers')
const spaceKey = (n: number): Command | false => {
  if (!model.spacesOn() || model.spaces.length < 2) return false
  const s = model.spaces[n - 1]
  return s ? { do: 'space.select', id: s.id } : false
}
for (let n = 1; n <= 9; n++) {
  shortcut(`Ctrl+${n}`, 'first', () => (swapped() ? spaceKey(n) : { do: 'tab.nth', n }))
  // Also Space n's action when Settings gave it a key of its own (actionOf).
  shortcut(`Alt+${n}`, 'first', (_c, k) => (swapped() && k.chord === `Alt+${n}` ? { do: 'tab.nth', n } : spaceKey(n)))
}

// windows: focus, ⌃ let go, the pages' histories before they close

viewHost.parentOf = view => allControllers().map(c => c.base.contentView).find(v => v.children.includes(view)) ?? null

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  const win = c.record
  model.front = id
  c.base.on('focus', () => { model.front = id })
  c.base.on('blur', () => {
    if (!win.switcher) return
    leaving.add(c)
    try { model.switchEnd(win, true) } finally { leaving.delete(c) }
  })
  // Before the window takes its pages with it: their histories, for ⇧⌘T.
  c.base.on('close', () => {
    for (const ids of Object.values(win.tabs)) for (const tab of ids) {
      const keep = runtimes.get(tab)?.keepsake()
      if (keep) model.keeps.set(tab, keep)
    }
  })
  for (const wc of [c.ui.webContents, c.overlay.webContents]) {
    wc.on('before-input-event', (_e, input) => {
      if (input.type === 'keyUp' && (input.key === 'Control' || input.key === 'Meta') && win.switcher) model.switchEnd(win)
    })
  }
}))

// The switcher gone, by Ctrl let go (a keyUp, or the keyboard asked), Esc,
// a click or Enter: the page in front gets the keys once it is on screen
// (tabs/focus.ts). Without this a quick Ctrl+Tab left them with the page it
// came from, now out of sight, and the next key went nowhere. Not when the
// window was left (focusing a page would bring Oriel back in front).
model.on('switch-ended', (w: { id: string }) => {
  const c = controllerFor(w.id)
  if (c && !leaving.has(c)) focusPageSoon(c)
})

// Another tab in front: the field it was raised for goes (Browser.select
// sets editing off, §3.9); an empty tab's field is the tab itself.
model.on('selected', (w: { id: string }, id: string) => {
  const c = controllerFor(w.id)
  if (c?.record.field.open && !model.tabs.get(id)?.empty) closeField(c)
})

// Camera, microphone or screen in use (src/preload/page/tabs.ts, §2.21).
ipcMain.on('search:tab-capture', (e, on: boolean) => {
  for (const [id, r] of runtimes) if (r.contents === e.sender) model.updateTab(id, { capturing: on ? true : undefined })
})

// Last time's other windows, once the first is up (restoreOnce, §9.11).
model.on('restore-windows', (n: number) => {
  const first = allControllers()[0]
  for (let i = 0; i < n && model.pendingWindowCount() > 0; i++) openWindow({ restore: true })
  first?.base.focus()
})

// ⇧⌘T after a window closed (§9.18).
model.on('open-window', () => {
  const c = openWindow({ restore: true })
  c.base.focus()
})

// A space signed out deleted: its cookies and sign-ins go (§7.9, §7.26).
const spaceSessions = new Map<string, Electron.Session>()
onPageSession((s, partition) => { if (partition.startsWith('persist:space-')) spaceSessions.set(partition, s) })
model.on('space-erased', (id: string) => {
  const s = spaceSessions.get(`persist:space-${id.toLowerCase()}`)
  if (s) { void s.clearStorageData().catch(() => {}); void s.clearCache().catch(() => {}) }
})

// After the model has read its settings (index.ts loads it when ready).
app.whenReady().then(() => setTimeout(startSleeping, 0))
