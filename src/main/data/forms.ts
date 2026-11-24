// Sign-ins in pages, on Search's side (Browser.hang, Browser.choose,
// Tab.sentSignIn and settleSignIn, the onCredentials offer; studio/05
// §2.3-2.6): the accounts hanging under a sign-in box, filling one in, and
// the question to save a password after a sign-in that took.

import { ipcMain, type WebContents } from 'electron'
import type { FillList, KeptLogin, SaveQuestion } from '../../shared/modules/data'
import type { ID, Rect } from '../../shared/state'
import { model } from '../model/model'
import { runtimes } from '../views/tabs'
import { handle } from '../router'
import { need } from '../context'
import { allControllers, type WindowController } from '../views/window'
import { controllerOfTab, mark, showPanel, windowData } from './store'
import { never, vault } from './vault'
import { fillProof } from './proof'
import { parse, registrable, siteHost } from './urls'

interface TabSignIn {
  /** A name and password just sent, held until the next page says it took. */
  sent?: { host: string; user: string; password: string; clear: boolean; at: number }
  /** The name a first step just sent, for the password page after it. */
  named?: { site: string; user: string; at: number }
  /** Picked from the list: it doesn't come back for the same box. */
  picked?: boolean
}

const tabs = new Map<ID, TabSignIn>()
const stateOf = (id: ID) => { let s = tabs.get(id); if (!s) { s = {}; tabs.set(id, s) } return s }

/** The question waiting for an answer, with the password it would keep. */
let offering: (SaveQuestion & { password: string; clear: boolean }) | null = null
/** What was last said, for the bench (Search's announce line belongs to the window). */
export let lastSaid = ''
const say = (text: string) => { lastSaid = text }

function tabOf(wc: WebContents): ID | null {
  for (const [id, rt] of runtimes) if (rt.contents === wc) return id
  return null
}

// asking the page

let serial = 0
const waiting = new Map<number, (value: unknown) => void>()
function call(wc: WebContents, name: string, args: Record<string, string> = {}, origin?: string): Promise<unknown> {
  if (wc.isDestroyed()) return Promise.resolve(false)
  const id = ++serial
  return new Promise(done => {
    const timer = setTimeout(() => { waiting.delete(id); done(false) }, 2000)
    waiting.set(id, v => { clearTimeout(timer); done(v) })
    wc.send('data:forms-call', { serial: id, call: name, args, origin })
  })
}

const wired = new WeakSet<WebContents>()
function wire(wc: WebContents, id: ID): void {
  if (wired.has(wc)) return
  wired.add(wc)
  // A new document: a password sent just before has gone somewhere.
  wc.on('did-finish-load', () => void settle(id, wc, true))
  // A form on its way out that the page's listeners didn't hear.
  wc.on('will-navigate', () => void call(wc, 'sent'))
  wc.on('did-navigate', () => hideList(id))
  // Going elsewhere, or to another step of a page that changes its own address.
  wc.on('did-start-navigation', (e: { isMainFrame?: boolean; isSameDocument?: boolean }) => { if (e?.isMainFrame !== false && !e?.isSameDocument) hideList(id) })
  wc.on('did-navigate-in-page', (_e, _url, isMainFrame) => { if (isMainFrame) hideList(id) })
  wc.on('destroyed', () => { tabs.delete(id); hideList(id) })
}

ipcMain.on('data:forms', (event, msg: Record<string, any>) => {
  const wc = event.sender
  if (event.senderFrame && event.senderFrame !== wc.mainFrame) return
  if (msg?.kind === 'reply') { waiting.get(msg.serial)?.(msg.value); waiting.delete(msg.serial); return }
  const id = tabOf(wc)
  if (!id) return
  wire(wc, id)
  switch (msg.kind) {
    case 'focus': void focused(id, wc, msg.rect ?? null, !!msg.name, msg.wide !== false); break
    case 'submit': sentSignIn(id, wc, String(msg.user ?? ''), String(msg.password ?? '')); break
    case 'name': gaveName(id, wc, String(msg.user ?? '')); break
    case 'settled': void settle(id, wc, false); break
    case 'listKey': listKey(id, String(msg.key)); break
    // A new document: the list hung from a box of the old one goes.
    case 'page': stateOf(id).picked = false; hideList(id); break
  }
})

