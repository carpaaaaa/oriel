// View › Edit Site Style… (SiteStyles.swift StylePanel): the CSS for the
// site in front, on the page as you type, a moment after the last key.
// Done closes it; there is nothing to save, it already is. Owned by the
// pages module.

import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'
import { cmd } from '../lib/store'

export function SiteStylePanel(props: { layer: OverlayLayer }) {
  const data = () => (props.layer.kind === 'panel' ? (props.layer.data as { host: string; css: string } | undefined) : undefined)
  const [text, setText] = createSignal(data()?.css ?? '')
  let box!: HTMLTextAreaElement
  let pending: ReturnType<typeof setTimeout> | null = null
  const host = () => data()?.host ?? ''
  const send = (css: string) => void cmd({ do: 'pages.style.set', host: host(), css })
  const typed = (css: string) => {
    setText(css)
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => { pending = null; send(css) }, 250)
  }
  const done = () => {
    if (pending) { clearTimeout(pending); pending = null }
    send(text())
    void cmd({ do: 'pages.style.close' })
  }
  onMount(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length) })
  onCleanup(() => { if (pending) clearTimeout(pending) })
  return (
    <div class="sitestyle">
      <div class="sitestyle-card" role="dialog" aria-label={host()}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); done() } }}>
        <div class="sitestyle-title">{host()}</div>
        <div class="sitestyle-caption">CSS for every page of this site</div>
        <textarea ref={box} class="sitestyle-text" spellcheck={false} autocomplete="off" value={text()} onInput={e => typed(e.currentTarget.value)} />
        <div class="sitestyle-foot">
          <button class="filled sitestyle-done" onClick={done}>Done</button>
          <Show when={text()}><button class="sitestyle-clear" onClick={() => typed('')}>Clear</button></Show>
        </div>
      </div>
    </div>
  )
}
