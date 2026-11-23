// The field: centred in the page, raised 30 (studio/02 §4.4), with its list
// of suggestions 8 below. On an empty tab it lives in the interface; over a
// page it lives in the overlay, on a veil of the page's colour at 74%.

import { createEffect, For, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Search, Globe } from '../lib/icons'
import { Mark } from '../sidebar/Sidebar'

export function Field(p: { place: 'page' | 'overlay' }) {
  let input!: HTMLInputElement
  let field!: HTMLDivElement
  const f = () => state.field

  onMount(() => { input.focus(); if (f().text) input.select() })
  createEffect(() => { if (f().open) queueMicrotask(() => { input?.focus() }) })
  createEffect(() => {
    if (document.activeElement !== input && input.value !== f().text) input.value = f().text
  })
  createEffect((prior: number) => {
    const n = f().refused
    if (n > prior) shake(field)
    return n
  }, f().refused)

  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); void cmd({ do: 'field.move', by: 1 }) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); void cmd({ do: 'field.move', by: -1 }) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      const index = f().suggestions.length ? f().selected : undefined
      void cmd({ do: 'field.commit', index, text: input.value, newTab: e.altKey })
    } else if (e.key === 'Escape') { e.preventDefault(); void cmd({ do: 'field.close' }) }
  }

  return (
    <div class="field-wrap" classList={{ [p.place]: true }}>
      <div class="field" ref={field}>
        <Search size={15} class="lens" />
        <input ref={input} spellcheck={false} autocomplete="off" placeholder="Search or type an address"
          onInput={e => cmd({ do: 'field.input', text: e.currentTarget.value })} onKeyDown={key} />
        <Show when={p.place === 'page'}><div class="breath" /></Show>
      </div>
      <Show when={f().suggestions.length && f().text}>
        <div class="suggestions">
          <For each={f().suggestions}>{(s, i) => (
            <div class="suggestion" classList={{ picked: i() === f().selected }}
              onPointerDown={e => { e.preventDefault(); void cmd({ do: 'field.commit', index: i() }) }}>
              <span class="icon">
                <Show when={s.kind === 'search'} fallback={s.favicon ? <Mark url={s.url} favicon={s.favicon} size={14} /> : <Globe size={14} />}>
                  <Search size={14} />
                </Show>
              </span>
              <span class="what">{s.title}</span>
              <Show when={s.detail}><span class="detail">{s.detail}</span></Show>
              <Show when={s.tabID}><span class="switch">Switch to Tab</span></Show>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  )
}

/** x = sin(t·6π) · 7 · (1−t), t easing out over 0.5 s (Design.swift:498-515). */
function shake(el: HTMLElement) {
  const frames: Keyframe[] = []
  for (let i = 0; i <= 30; i++) {
    const u = i / 30
    const t = 1 - (1 - u) * (1 - u)
    frames.push({ transform: `translateX(${Math.sin(t * 6 * Math.PI) * 7 * (1 - t)}px)` })
  }
  el.animate(frames, { duration: 500 })
}
