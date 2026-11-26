// The extensions' places in the interface (studio/04 §2): the puzzle and the
// pinned buttons in the column's foot (or at the end of the tab strip with
// tabs on top), and in the overlay the puzzle's list, the card behind a
// popup, the page that manages extensions, and the bar on the Web Store; in
// Oriel's Settings, the Extensions section. Owned by the extensions module.

import { lazy } from 'solid-js'
import { registerOutlet, registerPage, registerPanel } from '../lib/registry'
import { Buttons } from './Buttons'
import { List, PopupFrame } from './List'
import { Manage } from './Manage'
import { StoreBar } from './StoreBar'
import './extensions.css'

registerPage('settings.extensions', lazy(() => import('./SettingsPage').then(m => ({ default: m.ExtensionsSettings }))))

registerOutlet('sidebar.foot', () => <Buttons where="foot" />)
registerOutlet('strip.end', () => <Buttons where="strip" />)
registerPanel('ext.list', List)
registerPanel('ext.popup', PopupFrame)
registerPanel('ext.manage', Manage)
registerPanel('ext.store', StoreBar)
