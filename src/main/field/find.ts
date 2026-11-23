// Find on Page (studio/03 §6.1, Find.swift, Browser.swift:563-700): a pill in
// the page's top corner, in the overlay, asking Chromium's own find
// (webContents.findInPage) and counting what it answers.

import { Menu, type WebContents } from 'electron'
import { handle } from '../router'
import { model, type WindowRecord } from '../model/model'
import { registerSlice, controllerFor, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import type { FindState } from '../../shared/modules/field'
import { need } from '../context'
import { onAfterField, mem } from './commands'
import { PAGE_SCHEME } from '../address'

interface Finding extends FindState {
  /** The page being searched, and the answer it gave. */
  wc: WebContents | null
  matches: number
  active: number
  asked: boolean
}

const states = new WeakMap<WindowRecord, Finding>()
const fresh = (): Finding => ({ open: false, text: '', matchCase: false, wholeWords: false, status: null, missed: false, focus: 0, wc: null, matches: 0, active: 0, asked: false })

function findOf(c: WindowController): Finding {
  let f = states.get(c.record)
  if (!f) { f = fresh(); states.set(c.record, f) }
  return f
}

registerSlice('find', c => {
  const f = findOf(c)
  return { open: f.open, text: f.text, matchCase: f.matchCase, wholeWords: f.wholeWords, status: f.status, missed: f.missed, focus: f.focus } satisfies FindState
})

/** Room for the pill, 12 from the top and 14 from the right, with its shadow. */
const ROOM = { width: 470, height: 96 }

/** The page in front, when it is a web page Find can look in. */
function webPage(c: WindowController): WebContents | null {
  const tab = model.activeTab(c.record)
  if (!tab || tab.empty || tab.internal || tab.url.startsWith(PAGE_SCHEME + ':')) return null
  const wc = runtimes.get(tab.id)?.contents
  return wc && !wc.isDestroyed() ? wc : null
}

/** "3 of 17", "3 of 1000+", "No matches" (Browser.findStatus). */
function status(f: Finding): string | null {
  if (!f.text.trim() || !f.asked) return null
  if (f.wholeWords) return 'Whole words unavailable'
  if (!f.matches) return 'No matches'
  return f.matches > 1000 ? `${Math.min(f.active, 1000)} of 1000+` : `${f.active} of ${f.matches}`
}

function changed(c: WindowController): void {
  const f = findOf(c)
  f.status = status(f)
  f.missed = f.asked && !!f.text.trim() && f.matches === 0
  c.mark('find')
}

const listening = new WeakSet<WebContents>()
function listen(c: WindowController, wc: WebContents): void {
  if (listening.has(wc)) return
  listening.add(wc)
  const record = c.record
  wc.on('found-in-page', (_e, r) => {
    const f = states.get(record)
    const ctl = controllerFor(record.id)
    if (!f || !ctl || f.wc !== wc) return
    f.matches = r.matches
    if (r.activeMatchOrdinal) f.active = r.activeMatchOrdinal
    if (!r.matches) f.active = 0
    f.asked = true
    changed(ctl)
  })
  // A new page in the same tab: the words are asked of it again.
  wc.on('did-finish-load', () => {
    const f = states.get(record)
    const ctl = controllerFor(record.id)
    if (f?.open && f.wc === wc && ctl && f.text.trim()) ask(ctl, true)
  })
}

/** Keep what the page had selected, to put it back when Find closes. In a
 * world of Search's own, out of the page's reach. */
const WORLD = 1999
function keepSelection(wc: WebContents): void {
  void wc.executeJavaScriptInIsolatedWorld(WORLD, [{
    code: `(() => { const s = getSelection(); window.__searchKept = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null })()`,
  }]).catch(() => {})
}
function restoreSelection(wc: WebContents): void {
  void wc.executeJavaScriptInIsolatedWorld(WORLD, [{
    code: `(() => { const r = window.__searchKept; const s = getSelection(); if (!s) return; s.removeAllRanges(); if (r) s.addRange(r); window.__searchKept = null })()`,
  }]).catch(() => {})
}

/** Ask the page. `afresh`: new words, or a new page: a new find session. */
function ask(c: WindowController, afresh: boolean, forward = true): void {
  const f = findOf(c)
  const wc = webPage(c)
  if (f.wc && f.wc !== wc && !f.wc.isDestroyed()) f.wc.stopFindInPage('clearSelection')
  if (f.wc !== wc) afresh = true
  f.wc = wc
  if (!wc) { f.asked = false; changed(c); return }
  listen(c, wc)
  if (!f.text.trim()) {
    wc.stopFindInPage('clearSelection')
    f.asked = false
    f.matches = 0
    f.active = 0
    changed(c)
    return
  }
  wc.findInPage(f.text, { forward, findNext: afresh, matchCase: f.matchCase })
}

function show(c: WindowController, focus: boolean): void {
  const f = findOf(c)
  if (!f.open || !webPage(c)) return
  // The field over the page has the overlay; Find comes back when it goes.
  if (mem(c).editing) return
  const id = c.record.active[c.record.space]
  // The page's view is laid exactly where the page's card is.
  const card = id ? runtimes.get(id)?.view?.getBounds() : null
  if (!card || !card.width) return
  const width = Math.min(ROOM.width, card.width)
  c.sendOverlay({ kind: 'find' } as never)
  c.setOverlayRegion({ x: card.x + card.width - width, y: card.y, width, height: Math.min(ROOM.height, card.height) }, focus)
}

export function openFind(c: WindowController): boolean {
  const wc = webPage(c)
  if (!wc) return false
  const f = findOf(c)
  if (!f.open) keepSelection(wc)
  f.open = true
  f.focus++
  changed(c)
  show(c, true)
  if (f.text.trim() && f.wc !== wc) ask(c, true)
  return true
}

export function closeFind(c: WindowController): boolean {
  const f = findOf(c)
  if (!f.open && !f.text && !f.asked) return false
  const wc = f.wc
  f.open = false
  f.asked = false
  f.matches = 0
  f.active = 0
  f.wc = null
  if (wc && !wc.isDestroyed()) { wc.stopFindInPage('clearSelection'); restoreSelection(wc) }
  if ((c.overlayLayer.kind as string) === 'find') c.sendOverlay({ kind: 'none' })
  changed(c)
  c.focusPage()
  return true
}

export function findIsOpen(c: WindowController): boolean { return findOf(c).open }

/** Next or previous; false when Find isn't up, for the key to go on to the page. */
export function step(c: WindowController, forward: boolean): boolean {
  const f = findOf(c)
  if (!f.open) return false
  if (f.text.trim()) ask(c, false, forward)
  return true
}

handle('find.open', (_a, ctx) => openFind(need(ctx)))
handle('find.close', (_a, ctx) => closeFind(need(ctx)))
handle('find.step', ({ forward }, ctx) => step(need(ctx), forward))
handle('find.input', ({ text }, ctx) => {
  const c = need(ctx)
  const f = findOf(c)
  if (f.text === text) return
  f.text = text
  ask(c, true)
  changed(c)
})
handle('find.options', ({ matchCase, wholeWords }, ctx) => {
  const c = need(ctx)
  const f = findOf(c)
  if (matchCase != null) f.matchCase = matchCase
  if (wholeWords != null) f.wholeWords = wholeWords
  ask(c, true)
  changed(c)
})

// It stays open from tab to tab, and asks the new one (Find.swift).
model.on('window-changed', (id: string, slices: string[]) => {
  if (!slices.includes('activeID') && !slices.includes('space')) return
  const c = controllerFor(id)
  const f = c && states.get(c.record)
  if (!c || !f?.open) return
  setTimeout(() => {
    if (!f.open) return
    if (webPage(c)) { show(c, false); ask(c, true) }
    else if ((c.overlayLayer.kind as string) === 'find') c.sendOverlay({ kind: 'none' })
  }, 0)
})

onAfterField(c => { if (findOf(c).open) show(c, false) })

/** The "…" menu: Match case, and Whole words (Chromium's find has none:
 * off and unavailable, as the Mac has it for a PDF). */
handle('find.menu', ({ x, y }, ctx) => {
  const c = need(ctx)
  const f = findOf(c)
  const at = c.overlay.getBounds()
  Menu.buildFromTemplate([
    { label: 'Match case', type: 'checkbox', checked: f.matchCase, toolTip: 'Match uppercase and lowercase letters exactly.',
      click: () => { f.matchCase = !f.matchCase; ask(c, true); changed(c) } },
    { label: 'Whole words', type: 'checkbox', checked: f.wholeWords, enabled: f.wholeWords, toolTip: 'Match complete words. This option is unavailable for PDF pages.',
      click: () => { f.wholeWords = !f.wholeWords; ask(c, true); changed(c) } },
  ]).popup({ window: c.base as never, x: at.x + x, y: at.y + y })
})
