// The field's, Find's and the tab list's places in the overlay. Owned by the field module.

import { registerLayer } from '../lib/registry'
import { cmd } from '../lib/store'
import { Field } from './Field'
import { FindBar } from './Find'
import { TabOffers } from './TabField'

registerLayer('field', () => (
  <div class="field-veil" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'field.close' }) }}>
    <Field place="overlay" />
  </div>
))

registerLayer('find', () => <FindBar />)

// The list under the tab whose address is being typed in it.
registerLayer('tabOffers', () => <TabOffers />)
