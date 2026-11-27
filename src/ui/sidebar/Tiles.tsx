// The column of icons (SideIcons.swift, studio/01 §5.23-§5.26): 52 wide,
// each tab a tile of 32, 2 apart, 10 from the edge; its mark at 85% (whole
// when live or under the pointer); the live tile on `pinLive`. The live
// tile's cross waits half a second of the pointer on it and sits small in
// its top-left corner, clear of a click for the tab (Search 1.0.22). A
// group: a short heading with its letter, its tiles held by a thin bracket.
// A split: its tiles in one frame (§8.29, IconPair), as the rows have it.

import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { G, Ring } from './glyphs'
import { parts, label, atRest, picked, pairSlot, type PairSlot } from './derive'
import { Mark } from './Row'
import { GroupHeading, NewTabRow } from './Lines'
import { openMenu } from '../menus/open'
import { tabMenu } from '../menus/build'
import { arrive } from './motion'
import { groupColour } from './Sidebar'

export function Tiles(p: { still: boolean; glidingTo: string | null }) {
  const blocks = () => parts()
  return (
    <div class="tiles">
      <For each={[...blocks().squares, ...blocks().listed]}>{t => <Tile tab={t} still={p.still} gliding={p.glidingTo === t.id} />}</For>
      <Show when={blocks().squares.length + blocks().listed.length}><div style={{ height: '8px' }} /></Show>
      <For each={blocks().groups}>{g => (
        <div class="tile-group" style={{ background: groupColour(g.group.colour) }}>
          <GroupHeading group={g.group} compact />
          <Show when={!g.group.folded && g.members.length}><span class="bracket" /></Show>
          <For each={g.members}>{t => <Tile tab={t} still={p.still} gliding={p.glidingTo === t.id} pair={pairSlot(g.members, t.id)} />}</For>
        </div>
      )}</For>
      <For each={blocks().loose}>{t => <Tile tab={t} still={p.still} gliding={p.glidingTo === t.id} pair={pairSlot(blocks().loose, t.id)} />}</For>
      <NewTabRow centred />
    </div>
  )
}

/** How long the pointer stays on the tab you're on before its cross shows
 * (SideIcons.swift IconTile.crossDwell, Search 1.0.22). */
export const CROSS_DWELL = 500

/** The tile's tooltip: its title, where its page is on every tile, whatever
 * Settings says of the address (AtRest always), then what a row would say
 * beside it (IconTiles.tip, Search 1.0.22). */
export function tileTip(t: TabView): string {
  const lines = [t.empty ? 'New Tab' : label(t)]
  const rest = t.empty || t.internal ? null : atRest(t.url, t.site)
  if (rest) lines.push(`${rest.kind === 'notSecure' ? 'Not secure  ' : ''}${rest.lead}${rest.name}${rest.tail}`)
  const signs = [t.shy && 'Private', t.capturing && 'Recording', !t.loading && (t.muted ? 'Muted' : t.audible ? 'Playing sound' : '')].filter(Boolean)
  if (signs.length) lines.push(signs.join(' · '))
  return lines.join('\n')
}

/** Whether a tile or a pinned square wears the corner speaker: its page plays
 * sound, or was muted, and isn't on its way (CornerSpeaker.shows). */
export const cornerSpeaks = (t: TabView) => !t.loading && (t.audible || t.muted)

/** The speaker of a tile, and of a pinned square in the column and across the
 * top (Search 1.0.22): small, in the bottom corner, on a disc of the column's
 * ground; a press mutes or unmutes (CornerSpeaker). */
export function CornerSpeaker(p: { tab: TabView }) {
  return (
    <button class="corner-speaker" title={p.tab.muted ? 'Unmute Tab' : 'Mute Tab'}
      onPointerDown={e => e.stopPropagation()} onDblClick={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.mute', id: p.tab.id, muted: !p.tab.muted }) }}>
      {p.tab.muted ? <G.speakerSlash pt={6.5} /> : <G.speaker pt={6.5} />}
    </button>
  )
}

function Tile(p: { tab: TabView; still: boolean; gliding: boolean; pair?: PairSlot | null }) {
  let el!: HTMLDivElement
  const t = () => p.tab
  const live = () => t().id === state.activeID
  onMount(() => { if (!p.still) arrive(el, 0.9, 'center') })
  // Only the tab already on screen wears a cross, and only once the pointer
  // has stayed on it: a pass over the column, or a click for its address,
  // never closes it. Over the cross, which reaches past the tile's corner,
  // counts as on the tile (IconTile.overCross).
  const closable = () => live() && !t().pinID
  const [over, setOver] = createSignal(false)
  const [dwelled, setDwelled] = createSignal(false)
  let dwell = 0
  createEffect(() => {
    clearTimeout(dwell)
    if (closable() && over()) dwell = window.setTimeout(() => setDwelled(true), CROSS_DWELL)
    else setDwelled(false)
  })
  onCleanup(() => clearTimeout(dwell))
  const crossShows = () => closable() && dwelled() && over()
  // Put away rather than closed, in a group (Browser.closeTab).
  const putsAway = () => !!t().groupID && !t().asleep && !t().empty && !!t().url
  return (
    <div ref={el} class="tile" data-tab={t().id} classList={{
      live: live(), picked: picked(t().id), gliding: p.gliding, asleep: t().asleep,
      'in-pair': !!p.pair, 'pair-first': p.pair?.index === 0, 'pair-last': !!p.pair && p.pair.index === p.pair.count - 1, 'pair-live': !!p.pair?.live,
    }}
      style={{ '--r': '9px' }} title={tileTip(t())}
      onPointerEnter={() => setOver(true)} onPointerLeave={() => setOver(false)}
      onPointerDown={e => { if (e.button === 0 && !live() && !(e.target as HTMLElement).closest('.tile-x, .corner-speaker')) void cmd({ do: 'tab.select', id: t().id }) }}
      onDblClick={() => { if (live()) void cmd({ do: 'field.open', target: 'here' }) }}
      onAuxClick={e => { if (e.button === 1) void cmd({ do: 'tab.close', id: t().id }) }}
      onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(tabMenu(t()), { x: e.clientX, y: e.clientY }, `tab:${t().id}`) }}>
      <div class="ground" />
      <span class="tile-mark">
        <Show when={!t().loading} fallback={<Ring />}>
          <Show when={!t().empty} fallback={<G.magnifyPlus pt={11} weight="medium" />}>
            <Mark tab={{ ...t(), label: label(t()) }} size={16} dim={t().asleep} />
          </Show>
        </Show>
      </span>
      <Show when={closable()}>
        <button class="tile-x" classList={{ shown: crossShows() }} title={putsAway() ? 'Put Away' : 'Close Tab'} tabIndex={-1}
          onPointerDown={e => e.stopPropagation()} onDblClick={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); if (crossShows()) void cmd({ do: 'tab.close', id: t().id }) }}>
          {putsAway() ? <G.minus pt={6.5} weight="bold" /> : <G.xmark pt={6.5} weight="bold" />}
        </button>
      </Show>
      <Show when={cornerSpeaks(t())}><CornerSpeaker tab={t()} /></Show>
    </div>
  )
}
