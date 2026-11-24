// Settings › Tabs › Show the Home bookmarks on a new tab (`home.grid`,
// HomeGrid.swift, Bookmarks.homeSites): the sites of the top-level bookmark
// folder called Home, sixteen at most, as tiles under an empty tab's field.
// The window's state carries them while the row is on (the interface draws
// them: src/ui/tabs/HomeGrid.tsx).

import { model } from '../model/model'
import { registerSlice, allControllers } from '../views/window'
import { bookmarks } from '../data/store'
import type { BookmarkNode } from '../../shared/modules/data'

export interface HomeSite { id: string; title: string; url: string }

function homeSites(): HomeSite[] {
  const roots: BookmarkNode[] = bookmarks().roots
  const home = roots.find(n => n.url == null && n.title.trim().toLowerCase() === 'home')
  return (home?.children ?? []).filter(n => n.url != null).slice(0, 16).map(n => ({ id: n.id, title: n.title, url: n.url! }))
}

registerSlice('homeSites', () => (model.pref<boolean>('home.grid') ? homeSites() : []))

// Drawn again when the bookmarks change, and when the row is turned on or off.
let chained = false
function chain(): void {
  if (chained) return
  chained = true
  const store = bookmarks()
  const before = store.onChange
  store.onChange = () => { before(); for (const c of allControllers()) c.mark('homeSites') }
}
model.on('window-opened', () => setImmediate(chain))
model.on('window-changed', (_id: string, slices: string[]) => {
  if (slices.includes('prefs')) for (const c of allControllers()) c.mark('homeSites')
})
