// Hide Elements in the overlay (studio/01 §10.38, §10.40; App.swift hint and
// announcement, Hidden.swift): the line at the page's foot, and Hidden on
// This Site…. Owned by the hide module.

import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'
import type { HideBarData, HideListData } from '../../shared/modules/hide'
import { cmd } from '../lib/store'
import { Caption, Card, Nothing, Pill, Quick } from '../settings/controls'
import { Symbol } from '../settings/symbols'

/** What was said, light, over the dark hint that stays up as long as the
 * pointing does, which is how you know you are still in it. The overlay is
 * made the size of the two, so the page under the rest still takes clicks. */
export function HideBar(p: { layer: OverlayLayer }) {
  const data = () => (p.layer.kind === 'panel' ? (p.layer.data as HideBarData | undefined) : undefined)
  // The same words said again rise again: one line per announcement.
  const said = createMemo(() => { const d = data(); return d?.said ? { text: d.said, n: d.n } : null }, null,
    { equals: (a, b) => a?.n === b?.n && a?.text === b?.text })
  let stack!: HTMLDivElement
  // Room around the capsules for their shadows: 24 at the sides and above,
  // the 30 under them.
  const measure = () => {
    if (!stack) return
    const r = stack.getBoundingClientRect()
    void cmd({ do: 'hide.barSize', width: Math.ceil(r.width) + 48, height: Math.ceil(r.height) + 24 + 30 })
  }
  createEffect(() => { said(); data()?.hint; requestAnimationFrame(measure) })
  onMount(() => { void document.fonts?.ready.then(measure) })
  return (
    <div class="hide-bar" onPointerDown={() => void cmd({ do: 'hide.focus' })}>
      <div class="hide-stack" ref={stack} data-hide="bar">
        <Show when={said()} keyed>{s => <div class="hide-said" role="status">{s.text}</div>}</Show>
        <Show when={data()?.hint}>{hint => <div class="hide-hint">{hint()}</div>}</Show>
      </div>
    </div>
  )
}

/** Hidden on This Site…: resting on a row puts that one thing back on the
 * page, outlined, and scrolls to it; you choose by looking, not by decoding
 * its name. Leaving the card puts the page back as it was. */
export function HideList(p: { layer: OverlayLayer }) {
  const data = () => (p.layer.kind === 'panel' ? (p.layer.data as HideListData | undefined) : undefined)
  const [hot, setHot] = createSignal<string | null>(null)
  const close = () => void cmd({ do: 'hide.close' })
  const leave = () => { setHot(null); void cmd({ do: 'hide.unpeek' }) }
  const help = () => (data()?.key ? `Hide Something   ${data()!.key}` : 'Hide Something')
  return (
    <Show when={data()}>{d => (
      <div class="hide-list" onPointerDown={e => { if (e.target === e.currentTarget) close() }}>
        <div class="hide-plate" role="dialog" aria-label={d().title} data-hide="list"
          style={{ top: `${d().at.top}px`, right: `${d().at.right}px` }} onPointerLeave={leave}>
          <div class="up-head">
            <h2 class="up-title hide-title">{d().title}</h2>
            <button class="up-x" title="Done   esc" aria-label="Done" onClick={close}><Symbol name="xmark" size={11} weight="medium" /></button>
          </div>
          <div class="hide-body">
            <Show when={d().veils.length} fallback={<Card><Nothing text="Nothing is hidden here." /></Card>}>
              <Caption text="Hidden on this site: rest on a line to see it" />
              <div class="hide-scroll">
                <Card>
                  <For each={d().veils}>{(v, i) => (
                    <>
                      <Show when={i() > 0}><div class="st-rule hide-rule" /></Show>
                      <div class="hide-row" classList={{ hot: hot() === v.selector }} data-selector={v.selector}
                        onPointerEnter={() => { setHot(v.selector); void cmd({ do: 'hide.peek', selector: v.selector }) }}>
                        <div class="hide-words">
                          <div class="hide-label">{v.label}</div>
                          <Show when={v.note}><div class="hide-note">{v.note}</div></Show>
                        </div>
                        <Quick title="Restore" act={() => void cmd({ do: 'hide.restore', selector: v.selector })} />
                      </div>
                    </>
                  )}</For>
                </Card>
              </div>
            </Show>
          </div>
          <div class="hide-foot">
            <Pill title="Hide something…" filled help={help()} act={() => void cmd({ do: 'view.hide' })} />
            <Show when={d().veils.length}><Pill title="Restore all" act={() => void cmd({ do: 'hide.restoreAll' })} /></Show>
          </div>
        </div>
      </div>
    )}</Show>
  )
}
