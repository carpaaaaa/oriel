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

// Last in line: the page's own listeners run first, wherever they are. A
// microtask would run between two listeners of the same event (the checkpoint
// after each callback), before a page's later window listener could call
// preventDefault; a task runs only once the whole dispatch is over.
window.addEventListener('keydown', e => { setTimeout(() => leftover(e), 0) }, false)
