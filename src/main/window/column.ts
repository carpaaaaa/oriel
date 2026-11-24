// The column's resting place (Settings › Hide the column until the pointer
// reaches the edge, sidebar.hides; Fold.swift:501, :519, Browser.swift:3116):
// on, the column rests folded away and the page takes the whole window, the
// pointer at the edge brings it out (edges.ts, 10 from the edge after 0.05 s)
// and Ctrl+S keeps it out; off, it comes back beside the page. A window opened
// with it on starts folded.

import { model } from '../model/model'
import { allControllers, controllerFor } from '../views/window'

let hides = !!model.pref<boolean>('sidebar.hides')

function rest(folded: boolean): void {
  for (const c of allControllers()) {
    if (c.record.sidebar.layout !== 'side' || c.record.sidebar.folded === folded) continue
    c.record.sidebar = { ...c.record.sidebar, folded }
    model.touch(c.record, ['sidebar'])
  }
}

let buttons = model.pref<string>('window.buttons')

model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs')) return
  // Window buttons changed: their room at the strip's end with it.
  const style = model.pref<string>('window.buttons')
  if (style !== buttons) { buttons = style; for (const c of allControllers()) c.mark('window') }
  const now = !!model.pref<boolean>('sidebar.hides')
  if (now === hides) return
  hides = now
  rest(now)
})

model.on('window-opened', (id: string) => {
  if (!model.pref<boolean>('sidebar.hides')) return
  setImmediate(() => {
    const c = controllerFor(id) ?? allControllers().find(x => x.record.id === id)
    if (!c || c.record.sidebar.layout !== 'side' || c.record.sidebar.folded) return
    c.record.sidebar = { ...c.record.sidebar, folded: true }
    model.touch(c.record, ['sidebar'])
  })
})
