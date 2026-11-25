// The tabs module's parts of the interface for Settings' area B (studio/08 B):
// History › Archived Tabs…, and what comes with the rows that follow.

import { registerOutlet, registerPage, registerPanel } from '../lib/registry'
import { ArchivePage } from './ArchivePage'
import { HomeGrid } from './HomeGrid'
import { AskPanel } from './AskPanel'
import { PrivateNote } from './PrivateNote'
import './tabs.css'

registerPage('archive', ArchivePage)
registerOutlet('blank.over', HomeGrid)
registerOutlet('blank.over', PrivateNote)
registerPanel('tabs.ask', AskPanel)
