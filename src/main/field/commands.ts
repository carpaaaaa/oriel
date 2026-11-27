// The field: opening it, typing, the list, Return, Escape (studio/03 §1.1-1.5,
// §4.4 point 6). Browser.swift's "guessing" and "the address field" parts,
// one window at a time. Owned by the field module.

import { handle, run } from '../router'
import { model, type WindowRecord } from '../model/model'
import type { WindowController } from '../views/window'
import { controllerFor } from '../views/window'
import { runtimeFor } from '../views/tabs'
import { addressURL, fileURL, identity, pretty, reachable, shownAddress } from '../address'
import type { Suggestion } from '../../shared/state'
import type { FieldMode, SiteView } from '../../shared/modules/field'
import { need } from '../context'
import { destination, engineURL, shiftTemplate, siteMatch, siteURL, type SearchSite } from './engines'
import {
  EngineSuggester, engineQuestion, openPages, placeOffers, recentPlaces, SUGGEST_MOST, suggestionRow, switcherFallback, tabOffers,
} from './suggest'
import { cancelTabEdit, tabEditing } from './tabedit'
import { placeLine } from './line'

/** What a window's field holds besides what it shows (Browser's fields). */
interface Memory {
  typed: string
  offers: Suggestion[]
  ending: string | null
  picked: number | null
  /** The row was picked by what was typed (⌘T finds your open tabs), not by
   * the arrow keys: the field keeps what was typed (FieldState.pickedByTyping). */
  pickedByTyping: boolean
  editing: boolean
  summoning: boolean
  /** ⌘T's floating field is up over a page for a tab that doesn't exist yet
   * (Browser.launching, studio/01 §3.5): Return opens a new tab. */
  launching: boolean
  /** What ⌘T's field was put away with, for the next ⌘T (Browser.launchDraft). */
  launchDraft: string
  /** Raised by New Tab in Group: the tab Return makes goes to its end. */
  launchGroup: string | null
  /** ⌘L's field is the address line's, in its row and not over the page
   * (AddressLine.swift, Browser.editingInline, studio/03 §1.6). */
  inline: boolean
  /** The line's place in the interface, for its places to hang under. */
  anchor: { x: number; y: number; width: number; height: number } | null
  /** ⌘K raised with Ctrl still down: Ctrl let go of takes the row walked to. */
  summonHeld: boolean
  cycling: boolean
  chip: SearchSite | null
  offer: SearchSite | null
  refusals: number
  sync: number
  focus: number
  selectFrom: number | null
  /** The text the interface was last told to show. */
  shown: string
  serial: number
  pending: Promise<void>
  engineWords: { asked: string; words: string[] }
  suggester: EngineSuggester
  /** What was typed on each blank tab (Tab.draft), kept while away from it. */
  drafts: Map<string, string>
  lastActive: string | null
  /** Keys typed between ⌘L/⌘T/⌘K and the field taking them (holdKey). */
  focusAsked: number | null
  held: Electron.Input[]
}

const memories = new WeakMap<WindowRecord, Memory>()

export function mem(c: WindowController): Memory {
  let m = memories.get(c.record)
  if (!m) {
    m = {
      typed: '', offers: [], ending: null, picked: null, pickedByTyping: false, editing: false, summoning: false, summonHeld: false, cycling: false,
      launching: false, launchDraft: '', launchGroup: null, inline: false, anchor: null,
      chip: null, offer: null, refusals: 0, sync: 0, focus: 0, selectFrom: null, shown: '', serial: 0, pending: Promise.resolve(),
      engineWords: { asked: '', words: [] }, suggester: new EngineSuggester(), drafts: new Map(),
      lastActive: c.record.active[c.record.space] ?? null, focusAsked: null, held: [],
    }
    memories.set(c.record, m)
    // The window's field state, whole, from the start.
    queueMicrotask(() => publish(c))
  }
  return m
}

const activeOf = (c: WindowController) => model.activeTab(c.record)
export const blankInFront = (c: WindowController) => activeOf(c)?.empty ?? true

/** The field on screen: raised over a page, or a blank tab's own. */
export function fieldShowing(c: WindowController): boolean {
  return mem(c).editing || blankInFront(c)
}

function mode(c: WindowController, m: Memory): FieldMode {
  if (m.summoning) return 'switcher'
  if (m.launching) return 'newTab'
  if (m.editing && !blankInFront(c)) return 'thisTab'
  return 'blank'
}

const placeholders: Record<FieldMode, string> = {
  blank: 'Enter a web address',
  newTab: 'New tab: enter a web address',
  thisTab: 'This tab: enter a web address',
  switcher: 'Switch to an open tab',
}
const labels: Record<FieldMode, string> = {
  blank: 'Address', newTab: 'Address, new tab', thisTab: 'Address, this tab', switcher: 'Switch to an open tab',
}

