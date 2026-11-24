// The column (studio/01 §5, studio/02 §4.2; Side.swift `SideBar`): the band
// at the top with back, forward and reload; the pinned squares; the rows
// that scroll (pinned rows and their folders, groups, the keep line, the
// tabs, New tab); the foot. The live tab's grey glides from line to line on
// the `glide` spring; lines come and go on `settle`; the space's colour or
// gradient washes the chrome.

import './sidebar.css'
import { batch, createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch, untrack } from 'solid-js'
import { state, cmd } from '../lib/store'
import { outlet } from '../lib/registry'
import { Dynamic } from 'solid-js/web'
import { G } from './glyphs'
import { P, currentSpace, pref } from './derive'
import { layout, pinCells, type Item } from './layout'
import { Row } from './Row'
import { GroupHeading, FolderHeading, KeepLine, NewTabRow, RowGhost, openColumnMenu } from './Lines'
import { PinGrid } from './Pins'
import { Foot, capRoom, doorsUp, spaceStep } from './Foot'
import { PlayerRow } from './Player'
import { Tiles } from './Tiles'
import { wash, grain } from './look'
import { Chase, Springs, leave, arrive, swipe, reducedMotion, type Box } from './motion'
import { carry, shifted, dropMark, rowGhost, wireMenuPicks, activeTab } from './ui'
import { setColumn } from './drag'
import { TabBar } from '../tabbar/TabBar'

export function Sidebar() {
  wireMenuPicks()
  return (
    <Show when={state.sidebar.layout !== 'top'} fallback={<TabBar />}>
      <Column />
    </Show>
  )
}

/** The space's colour or gradient over the chrome, never the page: one layer
 * the size of the window under the column, the bars and the card, so each
 * shows its piece of the same gradient (§2.6). A change crossfades (quick). */
export function Wash() {
  const look = () => wash(currentSpace(), state.look === 'dark')
  const [layers, setLayers] = createSignal<{ bg: string; id: number }[]>([])
  let n = 0
  createEffect(on(look, bg => {
    const id = ++n
    // The new one fades in over the old, which goes once it has.
    setLayers(l => [...l.slice(-1), ...(bg ? [{ bg, id }] : [])])
    setTimeout(() => { if (id === n) setLayers(l => l.filter(x => x.id === id)) }, 160)
  }))
  const grainy = () => !!(currentSpace()?.gradient as { grain?: boolean } | undefined)?.grain
  return (
    <div class="wash" aria-hidden="true">
      <For each={layers()}>{l => <div class="wash-layer" style={{ background: l.bg }} />}</For>
      <Show when={grainy()}>
        <div class="wash-grain" style={{ 'background-image': `url(${grain()})`, opacity: state.look === 'dark' ? 0.04 : 0.035 }} />
      </Show>
    </div>
  )
}

/** Back, forward and reload (TabBar.swift `Helm`, Side.swift `Door`):
 * doors of 26, radius 8, 4 apart; greyed to 0.3 with nowhere to go. On
 * Windows the window's buttons are at the far end, so the doors start at
 * the column's edge, as the Mac's do in full screen (lights 0). */
