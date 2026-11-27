// The address in the tab itself (Browser.swift:2541-2720, TabBar.swift
// TabAddressField, TabOffers.swift; studio/01 §5.18, studio/03 §1.4): a click
// on the tab you're on turns its title into its address, selected whole, in
// the row (or the strip's tab); what is typed gets ⌘L's places in a list
// under the tab, a panel of its own that never takes the keys. Return goes
// there in the same tab, Escape gives the title back, a click elsewhere keeps
// what was typed as Return would. Owned by the field module.

import { handle } from '../router'
import { model, type WindowRecord } from '../model/model'
import { registerSlice, controllerFor, overlayFree, type WindowController } from '../views/window'
import { runtimeFor } from '../views/tabs'
import type { Suggestion } from '../../shared/state'
import type { TabEditState } from '../../shared/modules/field'
import { need } from '../context'
import { editable, fileURL, reachable } from '../address'
import { destination } from './engines'
import { placeOffers } from './suggest'
import { closeField, stayUp } from './commands'

interface Edit {
  id: string
  original: string
  draft: string
  offers: Suggestion[]
  picked: number | null
  serial: number
  sync: number
  refused: number
  /** The field's place in the interface, in its own pixels. */
  anchor: { x: number; y: number; width: number; height: number } | null
  finishing: NodeJS.Timeout | null
}

const edits = new WeakMap<WindowRecord, Edit>()
const refusals = new WeakMap<WindowRecord, number>()

registerSlice('tabEdit', c => {
  const e = edits.get(c.record)
  if (!e) return null
  return { id: e.id, shown: e.draft, offers: e.offers, selected: e.picked ?? -1, sync: e.sync, refused: refusals.get(c.record) ?? 0 } satisfies TabEditState
})

export function tabEditing(c: WindowController): boolean { return edits.has(c.record) }

/** The list under the tab: the overlay sized to it, the keys left in the tab
 * (TabOffersPanel: 8 of clear room around it for its shadow, 20 left of the
 * field, as wide as the field and 24, within 320 and 460). */
function placeList(c: WindowController): void {
  const e = edits.get(c.record)
  const layer = c.overlayLayer.kind as string
  if (!e || !e.offers.length || !e.anchor) {
    if (layer === 'tabOffers') c.sendOverlay({ kind: 'none' })
    return
  }
  if (!overlayFree(c.overlayLayer) && layer !== 'tabOffers') return
  const ui = c.ui.getBounds()
  const width = Math.min(Math.max(e.anchor.width + 24, 320), 460) + 16
  const rows = e.offers.length * 34
  const height = rows + 12 + 2 + 16 + 8
  if (layer !== 'tabOffers') c.sendOverlay({ kind: 'tabOffers' } as never)
  const { width: winW, height: winH } = c.base.getContentBounds()
  const x = Math.max(0, Math.min(ui.x + e.anchor.x - 20, winW - width))
  const y = ui.y + e.anchor.y + e.anchor.height - 2
  c.setOverlayRegion({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(Math.min(height, winH - y)) }, false)
}

function changed(c: WindowController): void {
  c.mark('tabEdit')
  placeList(c)
}

/** beginTabEdit: the tab you're on, its address, selected whole. */
export function beginTabEdit(c: WindowController, id: string): void {
  const tab = model.tabs.get(id)
  if (!tab || tab.empty || !tab.url || c.record.active[c.record.space] !== id) return
  // ⌘T's floating field stays up over the page: the Mac leaves it, and the
  // address in the tab would need the overlay it is in, so the keys stay there.
  if (stayUp(c)) return
  closeField(c)
  const before = edits.get(c.record)
  if (before?.finishing) clearTimeout(before.finishing)
  const draft = editable(tab.url)
  edits.set(c.record, { id, original: draft, draft, offers: [], picked: null, serial: 0, sync: (before?.sync ?? 0) + 1, refused: 0, anchor: null, finishing: null })
  c.ui.webContents.focus()
  changed(c)
}

export function cancelTabEdit(c: WindowController): void {
  const e = edits.get(c.record)
  if (!e) return
  if (e.finishing) clearTimeout(e.finishing)
  edits.delete(c.record)
  changed(c)
}

/** tabTyped: ⌘L's places for what is typed, and the ending; nothing for the
 * address the edit began with. */
async function typed(c: WindowController, text: string, deleting: boolean): Promise<{ text: string; ending: string | null }> {
  const e = edits.get(c.record)
  if (!e) return { text, ending: null }
  e.picked = null
  e.draft = text
  const serial = ++e.serial
  if (!text.trim() || text === e.original) {
    e.offers = []
    changed(c)
    return { text, ending: null }
  }
  const { offers, ending } = await placeOffers(text)
  if (edits.get(c.record) !== e || serial !== e.serial) return { text, ending: null }
  e.offers = offers
  changed(c)
  return { text, ending: deleting ? null : ending }
}