function siteView(s: SearchSite | null): SiteView | null {
  return s ? { name: s.name, host: s.host } : null
}

/** Typed plus whatever the field is quietly finishing; a row walked to shows
 * itself, one picked by typing leaves what was typed (Browser.completed). */
function completed(m: Memory): string {
  if (m.picked != null && m.offers[m.picked] && !m.pickedByTyping) return m.offers[m.picked].title
  return m.typed + (m.ending ?? '')
}

/** Walked to, or let go of: the field shows the row again (Browser.picked). */
function pick(m: Memory, n: number | null): void {
  m.pickedByTyping = false
  m.picked = n
}

/** The field over a page centred on the whole window, higher up (Settings ›
 * The field in the middle of the window, Browser.fieldOnWindow). */
function onWindow(c: WindowController, m: Memory): boolean {
  return !!model.pref<boolean>('field.window') && m.editing && !blankInFront(c)
}

/** ⌘K's quiet line when it has no page to offer. */
function note(m: Memory): string | null {
  if (!m.summoning || m.offers.length) return null
  return m.typed.trim() ? 'No open tab matches' : 'No other tabs open'
}

/** Into the window's state. `rewrite`: the text was changed here, not by
 * typing, so the interface writes it into its input. */
export function publish(c: WindowController, rewrite = false, selectFrom?: number | null): void {
  const m = mem(c)
  const shown = completed(m)
  if (rewrite) {
    m.sync++
    m.selectFrom = selectFrom === undefined ? m.typed.length : selectFrom
  }
  m.shown = shown
  const md = mode(c, m)
  c.record.field = {
    open: m.editing,
    target: md === 'thisTab' ? 'here' : 'new',
    text: m.typed,
    suggestions: m.offers,
    selected: m.picked ?? -1,
    refused: m.refusals,
    mode: md,
    ending: m.ending,
    shown,
    sync: m.sync,
    focus: m.focus,
    selectFrom: m.selectFrom,
    offer: siteView(m.offer),
    chip: siteView(m.chip),
    note: note(m),
    // The address line's field says what the blank tab's does (studio/03 §1.1).
    placeholder: m.chip ? `Search ${m.chip.name}` : placeholders[m.editing && m.inline ? 'blank' : md],
    label: labels[m.editing && m.inline ? 'blank' : md],
    high: onWindow(c, m),
    inline: m.editing && m.inline,
  }
  model.touch(c.record, ['field'])
  placeLine(c)
}

// guessing (Browser.guess)

function stopEngine(m: Memory): void {
  m.suggester.stop()
  m.engineWords = { asked: '', words: [] }
}

/** Every key asks again: the list and the grey ending answer what is typed. */
function guess(c: WindowController, deleting = false): Promise<void> {
  const m = mem(c)
  const serial = ++m.serial
  const work = (async () => {
    if (m.summoning || !m.typed.trim()) stopEngine(m)
    if (m.summoning) {
      m.offers = openPages(c.record, m.typed)
      const fallback = switcherFallback(m.typed, blankInFront(c))
      if (fallback) m.offers.push(fallback)
      m.ending = null
      m.offer = null
      pick(m, m.offers.length ? 0 : null)
      return
    }
    if (m.chip) {
      m.offer = null
      m.ending = null
      pick(m, null)
      const words = m.typed.trim()
      const url = siteURL(m.chip, words)
      m.offers = url ? [{ kind: 'search', how: 'search', title: words, detail: m.chip.name, url }] : []
      if (words) askEngine(c)
      return
    }
    if (!m.typed.trim()) {
      // ⌘T's field before anything is typed: the last few places, none picked.
      m.offers = m.launching && model.pref<boolean>('newtab.recent') ? recentPlaces(c.record, !!activeOf(c)?.shy || c.record.shy) : []
      m.ending = null
      pick(m, null)
      m.offer = null
      return
    }
    const typed = m.typed
    const offer = siteMatch(typed)
    const { offers, ending } = await placeOffers(typed)
    if (serial !== m.serial) return
    m.offer = offer
    m.offers = offers
    m.ending = deleting ? null : ending
    pick(m, null)
    if (m.launching && model.pref<boolean>('newtab.arc')) offerTabs(c, m, deleting)
    if (model.pref<boolean>('search.returnTop') && m.picked == null) pickTop(m)
    askEngine(c)
  })()
  m.pending = work.catch(e => console.warn('[field] guess', e))
  return m.pending
}

/** Return takes the top suggestion (Settings › Browsing, search.returnTop;
 * Browser.pickTop): the place on top of the list is picked as you type, so
 * Return goes to it rather than searching for the words. The field keeps
 * what was typed and ↑ lets go of the row, in every field, the one raised
 * from any app too (Search 1.0.22). Only a place: a search or a command on
 * top keeps Return as it is, an address typed out goes where it says, and
 * one the grey ending finishes goes where the field shows. */
