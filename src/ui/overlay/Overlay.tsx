// The layer above the pages. Transparent; the main process sizes it to what
// floats right now (the field over a page, menus, the switcher...), so
// clicks everywhere else reach the page.

import { createSignal, Match, onMount, Switch } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'
import { cmd } from '../lib/store'
import { Field } from '../field/Field'

export function OverlayRoot() {
  const [layer, setLayer] = createSignal<OverlayLayer>({ kind: 'none' })
  onMount(() => window.search.onOverlay(setLayer))
  return (
    <Switch>
      <Match when={layer().kind === 'field'}>
        <div class="veil" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'field.close' }) }}>
          <Field place="overlay" />
        </div>
      </Match>
    </Switch>
  )
}
