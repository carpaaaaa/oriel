// What's playing at the foot of the column (sidebar.player; Player.swift,
// Search 1.0.22): a row for every tab of the window making a sound, the newest
// on top, pinned or not, in this space or left playing in another (a click on
// one of those goes to its space). The column leaves out the tabs on screen
// and the floating one. Paused from the column a tab keeps its row, with its
// play, until it plays again, is gone to, put away or asleep, or leaves its
// page: then the pause is the page's own (handed back).
//
// The pause is run in Oriel's own world when pressed, never before: what plays
// in the page, in its open shadow roots and in its frames of the same site, is
// paused and remembered. A player a script can't reach that way (a music
// site's audio never put in the page, a Web Audio context) is found in the
// page's own heap through its debugger and paused or suspended too, as WebKit
// suspends what a script can't reach on the Mac; the play plays again exactly
// what was paused, from where it was.

import type { ID, PlayerView } from '../../shared/state'
import { model, type TabRecord } from '../model/model'
import { handle } from '../router'
import { runtimes } from '../views/tabs'
import { controllerFor, registerSlice } from '../views/window'

/** The tabs that made a sound, per window, the newest last (Browser.sounding). */
const sounding = new Map<ID, ID[]>()
/** Paused from the column: what the debugger holds of the page's own players. */
interface Held { group: string | null; mine: boolean }
const stilled = new Map<ID, Held>()

const GROUP = 'oriel-player'

/** A paused page's own leaving (a document of its own, not a step in its
 * history as single-page sites take): the pause is handed back. */
const leaving = new Map<ID, () => void>()
function watchLeaving(id: ID): void {
  const wc = runtimes.get(id)?.contents
  if (leaving.has(id) || !wc || wc.isDestroyed()) return
  const left = () => { leaving.delete(id); drop(id) }
  wc.once('did-navigate', left)
  leaving.set(id, () => { if (!wc.isDestroyed()) wc.removeListener('did-navigate', left) })
}
function stopWatching(id: ID): void {
  leaving.get(id)?.()
  leaving.delete(id)
}

/** The debugger let go by someone else (the page crashed, its tools took it):
 * what it held is gone with it, and a later play goes by the page alone. */
const watched = new WeakSet<Electron.Debugger>()
function watchDetach(id: ID, dbg: Electron.Debugger): void {
  if (watched.has(dbg)) return
  watched.add(dbg)
  dbg.on('detach', () => {
    const held = stilled.get(id)
    if (held?.group) stilled.set(id, { group: null, mine: false })
  })
}

const STILL = `(() => {
  const held = []
  const walk = root => {
    for (const el of root.querySelectorAll('*')) {
      if ((el.tagName === 'AUDIO' || el.tagName === 'VIDEO') && !el.paused) { held.push(el); el.pause() }
      if (el.shadowRoot) walk(el.shadowRoot)
      if (el.tagName === 'IFRAME') { try { const d = el.contentDocument; if (d) walk(d) } catch {} }
    }
  }
  walk(document)
  window.__orielStilled = held
  return held.length
})()`
const AGAIN = `(() => {
  const held = window.__orielStilled || []
  window.__orielStilled = null
  held.forEach(el => { if (el.paused && el.isConnected) el.play().catch(() => {}) })
  return held.length
})()`

function winOf(id: ID): ID | null {
  for (const [win, ids] of sounding) if (ids.includes(id)) return win
  return model.tabs.get(id)?.win ?? null
}

function mark(win: ID | null | undefined): void {
  if (win) controllerFor(win)?.mark('players')
}

/** A tab's sound started or stopped (Browser.heard): started, it is the newest;
 * quiet and not paused from the column, it has nothing to show. */
function heard(t: TabRecord): void {
  const list = sounding.get(t.win) ?? []
  if (t.audible) {
    // Playing again on its own: the pause was the page's to lift.
    if (stilled.has(t.id)) void handBack(t.id)
    if (list[list.length - 1] !== t.id) sounding.set(t.win, [...list.filter(x => x !== t.id), t.id])
  } else if (!stilled.has(t.id)) {
    sounding.set(t.win, list.filter(x => x !== t.id))
  }
  mark(t.win)
}