function pickTop(m: Memory): void {
  const top = m.offers[0]
  if (!top || m.ending != null || m.chip || addressURL(m.typed)) return
  if (!['open', 'visited', 'bookmark', 'known', 'searched'].includes(top.how ?? '')) return
  pick(m, 0)
  m.pickedByTyping = true
}

/** ⌘T finds your open tabs (Browser.offerTabs, Browser.swift:7863-7880): the
 * open tabs and pins that answer go above the places, and the first is
 * picked as you type, so Return goes to it; the rest of its address follows
 * in grey when what was typed starts it. */
function offerTabs(c: WindowController, m: Memory, deleting: boolean): void {
  const found = tabOffers(c.record, m.typed)
  if (!found.length) return
  const shown = new Set(found.map(o => identity(o.url)))
  m.offers = [...found, ...m.offers.filter(o => !shown.has(identity(o.url)))]
  pick(m, 0)
  m.pickedByTyping = true
  const words = m.typed.trim()
  const address = pretty(found[0].url)
  m.ending = !deleting && words && words === m.typed && address.toLowerCase().startsWith(words.toLowerCase()) && address.length > words.length
    ? address.slice(words.length) : null
}

/** The engine's words under the field's own rows; last time's that still
 * fit stay until it answers (Browser.askEngine). */
function askEngine(c: WindowController): void {
  const m = mem(c)
  const shy = !!activeOf(c)?.shy || c.record.shy
  const question = engineQuestion(m.typed, { summoning: m.summoning, shy, chip: m.chip })
  if (!question) { stopEngine(m); return }
  const words = m.typed.trim()
  const lower = words.toLowerCase()
  const keys = new Set(m.offers.map(o => o.title.toLowerCase()))
  const still = m.engineWords.words.filter(w => w.toLowerCase().startsWith(lower) && w.toLowerCase() !== lower && !keys.has(w.toLowerCase()))
  if (still.length) m.offers = [...m.offers, ...engineRows(still, m.chip)]
  m.suggester.ask(question, words, answer => {
    if (m.typed.trim() !== words || !fieldShowing(c)) return
    if (!engineQuestion(m.typed, { summoning: m.summoning, shy, chip: m.chip })) return
    const mine = m.offers.filter(o => o.how !== 'suggested')
    if (m.picked != null && m.picked >= mine.length) return
    m.engineWords = { asked: words, words: answer }
    const have = new Set(mine.map(o => o.title.toLowerCase()))
    m.offers = [...mine, ...engineRows(answer.filter(w => !have.has(w.toLowerCase())), m.chip)]
    publish(c)
  })
}

function engineRows(words: string[], chip: SearchSite | null): Suggestion[] {
  return words.slice(0, SUGGEST_MOST).map(w => suggestionRow(w, chip)).filter((s): s is Suggestion => !!s)
}

// opening

/** The words in the field now up, for another of its keys to carry on with. */
function wordsToCarry(c: WindowController, m: Memory): string | null {
  const active = activeOf(c)
  const page = active && !active.empty ? shownAddress(active.url) : ''
  if (!fieldShowing(c) || !m.typed.trim() || !(m.summoning || m.launching || m.typed !== page)) return null
  return m.typed
}

/** The field takes the keys. Over a page the overlay is asked to show it
 * only once the window's state has gone out (its patch is sent on the next
 * turn, queued now): a field made before then came up with the words of
 * before, and the patch arriving after selected them over keys typed. */
function askFocus(c: WindowController, m: Memory): void {
  m.focus++
  m.focusAsked = Date.now()
  // A blank tab's field and the address line's are in the interface, not over the page.
  if (blankInFront(c) || m.inline) {
    if (c.overlayLayer.kind === 'field') c.sendOverlay({ kind: 'none' })
    c.ui.webContents.focus()
    return
  }
  c.mark('field')
  setTimeout(() => {
    if (!m.editing || blankInFront(c) || c.base.isDestroyed()) return
    c.sendOverlay({ kind: 'field' })
    // In the middle of the window: the veil is over the column too.
    if (onWindow(c, m)) {
      const { width, height } = c.base.getContentBounds()
      c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
    }
  }, 0)
}

/** ⌘L: the page's address, selected whole; pressed again, put away. `inline`:
 * in the address line's row, where a click on it or ⌘L with it shown brings
 * the same field (studio/03 §1.6); a blank tab's field is its own. */
