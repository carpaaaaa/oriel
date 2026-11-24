// The puzzle and the pinned buttons (ExtensionSlot, studio/04 §2.3, §2.9):
// in the column's foot with the column, at the end of the tab strip with tabs
// across the top. No puzzle without extensions; the pinned ones next to it in
// the order they were added, as many as there is room for (none with the
// column narrowed to icons). A click presses, a right click gives the menu.

import { For, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Puzzle } from '../lib/icons'
import { ExtIcon, Badge, rectOf } from './parts'
import { doorsUp, upRoom } from '../sidebar/Foot'

export function Buttons(p: { where: 'foot' | 'strip' }) {
  const ext = () => state.ext
  const here = () => (p.where === 'foot' ? state.sidebar.layout !== 'top' : state.sidebar.layout === 'top')
  // Up beside back, forward and reload, only as many as fit (SideFoot.room).
  const room = () => (p.where === 'foot' ? (state.sidebar.icons ? 0 : doorsUp() ? Math.min(3, upRoom()) : 3) : 8)
  const pinned = () => (ext()?.list ?? []).filter(e => e.enabled && e.pinned && e.action).slice(0, room())
  let puzzle!: HTMLButtonElement
  return (
    <Show when={here() && (ext()?.list.length ?? 0) > 0}>
      <div class="ext-slot" data-where={p.where}>
        <For each={pinned()}>{e => (
          <button class="door ext-button" data-ext={e.id} title={e.title}
            onClick={ev => void cmd({ do: 'ext.press', id: e.id, anchor: rectOf(ev.currentTarget) })}
            onContextMenu={ev => { ev.preventDefault(); void cmd({ do: 'ext.context', id: e.id, x: ev.clientX, y: ev.clientY }) }}>
            <ExtIcon ext={e} size={15} />
            <Badge ext={e} />
          </button>
        )}</For>
        <button ref={puzzle} class="door ext-puzzle" classList={{ on: !!ext()?.menu, hidden: !!state.prefs?.['foot.extensions.hidden'] }} title="Extensions"
          onClick={() => void cmd({ do: 'ext.menu', anchor: rectOf(puzzle) })}>
          <Puzzle size={14} />
        </button>
      </div>
    </Show>
  )
}
