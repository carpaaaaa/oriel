// The data module's stores, made once, and each window's part of the data
// state (bookmarked, the account list, the save question, the import panel).

import type { DataState, FillList, ImportPanelState, SaveQuestion } from '../../shared/modules/data'
import type { ID } from '../../shared/state'
import { model } from '../model/model'
import { allControllers, controllerFor, registerSlice, type WindowController } from '../views/window'
import { Bookmarks } from './bookmarks'
import { History } from './history'

// Personal's files; other profiles get their own (05 §3.1, §3.5) once
// profiles exist (P1).
let historyStore: History | null = null
let bookmarkStore: Bookmarks | null = null

/** Made at first use: the userData folder is set by then. */
export function history(): History { return (historyStore ??= new History()) }
export function bookmarks(): Bookmarks {
  if (!bookmarkStore) {
    bookmarkStore = new Bookmarks()
    bookmarkStore.onChange = () => markAll()
  }
  return bookmarkStore
}

interface WindowData { fill: FillList | null; save: SaveQuestion | null; import: ImportPanelState | null }
const perWindow = new Map<ID, WindowData>()

export function windowData(c: WindowController): WindowData {
  let d = perWindow.get(c.record.id)
  if (!d) { d = { fill: null, save: null, import: null }; perWindow.set(c.record.id, d) }
  return d
}

function slice(c: WindowController): DataState {
  const d = windowData(c)
  const active = model.activeTab(c.record)
  const url = active && !active.empty ? active.url : ''
  return { bookmarked: !!url && bookmarks().contains(url), fill: d.fill, save: d.save, import: d.import }
}

registerSlice('data', slice)

export function mark(c: WindowController | undefined | null): void { c?.mark('data') }
export function markAll(): void { for (const c of allControllers()) c.mark('data') }

/** The window a tab is in. */
export function controllerOfTab(id: ID): WindowController | undefined {
  const win = model.windowOf(id)
  return win ? controllerFor(win.id) : undefined
}

model.on('selected', (win: { id: ID }) => mark(controllerFor(win.id)))
model.on('tab-changed', (tab: { id: ID }, patch: Record<string, unknown>) => {
  if ('url' in patch || 'empty' in patch) mark(controllerOfTab(tab.id))
})
model.on('window-changed', (id: ID) => {
  if (!controllerFor(id)) perWindow.delete(id)
})
