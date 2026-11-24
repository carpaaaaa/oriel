// The window's interface under the pages: the window itself (drawn by Search
// on Windows: corners, shadow, edges and its three buttons), the column, the
// page's card (its place, measured and sent to the main process), the empty
// tab's field. studio/01 §1.12, §1.19, §1.22; studio/02 §4.1, §4.7, §4.8.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'
import { Sidebar } from '../sidebar/Sidebar'
import { Field } from '../field/Field'
import { WinClose, WinMaximize, WinMinimize, WinRestore } from '../lib/icons'
import { EDGES, gripDown, wireFrame } from './frame'
import { Panes } from './Split'

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
    void state.activeID; void activeTab()?.empty; void state.sidebar.width; void state.sidebar.folded; void state.sidebar.layout; void state.maximized
    void state.frame?.state; void state.frame?.margin.top; void state.frame?.margin.left
    const s = split()
    if (s) { void s.sizes.join(); void s.tabs.join(); void state.tabs.length }
    void state.room?.width; void state.room?.side
    queueMicrotask(measure)
  })

  // The frame's kind and state drive the tokens (corners, margin, shadow).
  const kind = () => state.frame?.kind ?? (state.chrome === 'mac' ? 'mac' : 'drawn')
  const where = () => state.frame?.state ?? 'free'
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
  const side = () => (state.sidebar.folded || strip() ? 0 : state.sidebar.width)
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
      <div class="window on-frame" classList={{ windows: state.chrome === 'windows', blurred: !state.focused, top: strip(), [`room-${state.room?.side}`]: !!state.room }}
        style={{ '--side': `${side()}px`, '--top': strip() ? 'var(--strip)' : undefined, '--room': `${state.room?.width ?? 0}px` }}>
        <Show when={!state.sidebar.folded}>
          <Sidebar />
        </Show>
        <div class="top-strip" />
        <div class="card" ref={slot} classList={{ stage: !!split() }}>
          <Show when={split()} fallback={<>
            <Show when={activeTab()?.empty}>
              <div class="empty-page">
                <Field place="page" />
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
        <Show when={ownButtons()}>
          <div class="caption-buttons">
            <button class="minimize" title="Minimize" onClick={() => cmd({ do: 'window.minimize' })}><WinMinimize /></button>
            <button class="maximize" title={state.maximized ? 'Restore Down' : 'Maximize'} onClick={() => cmd({ do: 'window.maximize' })}>
              {state.maximized ? <WinRestore /> : <WinMaximize />}
            </button>
            <button class="close" title="Close" onClick={() => cmd({ do: 'window.close' })}><WinClose /></button>
          </div>
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
