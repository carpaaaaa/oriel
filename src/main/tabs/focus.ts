// The keys to the page in front after a tab comes to the front by a key or a
// click (Ctrl+Tab's switcher, Ctrl+1-9, Ctrl+PageDown, a tab in the column).
// The new page's view is put in the window only once the interface has said
// where it goes (setSlots, a moment later), and a view not yet in the window
// can't take the keys: until it is there Oriel's interface keeps them, so the
// next key (a second Ctrl+Tab at once) still counts. One wait per window, the
// newest wins; it stops if the switcher or the field comes up meanwhile.

import { model } from '../model/model'
import type { WindowController } from '../views/window'

const waiting = new WeakMap<WindowController, ReturnType<typeof setTimeout>>()

export function focusPageSoon(c: WindowController): void {
  clearTimeout(waiting.get(c))
  waiting.delete(c)
  const step = (tries: number) => {
    waiting.delete(c)
    if (c.base.isDestroyed()) return
    // Windows only: another app in front (Ctrl let go over it, which the key
    // poll hears before the window's blur arrives): giving the page the keys
    // would bring Oriel back in front. Not asked of a hidden test window on the Mac.
    if (process.platform === 'win32' && !c.base.isFocused()) return
    if (c.record.switcher || (tries > 0 && c.record.field.open)) return
    const tab = model.activeTab(c.record)
    const view = c.activeRuntime()?.view
    const shown = !!view && c.base.contentView.children.includes(view)
    if (!tab || tab.empty || shown || tries >= 40) { c.focusPage(); return }
    if (tries === 0 && !c.ui.webContents.isDestroyed()) c.ui.webContents.focus()
    waiting.set(c, setTimeout(() => step(tries + 1), 16))
  }
  step(0)
}