// the list under the box (Browser.hang)

let lowering: ReturnType<typeof setTimeout> | null = null
const rowHeight = 36, listPad = 6, footHeight = 26, shadowRoom = 10

function pageHost(wc: WebContents): { host: string; clear: boolean; origin: string } | null {
  const u = parse(wc.getURL())
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null
  return { host: siteHost(u.href), clear: u.protocol === 'http:', origin: u.origin }
}

function givenName(id: ID, host: string): string | null {
  const n = tabs.get(id)?.named
  return n && Date.now() - n.at < 300_000 && registrable(host) === n.site ? n.user : null
}

let shownAt = 0
async function focused(id: ID, wc: WebContents, rect: { x: number; y: number; w: number; h: number } | null, nameOnly: boolean, wide: boolean): Promise<void> {
  const c = controllerOfTab(id)
  if (!c) return
  if (!rect) {
    if (lowering) clearTimeout(lowering)
    // A beat later: a click on a row takes the caret out of the page first.
    lowering = setTimeout(() => { lowering = null; stateOf(id).picked = false; hideList(id) }, 200)
    return
  }
  if (lowering) { clearTimeout(lowering); lowering = null }
  if (!model.pref<boolean>('passwords.fill') || stateOf(id).picked) return
  const page = pageHost(wc)
  if (!page || !page.host) return
  let accounts: KeptLogin[] = vault.matching(page.host, wide)
  // A page in the clear is offered only what was kept from one.
  if (page.clear) accounts = accounts.filter(a => a.clear)
  const given = givenName(id, page.host)
  if (given) accounts.sort((a, b) => Number(b.user === given) - Number(a.user === given))
  accounts = accounts.slice(0, 5)
  if (!accounts.length) { hideList(id); return }
  const firstOther = accounts.findIndex(a => a.host !== page.host)
  const d = windowData(c)
  const same = d.fill?.tab === id
  d.fill = {
    tab: id, host: page.host, accounts, nameOnly,
    lit: same ? d.fill!.lit : null,
    othersFrom: firstOther > 0 ? firstOther : null,
    domain: registrable(page.host),
  }
  if (!same) shownAt = Date.now()
  place(c, id, wc, rect, d.fill)
  mark(c)
  wc.send('data:forms-list', { up: true, lit: d.fill.lit })
}

function place(c: WindowController, id: ID, wc: WebContents, rect: { x: number; y: number; w: number; h: number }, list: FillList): void {
  const view = runtimes.get(id)?.view
  if (!view) return
  const busy = c.overlayLayer.kind !== 'none' && !(c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'data.fill')
  if (busy) return
  const zoom = wc.getZoomFactor()
  const b = view.getBounds()
  const rows = list.accounts.length + (list.othersFrom != null ? 1 : 0)
  const height = listPad * 2 + rows * rowHeight + footHeight
  const width = Math.min(Math.max(Math.round(rect.w * zoom), 280), b.width - 16)
  let x = Math.round(b.x + rect.x * zoom)
  x = Math.min(Math.max(x, b.x + 8), b.x + b.width - width - 8)
  const below = Math.round(b.y + (rect.y + rect.h) * zoom + 4)
  const above = Math.round(b.y + rect.y * zoom - 4 - height)
  const y = below + height <= b.y + b.height || above < b.y ? below : above
  // Room for the list's shadow at the sides and below (data.css .accounts).
  const region: Rect = { x: x - shadowRoom, y, width: width + shadowRoom * 2, height: height + shadowRoom * 2 }
  if (c.overlayLayer.kind !== 'panel' || c.overlayLayer.name !== 'data.fill') showPanel(c, 'data.fill')
  c.setOverlayRegion(region, false)
}