function Helm(p: { vertical?: boolean }) {
  const tab = activeTab
  const back = () => !!tab() && !tab()!.empty && tab()!.canGoBack
  const forward = () => !!tab() && !tab()!.empty && tab()!.canGoForward
  const web = () => !!tab() && !tab()!.empty && !tab()!.internal
  const lights = () => (state.chrome === 'mac' && !state.fullScreen ? Math.max(0, Math.min(80, state.sidebar.width - 20 - 86 - (P.foldButton() ? 30 : 0))) : 0)
  return (
    <div class="helm" classList={{ vertical: !!p.vertical }} style={{ 'padding-left': p.vertical ? undefined : `${10 + lights()}px` }}>
      <Show when={P.foldButton() && !p.vertical}>
        <button class="door fold-door" title="Hide Sidebar   Ctrl+S" onClick={() => void cmd({ do: 'sidebar.fold', folded: true })}>
          <G.sidebarLeft pt={11} weight="medium" />
        </button>
      </Show>
      {/* Only what Settings › Appearance › Tabs › Back, forward and reload leaves ticked (studio/01 §5.6). */}
      <Show when={!pref('helm.back.hidden', false)}>
        <button class="door" disabled={!back()} title="Back   Alt+Left" onClick={() => void cmd({ do: 'tab.back' })}><G.chevronLeft pt={11} weight="medium" /></button>
      </Show>
      <Show when={!pref('helm.forward.hidden', false)}>
        <button class="door" disabled={!forward()} title="Forward   Alt+Right" onClick={() => void cmd({ do: 'tab.forward' })}><G.chevronRight pt={11} weight="medium" /></button>
      </Show>
      <Show when={!pref('helm.reload.hidden', false)}>
        <button class="door" disabled={!web()} title={tab()?.loading ? 'Stop   Esc' : 'Reload   Ctrl+R'}
          onClick={() => void cmd({ do: tab()?.loading ? 'tab.stop' : 'tab.reload' })}>
          {tab()?.loading ? <G.xmark pt={11} weight="medium" /> : <G.reload pt={11} weight="medium" />}
        </button>
      </Show>
      <Show when={!p.vertical}>
        <For each={outlet('sidebar.helm')}>{c => <Dynamic component={c} />}</For>
      </Show>
    </div>
  )
}

