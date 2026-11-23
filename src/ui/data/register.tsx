// The data module's places in the overlay: the accounts under a sign-in box,
// the question after a sign-in, Bring Things Over (studio/05 §1.12, §2.3,
// §2.4). Owned by the data module.
//
// The overlay draws one layer kind at a time; panels are told apart by name.
// Another module's panel registered before this one still gets its names.

import { registerLayer, layerFor } from '../lib/registry'
import { Dynamic } from 'solid-js/web'
import { Show } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'
import { FillList } from './FillList'
import { SaveQuestion } from './SaveQuestion'
import { ImportPanel } from './ImportPanel'
import './data.css'

const mine: Record<string, () => any> = {
  'data.fill': FillList,
  'data.save': SaveQuestion,
  'data.import': ImportPanel,
}

const before = layerFor('panel')
registerLayer('panel', props => {
  const name = () => (props.layer as Extract<OverlayLayer, { kind: 'panel' }>).name
  return (
    <Show when={mine[name()]} fallback={before ? <Dynamic component={before} layer={props.layer} /> : null}>
      {c => <Dynamic component={c()} />}
    </Show>
  )
})
