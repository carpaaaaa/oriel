// The tab numbers while Ctrl is held (Settings › Show tab numbers while Ctrl
// is held, tabs.shortcuts; TabShortcutHint.swift, Browser.tabShortcutNumbers):
// the first eight tabs Ctrl+1-8 picks and the last for Ctrl+9, in the order
// those keys go (model.shortcutTargets). Ctrl alone held shows them; any
// other key, Ctrl let go or the window left, and they go.

import type { ID } from '../../shared/state'
import { model } from '../model/model'
import { inputWatchers } from '../keys'
import { allControllers, registerSlice, type WindowController } from '../views/window'

const held = new WeakSet<WindowController>()

function hold(c: WindowController, on: boolean): void {
  if (on === held.has(c)) return
  if (on) held.add(c); else held.delete(c)
  c.mark('tabHints')
}

inputWatchers.push((c, input) => {
  const ctrl = input.key === 'Control' || (process.platform === 'darwin' && input.key === 'Meta')
  if (input.type === 'keyDown') hold(c, ctrl && !input.shift && !input.alt)
  else if (input.type === 'keyUp' && ctrl) hold(c, false)
})

registerSlice('tabHints', c => {
  if (!held.has(c) || !model.pref<boolean>('tabs.shortcuts')) return null
  const shown = model.shortcutTargets(c.record)
  const numbers: Record<ID, number> = {}
  shown.slice(0, 8).forEach((id, i) => { numbers[id] = i + 1 })
  if (shown.length > 8) numbers[shown[shown.length - 1]] = 9
  return numbers
})

// The window left with Ctrl down: no numbers left behind.
for (const c of allControllers()) c.base.on('blur', () => hold(c, false))
model.on('window-opened', (id: string) => setImmediate(() => {
  const c = allControllers().find(x => x.record.id === id)
  c?.base.on('blur', () => hold(c, false))
}))