export function edit(c: WindowController, inline = false): void {
  const m = mem(c)
  if (m.editing && !m.summoning && !m.launching && !blankInFront(c)) { putAway(c); return }
  // From ⌘T or ⌘K, what was typed stays, for this page now.
  const words = wordsToCarry(c, m)
  m.summoning = false
  m.cycling = false
  m.launching = false
  const active = activeOf(c)
  m.typed = words ?? (active && !active.empty ? shownAddress(active.url) : '')
  m.editing = true
  m.inline = inline && !blankInFront(c)
  if (m.inline && tabEditing(c)) cancelTabEdit(c)
  pick(m, null)
  m.ending = null
  void guess(c, true).then(() => publish(c))
  askFocus(c, m)
  // A draft carried on in a blank tab is not typed over: the caret after it.
  publish(c, true, blankInFront(c) && m.typed ? m.typed.length : null)
}

/** ⌘K (Browser.searchTabsKey). `held`: Ctrl is still down. */
export function searchTabsKey(c: WindowController, held: boolean): void {
  const m = mem(c)
  if (m.summoning && m.editing && m.summonHeld && m.offers.length) {
    m.cycling = true
    walk(c, 1)
  } else if (m.summoning && m.editing) {
    if (!blankInFront(c)) putAway(c); else dismiss(c)
  } else {
    summon(c, held)
  }
}

function summon(c: WindowController, held: boolean): void {
  const m = mem(c)
  const words = wordsToCarry(c, m) ?? ''
  m.chip = null
  m.launching = false
  m.inline = false
  m.summoning = true
  m.summonHeld = held
  m.typed = words
  m.editing = true
  void guess(c)
  askFocus(c, m)
  publish(c, true, null)
}

/** Ctrl let go of after ⌘K pressed on with it held: go where the walk landed. */
export function controlUp(c: WindowController): void {
  const m = memories.get(c.record)
  if (!m || !m.summonHeld) return
  m.summonHeld = false
  if (!m.cycling) return
  m.cycling = false
  if (m.picked != null) void submit(c, {})
}

/** A blank tab made by ⌘T (the tabs module calls this): its field takes the
 * keys, empty. A blank tab reused has its draft cleared, so repeated ⌘T
 * never leaves a row of identical empty tabs (Browser.newTab). */
export function openField(c: WindowController, target: 'new' | 'here'): void {
  if (target === 'here') { edit(c); return }
  const m = mem(c)
  noticeActive(c)
  m.summoning = false
  m.launching = false
  m.chip = null
  m.editing = false
  const active = activeOf(c)
  if (active?.empty && (m.typed || m.drafts.has(active.id))) {
    m.typed = ''
    m.drafts.delete(active.id)
    m.offers = []
    m.ending = null
    pick(m, null)
    m.offer = null
    m.serial++
    stopEngine(m)
  }
  askFocus(c, m)
  publish(c, true, m.typed.length)
}

/** Whether ⌘T would raise the floating field over the page in front
 * (Browser.launch's guard, Browser.swift:4846-4853): the setting on, a tab
 * in front that isn't blank, and no peek over it. Oriel has no extension
 * new tab pages, so the Mac's last condition never holds. */
export function floats(c: WindowController): boolean {
  const tab = activeOf(c)
  const peek = c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'pages.peek'
  return !!model.pref<boolean>('newtab.floating') && !!tab && !tab.empty && !peek
}

/** ⌘T, the + button, the column's New tab and its menu (Browser.launch,
 * Browser.swift:4841-4872; studio/01 §3.5). With the floating field on and a
 * page in front, the field comes up over that page and no tab is made: the
 * tab is made by Return. Again while it is up, it is put away, as the key
 * that raised it. False when an ordinary new tab is wanted instead.
 * `group`: New Tab in Group, whose tab goes to that group's end. */
export function launch(c: WindowController, group?: string): boolean {
  const m = mem(c)
  if (m.launching) {
    if (group) { m.launchGroup = group; return true }
    dismiss(c)
    c.focusPage()
    return true
  }
  if (!floats(c)) return false
  // From ⌘K or ⌘L the words typed come along; or else the words the last
  // ⌘T was put away with, selected whole, so typing over them costs nothing.
  const words = wordsToCarry(c, m) ?? m.launchDraft
  m.launchDraft = ''
  if (tabEditing(c)) cancelTabEdit(c)
  m.summoning = false
  m.summonHeld = false
  m.cycling = false
  m.chip = null
  m.offer = null
  m.editing = true
  m.inline = false
  m.launching = true
  m.launchGroup = group ?? null
  m.typed = words
  pick(m, null)
  m.ending = null
  void guess(c, true).then(() => publish(c))
  askFocus(c, m)
  publish(c, true, null)
  return true
}

/** The field raised over a page, put away whichever key raised it. A blank
 * tab's field is the tab, and stays with what was typed (its draft). */
export function putAway(c: WindowController): void {
  const m = mem(c)
  if (m.launching) { dismiss(c); return }
  m.summoning = false
  m.cycling = false
  m.summonHeld = false
  if (blankInFront(c)) { if (m.editing) { m.editing = false; publish(c) } return }
  closeOver(c, m)
}

