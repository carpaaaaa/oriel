// The field (studio/03 §1.1-1.5, studio/02 §4.4): on an empty tab it lives
// in the interface; over a page (⌘L, ⌘K) in the overlay, on a veil of the
// page's colour at 74%. Centred in the page and raised 30, with its list 8
// below, hanging so that it never moves the field. Omnibox.swift.

import './field.css'
import { createEffect, For, on, onMount, Show } from 'solid-js'
import type { Suggestion } from '../../shared/state'
import { state, cmd } from '../lib/store'
import { Bookmark, CommandKey, History, Lens, Pin } from './icons'

const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, '') } catch { return '' } }
const withoutWWW = (a: string) => (a.toLowerCase().startsWith('www.') ? a.slice(4) : a)

/** What a row reads: an address without its www, words as typed. */
function keyOf(s: Suggestion): string {
  return s.how === 'suggested' || s.how === 'searched' || s.how === 'search' || s.how === 'open' ? s.title : withoutWWW(s.title)
}

export function Field(p: { place: 'page' | 'overlay' }) {
  let input!: HTMLInputElement
  let box!: HTMLDivElement
  const f = () => state.field
  let composing = false
  let deleting = false
  /** The ending this input put in after the caret, while it is still there. */
  let ending: string | null = null
  let refused = false
  const listShown = () => f().suggestions.length > 0 || !!f().offer || !!f().note

  const write = (value: string, from: number | null | undefined) => {
    input.value = value
    ending = null
    if (from == null) input.select()
    else input.setSelectionRange(Math.min(from, value.length), value.length)
    // The start in view, not the end (#1055).
    input.scrollLeft = 0
  }

  // Counters as they were when this field came: only a real move counts
  // (a value arriving for the first time is not a change).
  let synced = f().sync ?? 0
  let focused = f().focus ?? 0
  let refusals = f().refused

  onMount(() => {
    // null selects everything (⌘L's address); absent, the caret at the end.
    write(f().shown ?? f().text, f().selectFrom === undefined ? f().text.length : f().selectFrom)
    input.focus()
    void cmd({ do: 'field.focused' })
  })

  // The main process changed the words (⌘L, a row walked to, Escape...).
  createEffect(on(() => f().sync ?? 0, n => {
    if (n === synced) return
    synced = n
    write(f().shown ?? f().text, f().selectFrom)
  }, { defer: true }))
  // The keys to the field.
  createEffect(on(() => f().focus ?? 0, n => {
    if (n === focused) return
    focused = n
    input.focus()
    void cmd({ do: 'field.focused' })
  }, { defer: true }))
  // Refused: a red edge and a shake, gone at the next key.
  createEffect(on(() => f().refused, n => {
    if (n <= refusals) { refusals = n; return }
    refusals = n
    refused = true
    box.classList.add('refused')
    shake(box)
  }, { defer: true }))

  const send = async () => {
    const text = input.value
    const del = deleting
    deleting = false
    if (refused) { refused = false; box.classList.remove('refused') }
    ending = null
    const r = await cmd({ do: 'field.type', text, deleting: del }) as { text: string; ending: string | null } | undefined
    if (!r || r.text !== text || input.value !== text || composing || !r.ending) return
    if (document.activeElement !== input || input.selectionStart !== text.length || input.selectionEnd !== text.length) return
    input.value = text + r.ending
    input.setSelectionRange(text.length, input.value.length)
    input.scrollLeft = 0
    ending = r.ending
  }

  const key = (e: KeyboardEvent) => {
    if (e.isComposing || composing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      void cmd({ do: 'field.move', by: e.key === 'ArrowDown' ? 1 : -1 })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      void cmd({ do: 'field.submit', text: input.value, newTab: e.altKey, front: e.altKey && e.shiftKey })
    } else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault()
      void cmd({ do: 'field.tab', back: e.shiftKey })
    } else if (e.key === 'Backspace' && !input.value && f().chip) {
      // An empty field with a site in it: the site goes.
      e.preventDefault()
      void cmd({ do: 'field.unchip' })
    } else if (e.key === 'Backspace' && (e.ctrlKey || e.altKey) && ending && input.selectionEnd === input.value.length
      && input.value.endsWith(ending) && input.selectionStart === input.value.length - ending.length) {
      // Ctrl+Backspace over an offered ending lets go of it and takes the
      // last word typed, as it does with no ending there.
      e.preventDefault()
      const typed = input.value.slice(0, input.value.length - ending.length)
      const cut = typed.replace(/[\p{L}\p{N}_]*[^\p{L}\p{N}_]*$/u, '')
      input.value = cut === typed ? typed.slice(0, -1) : cut
      deleting = true
      void send()
    }
  }

  return (
    <div class="field-wrap" classList={{ [p.place]: true }}>
      <div class="field" ref={box}>
        <div class="breath" />
        <Show when={f().chip}>{chip => (
          <span class="chip" aria-label={`Searching ${chip().name}`}>
            <span class="chip-icon"><Lens size={11} /></span>
            <span class="chip-name">{chip().name}</span>
          </span>
        )}</Show>
        <input ref={input} spellcheck={false} autocomplete="off" placeholder={f().placeholder ?? 'Enter a web address'}
          aria-label={f().label ?? 'Address'}
          onBeforeInput={e => { deleting = e.inputType.startsWith('delete') }}
          onInput={() => { if (!composing) void send() }}
          onCompositionStart={() => { composing = true }}
          onCompositionEnd={() => { composing = false; void send() }}
          onKeyDown={key} />
      </div>
      <Show when={listShown()}>
        <div class="suggestions" role="listbox">
          <Show when={f().offer}>{site => (
            <div class="suggestion offer" aria-label={`Search ${site().name}, press Tab`}
              onPointerDown={e => e.preventDefault()} onClick={() => void cmd({ do: 'field.lock' })}>
              <span class="icon"><Lens size={11} /></span>
              <span class="key">Search {site().name}</span>
              <span class="spacer" />
              <span class="tab-key">Tab</span>
            </div>
          )}</Show>
          <For each={f().suggestions}>{(s, i) => (
            <div class="suggestion" classList={{ picked: i() === f().selected }} role="option" aria-selected={i() === f().selected}
              onPointerDown={e => e.preventDefault()} onClick={() => void cmd({ do: 'field.take', index: i() })}>
              <span class="icon"><RowIcon s={s} /></span>
              <span class="key">{keyOf(s)}</span>
              <Show when={s.detail}><span class="title">{s.detail}</span></Show>
              <span class="spacer" />
              <Show when={s.how === 'bookmark'}><span class="trail"><Bookmark size={11} /></span></Show>
              <Show when={s.how !== 'bookmark' && s.pinned}><span class="trail"><Pin size={11} /></span></Show>
            </div>
          )}</For>
          <Show when={f().note}><div class="note">{f().note}</div></Show>
        </div>
      </Show>
    </div>
  )
}

