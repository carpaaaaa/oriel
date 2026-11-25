// The column of icons (SideIcons.swift, studio/01 §5.23-§5.26): 52 wide,
// each tab a tile of 32, 2 apart, 10 from the edge; its mark at 85% (whole
// when live or under the pointer); the live tile on `pinLive`; under the
// pointer, on the live tile only, a cross in place of the mark. A group: a
// short heading with its letter, its tiles held by a thin bracket. A split:
// its tiles in one frame (§8.29, IconPair), as the rows have it.

import { For, Show, onMount } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { TabView } from '../../shared/state'
import { G, Ring } from './glyphs'
import { parts, label, restOf, picked, pairSlot, type PairSlot } from './derive'
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

function Tile(p: { tab: TabView; still: boolean; gliding: boolean; pair?: PairSlot | null }) {
  let el!: HTMLDivElement
  const t = () => p.tab
  const live = () => t().id === state.activeID
  onMount(() => { if (!p.still) arrive(el, 0.9, 'center') })
  const tip = () => {
    const lines = [t().empty ? 'New Tab' : label(t())]
    const rest = live() ? restOf(t()) : null
    if (rest) lines.push(`${rest.kind === 'notSecure' ? 'Not secure  ' : ''}${rest.lead}${rest.name}${rest.tail}`)
    const signs = [t().shy && 'Private', t().capturing && 'Recording', !t().loading && (t().muted ? 'Muted' : t().audible ? 'Playing sound' : '')].filter(Boolean)
    if (signs.length) lines.push(signs.join(' · '))
    return lines.join('\n')
  }
  return (
    <div ref={el} class="tile" data-tab={t().id} classList={{
      live: live(), picked: picked(t().id), gliding: p.gliding, asleep: t().asleep,
      'in-pair': !!p.pair, 'pair-first': p.pair?.index === 0, 'pair-last': !!p.pair && p.pair.index === p.pair.count - 1, 'pair-live': !!p.pair?.live,
    }}
      style={{ '--r': '9px' }} title={tip()}
      onPointerDown={e => { if (e.button === 0 && !live() && !(e.target as HTMLElement).closest('.tile-x')) void cmd({ do: 'tab.select', id: t().id }) }}
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
      <Show when={live() && !t().pinID}>
        <button class="tile-x" title="Close Tab" onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.close', id: t().id }) }}>
          <span class="disc"><G.xmark pt={8} weight="semibold" /></span>
        </button>
      </Show>
      <Show when={t().audible || t().muted}>
        <button class="tile-speaker" onClick={e => { e.stopPropagation(); void cmd({ do: 'tab.mute', id: t().id, muted: !t().muted }) }}>
          {t().muted ? <G.speakerSlash pt={6.5} /> : <G.speaker pt={6.5} />}
        </button>
      </Show>
    </div>
  )
}
