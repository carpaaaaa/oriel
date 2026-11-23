// History, bookmarks, passwords, forms, import from other browsers (studio/05).
// Owned by the data module.

import { app } from 'electron'
import './store'
import './places'
import './forms'
import './passwords'
import '../import/panel'
import { bookmarks, history } from './store'
import { flushMeta } from './meta'

// Read at start, as the Mac does: a file that can't be read is set aside at once.
app.whenReady().then(() => { history(); bookmarks() })

app.on('before-quit', () => {
  // A title that changed after its visit was written waits for this.
  if (history().owesWrite) history().flush()
  flushMeta()
})
