// Keys in the tab switcher (studio/06 §1.11 note.switcher; TabSwitcher.swift):
// always there, with Ctrl+Tab up and Ctrl still held, Ctrl+W closes the card
// it is on as Ctrl+W closes a tab, Ctrl+R loads its page again and Ctrl+M
// turns its sound off or on again. Without the switcher each key is what
// it was before (chained, never taken from the module that had it).

import { findAction, shortcut, type Action } from '../keys'
import { model, type WindowRecord } from '../model/model'
import { runtimes } from '../views/tabs'

function card(win: WindowRecord): string | null {
  const s = win.switcher
  return s ? s.cards[s.index] ?? null : null
}

const jobs: [string, (win: WindowRecord, id: string) => void][] = [
  ['Ctrl+W', (win, id) => {
    const s = win.switcher!
    model.closeTab(win, id)
    if (!win.switcher) return
    const cards = s.cards.filter(x => x !== id && model.tabs.has(x))
    if (cards.length < 2) { model.switchEnd(win, true); return }
    win.switcher = { cards, index: Math.min(s.index, cards.length - 1) }
    model.touch(win, ['switcher'])
  }],
  ['Ctrl+R', (_win, id) => runtimes.get(id)?.reload()],
  ['Ctrl+M', (_win, id) => { const t = model.tabs.get(id); if (t) model.updateTab(id, { muted: !t.muted }) }],
]

for (const [key, job] of jobs) {
  const before: Action | undefined = findAction(key, 'first')
  shortcut(key, 'first', (c, k) => {
    const id = card(c.record)
    if (id) { job(c.record, id); return true }
    return before ? before(c, k) : false
  })
}
