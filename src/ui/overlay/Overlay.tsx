// The layer above the pages. Transparent; the main process sizes it to what
// floats right now (the field over a page, menus, the switcher...), so
// clicks everywhere else reach the page. What each kind of layer draws is
// registered by its module (lib/registry.ts).

import { createSignal, onMount, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type { OverlayLayer } from '../../shared/state'
import { layerFor, panelFor } from '../lib/registry'

export function OverlayRoot() {
  const [layer, setLayer] = createSignal<OverlayLayer>({ kind: 'none' })
  onMount(() => {
    window.search.onOverlay(setLayer)
    // A layer sent while this page was still loading would be lost: ask.
    void window.search.overlayNow().then(l => { if (l) setLayer(l) })
  })
  const component = () => {
    const l = layer()
    if (l.kind === 'none') return undefined
    if (l.kind === 'panel') return panelFor(l.name) ?? layerFor('panel')
    return layerFor(l.kind)
  }
  return (
    <Show when={component()}>
      {c => <Dynamic component={c()} layer={layer()} />}
    </Show>
  )
}