function closeOver(c: WindowController, m: Memory): void {
  m.editing = false
  m.inline = false
  m.launching = false
  m.launchGroup = null
  m.chip = null
  m.typed = ''
  m.offers = []
  m.ending = null
  pick(m, null)
  m.offer = null
  m.serial++
  stopEngine(m)
  if (c.overlayLayer.kind === 'field') {
    c.sendOverlay({ kind: 'none' })
    afterField(c)
  } else if ((c.overlayLayer.kind as string) === 'lineOffers') c.sendOverlay({ kind: 'none' })
  publish(c, true)
}

/** The tab already in front chosen again, by a click on it in the column or
 * the strip or by its number: ⌘T's floating field stays up and the keys go
 * back to it (Browser.select returns before putting the field away,
 * Browser.swift:5052-5057; beginTabEdit leaves it, :2562-2575). True when
 * the field was up and stays. */
export function stayUp(c: WindowController): boolean {
  const m = memories.get(c.record)
  if (!m || !m.launching || !m.editing || blankInFront(c)) return false
  if (tabEditing(c)) cancelTabEdit(c)
  m.focus++
  if (c.overlayLayer.kind === 'field' && !c.overlay.webContents.isDestroyed()) c.overlay.webContents.focus()
  publish(c)
  return true
}

/** The veil in the middle of the window follows the window as it changes
 * size, as the Mac's, drawn by the window, does (Omnibox.swift:68-71). */
function followWindow(c: WindowController): void {
  const m = memories.get(c.record)
  if (!m || c.base.isDestroyed() || c.overlayLayer.kind !== 'field' || !onWindow(c, m)) return
  const { width, height } = c.base.getContentBounds()
  c.setOverlayRegion({ x: 0, y: 0, width, height }, false)
}

model.on('window-opened', (id: string) => setImmediate(() => {
  const c = controllerFor(id)
  if (!c) return
  for (const e of ['resize', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'restore'] as const) {
    c.base.on(e as 'resize', () => followWindow(c))
  }
}))

/** For tab.select and the like: the field over a page goes. ⌘T's floating
 * field goes without keeping what was typed, as the Mac's editing = false
 * (Browser.swift:393): only Escape, ⌘W, a click outside or ⌘T keep it. */
export function closeField(c: WindowController): void {
  const m = mem(c)
  if (!m.editing && !m.summoning) return
  if (m.launching) { closeOver(c, m); return }
  putAway(c)
}

/** Browser.dismiss: Escape or a click on the veil. With a site in the
 * field only the site goes. */
export function dismiss(c: WindowController): void {
  const m = mem(c)
  m.summoning = false
  m.cycling = false
  m.summonHeld = false
  // The floating new tab was never a tab: nothing is left behind but what
  // was typed, for the next ⌘T to carry on with (Browser.dismiss, :8270-8282).
  if (m.launching) {
    m.launchDraft = m.typed
    closeOver(c, m)
    return
  }
  if (m.chip) { m.chip = null; void guess(c).then(() => publish(c)); publish(c, true); return }
  if (blankInFront(c)) { publish(c); return }
  closeOver(c, m)
}

// the list

/** The arrow keys walk the list; off either end lets go of it. */
export function walk(c: WindowController, step: number): void {
  const m = mem(c)
  if (!m.offers.length) return
  // A tab picked by what was typed, let go of: its address goes from the
  // grey ending too, so Return opens what was typed (Browser.walk).
  if (m.pickedByTyping && m.picked === 0 && step < 0) m.ending = null
  if (m.picked == null) pick(m, step > 0 ? 0 : m.offers.length - 1)
  else {
    const next = m.picked + step
    pick(m, next < 0 || next >= m.offers.length ? null : next)
  }
  publish(c, true, m.typed.length)
}

/** Tab: the offered site into the field, or a step down the list. */
function tabKey(c: WindowController, back: boolean): void {
  const m = mem(c)
  if (!back && lockSiteOffer(c)) return
  if (m.offers.length) walk(c, back ? -1 : 1)
}

function lockSiteOffer(c: WindowController): boolean {
  const m = mem(c)
  if (m.chip || !m.offer) return false
  m.chip = m.offer
  m.offer = null
  m.typed = ''
  m.ending = null
  pick(m, null)
  stopEngine(m)
  void guess(c)
  publish(c, true, 0)
  return true
}

// Return

interface Submit { text?: string; newTab?: boolean; front?: boolean }

/** Browser.submit: the row walked to, else the grey ending, else what was
 * typed; nothing of those a place, and the field shakes. */
