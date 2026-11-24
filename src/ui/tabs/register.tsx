// The tabs module's parts of the interface for Settings' area B (studio/08 B):
// History › Archived Tabs…, and what comes with the rows that follow.

import { registerOutlet, registerPage } from '../lib/registry'
import { ArchivePage } from './ArchivePage'
import { HomeGrid } from './HomeGrid'
import './tabs.css'

registerPage('archive', ArchivePage)
registerOutlet('blank.over', HomeGrid)
