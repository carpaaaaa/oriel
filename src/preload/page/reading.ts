// How far down its page a tab is, for the fill in its pill (studio/01 §2.17,
// §4.11; Tab.swift ScrollRelay). Reported at most once a frame, from a
// passive listener, and once as the document starts; and only when the
// hundredth changes, since each report is a redraw in the tab (at 120 Hz it
// was a third of a core). The main frame's only: page.ts loads this nowhere
// else. Owned by the tabs module.

import { ipcRenderer } from 'electron'

let last = -1
let waiting = false

function tell(): void {
  waiting = false
  const root = document.documentElement
  const y = window.scrollY || root?.scrollTop || 0
  const ceiling = Math.max(1, (root?.scrollHeight || 0) - window.innerHeight)
  const fraction = Math.round(Math.min(1, Math.max(0, y / ceiling)) * 100) / 100
  if (fraction === last) return
  last = fraction
  ipcRenderer.send('search:tab-reading', fraction)
}

window.addEventListener('scroll', () => {
  if (waiting) return
  waiting = true
  requestAnimationFrame(tell)
}, { passive: true })
// A page back from the back-forward cache says where it is again.
window.addEventListener('pageshow', e => { if (e.persisted) { last = -1; tell() } })
tell()
