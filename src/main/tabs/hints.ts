// The tab numbers while Ctrl is held (Settings › Show tab numbers while Ctrl
// is held, tabs.shortcuts; TabShortcutHint.swift, Browser.tabShortcutNumbers):
// the first eight tabs Ctrl+1-8 picks and the last for Ctrl+9, in the order
// those keys go (model.shortcutTargets, as tab.nth). Ctrl alone held shows
// them (Alt with the tabs on Alt+1-9); any other key, the key let go or the
// window left, and they go. Not while the Ctrl+Tab switcher is up.

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

/** With Ctrl+1 to Ctrl+9 switch spaces on, the tabs' keys are Alt+1-9, and
 * Alt held shows their numbers (Settings says "while Alt is held";
 * KeyCombo.tabNumberModifier). */
const onAlt = () => model.spacesOn() && !!model.pref<boolean>('spaces.commandNumbers')

inputWatchers.push((c, input) => {
  const alt = onAlt()
  const mine = alt ? input.key === 'Alt' : input.key === 'Control' || (process.platform === 'darwin' && input.key === 'Meta')
  if (input.type === 'keyDown') hold(c, mine && !input.shift && (alt ? !input.control : !input.alt))
  else if (input.type === 'keyUp' && mine) hold(c, false)
})

registerSlice('tabHints', c => {
  if (!held.has(c) || !model.pref<boolean>('tabs.shortcuts') || c.record.switcher) return null
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
