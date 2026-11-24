// The hide module's places in the overlay: the line at the page's foot while
// pointing (and what was said), and Hidden on This Site…. Owned by the hide module.

import { registerPanel } from '../lib/registry'
import { HIDE_BAR, HIDE_LIST } from '../../shared/modules/hide'
import { HideBar, HideList } from './Hidden'
import './hide.css'

registerPanel(HIDE_BAR, HideBar)
registerPanel(HIDE_LIST, HideList)
