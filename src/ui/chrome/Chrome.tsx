// The window's interface under the pages: the window itself (drawn by Search
// on Windows: corners, shadow, edges and its three buttons), the column, the
// page's card (its place, measured and sent to the main process), the empty
// tab's field. studio/01 §1.12, §1.19, §1.22; studio/02 §4.1, §4.7, §4.8.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'
import { Sidebar } from '../sidebar/Sidebar'
import { Field } from '../field/Field'
import { outlet } from '../lib/registry'
import { CaptionButtons, buttonStyle } from './Buttons'
import { EDGES, gripDown, wireFrame } from './frame'
import { Panes } from './Split'
import { foldSlide } from './slide'
import { capBand, cornerRight } from '../data/where'
import { BookmarksBar, barShown } from '../data/BookmarksBar'

export function ChromeRoot() {
  let slot!: HTMLDivElement
  let frameEl!: HTMLDivElement
  let roomEl: HTMLDivElement | undefined
  const [stageWidth, setStageWidth] = createSignal(0)
  // studio/01 §8: the split the page with the keys belongs to.
  const split = () => state.splits.find(s => s.tabs.includes(state.activeID ?? ''))

  const measure = () => {
    const tab = activeTab()
    if (!slot) return
    if (state.room && roomEl) {
      const b = roomEl.getBoundingClientRect()
      void cmd({ do: 'window.room', rect: { x: b.left, y: b.top, width: b.width, height: b.height } })
    }
    const r = slot.getBoundingClientRect()
    if (Math.round(r.width) !== stageWidth()) setStageWidth(Math.round(r.width))
    const rectOf = (el: Element) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height } }
    if (split()) {
      // One slot per page in the split (the empty one has no page).
      const slots = [...slot.querySelectorAll<HTMLElement>('.pane[data-tab]')]
        .filter(el => !state.tabs.find(t => t.id === el.dataset.tab)?.empty)
        .map(el => ({ id: el.dataset.tab!, rect: rectOf(el), radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 }))
      void cmd({ do: 'layout.slots', slots })
      return
    }
    const radius = parseFloat(getComputedStyle(slot).borderTopLeftRadius) || 0
    void cmd({
      do: 'layout.slots',
      slots: tab && !tab.empty ? [{ id: tab.id, rect: rectOf(slot), radius }] : [],
    })
  }

  onMount(() => {
    setStageWidth(Math.round(slot.getBoundingClientRect().width))
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    window.addEventListener('resize', measure)
    const unwire = wireFrame(frameEl)
    onCleanup(() => { ro.disconnect(); window.removeEventListener('resize', measure); unwire() })
  })
  createEffect(() => {
    void state.activeID; void activeTab()?.empty; void state.sidebar.width; void state.sidebar.folded; void state.sidebar.layout; void state.sidebar.side; void state.sidebar.icons; void state.prefs?.['tabs.compact']; void state.maximized
    void state.frame?.state; void state.frame?.margin.top; void state.frame?.margin.left
    const s = split()
    if (s) { void s.sizes.join(); void s.tabs.join(); void state.tabs.length }
    void state.room?.width; void state.room?.side
    void barShown()
    queueMicrotask(measure)
  })

  // The frame's kind and state drive the tokens (corners, margin, shadow).
  const kind = () => state.frame?.kind ?? (state.chrome === 'mac' ? 'mac' : 'drawn')
  // Borderless full screen is drawn as a maximized window (its buttons, the card).
  const where = () => { const s = state.frame?.state ?? 'free'; return s === 'fullScreen' && state.frame?.borderless ? 'maximized' : s }
  createEffect(() => {
    const root = document.documentElement.dataset
    root.frame = kind()
    root.state = where()
    root.cardsFullScreen = String(!!state.prefs['layout.cardsFullScreen'])
  })

  // Tabs across the top (studio/01 §4.3, studio/02 §4.3): the column's
  // strip of 52 is the window's top and the page goes under it; the window
  // lays that out here, the strip only draws itself (tabbar/).
  const strip = () => state.sidebar.layout === 'top' && !state.sidebar.folded
  // Ctrl+S slides the column off the edge and back, the card's edge beside
  // it every frame, the page measured there each frame (slide.ts).
  const slide = foldSlide(() => measure())
  const docked = () => (state.sidebar.icons ? 52 : state.sidebar.width)
  const gap = () => (where() === 'fullScreen' && !pref('layout.cardsFullScreen') ? 0 : parseFloat(getComputedStyle(frameEl).getPropertyValue('--card-gap')) || 0)
  const side = () => {
    const o = slide.out()
    if (o !== null) return gap() + (docked() - gap()) * o
    return state.sidebar.folded || strip() ? 0 : docked()
  }
  const columnShift = () => {
    const o = slide.out()
    return o === null ? undefined : `${(state.sidebar.side === 'right' ? 1 : -1) * docked() * (1 - o)}px 0`
  }
  // Settings › Tabs › On the right (sidebar.position): the column on the
  // window's right, the page's card on its left (studio/01 §5.1).
  const onRight = () => state.sidebar.layout === 'side' && state.sidebar.side === 'right' && (!state.sidebar.folded || slide.out() !== null)
  const pref = (k: string) => !!state.prefs?.[k]
  // A loading line with the tabs hidden (fold.loadingLine, App.swift:623,
  // Fold.swift LoadingLine): folded away, 2 points along the page's top while
  // it loads, clear of the card's round corners.
  const loadingLine = () => state.sidebar.folded && pref('fold.loadingLine') && !!activeTab()?.loading && !activeTab()?.empty
  const margin = () => state.frame?.margin ?? { top: 0, right: 0, bottom: 0, left: 0 }
  // Our own buttons: always with the frame we draw; with Windows' frame only
  // when developing on a Mac (Windows draws its own there).
  const ownButtons = () => state.chrome === 'windows' && where() !== 'fullScreen' &&
    (kind() === 'drawn' || window.search.platform === 'darwin')
  const resizable = () => kind() === 'drawn' && (where() === 'free' || where() === 'snapped')

  return (
    <div class="frame" ref={frameEl}
      style={{
        '--m-top': `${margin().top}px`, '--m-right': `${margin().right}px`,
        '--m-bottom': `${margin().bottom}px`, '--m-left': `${margin().left}px`,
        '--grip-out': `${state.frame?.grip.outside ?? 8}px`, '--grip-in': `${state.frame?.grip.inside ?? 4}px`,
        '--grip-corner': `${state.frame?.grip.corner ?? 20}px`,
      }}>
      {/* The window's own buttons don't keep the keys after a click, as
          the Mac's don't: the + kept them, and the next key (Escape, Tab)
          drew a focus ring around it beside the tab. */}
      <div class="window on-frame" onMouseDown={e => { const btn = (e.target as HTMLElement).closest('button'); if (btn && btn.closest('.tabbar, .sidebar, .caption-buttons')) e.preventDefault() }} classList={{ windows: state.chrome === 'windows', blurred: !state.focused, top: strip(), 'col-right': onRight(), compact: pref('tabs.compact'), 'btn-inline': ownButtons() && buttonStyle() === 'inline', [`room-${state.room?.side}`]: !!state.room, bm: barShown() }}
        style={{ '--side': `${side()}px`, '--fold-shift': columnShift(), '--top': strip() ? (pref('tabs.compact') ? 'var(--strip-compact)' : 'var(--strip)') : undefined, '--room': `${state.room?.width ?? 0}px` }}>
        <Show when={!state.sidebar.folded || slide.out() !== null}>
          <Sidebar />
        </Show>
        <div class="top-strip" />
        {/* Settings › Appearance › Show the bookmarks bar: right above the page (data/BookmarksBar.tsx). */}
        <Show when={barShown()}><BookmarksBar /></Show>
        <div class="card" ref={slot} classList={{ stage: !!split() }}>
          <Show when={split()} fallback={<>
            <Show when={activeTab()?.empty}>
              <div class="empty-page">
                <For each={outlet('blank.under')}>{C => <C />}</For>
                <Field place="page" />
                <For each={outlet('blank.over')}>{C => <C />}</For>
              </div>
            </Show>
            {/* Its page out in Oriel's floating window (Ctrl+Shift+P): said here, with the way back, not a dark card. */}
            <Show when={state.float?.tab === state.activeID}>
              <div class="float-note" data-window-ui="float-note">
                <p>Playing in the floating window</p>
                <button class="pill" onClick={() => cmd({ do: 'pages.float.land' })}>Bring it back</button>
              </div>
            </Show>
            <Show when={activeTab()?.error}>
              {e => <div class="error-page"><h1>{e().description}</h1><p>{e().url}</p><button class="pill" onClick={() => cmd({ do: 'tab.reload' })}>Try again</button></div>}
            </Show>
          </>}>
            {s => <Panes split={s()} width={stageWidth()} onLaid={() => queueMicrotask(measure)} />}
          </Show>
        </div>
        <Show when={state.room}>
          <div class="side-room" ref={roomEl} />
        </Show>
        <Show when={loadingLine()}>
          <div class="loading-line" data-window-ui="loading-line"><span /></div>
        </Show>
        {/* Beside the window's buttons, up in the band above the page: the
            bookmark button (data/where.ts), 12 left of them. */}
        <Show when={capBand()}>
          <div class="chrome-end" style={{ right: `${cornerRight()}px` }}>
            <For each={outlet('chrome.end')}>{C => <C />}</For>
          </div>
        </Show>
        <Show when={ownButtons()}>
          <CaptionButtons />
        </Show>
      </div>
      <Show when={resizable()}>
        <div class="grips">
          <For each={EDGES}>{edge => <div class={`grip-${edge}`} data-edge={edge} onPointerDown={e => gripDown(edge, e)} />}</For>
        </div>
      </Show>
    </div>
  )
}
