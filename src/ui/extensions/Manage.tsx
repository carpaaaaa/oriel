// Managing extensions (Settings › Extensions on the Mac, ExtensionsUI.swift,
// studio/04 §2.6), the minimal part: add from the Chrome Web Store by link or
// id, the installed ones with their switch and their "…" menu, Load
// Unpacked. Until Oriel's own pages are wired (oriel://extensions), it
// floats over the window as a plate.

import { createSignal, For, Show, onMount } from 'solid-js'
import { state, cmd } from '../lib/store'
import { ExtIcon, Ellipsis } from './parts'
import type { ExtView } from '../../shared/modules/extensions'

/** TODO(brand): brand.name once the interface reads src/shared/brand.ts. */
const APP = 'Oriel'
const hasId = (t: string) => /[a-p]{32}/.test(t.toLowerCase())

function detail(e: ExtView): string {
  const where = e.fromStore ? 'Chrome Web Store' : e.folder ? `From “${e.folder.split(/[\\/]/).pop()}”` : 'From a folder'
  return [`Version ${e.version}`, where].join(' · ')
}

export function Manage() {
  const [text, setText] = createSignal('')
  const ext = () => state.ext
  const add = () => { if (hasId(text())) { void cmd({ do: 'ext.install', text: text() }); setText('') } }
  const close = () => void cmd({ do: 'ext.manage', open: false })
  let plate!: HTMLDivElement
  onMount(() => plate?.focus())
  return (
    <Show when={ext()?.manage}>
      <div class="ext-veil" onPointerDown={e => { if (e.target === e.currentTarget) close() }}>
        <div class="ext-plate" ref={plate} tabindex={-1} onKeyDown={e => { if (e.key === 'Escape') close() }}>
          <div class="ext-plate-head">
            <h1>Extensions</h1>
            <button class="ext-pill" onClick={close}>Done</button>
          </div>
          <Show when={ext()?.said}>{s => <p class="ext-said" classList={{ bad: !!s().bad }}>{s().text}</p>}</Show>

          <section class="ext-box">
            <div class="ext-box-title">
              <span>Add from the Chrome Web Store</span>
              <button class="ext-pill" onClick={() => void cmd({ do: 'ext.store' })}>Open the Store</button>
            </div>
            <div class="ext-field-row">
              <input class="ext-field" placeholder="Paste a link to an extension, or its id" value={text()}
                onInput={e => setText(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} spellcheck={false} />
              <Show when={!(ext()?.busy.length)} fallback={<span class="ext-spin" />}>
                <button class="ext-pill full" disabled={!hasId(text())} onClick={add}>Add</button>
              </Show>
            </div>
            <p class="ext-note">Or find it in the store and press Add to {APP} on its page.</p>
          </section>

          <Show when={ext()?.list.length} fallback={<p class="ext-none">No extensions yet.</p>}>
            <section class="ext-box ext-installed">
              <For each={ext()!.list}>{e => (
                <div class="ext-line" data-ext={e.id}>
                  <ExtIcon ext={e} size={22} />
                  <div class="ext-line-text">
                    <span class="ext-line-name">{e.name}</span>
                    <span class="ext-line-detail">{detail(e)}</span>
                    <Show when={e.problem}><span class="ext-line-problem">{e.problem}</span></Show>
                  </div>
                  <button class="door ext-more" title={`More for ${e.name}`} aria-label={`More for ${e.name}`}
                    onClick={ev => { const r = ev.currentTarget.getBoundingClientRect(); void cmd({ do: 'ext.context', id: e.id, x: r.left, y: r.bottom, overlay: true }) }}>
                    <Ellipsis size={14} />
                  </button>
                  <button class="ext-switch" classList={{ on: e.enabled }} role="switch" aria-checked={e.enabled} title={e.enabled ? 'Turn off' : 'Turn on'}
                    onClick={() => void cmd({ do: 'ext.enable', id: e.id, on: !e.enabled })}><span /></button>
                </div>
              )}</For>
            </section>
          </Show>

          <section class="ext-box ext-line">
            <div class="ext-line-text">
              <span class="ext-line-name">Load an unpacked extension</span>
              <span class="ext-line-detail">A folder with a manifest.json: your own, or one exported from another browser. Reload picks up what you've changed in it since.</span>
            </div>
            <button class="ext-pill" onClick={() => void cmd({ do: 'ext.loadUnpacked' })}>Choose…</button>
          </section>
        </div>
      </div>
    </Show>
  )
}
