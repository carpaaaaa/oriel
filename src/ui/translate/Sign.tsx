// The sign of a translated page (TranslateSign, studio/03 §6.3): the
// translate symbol, faded to 40% while the work goes on, the speech bubble
// with "!" when it failed (gone after 8 s); a click opens its menu
// (TranslateMenu): what happened, Show Original, and that it was done on
// this PC. The Mac puts the sign beside the tab's title; here it stands in
// the column's helm (or at the end of the tab strip) for the tab in front,
// until the tabs module gives the row a place for it. Owned by the translate module.

import { onCleanup, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { languageName, type TranslateTab } from '../../shared/modules/translate'
import { brand } from '../../shared/brand'

const mark = (): TranslateTab | null => {
  const id = state.activeID
  return (id && state.translate?.tabs[id]) || null
}

/** What the menu's first line and the sign's tooltip say (TranslateMenu.heading). */
export function heading(m: TranslateTab): string {
  const from = m.from ? languageName(m.from) : null
  switch (m.phase) {
    case 'downloading': return `Downloading ${from ?? 'the language'}… ${Math.round((m.progress ?? 0) * 100)}%`
    case 'working': return from ? `Translating from ${from}…` : 'Translating…'
    case 'done': return from ? `Translated from ${from}` : 'Translated'
    case 'failed': return m.error ?? `${brand.name} couldn't translate this page`
  }
}

function TranslateGlyph(p: { failed: boolean; size: number }) {
  return (
    <svg width={p.size} height={p.size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
      <Show when={!p.failed} fallback={<>
        <path d="M3.4 2.8h9.2a1.6 1.6 0 0 1 1.6 1.6v5.2a1.6 1.6 0 0 1-1.6 1.6H7.4l-3 2.4v-2.4h-1a1.6 1.6 0 0 1-1.6-1.6V4.4a1.6 1.6 0 0 1 1.6-1.6z" />
        <path d="M8 5v2.8" /><path d="M8 9.6v.01" />
      </>}>
        <path d="M1.8 3.6h6.6" /><path d="M5.1 2v1.6" />
        <path d="M3 5.4c.8 2.2 2.3 3.6 4.4 4.4" /><path d="M7.2 3.6C6.7 6.4 5 8.6 2.2 9.9" />
        <path d="M8.6 14.2 11.3 7.4l2.7 6.8" /><path d="M9.5 12h3.6" />
      </Show>
    </svg>
  )
}

export function Sign(p: { where: 'helm' | 'strip' }) {
  return (
    <Show when={mark()}>
      {m => (
        <button class="door tr-sign" classList={{ working: m().phase === 'working' || m().phase === 'downloading', failed: m().phase === 'failed', strip: p.where === 'strip' }}
          title={heading(m())} aria-label={heading(m())} data-translate-sign={m().phase}
          onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); void cmd({ do: 'translate.menu', anchor: { x: r.left + r.width / 2, y: r.bottom } }) }}>
          <TranslateGlyph failed={m().phase === 'failed'} size={13} />
        </button>
      )}
    </Show>
  )
}

/** The menu, in the overlay: a card hanging under the sign. */
export function TranslateMenu() {
  let card: HTMLDivElement | undefined
  const close = () => void cmd({ do: 'translate.menuClose' })
  onMount(() => {
    const blur = () => close()
    window.addEventListener('blur', blur)
    onCleanup(() => window.removeEventListener('blur', blur))
    card?.focus()
  })
  return (
    <div class="tr-region" onPointerDown={e => { if (e.target === e.currentTarget) close() }}
      onKeyDown={e => { if (e.key === 'Escape') close() }}>
      <Show when={mark()}>
        {m => (
          <div class="tr-card" ref={card} tabindex={-1} data-translate-menu>
            <div class="tr-heading" classList={{ alone: m().phase === 'failed' }}>{heading(m())}</div>
            <Show when={m().phase !== 'failed'}>
              <div class="tr-items">
                <button class="tr-item" data-translate-original onClick={() => void cmd({ do: 'page.untranslate' })}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5.5 3.5 2.5 6.5l3 3" /><path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" />
                  </svg>
                  <span>Show Original</span>
                </button>
              </div>
              <div class="tr-rule" />
              <div class="tr-foot">Translated on this PC. Nothing is sent anywhere.</div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