export function hideList(id?: ID): void {
  for (const c of id ? [controllerOfTab(id)] : allControllers()) {
    if (!c) continue
    const d = windowData(c)
    if (!d.fill || (id && d.fill.tab !== id)) continue
    const tab = d.fill.tab
    d.fill = null
    mark(c)
    runtimes.get(tab)?.contents?.send('data:forms-list', { up: false, lit: null })
    if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'data.fill') c.sendOverlay({ kind: 'none' })
  }
}

function listKey(id: ID, key: string): void {
  const c = controllerOfTab(id)
  const d = c && windowData(c)
  if (!c || !d?.fill || d.fill.tab !== id) return
  const n = d.fill.accounts.length
  if (key === 'Escape') { stateOf(id).picked = true; hideList(id); return }
  if (key === 'Enter' && d.fill.lit != null) { void pick(c, d.fill.lit, true); return }
  if (key === 'ArrowDown') d.fill.lit = d.fill.lit == null ? 0 : (d.fill.lit + 1) % n
  if (key === 'ArrowUp') d.fill.lit = d.fill.lit == null ? n - 1 : (d.fill.lit - 1 + n) % n
  mark(c)
  runtimes.get(id)?.contents?.send('data:forms-list', { up: true, lit: d.fill.lit })
}

/** One account into the page (Browser.choose): the page still the same
 * site and scheme, a proof first if Settings asks for it, the secret read
 * for this account alone, and never on its own. */
export async function pick(c: WindowController, index: number, byKey = false): Promise<boolean> {
  const d = windowData(c)
  const list = d.fill
  if (!list) return false
  // A click already on its way when the list came up is not a choice.
  if (!byKey && Date.now() - shownAt < 500) return false
  const account = list.accounts[index]
  const rt = runtimes.get(list.tab)
  const wc = rt?.contents
  if (!account || !wc) return false
  const page = pageHost(wc)
  if (!page || page.host !== list.host) { hideList(list.tab); return false }
  const shy = !!model.tabs.get(list.tab)?.shy
  stateOf(list.tab).picked = true
  hideList(list.tab)
  if (!list.nameOnly && model.pref<boolean>('passwords.fill.prove')) {
    if (!(await fillProof.ask(account.host, shy, c))) { c.focusPage(); return false }
  }
  let ok: boolean
  if (list.nameOnly) {
    ok = (await call(wc, 'name', { user: account.user }, page.origin)) === true
  } else {
    const password = vault.secret(account.host, account.user)
    if (password == null) { say('The vault refused it'); return false }
    ok = (await call(wc, 'fill', { user: account.user, password }, page.origin)) === true
    if (ok) vault.touch(account.host, account.user)
  }
  if (!ok) say("Couldn't find the sign-in fields anymore")
  c.focusPage()
  return ok
}

// a sign-in going out, and whether it took (Tab.sentSignIn, settleSignIn)

function gaveName(id: ID, wc: WebContents, user: string): void {
  const page = pageHost(wc)
  if (!user || user.length > 256 || !page) return
  stateOf(id).named = { site: registrable(page.host), user, at: Date.now() }
}

function sentSignIn(id: ID, wc: WebContents, user: string, password: string): void {
  const page = pageHost(wc)
  if (!page || !password) return
  // A password page with no name on it: the name the step before sent.
  const name = user || givenName(id, page.host) || ''
  stateOf(id).sent = { host: page.host, user: name, password, clear: page.clear, at: Date.now() }
}

/** A new document judged at once; boxes gone without one given 1.5 s. Still
 * a password box: refused, or a second step, so it waits. */
