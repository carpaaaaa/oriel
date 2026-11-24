// Oriel's bar on an extension's page in the Chrome Web Store (StoreOffer,
// studio/04 §2.2 way 2, §2.9): a capsule at the foot of the page, the
// extension's icon and name and "Add to Oriel"; "Adding…" while it comes;
// "Added to Oriel" and Remove once in. It measures itself so the overlay's
// region is just its size, and the page keeps every other click.

import { createEffect, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Puzzle } from '../lib/icons'
import { brand } from '../../shared/brand'

export function StoreBar() {
  const offer = () => state.ext?.store ?? null
  const busy = () => { const o = offer(); return !!o && (state.ext?.busy ?? []).includes(o.id) }
  let bar: HTMLDivElement | undefined
  createEffect(() => {
    const o = offer()
    void o?.name; void o?.icon; void o?.installed; void busy()
    requestAnimationFrame(() => { if (bar && offer()) void cmd({ do: 'ext.storeFit', width: bar.getBoundingClientRect().width }) })
  })
  return (
    <Show when={offer()}>
      {o => (
        <div class="ext-store-region">
          <div class="ext-store" ref={bar} data-ext={o().id}>
            <Show when={o().icon} fallback={<span class="ext-store-glyph"><Puzzle size={13} /></span>}>
              <img class="ext-store-icon" src={o().icon!} width={18} height={18} alt="" draggable={false} />
            </Show>
            <span class="ext-store-name">{o().name || `Add this extension to ${brand.name}`}</span>
            <Show when={busy()}>
              <span class="ext-store-state">Adding…</span>
              <span class="ext-spin ext-store-ring" />
            </Show>
            <Show when={!busy() && o().installed}>
              <span class="ext-store-state">Added to {brand.name}</span>
              <button class="ext-store-button ext-store-remove" onClick={() => void cmd({ do: 'ext.remove', id: o().id })}>Remove</button>
            </Show>
            <Show when={!busy() && !o().installed}>
              <button class="ext-store-button" onClick={() => void cmd({ do: 'ext.install', text: o().id })}>Add to {brand.name}</button>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}
