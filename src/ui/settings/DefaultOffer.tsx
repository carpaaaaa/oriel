// The first launch's offer to be the default browser (Welcome.swift's
// "Links from other apps." page; studio/06 §1.1 general.default): the plate
// of the update at launch, once. Make Oriel the default opens Oriel's page
// in Windows Settings and says what to click there; once Windows has it
// (read again when Oriel comes back to the front), a tick and Done. The X
// and Escape put it away (settings/browser.ts).

import { onCleanup, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Symbol } from './symbols'

export function DefaultOffer() {
  const o = () => state.settings?.defaultOffer ?? null
  const dismiss = () => void cmd({ do: 'settings.do', id: 'default.dismiss' })
  const make = () => void cmd({ do: 'settings.do', id: 'general.default' })
  onMount(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); dismiss() } }
    window.addEventListener('keydown', key)
    onCleanup(() => window.removeEventListener('keydown', key))
  })
  return (
    <Show when={o()}>{v => (
      <div class="up-veil">
        <div class="up-plate df-plate" role="dialog" aria-label="Links from other apps.">
          <div class="up-head">
            <h2 class="up-title">Links from other apps.</h2>
            <button class="up-x" title="Not now   esc" aria-label="Close" onClick={dismiss}><Symbol name="xmark" size={11} weight="medium" /></button>
          </div>
          <p class="up-notes">A click in Outlook, in Slack, in a PDF: Windows sends it to whichever browser is the default. It can be this one.</p>
          <div class="up-foot">
            <Show when={v().isDefault} fallback={<>
              <Show when={v().asked}><span class="df-line">In Windows Settings, click Set default at the top</span></Show>
              <button class="pill-st filled up-go df-make" onClick={make}>Make Oriel the default</button>
            </>}>
              <span class="df-line df-done"><Symbol name="checkmark" size={11} weight="medium" />Oriel is the default browser</span>
              <button class="pill-st filled up-go df-ok" onClick={dismiss}>Done</button>
            </Show>
          </div>
        </div>
      </div>
    )}</Show>
  )
}
