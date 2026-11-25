// Tabs picked with Ctrl or Shift let go on a press anywhere that isn't a pick
// of its own (studio/01 §3.18): the column's empty places, the strip, the
// buttons, a tab that isn't picked. A press on a tab picked among others is
// that tab's: a click lets the rest go (Row.tsx), a carry takes them, a right
// click acts on them. Ctrl or Shift on a tab adds to the picks or takes away.
// A click on the page is the page's view, told by the main process
// (main/tabs/pickclear.ts); Escape is keys.ts's.

import { state, cmd } from '../lib/store'
import { pickedAmongOthers } from './derive'

const TABS = '.row, .square, .tile, .strip-tab, .strip-pin'

function onDown(e: PointerEvent): void {
  if (!(state.picked ?? []).length) return
  const tab = (e.target as Element | null)?.closest?.<HTMLElement>(TABS)
  if (tab) {
    if (tab.dataset.tab && pickedAmongOthers(tab.dataset.tab)) return
    const ctrl = e.ctrlKey || (window.search.platform === 'darwin' && e.metaKey)
    if (e.button === 0 && (ctrl || e.shiftKey)) return
  }
  void cmd({ do: 'tab.pick', id: '', mode: 'clear' })
}

let wired = false
export function watchPicks(): void {
  if (wired) return
  wired = true
  window.addEventListener('pointerdown', onDown, true)
}