export async function submit(c: WindowController, o: Submit): Promise<void> {
  const m = mem(c)
  await m.pending
  if (o.text != null && o.text !== m.shown) {
    // A key went in before its answer: what the field shows is what counts.
    m.typed = o.text
    pick(m, null)
    await guess(c, true)
  }
  const aside = !!o.newTab
  const active = activeOf(c)
  const fromSwitcher = m.summoning && !!active && !active.empty
  // Return takes the top suggestion picks its row as you type (pickTop), so
  // ↑ can let go of it and Return searches.
  const picked = m.picked != null ? m.offers[m.picked] : undefined
  if (picked?.tabID && model.tabs.has(picked.tabID)) {
    m.summoning = false
    model.selectTab(c.record, picked.tabID)
    closeOver(c, m)
    c.focusPage()
    return
  }
  if (m.summoning) {
    m.summoning = false
    m.summonHeld = false
    m.cycling = false
    if (!m.typed.trim()) { m.editing = false; if (!blankInFront(c)) closeOver(c, m); else publish(c); return }
  }
  let target: string | null
  if (picked) target = picked.url
  else if (m.ending != null) target = addressURL(completed(m))
  else target = m.chip ? siteURL(m.chip, m.typed) : fileURL(m.typed) ?? destination(m.typed)
  if (!target) {
    m.refusals++
    publish(c)
    return
  }
  // An address typed (or finished from what was typed), not a search: kept
  // under the name it was typed by if the site sends you elsewhere. Typed
  // with no scheme and finished by nothing, it is the field's guess: a name
  // that can't be found isn't tried again unless you have been there
  // (Search 1.0.22, Browser.submit).
  const typedAddress = !picked && (m.ending != null || !!addressURL(m.typed))
  const typed = typedAddress ? { guessed: m.ending == null && !m.chip && !m.typed.includes('://') } : undefined
  // The floating new tab: what was typed gets a tab of its own, and the page
  // the field was raised over stays as it was; the same for ⌘K's words
  // (Browser.submit, :8398-8402). Alt+Return is ⌘Return: behind, as a link.
  if ((m.launching || fromSwitcher) && !aside) go(c, reachable(target), { loose: true, typed })
  else go(c, reachable(target), aside ? { newTab: true, front: !!o.front, typed } : { typed })
}

/** Paste and Go: an address from the clipboard, where Return would send one
 * typed out (Browser.submit(address:), Search 1.0.22). */
export function pasteAndGo(c: WindowController, url: string): void {
  const m = mem(c)
  const active = activeOf(c)
  const fromSwitcher = m.summoning && !!active && !active.empty
  m.summoning = false
  go(c, reachable(url), m.launching || fromSwitcher ? { loose: true, typed: { guessed: false } } : { typed: { guessed: false } })
}

/** Shift-Return (Browser.submitToShiftEngine, studio/03 §1.4): exactly what
 * was typed, searched with the Shift-Return engine; the row walked to, the
 * grey ending, a site in the field and a site shortcut are passed over.
 * With none chosen in Settings it is Return. */
export async function shiftSubmit(c: WindowController, text?: string): Promise<void> {
  const template = shiftTemplate()
  if (!template) return submit(c, { text })
  const m = mem(c)
  await m.pending
  // What the input shows is what was typed plus the ending or a row walked
  // to: the words are what was typed, unless a key went in before its answer.
  const words = text != null && text !== m.shown ? text : m.typed
  const url = engineURL(words, template)
  if (!url) {
    m.refusals++
    publish(c)
    return
  }
  m.summoning = false
  m.summonHeld = false
  m.chip = null
  pick(m, null)
  // The floating new tab, as Return: a tab of its own.
  go(c, url, m.launching ? { loose: true } : {})
}

/** A row clicked: taken as it is, never through the keyboard's pick. */
async function take(c: WindowController, index: number): Promise<void> {
  const m = mem(c)
  await m.pending
  const offer = m.offers[index]
  if (!offer) return
  const active = activeOf(c)
  const aside = m.summoning && !!active && !active.empty
  m.summoning = false
  if (offer.tabID && model.tabs.has(offer.tabID)) {
    model.selectTab(c.record, offer.tabID)
    closeOver(c, m)
    c.focusPage()
    return
  }
  go(c, reachable(offer.url), m.launching || aside ? { loose: true } : {})
}

/** Where Return sends it. `loose`: the floating new tab's or ⌘K's, which is
 * ⌘T's tab and came from no page: in front, in no group, beside the page
 * (Browser.open's `loose`); raised by New Tab in Group, at that group's end. */