export function Column() {
  let body!: HTMLDivElement
  let scroller!: HTMLDivElement
  let content!: HTMLDivElement
  let pillEl!: HTMLDivElement

  const icons = () => P.iconColumn()
  const width = () => (icons() ? 52 : state.sidebar.width)
  const L = createMemo(() => layout())
  const byKey = createMemo(() => new Map(L().items.map(i => [i.key, i])))

  // lines going: kept a moment where they were, fading (settle)
  const [ghosts, setGhosts] = createSignal<Map<string, Item>>(new Map())
  const [arrivals, setArrivals] = createSignal(false)
  const [still, setStill] = createSignal(true)
  let seenSpace = state.space
  let lastKeys = new Set<string>()
  let lastItems = new Map<string, Item>()

  createEffect(on(L, l => {
    const keys = new Set(l.items.map(i => i.key))
    const items = new Map(l.items.map(i => [i.key, i]))
    queueMicrotask(() => {
      const switched = state.space !== seenSpace
      seenSpace = state.space
      if (switched) {
        batch(() => { setGhosts(new Map()); setStill(true) })
        requestAnimationFrame(() => requestAnimationFrame(() => setStill(false)))
        slideIn()
      } else if (arrivals()) {
        const gone = [...lastKeys].filter(k => !keys.has(k) && lastItems.get(k)?.kind !== 'wash')
        if (gone.length) setGhosts(g => { const m = new Map(g); for (const k of gone) m.set(k, lastItems.get(k)!); return m })
        const back = [...ghosts().keys()].filter(k => keys.has(k))
        if (back.length) setGhosts(g => { const m = new Map(g); for (const k of back) m.delete(k); return m })
      }
      lastKeys = keys
      lastItems = items
    })
  }))
  onMount(() => { requestAnimationFrame(() => { setStill(false); setArrivals(true) }) })

  const keys = createMemo(() => [...L().items.map(i => i.key), ...[...ghosts().keys()].filter(k => !byKey().has(k))])
  const itemOf = (key: string) => byKey().get(key) ?? ghosts().get(key)

  // the space's rows sliding in, the way the spaces went (§7.18, §7.21)
  let stopSlide = () => {}
  function slideIn() {
    stopSlide()
    const x0 = spaceStep() * width()
    const targets = [content, body.querySelector<HTMLElement>('.pins')].filter(Boolean) as HTMLElement[]
    stopSlide = swipe(x0, x => { for (const t of targets) t.style.translate = x ? `${x}px 0` : '' }, () => {})
  }

  // the grey that glides (LivePill, §5.12)
  const [gliding, setGliding] = createSignal<string | null>(null)
  let chase: Chase | null = null
  const rectIn = (el: Element): Box => {
    const b = body.getBoundingClientRect(), r = el.getBoundingClientRect()
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }
  }
  const liveEl = (id: string | null) => (id ? body.querySelector<HTMLElement>(`.row[data-tab="${id}"], .square[data-tab="${id}"], .tile[data-tab="${id}"]`) : null)
  createEffect(on(() => state.activeID, (id, prev) => {
    if (!prev || !id || prev === id) return
    const spaceThen = state.space
    queueMicrotask(() => {
      if (state.space !== spaceThen || seenSpace !== spaceThen) return
      const from = liveEl(prev) ?? body.querySelector(`[data-ghost-tab="${prev}"]`)
      const to = liveEl(id)
      if (!from || !to || reducedMotion()) return
      const start = chase ? { x: chase.pos[0], y: chase.pos[1], w: chase.pos[2], h: chase.pos[3] } : rectIn(from)
      chase?.stop()
      const paint = (b: Box) => {
        pillEl.style.transform = `translate(${b.x}px, ${b.y}px)`
        pillEl.style.width = `${b.w}px`
        pillEl.style.height = `${b.h}px`
      }
      const square = to.classList.contains('square') || to.classList.contains('tile')
      pillEl.classList.toggle('on-square', square)
      pillEl.style.borderRadius = square ? getComputedStyle(to).getPropertyValue('--r') || '9px' : '9px'
      paint(start)
      setGliding(id)
      chase = new Chase(Springs.glide, start, () => { const el = liveEl(state.activeID); return el ? rectIn(el) : null }, paint,
        () => { chase = null; setGliding(null) })
      chase.start()
    })
  }))
  onCleanup(() => chase?.stop())

  // the tab in front kept in sight (§5.10): scrolled to, or centred
  createEffect(on(() => state.activeID, id => {
    queueMicrotask(() => {
      const el = id ? scroller.querySelector<HTMLElement>(`.row[data-tab="${id}"], .tile[data-tab="${id}"]`) : null
      if (!el) return
      const it = byKey().get(`t:${id}`)
      if (!it) return
      const top = scroller.scrollTop, h = scroller.clientHeight
      if (it.y < top || it.y + it.h > top + h) {
        const centre = Math.max(0, it.y + it.h / 2 - h / 2)
        scroller.scrollTo({ top: centre, behavior: reducedMotion() || still() ? 'instant' : 'smooth' })
      }
    })
  }))

  onMount(() => {
    setColumn({
      body, scroller,
      width,
      rowsTop: () => scroller.offsetTop - scroller.scrollTop,
      gridHeight: () => { const g = body.querySelector<HTMLElement>('.pins'); return g ? g.offsetHeight : 0 },
    })
  })
  onCleanup(() => setColumn(null))

  // the edge (§5.3): 9 wide, the pill 4 × 28, 40 lit; double click, 232
  const [gripping, setGripping] = createSignal(false)
  const startResize = (e: PointerEvent) => {
    if (e.button !== 0 || icons() && !P.narrowIcons()) return
    e.preventDefault()
    const start = e.clientX
    const from = icons() ? 200 - 24 : state.sidebar.width
    setGripping(true)
    let raf = 0, wanted = from
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
    const move = (m: PointerEvent) => {
      wanted = from + (m.clientX - start)
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        // Narrow to icons: under 200 the strip, pulled 24 out of it the titles (§5.4).
        if (P.narrowIcons()) {
          const narrow = wanted < 200
          if (narrow !== !!pref('sidebar.narrowed', false)) void cmd({ do: 'prefs.set', key: 'sidebar.narrowed', value: narrow })
          if (narrow) return
        }
        void cmd({ do: 'sidebar.resize', width: wanted })
      })
    }
    const up = () => {
      setGripping(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // the void under the rows: a new tab on a double click, the column's menu
  // on a right click; dragged, the window (asked of the window module).
  const voidDown = (e: PointerEvent) => {
    // The window drawn by Oriel moves itself from here (chrome/frame.ts):
    // a second window.startDrag would start Windows' move loop twice.
    if (e.button !== 0 || state.frame?.kind === 'drawn') return
    const x0 = e.screenX, y0 = e.screenY
    const move = (m: PointerEvent) => {
      if (Math.abs(m.screenX - x0) + Math.abs(m.screenY - y0) > 3) {
        stop()
        void cmd({ do: 'window.startDrag', x: m.screenX, y: m.screenY })
      }
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const rowsHeight = () => L().height

  // Buttons at the top (sidebar.doorsUp; Side.swift:196-203): up only if they
  // fit beside the helm, keptWidth ≤ beyondHelm (Foot.tsx); never with icons only.

  // What's playing in other tabs (sidebar.player; Player.swift): the newest
  // tab to make a sound that is out of sight, its pause; paused from here it
  // stays, with its play, until it plays again or goes.
  const [order, setOrder] = createSignal<string[]>([])
  const [stilled, setStilled] = createSignal<Set<string>>(new Set())
  createEffect(() => {
    const sounding = state.tabs.filter(t => t.audible).map(t => t.id)
    setOrder(o => [...o.filter(id => sounding.includes(id)), ...sounding.filter(id => !o.includes(id))])
    setStilled(s => { const n = new Set([...s].filter(id => state.tabs.some(t => t.id === id && !t.asleep && !t.audible))); return n.size === s.size ? s : n })
  })
  const shownIDs = () => new Set([state.activeID, ...(state.splits.find(s => s.tabs.includes(state.activeID ?? ''))?.tabs ?? [])])
  const player = () => {
    if (!pref('sidebar.player', false) || icons()) return null
    const ids = [...order(), ...stilled()]
    for (const id of ids.reverse()) {
      const t = state.tabs.find(x => x.id === id)
      if (t && !shownIDs().has(id)) return t
    }
    return null
  }
  const playOrPause = (id: string, play: boolean) => {
    void cmd({ do: 'tab.media', id, play })
    setStilled(s => { const n = new Set(s); if (play) n.delete(id); else n.add(id); return n })
  }

  return (
    <aside class="sidebar on-frame" data-tabs-ui="column" classList={{ icons: icons(), right: state.sidebar.side === 'right', contrast: P.contrast() }}
      style={{ width: `${width()}px` }}
      onContextMenu={e => { if (!(e.target as HTMLElement).closest('.row, .square, .tile, .group-heading, .folder-heading, .door, .foot > *')) { e.preventDefault(); void openColumnMenu(e) } }}>
      <Wash />
      <div class="band drag" style={{ 'padding-right': capRoom() ? `${capRoom()}px` : undefined }}>
        <Show when={!icons()}><Helm /></Show>
        <For each={outlet('sidebar.top')}>{c => <Dynamic component={c} />}</For>
        {/* Buttons at the top (sidebar.doorsUp): the foot's doors beside the helm, when they fit */}
        <Show when={doorsUp()}><Foot up /></Show>
      </div>
      <Show when={icons()}>
        <Show when={!pref('sidebar.narrowed', false) || state.sidebar.icons}><Helm vertical /></Show>
      </Show>
      <div class="side-body" ref={body}>
        <div class="pill-layer" aria-hidden="true">
          <div ref={pillEl} class="live-pill" classList={{ on: !!gliding() }} />
        </div>
        <Show when={!icons()} fallback={<Tiles still={still()} glidingTo={gliding()} />}>
          <PinGrid squares={L().squares} width={width()} still={still()} glidingTo={gliding()} />
        </Show>
        <For each={outlet('sidebar.afterPins')}>{c => <Dynamic component={c} />}</For>
        <Show when={!icons()}>
          <div class="rows" ref={scroller} onDblClick={e => { if (e.target === scroller) void cmd({ do: 'tab.new' }) }}>
            <div class="rows-content" ref={content} classList={{ still: still() }} style={{ height: `${rowsHeight()}px` }}>
              <For each={keys()}>{key => <Line key={key} item={itemOf(key)} leaving={!byKey().has(key)} arrivals={arrivals()} gliding={gliding()}
                done={() => setGhosts(g => { const m = new Map(g); m.delete(key); return m })} />}</For>
              <Show when={rowGhost()}>{g => {
                const t = () => state.tabs.find(x => x.id === g().tab)
                return <Show when={t()}><div class="line ghost-line" style={{ transform: `translateY(${g().block}px)`, height: `${L().items[0]?.h ?? 28}px` }}><RowGhost tab={t()!} /></div></Show>
              }}</Show>
            </div>
          </div>
        </Show>
        <div class="void" onDblClick={() => void cmd({ do: 'tab.new' })} onPointerDown={voidDown} />
      </div>
      <Show when={player()}>{t => <PlayerRow tab={t()} stilled={stilled().has(t().id)} still={playOrPause} />}</Show>
      <Show when={!doorsUp()}><Foot vertical={icons()} /></Show>
      <div class="grip" classList={{ held: gripping() }} onPointerDown={startResize}
        onDblClick={() => { void cmd({ do: 'prefs.set', key: 'sidebar.narrowed', value: false }); void cmd({ do: 'sidebar.resize', width: 232 }) }}>
        <span class="grip-pill" />
      </div>
    </aside>
  )
}

/** One line of the rows, at its place. */
function Line(p: { key: string; item: Item | undefined; leaving: boolean; arrivals: boolean; gliding: string | null; done: () => void }) {
  let el!: HTMLDivElement
  const c = () => carry()
  const carried = () => c()?.key === p.key
  const y = () => {
    if (carried()) return c()!.y
    const s = shifted()[p.key]
    return s ?? p.item?.y ?? 0
  }
  onMount(() => {
    const it = p.item
    queueMicrotask(() => { if (p.arrivals && !p.leaving && it && it.kind !== 'wash' && untrack(() => !carry())) arrive(el, it.kind === 'row' ? 0.94 : 0.94) })
  })
  createEffect(on(() => p.leaving, l => { if (l) leave(el, 0.94, p.done) }))
  const mark = () => dropMark()?.key === p.key ? dropMark() : null
  return (
    <Show when={p.item}>{it => (
      <div ref={el} class="line" data-key={p.key} data-kind={it().kind}
        data-ghost-tab={p.leaving && it().kind === 'row' ? (it() as Extract<Item, { kind: 'row' }>).tab.id : undefined}
        classList={{ carried: carried(), faded: carried() && !!c()?.faded, leaving: p.leaving, wash: it().kind === 'wash', gliding: it().kind === 'row' && p.gliding === (it() as Extract<Item, { kind: 'row' }>).tab.id }}
        style={{ transform: `translateY(${y()}px)`, height: `${it().h}px`, left: `${it().x}px`, right: `${it().r}px` }}>
        <Switch>
          <Match when={it().kind === 'row' && (it() as Extract<Item, { kind: 'row' }>)}>{r => <Row tab={r().tab} grouped={!!r().group} pinned={!!r().pinned} />}</Match>
          <Match when={it().kind === 'group' && (it() as Extract<Item, { kind: 'group' }>)}>{g => <GroupHeading group={g().group} />}</Match>
          <Match when={it().kind === 'folder' && (it() as Extract<Item, { kind: 'folder' }>)}>{f => <FolderHeading folder={f().folder} depth={f().depth} />}</Match>
          <Match when={it().kind === 'keep' && (it() as Extract<Item, { kind: 'keep' }>)}>{k => <KeepLine clears={k().clears} />}</Match>
          <Match when={it().kind === 'new'}><NewTabRow /></Match>
          <Match when={it().kind === 'wash' && (it() as Extract<Item, { kind: 'wash' }>)}>{w => <GroupWash colour={w().group.colour} />}</Match>
        </Switch>
        <Show when={mark()}>{m => <span class="drop-mark" classList={{ after: m().after }} />}</Show>
      </div>
    )}</Show>
  )
}

function GroupWash(p: { colour: number }) {
  return <div class="group-wash" style={{ background: groupColour(p.colour) }} />
}

export function groupColour(colour: number): string {
  const c = [[0.26, 0.52, 0.96], [0.20, 0.66, 0.45], [0.96, 0.62, 0.20], [0.90, 0.33, 0.40], [0.62, 0.40, 0.90]][colour - 1]
  if (!c) return 'transparent'
  const a = state.look === 'dark' ? 0.11 : 0.07
  return `rgba(${c.map(v => Math.round(v * 255)).join(', ')}, ${a})`
}

export { pinCells }
