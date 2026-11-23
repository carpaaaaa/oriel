// Reports the keys the page left alone,
// so Search's shortcuts come after the page's own ("page first", studio/03
// §1.41). More page helpers (modified clicks, popups, reading progress,
// password fill) join here, each in its own file under preload/page/.

import { ipcRenderer } from 'electron'

function leftover(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return
  if (!(e.ctrlKey || e.metaKey || e.altKey || e.key.startsWith('F') || e.key === 'Escape')) return
  ipcRenderer.send('search:leftover-key', {
    key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey,
    altGraph: e.getModifierState('AltGraph'),
  })
}

// Last in line: the page's own listeners, on window or below, run first. A
// listener added on window in the bubble phase after load still sees the
// event before ours only if added earlier; the queueMicrotask below lets a
// handler that calls preventDefault late still win.
window.addEventListener('keydown', e => queueMicrotask(() => leftover(e)), false)
