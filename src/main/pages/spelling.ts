// Correct spelling as you type (studio/06 §1.5, autocorrect): on the Mac,
// macOS's own autocorrect in pages. Chromium on Windows corrects nothing by
// itself; the nearest is its spelling checker, the misspelt word underlined
// with suggestions in the page's menu, on or off for every page at once.

import { onPageSession } from '../views/tabs'
import { model } from '../model/model'
import { pref } from './facts'

const sessions = new Set<Electron.Session>()
const apply = (s: Electron.Session) => { try { s.setSpellCheckerEnabled(pref<boolean>('autocorrect') !== false) } catch {} }

onPageSession(s => { sessions.add(s); apply(s) })

let was: boolean | null = null
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs')) return
  const now = pref<boolean>('autocorrect') !== false
  if (now === was) return
  was = now
  sessions.forEach(apply)
})