/** The column before a row's words: the site's icon or letter, a lens for
 * words, a clock for words searched before, ⌘ for a command. */
function RowIcon(p: { s: Suggestion }) {
  const how = () => p.s.how ?? (p.s.kind === 'search' ? 'search' : 'visited')
  return (
    <Show when={how() !== 'search' && how() !== 'suggested'} fallback={<Lens size={11} />}>
      <Show when={how() !== 'command'} fallback={<CommandKey size={11} />}>
        <Show when={how() !== 'searched'} fallback={<History size={11} />}>
          <RowMark url={p.s.url} favicon={p.s.favicon} />
        </Show>
      </Show>
    </Show>
  )
}

/** Mark at 14: the favicon this computer has, or the site's letter on 6% ink. */
function RowMark(p: { url: string; favicon?: string }) {
  let broken = false
  const letter = () => hostOf(p.url)[0]?.toUpperCase() ?? '•'
  return (
    <span class="row-mark">
      <Show when={p.favicon && !broken} fallback={<span class="row-letter">{letter()}</span>}>
        <img src={p.favicon} width={14} height={14} draggable={false} onError={e => { broken = true; e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: 'row-letter', textContent: letter() })) }} />
      </Show>
    </span>
  )
}

/** x = sin(t·6π) · 7 · (1−t), t going 0 to 1 with SwiftUI's easeOut over
 * 0.5 s (Design.swift:498-515): the frames are even in t, the animation's
 * own easing is that easeOut, so at time u the field is at x(easeOut(u)). */
export function shake(el: HTMLElement): Animation | null {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  const frames: Keyframe[] = []
  for (let i = 0; i <= 60; i++) {
    const t = i / 60
    frames.push({ transform: `translateX(${(Math.sin(t * 6 * Math.PI) * 7 * (1 - t)).toFixed(3)}px)` })
  }
  return el.animate(frames, { duration: 500, easing: 'cubic-bezier(0, 0, .58, 1)' })
}
