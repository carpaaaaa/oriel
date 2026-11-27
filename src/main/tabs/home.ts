// Settings › Tabs › Show the Home bookmarks on a new tab (`home.grid`,
// HomeGrid.swift, Bookmarks.homeSites): the sites of the top-level bookmark
// folder called Home, sixteen at most, as tiles under an empty tab's field.
// The window's state carries them while the row is on (the interface draws
// them: src/ui/tabs/HomeGrid.tsx).
// Oriel's own (carpa, 27 Nov 2026): turned on, the folder is made when there
// is none, so there is somewhere to put sites at once; turned off, an empty
// one goes again. Not at launch, though the row is on as it comes since
// 0.1.34: a first import from another browser fills an empty list's top
// level, and a Home folder made unasked would send it into a folder (a
// bookmark's Show on New Tab makes the folder too). While it is on the
// bookmarks bar leaves the folder out (data/door.ts): its sites are on
// every new tab.

import { model } from '../model/model'
import { registerSlice, allControllers } from '../views/window'
import { bookmarks } from '../data/store'
import { homeFolder } from '../data/bookmarks'
import { benchRequest } from '../bench/server'

export interface HomeSite { id: string; title: string; url: string }

function homeSites(): HomeSite[] {
  const home = homeFolder(bookmarks().roots)
  return (home?.children ?? []).filter(n => n.url != null).slice(0, 16).map(n => ({ id: n.id, title: n.title, url: n.url! }))
}

registerSlice('homeSites', () => (model.pref<boolean>('home.grid') ? homeSites() : []))

/** The row moved: the folder made, or an empty one taken away. */
function settle(on: boolean): void {
  const store = bookmarks()
  const home = homeFolder(store.roots)
  if (on && !home) store.newFolder('Home')
  else if (!on && home && !(home.children ?? []).length) store.remove(home.id)
}

// Drawn again when the bookmarks change, and when the row is turned on or off.
let chained = false
let was: boolean | null = null
function chain(): void {
  if (chained) return
  chained = true
  was = !!model.pref<boolean>('home.grid')
  const store = bookmarks()
  const before = store.onChange
  store.onChange = () => { before(); for (const c of allControllers()) c.mark('homeSites') }
}
model.on('window-opened', () => setImmediate(chain))
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs')) return
  for (const c of allControllers()) c.mark('homeSites')
  const on = !!model.pref<boolean>('home.grid')
  if (was === null || on === was) return
  was = on
  settle(on)
})

benchRequest('tabs.homeSites', () => ({ sites: homeSites(), home: homeFolder(bookmarks().roots) ?? null }))
