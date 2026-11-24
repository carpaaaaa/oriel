// Translate Page in the interface (studio/03 §6.3): the sign for the tab in
// front, in the column's helm or at the end of the tab strip, and its menu
// in the overlay. Owned by the translate module.

import { registerOutlet, registerPanel } from '../lib/registry'
import { Sign, TranslateMenu } from './Sign'
import './translate.css'

registerOutlet('sidebar.helm', () => <Sign where="helm" />)
registerOutlet('strip.end', () => <Sign where="strip" />)
registerPanel('translate.menu', TranslateMenu)