function go(c: WindowController, url: string, o: { newTab?: boolean; front?: boolean; loose?: boolean; typed?: { guessed: boolean } }): void {
  const m = mem(c)
  const active = activeOf(c)
  const group = o.loose && m.launching ? m.launchGroup : null
  if (active?.empty) m.drafts.delete(active.id)
  closeOver(c, m)
  // The tab told the address was typed (tabs.ts noteTyped).
  const typed = (id: unknown) => { if (o.typed && typeof id === 'string' && model.tabs.has(id)) runtimeFor(id, c.pageSession).noteTyped(url, o.typed.guessed) }
  if (o.loose) {
    void run({ do: 'tab.open', url, foreground: true, from: active?.id, loose: true } as never, { window: c })
      .then(id => { typed(id); if (group && typeof id === 'string') intoGroup(c, id, group); c.placePages(); c.focusPage() })
      .catch(e => console.warn('[field] tab.open', e))
    return
  }
  if (o.newTab || !active) {
    void run({ do: 'tab.new', url, background: !o.front, after: active?.id } as never, { window: c })
      .then(id => { typed(id); c.placePages(); if (o.front) c.focusPage() })
      .catch(e => console.warn('[field] tab.new', e))
    return
  }
  typed(active.id)
  runtimeFor(active.id, c.pageSession).go(url)
  c.placePages()
  c.focusPage()
}

/** The tab Return made, to the end of the group New Tab in Group named,
 * which opens (Browser.open's `into`, :6568-6573). Never a private tab. */
function intoGroup(c: WindowController, id: string, group: string): void {
  const win = c.record
  const t = model.tabs.get(id)
  const g = t && (win.groupsBy[t.space] ?? []).find(x => x.id === group)
  if (!t || !g || t.shy || t.bench || t.pinID) return
  const row = model.spaceTabs(win, t.space)
  const from = row.indexOf(id)
  if (from < 0) return
  row.splice(from, 1)
  let last = -1
  row.forEach((x, i) => { const o = model.tabs.get(x); if (o && !o.pinID && o.groupID === group) last = i })
  const firstLoose = row.findIndex(x => !model.tabs.get(x)?.pinID)
  row.splice(last >= 0 ? last + 1 : firstLoose >= 0 ? firstLoose : row.length, 0, id)
  t.groupID = group
  g.folded = false
  model.arrangeGroups(win, t.space)
  model.touch(win, ['tabs', 'groups'])
  model.sessionNow(win, t.space)
}

// Escape (App.swift take, the field's part of the chain)

/** One step at a time: the row, then the blank tab's words, then the blank
 * tab itself, then the field over the page. False when there was nothing. */
export function escape(c: WindowController): boolean {
  const m = mem(c)
  const active = activeOf(c)
  if (!fieldShowing(c)) return false
  if (m.picked != null) { pick(m, null); publish(c, true, m.typed.length); return true }
  if (active?.empty && (m.typed || m.chip)) {
    m.chip = null
    pick(m, null)
    m.typed = ''
    m.drafts.delete(active.id)
    void guess(c).then(() => publish(c))
    publish(c, true, 0)
    return true
  }
  if (active?.empty && !m.typed) {
    // An unused blank tab goes, back to the tab touched last; never the last one.
    const others = model.spaceTabs(c.record).filter(id => id !== active.id).map(id => model.tabs.get(id)!).filter(Boolean)
    if (!others.length) {
      if (m.summoning) { m.summoning = false; m.editing = false; publish(c); return true }
      return false
    }
    const back = others.reduce((a, b) => ((b.touched ?? 0) > (a.touched ?? 0) ? b : a))
    m.summoning = false
    m.editing = false
    model.selectTab(c.record, back.id)
    model.closeTab(c.record, active.id)
    c.focusPage()
    return true
  }
  if (m.editing && active && !active.empty) { dismiss(c); if (!m.editing) c.focusPage(); return true }
  return false
}

// the tab in front changing (Browser.select)

/** A blank tab left keeps its words; one come back to gets them again. */
function noticeActive(c: WindowController): void {
  const m = mem(c)
  const now = c.record.active[c.record.space] ?? null
  if (now === m.lastActive) return
  const before = m.lastActive ? model.tabs.get(m.lastActive) : undefined
  if (before?.empty && !m.summoning) m.drafts.set(before.id, m.typed)
  m.lastActive = now
  const tab = now ? model.tabs.get(now) : undefined
  m.summoning = false
  m.summonHeld = false
  m.cycling = false
  m.editing = false
  m.inline = false
  // Another tab in front puts ⌘T's field away, keeping nothing (Browser.select).
  m.launching = false
  m.launchGroup = null
  m.chip = null
  pick(m, null)
  m.typed = tab?.empty ? m.drafts.get(tab.id) ?? '' : ''
  if (c.overlayLayer.kind === 'field') { c.sendOverlay({ kind: 'none' }); afterField(c) }
  else if ((c.overlayLayer.kind as string) === 'lineOffers') c.sendOverlay({ kind: 'none' })
  void guess(c, true).then(() => publish(c))
  publish(c, true, m.typed.length)
}

