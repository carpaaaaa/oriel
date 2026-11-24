// The update at launch, over the window (the user's wish, 24 Nov 2026): a
// plate with the new version and its notes in brief, Update and Restart,
// and an X that puts it away until a newer version comes (updates.dismissed).
// Measures of the Plate (studio/02 §4.6): 460 wide as the Mac's What's New
// card, padding 22, title 17 semibold, corners 16, the panels' veil.

import { onCleanup, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Symbol } from './symbols'

export function UpdatePopup() {
  const u = () => state.settings?.update ?? null
  const title = () => {
    const v = u()
    if (!v) return ''
    return v.fetching ? `Oriel ${v.version} is downloading…` : v.ready ? `Oriel ${v.version} is ready` : `Oriel ${v.version} is out`
  }
  const dismiss = () => void cmd({ do: 'update.dismiss' })
  onMount(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); dismiss() } }
    window.addEventListener('keydown', key)
    onCleanup(() => window.removeEventListener('keydown', key))
  })
  return (
    <Show when={u()}>{v => (
      <div class="up-veil">
        <div class="up-plate" role="dialog" aria-label={title()}>
          <div class="up-head">
            <h2 class="up-title">{title()}</h2>
            <button class="up-x" title="Not now   esc" aria-label="Close" onClick={dismiss}><Symbol name="xmark" size={11} weight="medium" /></button>
          </div>
          <p class="up-notes">{v().notes ?? 'A newer Oriel, with what has changed since yours.'}</p>
          <div class="up-foot">
            <button class="pill-st filled up-go" disabled={v().fetching} onClick={() => void cmd({ do: 'update.now' })}>
              {v().fetching ? 'Downloading…' : 'Update and Restart'}
            </button>
          </div>
        </div>
      </div>
    )}</Show>
  )
}
