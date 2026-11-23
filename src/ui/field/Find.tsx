// Find on Page: a pill in the page's top corner (studio/03 §6.1, Find.swift).

import { createEffect, on, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { ChevronDown, ChevronUp, Ellipsis, XMark } from './icons'

export function FindBar() {
  let input!: HTMLInputElement
  const f = () => state.find ?? { open: false, text: '', matchCase: false, wholeWords: false, status: null, missed: false, focus: 0 }
  // A pane narrower than 290 keeps Return and Shift+Return instead of the arrows.
  const narrow = () => innerWidth < 290

  /** What this input last sent: words coming back that it didn't send are
   * written in (Ctrl+F again with words kept, another window's choice). */
  let sent: string | null = null
  const take = () => { input.focus(); input.select() }
  onMount(() => { input.value = f().text; take() })
  createEffect(on(() => f().focus, take, { defer: true }))
  createEffect(() => { const text = f().text; if (text !== sent && input.value !== text) input.value = text })

  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      void cmd({ do: 'find.step', forward: !e.shiftKey })
    }
  }

  const options = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    void cmd({ do: 'find.menu', x: Math.round(r.left), y: Math.round(r.bottom + 4) })
  }

  return (
    <div class="find-room">
      <div class="find" classList={{ missed: f().missed, narrow: narrow() }}>
        <input ref={input} class="find-field" spellcheck={false} autocomplete="off" placeholder="Find on page"
          aria-label="Find on page" title="" aria-description="Type text to search this page. Press Return to find the next match."
          onInput={e => { sent = e.currentTarget.value; void cmd({ do: 'find.input', text: sent }) }} onKeyDown={key} />
        <Show when={f().status}>
          <span class="find-status" aria-label={f().status ?? ''}>{f().status}</span>
        </Show>
        <Show when={!narrow()}>
          <button class="find-button" aria-label="Previous match" title="Previous Match   Ctrl+Shift+G" onClick={() => void cmd({ do: 'find.step', forward: false })}><ChevronUp size={10} weight={2.2} /></button>
          <button class="find-button" aria-label="Next match" title="Next Match   Ctrl+G" onClick={() => void cmd({ do: 'find.step', forward: true })}><ChevronDown size={10} weight={2.2} /></button>
        </Show>
        <button class="find-button" classList={{ on: f().matchCase || f().wholeWords }} aria-label="Search options" title="Search options" onClick={options}><Ellipsis size={11} /></button>
        <button class="find-button" aria-label="Close Find on Page" title="Close the find field and clear its selection." onClick={() => void cmd({ do: 'find.close' })}><XMark size={10} weight={2.2} /></button>
      </div>
    </div>
  )
}
