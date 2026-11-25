// The field's, Find's and the tab list's places in the overlay. Owned by the field module.

import { registerLayer } from '../lib/registry'
import { cmd, state } from '../lib/store'
import { Field } from './Field'
import { FindBar } from './Find'
import { TabOffers } from './TabField'
import { LineOffers } from './AddressLine'

// A click on the veil puts the field away (Omnibox.swift:87-94). With The
// field in the middle of the window the veil is the whole window's and the
// field stands 24% down (`high`).
registerLayer('field', () => (
  <div class="field-veil" classList={{ high: !!state.field.high }}
    onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'field.close' }) }}>
    <Field place="overlay" />
  </div>
))

registerLayer('find', () => <FindBar />)

// The list under the tab whose address is being typed in it.
registerLayer('tabOffers', () => <TabOffers />)

// The places under the address line's row (studio/03 §1.6).
registerLayer('lineOffers', () => <LineOffers />)