/** Out of the list: the tab gone, asleep, put away, or its page left. */
function drop(id: ID): void {
  const win = winOf(id)
  if (stilled.has(id)) void handBack(id)
  for (const [w, ids] of sounding) if (ids.includes(id)) sounding.set(w, ids.filter(x => x !== id))
  mark(win)
}

/** The debugger of a tab's page, attached for the time it is needed. */
async function withDebugger<T>(id: ID, run: (send: (method: string, params?: object) => Promise<any>) => Promise<T>): Promise<{ value: T; mine: boolean } | null> {
  const wc = runtimes.get(id)?.contents
  if (!wc || wc.isDestroyed()) return null
  const dbg = wc.debugger
  let mine = false
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); mine = true }
    watchDetach(id, dbg)
    const value = await run((method, params) => dbg.sendCommand(method, params))
    return { value, mine }
  } catch {
    // The page's tools hold it, or the page went: what the DOM pass did stands.
    if (mine) try { dbg.detach() } catch { /* gone */ }
    return null
  }
}

/** The page's own players a script can't reach: its media never put in the
 * page and its running Web Audio contexts, paused and suspended, held by the
 * debugger until played again or handed back. How many. */
async function stillOutOfReach(id: ID): Promise<number> {
  const got = await withDebugger(id, async send => {
    const proto = async (expr: string) => (await send('Runtime.evaluate', { expression: expr, objectGroup: GROUP })).result?.objectId as string | undefined
    const all = async (expr: string) => {
      const p = await proto(expr)
      return p ? (await send('Runtime.queryObjects', { prototypeObjectId: p, objectGroup: GROUP })).objects?.objectId as string | undefined : undefined
    }
    const media = await all('HTMLMediaElement.prototype')
    const audio = await all('typeof BaseAudioContext === "function" ? BaseAudioContext.prototype : undefined')
    if (!media) return { count: 0, heldID: null }
    const held = await send('Runtime.callFunctionOn', {
      objectId: media, objectGroup: GROUP, returnByValue: false,
      arguments: [audio ? { objectId: audio } : { value: [] }],
      // The prototypes come with them (HTMLAudioElement.prototype…): their getters throw.
      functionDeclaration: `function (contexts) {
        const held = []
        for (const el of this) try { if (!el.paused) { el.pause(); held.push(el) } } catch {}
        for (const a of contexts || []) try { if (a.state === 'running') { a.suspend().catch(() => {}); held.push(a) } } catch {}
        return held
      }`,
    })
    const heldID = held.result?.objectId as string | undefined
    const n = heldID ? await send('Runtime.callFunctionOn', { objectId: heldID, returnByValue: true, functionDeclaration: 'function () { return this.length }' }) : null
    const count = Number(n?.result?.value) || 0
    if (!count) await send('Runtime.releaseObjectGroup', { objectGroup: GROUP }).catch(() => {})
    return { count, heldID: count ? heldID ?? null : null }
  })
  if (!got) return 0
  if (got.value.heldID) stilled.set(id, { group: got.value.heldID, mine: got.mine })
  // Nothing held: the debugger goes at once.
  else if (got.mine) { try { runtimes.get(id)?.contents?.debugger.detach() } catch { /* gone */ } }
  return got.value.count
}

/** What the debugger held: played again (`play`), or let go. Let go, its
 * players stay paused as by their own buttons; `wake` lifts what was only
 * suspended (a Web Audio context, which has no button), so the page plays as
 * it would once gone to. */
