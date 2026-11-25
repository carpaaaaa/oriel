// The tabs interface plugged into both roots. In the overlay: the drawn
// menus and popovers, the Ctrl+Tab switcher, the folded column coming out
// over the page; each in a root of its own beside the overlay's. In the
// window's interface: a hook for tests to lay a window's state on the
// column without the main process (test/ui_*.py, fixtures).

import { render } from 'solid-js/web'
import { reconcile } from 'solid-js/store'
import { registerLayer, registerPanel } from '../lib/registry'
import { setState, state } from '../lib/store'
import type { WindowState } from '../../shared/state'
import { MenuHost, MainMenuLayer, MENU } from '../menus/host'
import { Switcher } from '../switcher/Switcher'
import { FoldLayer } from './Fold'
import { sayRoom } from '../menus/open'
import { post } from '../menus/bridge'
import { createEffect, createRoot } from 'solid-js'
import { watchPicks } from './picks'

registerLayer('menu', MainMenuLayer)
registerLayer('fold', FoldLayer)
// menu.open's layer: MenuHost draws it, in a root of its own beside the overlay's.
registerPanel(MENU, () => null)

if (window.search?.root === 'overlay') {
  const host = document.createElement('div')
  host.id = 'tabs-ui'
  document.body.appendChild(host)
  render(() => <><MenuHost /><Switcher /></>, host)
  // Ask the window's interface for the window's size, once known which window.
  createRoot(() => createEffect(() => { if (state.windowID) post({ type: 'close', window: state.windowID }) }))
} else if (window.search) {
  createRoot(() => createEffect(() => { if (state.windowID) sayRoom() }))
  watchPicks()
}

declare global {
  interface Window {
    /** Tests only: lay a state on the interface, frozen against the main
     * process's patches until `thaw()`. */
    __tabsUI?: { fake(s: Partial<WindowState>): void; thaw(): void; state(): WindowState }
  }
}

window.__tabsUI = {
  fake(s) {
    for (const [k, v] of Object.entries(s)) setState(k as keyof WindowState, reconcile(v as never, { key: 'id', merge: false }) as never)
    // Higher than any patch the main process will send for a while.
    setState('rev', 1e9)
    document.documentElement.dataset.look = state.look
  },
  thaw() { setState('rev', -1); void window.search.hello().then(p => { if (p) { for (const [k, v] of Object.entries(p.set)) setState(k as keyof WindowState, reconcile(v as never, { key: 'id', merge: false }) as never); setState('rev', p.rev) } }) },
  state: () => JSON.parse(JSON.stringify(state)),
}
