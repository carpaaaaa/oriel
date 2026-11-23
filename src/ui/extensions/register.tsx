// The extensions' places in the interface (studio/04 §2): the puzzle and the
// pinned buttons in the column's foot (or at the end of the tab strip with
// tabs on top), and in the overlay the puzzle's list, the card behind a
// popup, and the page that manages extensions. Owned by the extensions module.

import { registerOutlet, registerPanel } from '../lib/registry'
import { Buttons } from './Buttons'
import { List, PopupFrame } from './List'
import { Manage } from './Manage'
import './extensions.css'

registerOutlet('sidebar.foot', () => <Buttons where="foot" />)
registerOutlet('strip.end', () => <Buttons where="strip" />)
registerPanel('ext.list', List)
registerPanel('ext.popup', PopupFrame)
registerPanel('ext.manage', Manage)