async function settle(id: ID, wc: WebContents, navigated: boolean): Promise<void> {
  const s = tabs.get(id)
  const sent = s?.sent
  if (!s || !sent) return
  if (Date.now() - sent.at >= 45_000) { s.sent = undefined; return }
  if (!navigated) {
    const stamp = sent.at
    setTimeout(() => { if (tabs.get(id)?.sent?.at === stamp) void settle(id, wc, true) }, 1500)
    return
  }
  if ((await call(wc, 'hasPassword')) === true) return
  if (s.sent !== sent) return
  s.sent = undefined
  s.named = undefined
  credentials(id, sent.host, sent.user, sent.password, sent.clear)
}

/** A sign-in that took: offered a place in the vault, unless it is known,
 * the site said never, the tab is private, or saving is off (onCredentials). */
function credentials(id: ID, host: string, user: string, password: string, clear: boolean): void {
  const tab = model.tabs.get(id)
  if (!model.pref<boolean>('passwords.save') || !password || !tab || tab.shy) return
  if (never.has(host) || /^chrome-extension:/i.test(tab.url)) return
  const known = vault.matching(host, false)
  const same = known.find(k => k.user === user)
  if (same && vault.secret(host, user) === password) { vault.touch(host, user, clear); return }
  offering = { tab: id, host, user, changed: !!same, password, clear }
  ask()
}

function ask(): void {
  if (!offering) return
  const c = controllerOfTab(offering.tab)
  if (!c) return
  const d = windowData(c)
  const { password: _p, clear: _c, ...question } = offering
  d.save = question
  mark(c)
  showQuestion(c)
}

/** The bubble at the top right of the page, when its tab is in front and
 * nothing else floats there. */
function showQuestion(c: WindowController): void {
  const q = windowData(c).save
  if (!q) return
  if (c.record.active[c.record.space] !== q.tab) return
  const layer = c.overlayLayer
  // The question wins over our own account list; anything else floating
  // there (the field, a menu) is waited out.
  if (layer.kind === 'panel' && layer.name === 'data.fill') hideList(windowData(c).fill?.tab)
  else if (layer.kind !== 'none' && !(layer.kind === 'panel' && layer.name === 'data.save')) { setTimeout(() => showQuestion(c), 500); return }
  const view = runtimes.get(q.tab)?.view
  if (!view) return
  const b = view.getBounds()
  const width = Math.min(b.width - 24, 560), height = 64
  showPanel(c, 'data.save')
  // With room for the bubble's shadow around it (data.css .offer).
  c.setOverlayRegion({ x: b.x + b.width - width - 12 - shadowRoom * 2, y: b.y + 12, width: width + shadowRoom * 2 + 12, height: height + shadowRoom * 3 }, false)
}

function closeQuestion(c: WindowController): void {
  windowData(c).save = null
  mark(c)
  if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'data.save') c.sendOverlay({ kind: 'none' })
}

model.on('selected', (win: { id: ID }, id: ID) => {
  if (offering) {
    const c = controllerOfTab(offering.tab)
    if (c && c.record.id === win.id) {
      if (id === offering.tab) showQuestion(c)
      else if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'data.save') c.sendOverlay({ kind: 'none' })
    }
  }
  for (const t of tabs.keys()) if (t !== id) hideList(t)
})

handle('save.answer', ({ answer }, ctx) => {
  const c = need(ctx)
  const o = offering
  offering = null
  closeQuestion(c)
  c.focusPage()
  if (!o) return null
  if (answer === 'save') {
    if (!vault.save(o.host, o.user, o.password, Date.now(), o.clear)) { say('The vault refused it'); return lastSaid }
    say(o.changed ? `Password updated for ${o.host}` : `Password saved for ${o.host}`)
  } else if (answer === 'never') {
    never.add([o.host])
    say(`Never for ${o.host}`)
  }
  return lastSaid
})

handle('fill.pick', ({ index, byKey }, ctx) => pick(need(ctx), index, byKey))
handle('fill.dismiss', (_a, ctx) => {
  const c = need(ctx)
  const d = windowData(c)
  if (d.fill) { stateOf(d.fill.tab).picked = true; hideList(d.fill.tab) }
})

export function pendingOffer() { return offering ? { host: offering.host, user: offering.user, changed: offering.changed } : null }