function walk(c: WindowController, step: number): void {
  const e = edits.get(c.record)
  if (!e || !e.offers.length) return
  if (e.picked == null) e.picked = step > 0 ? 0 : e.offers.length - 1
  else {
    const next = e.picked + step
    e.picked = next < 0 || next >= e.offers.length ? null : next
  }
  changed(c)
}

function take(c: WindowController, offer: Suggestion): void {
  const e = edits.get(c.record)
  if (!e) return
  cancelTabEdit(c)
  if (offer.tabID && model.tabs.has(offer.tabID)) { model.selectTab(c.record, offer.tabID); c.focusPage(); return }
  go(c, e.id, offer.url)
}

function go(c: WindowController, id: string, url: string): void {
  runtimeFor(id, c.pageSession).go(reachable(url))
  c.placePages()
  c.focusPage()
}

/** commitTabEdit: the row walked to, else where the words go; refused, the
 * edit stays and the tab shakes. */
async function commit(c: WindowController, text?: string): Promise<void> {
  const e = edits.get(c.record)
  if (!e) return
  if (text != null) e.draft = text
  if (e.picked != null && e.offers[e.picked]) { take(c, e.offers[e.picked]); return }
  const url = fileURL(e.draft) ?? destination(e.draft)
  if (!url) {
    refusals.set(c.record, (refusals.get(c.record) ?? 0) + 1)
    changed(c)
    return
  }
  cancelTabEdit(c)
  go(c, e.id, url)
}

/** Paste and Go in the tab's own field (Search 1.0.22): that tab goes to
 * the clipboard's website, as an address typed, and the edit ends. */
export function tabPasteAndGo(c: WindowController, url: string): boolean {
  const e = edits.get(c.record)
  if (!e) return false
  if (e.finishing) { clearTimeout(e.finishing); e.finishing = null }
  cancelTabEdit(c)
  runtimeFor(e.id, c.pageSession).noteTyped(url, false)
  go(c, e.id, url)
  return true
}

/** finishTabEdit: a click elsewhere keeps what was typed, as Return does;
 * an address left as it was, an empty field or words going nowhere let go. */
function finish(c: WindowController): void {
  const e = edits.get(c.record)
  if (!e) return
  const draft = e.draft.trim()
  const tab = model.tabs.get(e.id)
  if (!draft || (tab && editable(tab.url) === draft) || !destination(draft)) { cancelTabEdit(c); return }
  void commit(c)
}

// commands

handle('field.editTab', ({ id }, ctx) => beginTabEdit(need(ctx), id))
handle('field.tabType', ({ text, deleting }, ctx) => typed(need(ctx), text, !!deleting))
handle('field.tabMove', ({ by }, ctx) => walk(need(ctx), by))
handle('field.tabCommit', ({ text }, ctx) => commit(need(ctx), text))
handle('field.tabCancel', (_a, ctx) => cancelTabEdit(need(ctx)))
handle('field.tabTake', ({ index }, ctx) => {
  const c = need(ctx)
  const e = edits.get(c.record)
  if (e?.finishing) { clearTimeout(e.finishing); e.finishing = null }
  const offer = e?.offers[index]
  if (offer) take(c, offer)
})
handle('field.tabAnchor', ({ rect }, ctx) => {
  const c = need(ctx)
  const e = edits.get(c.record)
  if (!e) return
  e.anchor = rect
  placeList(c)
})
/** The field let go of the keys (a click elsewhere). A click on the list
 * takes the keys from the tab too: it comes first, so the end waits a beat. */
handle('field.tabBlur', ({ text }, ctx) => {
  const c = need(ctx)
  const e = edits.get(c.record)
  if (!e) return
  if (text != null) e.draft = text
  if (e.finishing) clearTimeout(e.finishing)
  e.finishing = setTimeout(() => { e.finishing = null; if (edits.get(c.record) === e) finish(c) }, 150)
})

// Another tab in front, another space: the edit is over (Browser.select).
model.on('window-changed', (wid: string, slices: string[]) => {
  if (!slices.includes('activeID') && !slices.includes('space')) return
  const c = controllerFor(wid)
  const e = c && edits.get(c.record)
  if (c && e && c.record.active[c.record.space] !== e.id) cancelTabEdit(c)
})
model.on('tab-closed', (id: string) => {
  for (const win of model.windows.values()) {
    const e = edits.get(win)
    const c = controllerFor(win.id)
    if (e?.id === id && c) cancelTabEdit(c)
  }
})
