// Tabs picked with Ctrl or Shift let go when the page is clicked (studio/01
// §3.18): a click on the interface is the interface's own (ui/sidebar/picks.ts),
// but the page is another view, so it tells here. Escape lets them go too
// (keys.ts, escapeKey).

import { model } from '../model/model'
import { pageInput } from '../views/tabs'

pageInput.push((id, kind, input) => {
  if (kind !== 'mouse') return
  const win = model.windowOf(id)
  if (win?.picked.length && (input as Electron.MouseInputEvent).type === 'mouseDown') model.pick(win, '', 'clear')
})
