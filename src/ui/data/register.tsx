// The data module's places: the accounts under a sign-in box, the question
// after a sign-in, Bring Things Over (studio/05 §1.12, §2.3, §2.4) in the
// overlay; the bookmark button up beside the window's buttons (where.ts), and
// its list, its right-click menu or its card in the overlay (studio/05 §3.2).
// Owned by the data module.

import { registerOutlet, registerPage, registerPanel } from '../lib/registry'
import { HistoryPage } from './HistoryPage'
import { FillList } from './FillList'
import { SaveQuestion } from './SaveQuestion'
import { ImportPanel } from './ImportPanel'
import { BookmarkDoor, BookmarksPopover } from './BookmarkDoor'
import './data.css'

const mine: Record<string, () => any> = {
  'data.fill': FillList,
  'data.save': SaveQuestion,
  'data.import': ImportPanel,
  'data.bookmarks': BookmarksPopover,
}

for (const [name, component] of Object.entries(mine)) registerPanel(name, component)

registerOutlet('sidebar.foot', () => <BookmarkDoor where="foot" />)
registerOutlet('strip.end', () => <BookmarkDoor where="strip" />)
registerOutlet('chrome.end', () => <BookmarkDoor where="corner" />)

// oriel://history
registerPage('history', HistoryPage)
