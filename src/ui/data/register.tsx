// The data module's places in the overlay: the accounts under a sign-in box,
// the question after a sign-in, Bring Things Over (studio/05 §1.12, §2.3,
// §2.4). Owned by the data module.
//

import { registerPanel } from '../lib/registry'
import { FillList } from './FillList'
import { SaveQuestion } from './SaveQuestion'
import { ImportPanel } from './ImportPanel'
import './data.css'

const mine: Record<string, () => any> = {
  'data.fill': FillList,
  'data.save': SaveQuestion,
  'data.import': ImportPanel,
}

for (const [name, component] of Object.entries(mine)) registerPanel(name, component)
