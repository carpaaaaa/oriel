// The window's interface under the pages: the column, the page's card (its
// place, measured and sent to the main process), the empty tab's field, and
// on Windows the room for the window's own buttons.

import { createEffect, onCleanup, onMount, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'
import { Sidebar } from '../sidebar/Sidebar'
import { Field } from '../field/Field'
import { WinClose, WinMaximize, WinMinimize, WinRestore } from '../lib/icons'

export function ChromeRoot() {
  let slot!: HTMLDivElement

  const measure = () => {
    const tab = activeTab()
    if (!slot) return
    const r = slot.getBoundingClientRect()
    const radius = parseFloat(getComputedStyle(slot).borderTopLeftRadius) || 0
    void cmd({
      do: 'layout.slots',
      slots: tab && !tab.empty ? [{ id: tab.id, rect: { x: r.left, y: r.top, width: r.width, height: r.height }, radius }] : [],
    })
  }

  onMount(() => {
    const ro = new ResizeObserver(measure)
    ro.observe(slot)
    window.addEventListener('resize', measure)
    onCleanup(() => { ro.disconnect(); window.removeEventListener('resize', measure) })
  })
  createEffect(() => { void state.activeID; void activeTab()?.empty; void state.sidebar.width; void state.sidebar.folded; void state.maximized; queueMicrotask(measure) })

  const side = () => (state.sidebar.folded ? 0 : state.sidebar.width)
  const fakeControls = () => state.chrome === 'windows' && window.search.platform === 'darwin'

  return (
    <div class="window on-frame" classList={{ windows: state.chrome === 'windows', blurred: !state.focused }}
      style={{ '--side': `${side()}px` }}>
      <Show when={!state.sidebar.folded}>
        <Sidebar />
      </Show>
      <div class="top-strip" />
      <div class="card" ref={slot}>
        <Show when={activeTab()?.empty}>
          <div class="empty-page">
            <Field place="page" />
          </div>
        </Show>
        <Show when={activeTab()?.error}>
          {e => <div class="error-page"><h1>{e().description}</h1><p>{e().url}</p><button class="pill" onClick={() => cmd({ do: 'tab.reload' })}>Try again</button></div>}
        </Show>
      </div>
      <Show when={fakeControls()}>
        <div class="caption-buttons">
          <button onClick={() => cmd({ do: 'window.minimize' })}><WinMinimize /></button>
          <button onClick={() => cmd({ do: 'window.maximize' })}>{state.maximized ? <WinRestore /> : <WinMaximize />}</button>
          <button class="close" onClick={() => cmd({ do: 'window.close' })}><WinClose /></button>
        </div>
      </Show>
    </div>
  )
}