async function letGo(id: ID, how: 'play' | 'wake' | 'leave'): Promise<number> {
  const held = stilled.get(id)
  stilled.delete(id)
  stopWatching(id)
  const wc = runtimes.get(id)?.contents
  if (how !== 'play' && wc && !wc.isDestroyed()) void wc.executeJavaScriptInIsolatedWorld(1003, [{ code: 'window.__orielStilled = null' }]).catch(() => {})
  if (!held?.group) return 0
  if (!wc || wc.isDestroyed()) return 0
  const dbg = wc.debugger
  let count = 0
  try {
    if (how !== 'leave' && dbg.isAttached()) {
      const r = await dbg.sendCommand('Runtime.callFunctionOn', {
        objectId: held.group, returnByValue: true, arguments: [{ value: how === 'play' }],
        functionDeclaration: `function (play) {
          let n = 0
          for (const x of this) try {
            if (typeof x.play === 'function') { if (play && x.paused) { n++; const p = x.play(); if (p && p.catch) p.catch(() => {}) } }
            else if (x.state === 'suspended') { n++; x.resume().catch(() => {}) }
          } catch {}
          return n
        }`,
      }) as { result?: { value?: number } }
      count = Number(r.result?.value) || 0
    }
    if (dbg.isAttached()) await dbg.sendCommand('Runtime.releaseObjectGroup', { objectGroup: GROUP }).catch(() => {})
  } catch { /* the page went */ }
  if (held.mine) try { dbg.detach() } catch { /* gone */ }
  return count
}

/** Gone to (`wake`), put away, asleep or its page left: the pause is the page's own. */
async function handBack(id: ID, wake = false): Promise<void> {
  if (!stilled.has(id)) return
  const win = winOf(id)
  await letGo(id, wake ? 'wake' : 'leave')
  const t = model.tabs.get(id)
  if (!t?.audible) for (const [w, ids] of sounding) if (ids.includes(id)) sounding.set(w, ids.filter(x => x !== id))
  mark(win)
}

handle('tab.media', async ({ id, play, letGo: away }) => {
  // Put Away on a row paused from here: not wanted again, it goes until the tab plays again.
  if (away) { await handBack(id); return 0 }
  const wc = runtimes.get(id)?.contents
  if (!wc || wc.isDestroyed()) return 0
  const t = model.tabs.get(id)
  if (play) {
    // Taken out of the paused first: the sound coming back mustn't read as the page playing on its own.
    const deep = letGo(id, 'play')
    const dom = Number(await wc.executeJavaScriptInIsolatedWorld(1003, [{ code: AGAIN }]).catch(() => 0)) || 0
    mark(t?.win)
    return dom + await deep
  }
  const dom = Number(await wc.executeJavaScriptInIsolatedWorld(1003, [{ code: STILL }]).catch(() => 0)) || 0
  // A pause pressed again (two presses before the sound stopped): what is already held stays held.
  const deep = stilled.get(id)?.group ? 0 : await stillOutOfReach(id)
  if (dom + deep > 0 || stilled.has(id)) {
    if (!stilled.has(id)) stilled.set(id, { group: null, mine: false })
    watchLeaving(id)
    if (t) { const list = sounding.get(t.win) ?? []; if (!list.includes(id)) sounding.set(t.win, [...list, id]) }
  }
  mark(t?.win)
  return dom + deep
})

model.on('tab-changed', (t: TabRecord, patch: Partial<TabRecord>) => {
  if ('audible' in patch) heard(t)
  // Asleep: out of the list. A paused page leaving is heard from its own
  // navigation (watchLeaving), so a single-page site's step keeps the pause.
  if (patch.asleep === true) drop(t.id)
  // Its title, icon or mute changed: the row says so.
  else if (sounding.get(t.win)?.includes(t.id) && ('title' in patch || 'favicon' in patch || 'muted' in patch || 'name' in patch)) mark(t.win)
})
model.on('tab-rest', (id: ID) => drop(id))
model.on('tab-closed', (id: ID) => { drop(id); stopWatching(id) })
// Gone to, or come on screen beside it in a split: the pause is handed back.
model.on('selected', (win: { id: ID; splits?: { tabs: ID[] }[] }, id: ID) => {
  const pages = win.splits?.find(s => s.tabs.includes(id))?.tabs ?? [id]
  for (const page of pages) if (stilled.has(page)) void handBack(page, true)
})
model.on('space-changed', (win: { id: ID }) => mark(win.id))

registerSlice('players', (c): PlayerView[] => {
  const win = c.record
  const ids = [...(sounding.get(win.id) ?? [])].reverse()
  return ids.flatMap(id => {
    const t = model.tabs.get(id)
    if (!t || t.win !== win.id || !(t.audible || stilled.has(id))) return []
    const view: PlayerView = model.viewOf(t)
    if (t.space !== win.space) view.space = t.space
    if (stilled.has(id)) view.stilled = true
    return [view]
  })
})
