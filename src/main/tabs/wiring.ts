// The tabs module joined to the window: its parts of the window's state, its
// keys, the window's frame and focus for windows.json, last time's windows
// brought back, and the sleep timer.

import { app, screen } from 'electron'
import { model } from '../model/model'
import { frameString, parseFrame } from '../model/formats'
import { registerSlice, controllerFor, allControllers, type WindowController } from '../views/window'
import { runtimes, onPageSession } from '../views/tabs'
import { shortcut } from '../keys'
import { openWindow } from '../context'
import { startSleeping } from './sleep'
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
shortcut('Ctrl+Tab', 'first', () => ({ do: 'tab.switch', by: 1 }))
shortcut('Ctrl+Shift+Tab', 'first', () => ({ do: 'tab.switch', by: -1 }))
shortcut('Ctrl+PageDown', 'first', () => ({ do: 'tab.step', by: 1 }))
shortcut('Ctrl+PageUp', 'first', () => ({ do: 'tab.step', by: -1 }))
shortcut('Ctrl+Shift+]', 'later', () => ({ do: 'tab.step', by: 1 }))
shortcut('Ctrl+Shift+[', 'later', () => ({ do: 'tab.step', by: -1 }))
shortcut('Ctrl+D', 'later', c => { const id = active(c); return id ? { do: 'tab.duplicate', id } : null })

/** ⌘1-⌘9 the tabs and ⌃1-⌃9 the spaces; swapped with ⌘1-⌘9 switch spaces,
 * as in Arc. On Windows: Ctrl for tabs, Alt for spaces (§7.16). */
const swapped = () => model.spacesOn() && model.pref<boolean>('spaces.commandNumbers')
const spaceKey = (n: number): Command | null => {
  if (!model.spacesOn()) return null
  const s = model.spaces[n - 1]
  return s ? { do: 'space.select', id: s.id } : null
}
for (let n = 1; n <= 9; n++) {
  shortcut(`Ctrl+${n}`, 'later', () => (swapped() ? spaceKey(n) : { do: 'tab.nth', n }))
  shortcut(`Alt+${n}`, 'later', () => (swapped() ? { do: 'tab.nth', n } : spaceKey(n)))
}

// windows: frame, focus, ⌃ let go, the pages' histories before they close

model.hooks.frame = id => {
  const c = controllerFor(id)
  if (!c || c.base.isDestroyed()) return {}
  return { frame: frameString(c.base.getNormalBounds()), maximized: c.base.isMaximized() || undefined }
}

function onScreen(r: { x: number; y: number; width: number; height: number }): boolean {
  return screen.getAllDisplays().some(d => {
    const a = d.workArea
    return r.x < a.x + a.width && r.x + r.width > a.x && r.y < a.y + a.height && r.y + r.height > a.y
  })
}

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  const win = c.record
  const rect = parseFrame(win.frame)
  if (rect && onScreen(rect)) c.base.setBounds(rect)
  if (win.maximized) c.base.once('show', () => c.base.maximize())
  model.front = id
  c.base.on('focus', () => { model.front = id })
  for (const event of ['move', 'resize', 'maximize', 'unmaximize'] as const) c.base.on(event as 'move', () => model.windowMoved(id))
  c.base.on('blur', () => { if (win.switcher) model.switchEnd(win, true) })
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
