// The window's state as the interface holds it: one Solid store, fed by the
// main process's patches. Each top-level key is reconciled on its own, keyed
// by id, so a tab that didn't change keeps its DOM.

import { createStore, reconcile } from 'solid-js/store'
import type { WindowPatch, WindowState } from '../../shared/state'

const empty: WindowState = {
  rev: -1, windowID: '', chrome: 'windows', look: 'light', focused: true, maximized: false, fullScreen: false,
  controlsWidth: 138, space: '', spaces: [], tabs: [], pins: [], pinFolders: [], groups: [], splits: [],
  activeID: null,
  sidebar: { layout: 'side', width: 232, folded: false, side: 'left', icons: false },
  field: { open: false, target: 'new', text: '', suggestions: [], selected: 0, refused: 0 },
  extensions: [], downloads: [], prefs: {},
}

export const [state, setState] = createStore<WindowState>(empty)

export function apply(patch: WindowPatch): void {
  if (patch.rev <= state.rev && patch.rev !== 0) return
  for (const [key, value] of Object.entries(patch.set)) {
    setState(key as keyof WindowState, reconcile(value as never, { key: 'id', merge: false }) as never)
  }
  setState('rev', patch.rev)
  document.documentElement.dataset.look = state.look
  document.documentElement.dataset.chrome = state.chrome
  document.documentElement.dataset.maximized = String(state.maximized || state.fullScreen)
}

export const cmd = (c: Parameters<typeof window.search.cmd>[0]) => window.search.cmd(c)

export function connect(): void {
  window.search.onState(apply)
  void window.search.hello().then(p => p && apply(p))
}

export const activeTab = () => state.tabs.find(t => t.id === state.activeID) ?? null