model.on('window-changed', (id: string, slices: string[]) => {
  if (!slices.includes('activeID') && !slices.includes('space') && !slices.includes('tabs')) return
  const c = controllerFor(id)
  if (c && memories.has(c.record)) noticeActive(c)
})
model.on('tab-closed', (id: string) => {
  for (const win of model.windows.values()) memories.get(win)?.drafts.delete(id)
})

/** The overlay given back: whatever the field covered comes back (find). */
let afterFieldHook: (c: WindowController) => void = () => {}
export function onAfterField(f: (c: WindowController) => void): void { afterFieldHook = f }
function afterField(c: WindowController): void { afterFieldHook(c) }

// keys typed before the field had them (Browser.holdKey)

/** Typing between the key that raised the field and the field taking the
 * keys is kept for it, half a second at most, never a shortcut. A key that
 * reaches the page under the raised field is the field's too: the page is
 * behind the veil. */
export function holdKey(c: WindowController, input: Electron.Input, from: Electron.WebContents): boolean {
  const m = memories.get(c.record)
  if (!m || input.control || input.meta || input.alt || input.type !== 'keyDown' || input.isComposing) return false
  if (['Shift', 'CapsLock', 'Control', 'Alt', 'Meta', 'AltGraph', 'Process', 'Dead'].includes(input.key)) return false
  const early = m.focusAsked != null && Date.now() - m.focusAsked <= 500 && fieldShowing(c)
  const stray = m.editing && !blankInFront(c) && from !== c.overlay.webContents && from !== c.ui.webContents
  if (!early && !stray) return false
  if (!m.held.length) setTimeout(() => letGo(c), early ? 500 : 0)
  m.held.push(input)
  return true
}

const named: Record<string, string> = { ArrowDown: 'Down', ArrowUp: 'Up', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', ' ': 'Space' }

function letGo(c: WindowController): void {
  const m = memories.get(c.record)
  if (!m) return
  m.focusAsked = null
  const held = m.held
  m.held = []
  const wc = blankInFront(c) || m.inline ? c.ui.webContents : c.overlay.webContents
  if (wc.isDestroyed()) return
  for (const k of held) {
    const modifiers: Electron.InputEvent['modifiers'] = k.shift ? ['shift'] : []
    const keyCode = named[k.key] ?? k.key
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    if (k.key.length === 1) wc.sendInputEvent({ type: 'char', keyCode: k.key, modifiers })
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  }
}

// commands

handle('field.open', ({ target }, ctx) => openField(need(ctx), target))
handle('field.close', (_a, ctx) => { const c = need(ctx); dismiss(c); if (!mem(c).editing) c.focusPage() })
handle('field.summon', (_a, ctx) => searchTabsKey(need(ctx), false))
handle('field.move', ({ by }, ctx) => walk(need(ctx), by))
handle('field.tab', ({ back }, ctx) => tabKey(need(ctx), !!back))
handle('field.lock', (_a, ctx) => { lockSiteOffer(need(ctx)) })
handle('field.unchip', (_a, ctx) => {
  const c = need(ctx)
  const m = mem(c)
  if (!m.chip) return
  m.chip = null
  void guess(c).then(() => publish(c))
  publish(c)
})
handle('field.escape', (_a, ctx) => escape(need(ctx)))
handle('field.take', ({ index }, ctx) => take(need(ctx), index))
handle('field.focused', (_a, ctx) => {
  const c = need(ctx)
  // A blank tab's field has the keys: the interface's view must have them
  // too (a new window comes up with the overlay or nothing focused).
  if ((blankInFront(c) || mem(c).inline) && !c.ui.webContents.isFocused() && c.base.isFocused()) c.ui.webContents.focus()
  if (mem(c).held.length) letGo(c); else mem(c).focusAsked = null
})

/** Typing. Answers with the ending for these words, for the input to show
 * grey and selected after the caret. */
handle('field.type', async ({ text, deleting }, ctx) => {
  const c = need(ctx)
  const m = mem(c)
  m.typed = text
  pick(m, null)
  if (deleting) m.ending = null
  m.shown = text
  const work = guess(c, !!deleting)
  publish(c)
  await work
  if (m.typed !== text) return { text, ending: null }
  publish(c)
  return { text, ending: m.ending }
})
handle('field.input', async ({ text }, ctx) => {
  const c = need(ctx)
  const m = mem(c)
  m.typed = text
  pick(m, null)
  await guess(c)
  publish(c)
})
handle('field.submit', (o, ctx) => submit(need(ctx), o))
handle('field.shiftSubmit', ({ text }, ctx) => shiftSubmit(need(ctx), text))
handle('field.commit', async ({ index, text, newTab }, ctx) => {
  const c = need(ctx)
  const m = mem(c)
  await m.pending
  if (text != null && index == null) {
    m.typed = text
    pick(m, null)
    await guess(c, true)
    publish(c)
  } else if (index != null) {
    pick(m, index)
  }
  await submit(c, { newTab })
})
