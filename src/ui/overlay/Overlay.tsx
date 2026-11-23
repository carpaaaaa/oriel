// The layer above the pages. Transparent; the main process sizes it to what
// floats right now (the field over a page, menus, the switcher...), so
// clicks everywhere else reach the page. What each kind of layer draws is
// registered by its module (lib/registry.ts).

import { createSignal, onMount, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { OverlayLayer } from '../../shared/state'
import { layerFor } from '../lib/registry'

export function OverlayRoot() {
  const [layer, setLayer] = createSignal<OverlayLayer>({ kind: 'none' })
  onMount(() => window.search.onOverlay(setLayer))
  return (
    <Show when={layer().kind !== 'none' && layerFor(layer().kind)}>
      {c => <Dynamic component={c()} layer={layer()} />}
    </Show>
  )
}
