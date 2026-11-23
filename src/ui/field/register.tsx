// The field's and Find's places in the overlay. Owned by the field module.

import { registerLayer } from '../lib/registry'
import { cmd } from '../lib/store'
import { Field } from './Field'
import { FindBar } from './Find'

registerLayer('field', () => (
  <div class="veil" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'field.close' }) }}>
    <Field place="overlay" />
  </div>
))

registerLayer('find', () => <FindBar />)
