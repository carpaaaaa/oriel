// A blank tab's grid (HomeGrid.swift; Settings › Tabs › Show the Home
// bookmarks on a new tab): the sites of the bookmark folder called Home,
// four to a row, each a tile with its saved title, hung just under the
// field (centred, lifted 30, 50 tall). Nothing while something is typed.

import { For, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'

export function HomeGrid() {
  const sites = () => state.homeSites ?? []
  return (
    <Show when={sites().length && !state.field.text}>
      <div class="home-grid" data-home-grid>
        <For each={sites()}>
          {s => (
            <button class="home-tile" title={s.url} onClick={() => { const t = activeTab(); void cmd({ do: 'tab.go', id: t?.id, input: s.url }) }}>
              {s.title}
            </button>
          )}
        </For>
      </div>
    </Show>
  )
}
