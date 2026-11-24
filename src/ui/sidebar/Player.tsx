// What's playing in another tab, above the column's foot (sidebar.player;
// Player.swift PlayerRow): its mark and title, its pause (or play, once paused
// from here), a click on it to go there. A card's hairline, not a tab's
// ground, so it never reads as one more tab.

import { Show } from 'solid-js'
import { cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { Mark } from './Row'
import { label, markSize } from './derive'

export function PlayerRow(p: { tab: TabView; stilled: boolean; still: (id: string, play: boolean) => void }) {
  return (
    <div class="player" data-tab={p.tab.id} title={label(p.tab)} onClick={() => void cmd({ do: 'tab.select', id: p.tab.id })}>
      <Mark tab={{ ...p.tab, label: label(p.tab) }} size={markSize()} />
      <span class="player-title">{label(p.tab)}</span>
      <button class="player-button" title={p.stilled ? 'Play' : 'Pause'} onClick={e => { e.stopPropagation(); p.still(p.tab.id, p.stilled) }}>
        <Show when={p.stilled} fallback={<svg width="10" height="10" viewBox="0 0 10 10"><rect x="2" y="1.5" width="2" height="7" rx=".6" fill="currentColor" /><rect x="6" y="1.5" width="2" height="7" rx=".6" fill="currentColor" /></svg>}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1.6v6.8c0 .4.4.6.7.4l5-3.4c.3-.2.3-.6 0-.8l-5-3.4c-.3-.2-.7 0-.7.4Z" fill="currentColor" /></svg>
        </Show>
      </button>
    </div>
  )
}
