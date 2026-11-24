// The address in the tab itself (TabBar.swift TabAddressField, TabOffers.swift):
// the tab's title gives way to its address, 12.5, selected whole; the grey
// ending as ⌘L's field has it; ↓ and ↑ walk the list under the tab, Return
// goes, Escape (the main process's) gives the title back, a press anywhere
// else keeps what was typed. The column's row and the strip's tab host it.

import { createEffect, For, on, onCleanup, onMount } from 'solid-js'
import { state, cmd } from '../lib/store'
import { OfferRow, shake } from './Field'
import { curve, Springs } from '../sidebar/motion'

export function TabField() {
  let input!: HTMLInputElement
  const e = () => state.tabEdit
  let synced = e()?.sync ?? 0
  let refusals = e()?.refused ?? 0
  let deleting = false
  let composing = false

  const report = () => {
    const r = input.getBoundingClientRect()
    void cmd({ do: 'field.tabAnchor', rect: { x: r.x, y: r.y, width: r.width, height: r.height } })
  }

  onMount(() => {
    // In over the tab's title, on glide (TabBar.swift:1072, Side.swift:2283).
    const { duration, easing } = curve(Springs.glide)
    if (duration) input.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing })
    input.value = e()?.shown ?? ''
    input.focus()
    input.select()
    input.scrollLeft = 0
    report()
    const watch = new ResizeObserver(report)
    watch.observe(input)
    // A press anywhere but the field ends the edit as Return would; the
    // press goes on to what it was for.
    const down = (ev: PointerEvent) => { if (ev.target !== input) void cmd({ do: 'field.tabBlur', text: input.value }) }
    document.addEventListener('pointerdown', down, true)
    onCleanup(() => { watch.disconnect(); document.removeEventListener('pointerdown', down, true) })
  })

  createEffect(on(() => e()?.sync ?? 0, n => {
    if (n === synced) return
    synced = n
    input.value = e()?.shown ?? ''
    input.select()
  }, { defer: true }))
  // Nowhere to go: the tab shakes, the edit stays.
  createEffect(on(() => e()?.refused ?? 0, n => {
    if (n <= refusals) { refusals = n; return }
    refusals = n
    const host = input.closest('.row, .strip-tab') as HTMLElement | null
    if (host) shake(host)
  }, { defer: true }))

  const send = async () => {
    const text = input.value
    const del = deleting
    deleting = false
    const r = await cmd({ do: 'field.tabType', text, deleting: del }) as { text: string; ending: string | null } | undefined
    if (!r?.ending || r.text !== text || input.value !== text || composing) return
    if (document.activeElement !== input || input.selectionStart !== text.length || input.selectionEnd !== text.length) return
    input.value = text + r.ending
    input.setSelectionRange(text.length, input.value.length)
    input.scrollLeft = 0
  }

  const key = (ev: KeyboardEvent) => {
    ev.stopPropagation()
    if (ev.isComposing || composing) return
    if (ev.key === 'Enter') { ev.preventDefault(); void cmd({ do: 'field.tabCommit', text: input.value }) }
    else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (e()?.offers.length ?? 0) > 0) {
      ev.preventDefault()
      void cmd({ do: 'field.tabMove', by: ev.key === 'ArrowDown' ? 1 : -1 })
    } else if (ev.key === 'Escape') { ev.preventDefault(); void cmd({ do: 'field.tabCancel' }) }
  }

  return (
    <input ref={input} class="field-tab-input" spellcheck={false} autocomplete="off" aria-label="Address"
      onPointerDown={ev => ev.stopPropagation()} onClick={ev => ev.stopPropagation()} onDblClick={ev => ev.stopPropagation()}
      onBeforeInput={ev => { deleting = ev.inputType.startsWith('delete') }}
      onInput={() => { if (!composing) void send() }}
      onCompositionStart={() => { composing = true }}
      onCompositionEnd={() => { composing = false; void send() }}
      onKeyDown={key}
      onBlur={() => void cmd({ do: 'field.tabBlur', text: input.value })} />
  )
}

/** The list under the tab, in the overlay: never the keys (TabOffersList). */
export function TabOffers() {
  const e = () => state.tabEdit
  return (
    <div class="field-taboffers-room">
      <div class="field-list field-taboffers" role="listbox">
        <For each={e()?.offers ?? []}>{(s, i) => (
          <OfferRow s={s} picked={i() === (e()?.selected ?? -1)} take={() => void cmd({ do: 'field.tabTake', index: i() })} />
        )}</For>
      </div>
    </div>
  )
}
