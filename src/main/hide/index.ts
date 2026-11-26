// Hide Elements (studio/01 §10.38-§10.41; Curtain.swift, Browser.swift
// "taking things off pages", Hidden.swift), as on the Mac.
//
// View › Hide Elements… (Ctrl+Shift+H) points at the page in front: an
// outline follows the pointer (preload/page/hide.ts), ↑ and ↓ widen and
// narrow it, a click takes it off, Ctrl+Z puts the last one back, Esc stops.
// What is taken off is kept by site (the host, lowercase, no www.) in
// hidden.json, one selector each, and worn by every page of that site from
// its first frame as a stylesheet of the user's origin. "Hidden" is said only
// once the page shows it gone (Tab.stillShows). Hidden on This Site…
// (Ctrl+Shift+U) lists them: resting on a row shows that one, Restore puts
// it back for good. The page menu's Hide Element takes off what the right
// click was on, at once. A private tab writes nothing down: what it takes
// off is for its page only. Owned by the hide module.

import { ipcMain, type WebContents } from 'electron'
import { handle } from '../router'
import { need } from '../context'
import { model } from '../model/model'
import { readJSON, toAppleDate, writeJSON } from '../model/persist'
import { runtimes, type TabRuntime } from '../views/tabs'
import { allControllers, controllerFor, overlayFree, type WindowController } from '../views/window'
import { bindings, findAction, keysOf, live, shortcut } from '../keys'
import { benchRequest } from '../bench/server'
import { pageMenuHooks } from '../contextmenu/menu'
import { beforeCapture } from '../pages/capture'
import { beforeStyle } from '../pages/styles'
import { HIDE_BAR, HIDE_LIST, type HideBarData, type HideListData, type Veil } from '../../shared/modules/hide'
import type { ID } from '../../shared/state'

/** The preload's own world in every page (Electron's isolated world). */
const PRELOAD_WORLD = 999

// what Oriel says (Browser.swift), Windows' keys in the Mac's words

const HINT = 'Click anything to hide it   ↑↓ wider, narrower   Ctrl+Z undo   esc done'
const HIDDEN = 'Hidden, Ctrl+Z puts it back'
const HIDDEN_HERE = 'Hidden on this page, Ctrl+Z puts it back'
/** Said when the page keeps what you picked on screen whatever the sheet
 * says (Browser.keptOnScreen). ↑ is usually the way past it. */
const KEPT = "The page keeps that on screen: try ↑ for what's around it"
/** How long a line stays (Browser.announce). */
const SAID_FOR = 1700

// the curtain: hidden.json (§10.39)

let byHost: Record<string, Veil[]> | null = null

function all(): Record<string, Veil[]> {
  if (!byHost) {
    byHost = readJSON<Record<string, Veil[]>>('hidden.json', {}, raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
      const out: Record<string, Veil[]> = {}
      for (const [host, list] of Object.entries(raw as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue
        const veils = list.filter((v): v is Veil => !!v && typeof v === 'object' && typeof (v as Veil).selector === 'string' && !!(v as Veil).selector)
          .map(v => ({ selector: v.selector, label: typeof v.label === 'string' ? v.label : v.selector, ...(typeof v.note === 'string' ? { note: v.note } : {}), date: typeof v.date === 'number' ? v.date : 0 }))
        if (veils.length) out[host] = veils
      }
      return out
    })
  }
  return byHost
}

/** Written 0.4 s after the last change, atomically (Curtain.save). */
const save = () => writeJSON('hidden.json', () => all())

/** The site things are kept by: the host, lowercase, without www. (Curtain.host). */
export function veilHost(address: string | undefined | null): string | null {
  if (!address) return null
  try {
    const u = new URL(address)
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return null
    const host = u.hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch { return null }
}

const veilsOn = (host: string | null): Veil[] => (host ? all()[host] ?? [] : [])

function hideOn(host: string, selector: string, label: string, note: string): void {
  const list = all()[host] ?? []
  if (list.some(v => v.selector === selector)) return
  list.push({ selector, label, note, date: toAppleDate(Date.now()) })
  all()[host] = list
  save()
}

function restoreOn(host: string, selector: string): void {
  const list = (all()[host] ?? []).filter(v => v.selector !== selector)
  if (list.length) all()[host] = list
  else delete all()[host]
  save()
}

/** The last one back (Curtain.undo). */
function undoOn(host: string): Veil | null {
  const list = all()[host]
  const last = list?.pop()
  if (!last) return null
  if (!list!.length) delete all()[host]
  save()
  return last
}

function restoreAllOn(host: string): void {
  delete all()[host]
  save()
}

/** One thing taken off (Curtain.rule): three ids no element has lift it
 * over a page's own particular rules, `:is()` keeps the pick whole, and one
 * it can't read matches nothing rather than taking the sheet down. */
export const rule = (selector: string) =>
  `:is(${selector}):not(#oriel-veiled):not(#oriel-veiled):not(#oriel-veiled) { display: none !important; }`

/** A site's sheet; one selector may be left out (the row being looked at). */
const cssOn = (host: string | null, without?: string) =>
  veilsOn(host).filter(v => v.selector !== without).map(v => rule(v.selector)).join('\n')

// private tabs: what they take off is kept for their page only (§10.41)

const passing = new Map<ID, string[]>()
const passingCSS = (id: ID) => (passing.get(id) ?? []).map(s => '\n' + rule(s)).join('')

/** What a tab's page wears now: its site's, and its own if private. */
function cssFor(rt: TabRuntime, without?: string): string {
  const host = veilHost(rt.contents?.getURL())
  return cssOn(host, without) + (rt.record?.shy ? passingCSS(rt.id) : '')
}

// pages

function tabOf(wc: WebContents): TabRuntime | undefined {
  for (const rt of runtimes.values()) if (rt.contents === wc) return rt
  return undefined
}

function activeRuntime(c: WindowController): TabRuntime | undefined {
  const id = c.record.active[c.record.space]
  return id ? runtimes.get(id) : undefined
}

/** Script in the preload's world of a page; null if it can't run there. */
async function inPage<T = unknown>(wc: WebContents | null | undefined, code: string): Promise<T | null> {
  if (!wc || wc.isDestroyed()) return null
  try { return await wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code }], false) as T } catch { return null }
}

const call = (name: string, ...args: unknown[]) =>
  `globalThis.__orielHide ? globalThis.__orielHide.${name}(${args.map(a => JSON.stringify(a)).join(', ')}) : null`

/** The sheet on the page, and whether `selector` still shows once it is worn. */
async function wear(wc: WebContents, css: string, selector: string): Promise<boolean> {
  return (await inPage<boolean>(wc, call('wear', css, selector))) === true
}

/** Every open page of a site wears its sheet as it stands now. */
function dress(host: string, except?: WebContents): void {
  for (const rt of runtimes.values()) {
    const wc = rt.contents
    if (!wc || wc === except || veilHost(wc.getURL()) !== host) continue
    wc.send('hide:css', cssFor(rt))
  }
}

/** A page leaving: the pointing ends with it (Browser.swift:9638), and a
 * private tab's own things go with its page. */
const watched = new WeakSet<WebContents>()
function watch(wc: WebContents): void {
  if (watched.has(wc)) return
  watched.add(wc)
  wc.on('did-navigate', () => {
    const rt = tabOf(wc)
    if (rt) passing.delete(rt.id)
    for (const c of allControllers()) if (pointing.get(c)?.wc === wc) stopPointing(c)
  })
}

// the line at the foot: the hint while pointing, and what was said

/** What was said, for the bench. */
export const said: string[] = []

interface Bar { said: string | null; n: number; timer: NodeJS.Timeout | null; size: { width: number; height: number } | null }
const bars = new WeakMap<WindowController, Bar>()
const barOf = (c: WindowController): Bar => {
  let b = bars.get(c)
  if (!b) bars.set(c, (b = { said: null, n: 0, timer: null, size: null }))
  return b
}

const isPanel = (c: WindowController, name: string) => c.overlayLayer.kind === 'panel' && c.overlayLayer.name === name

function say(c: WindowController, text: string): { said: string } {
  said.push(text)
  if (said.length > 30) said.shift()
  const bar = barOf(c)
  bar.said = text
  bar.n++
  if (bar.timer) clearTimeout(bar.timer)
  bar.timer = setTimeout(() => { bar.said = null; bar.timer = null; drawBar(c) }, SAID_FOR)
  drawBar(c)
  return { said: text }
}

/** Up over the page's foot, centred, the size the line measured itself;
 * nothing of the page under it but the line. Something else in the overlay
 * (the field, a menu) goes first. */
function drawBar(c: WindowController): void {
  if (c.base.isDestroyed()) return
  const bar = barOf(c)
  const hint = pointing.has(c) ? HINT : null
  const mine = isPanel(c, HIDE_BAR)
  if (!hint && !bar.said) { if (mine) c.sendOverlay({ kind: 'none' }); return }
  if (!overlayFree(c.overlayLayer) && !mine) return
  const data: HideBarData = { hint, said: bar.said, n: bar.n }
  c.sendOverlay({ kind: 'panel', name: HIDE_BAR, data })
  placeBar(c)
}

function placeBar(c: WindowController): void {
  const bar = barOf(c)
  const page = activeRuntime(c)?.view?.getBounds()
  const { width, height } = c.base.getContentBounds()
  const r = page && page.width && page.height ? page : { x: 0, y: 0, width, height }
  const d = c.overlayLayer.kind === 'panel' ? c.overlayLayer.data as HideBarData : null
  // Until the line has measured itself: about its size.
  const guess = { width: 560, height: 30 + (d?.hint ? 31 : 0) + (d?.said ? 32 : 0) + (d?.hint && d?.said ? 8 : 0) }
  const size = bar.size ?? guess
  const w = Math.min(r.width, Math.ceil(size.width)), h = Math.min(r.height, Math.ceil(size.height))
  c.setOverlayRegion({ x: Math.round(r.x + (r.width - w) / 2), y: r.y + r.height - h, width: w, height: h }, false)
}

// pointing (Browser.toggleHiding, stopHiding)

interface Pointing { tab: ID; wc: WebContents }
const pointing = new WeakMap<WindowController, Pointing>()

function startPointing(c: WindowController): { hiding: boolean } {
  const rt = activeRuntime(c)
  const wc = rt?.contents
  if (!rt || !wc || !veilHost(wc.getURL())) return { hiding: false }
  // One pointing mode at a time: Capture's layer comes down.
  void inPage(wc, 'globalThis.__orielCapture && globalThis.__orielCapture.live() ? globalThis.__orielCapture.off() : null')
  closeList(c, false)
  pointing.set(c, { tab: rt.id, wc })
  watch(wc)
  wc.send('hide:pointing', true)
  // The keys to the page, for ↑ and ↓.
  wc.focus()
  drawBar(c)
  return { hiding: true }
}

function stopPointing(c: WindowController): void {
  const p = pointing.get(c)
  if (!p) return
  pointing.delete(c)
  if (!p.wc.isDestroyed()) p.wc.send('hide:pointing', false)
  drawBar(c)
}

/** Ctrl+Z while pointing: the last thing taken off comes back (Browser.undoHiding). */
function undo(c: WindowController): boolean {
  const rt = activeRuntime(c)
  const wc = rt?.contents
  if (!rt || !wc) return true
  if (rt.record?.shy) {
    const list = passing.get(rt.id)
    if (!list?.length) return true
    list.pop()
    wc.send('hide:css', cssFor(rt))
    say(c, "It's back")
    return true
  }
  const host = veilHost(wc.getURL())
  const back = host ? undoOn(host) : null
  if (!host || !back) return true
  dress(host)
  listChanged(c)
  say(c, `${back.label} is back`)
  return true
}

const clean = (p: unknown): { selector: string; label: string; note: string } | null => {
  if (!p || typeof p !== 'object') return null
  const { selector, label, note } = p as Record<string, unknown>
  if (typeof selector !== 'string' || !selector.trim() || selector.length > 4000) return null
  return {
    selector,
    label: (typeof label === 'string' && label ? label : selector).slice(0, 200),
    note: (typeof note === 'string' ? note : '').slice(0, 100),
  }
}

/** The key a command has now ("Ctrl+Shift+U"), if it has one. */
function keyOf(id: string): string | null {
  const b = bindings.find(x => x.id === id)
  return b && live(b) ? keysOf(b)[0] ?? null : null
}

/** A pick, from pointing or from the page menu (Browser.swift:7537-7576).
 * Said once the page shows it gone, not before; one the page keeps on
 * screen is neither kept nor listed. */
async function picked(c: WindowController, rt: TabRuntime, p: { selector: string; label: string; note: string }, how: 'point' | 'menu'): Promise<{ hidden: boolean; said?: string }> {
  const wc = rt.contents
  const host = veilHost(wc?.getURL())
  if (!wc || !host) return { hidden: false }
  const { selector } = p
  if (rt.record?.shy) {
    const list = passing.get(rt.id) ?? []
    if (!list.includes(selector)) list.push(selector)
    passing.set(rt.id, list)
    watch(wc)
    if (!(await wear(wc, cssFor(rt), selector))) return { hidden: true, ...say(c, how === 'point' ? HIDDEN_HERE : 'Hidden on this page') }
    passing.set(rt.id, list.filter(s => s !== selector))
    await wear(wc, cssFor(rt), '')
    return { hidden: false, ...say(c, KEPT) }
  }
  hideOn(host, selector, p.label, p.note)
  dress(host, wc)
  if (!(await wear(wc, cssFor(rt), selector))) {
    listChanged(c)
    const key = keyOf('view.hidden')
    return { hidden: true, ...say(c, how === 'point' ? HIDDEN : key ? `Hidden, ${key} puts it back` : 'Hidden') }
  }
  restoreOn(host, selector)
  dress(host, wc)
  await wear(wc, cssFor(rt), '')
  return { hidden: false, ...say(c, KEPT) }
}

function controllerOfPointing(wc: WebContents): WindowController | undefined {
  return allControllers().find(c => pointing.get(c)?.wc === wc)
}

// from the page (preload/page/hide.ts)

ipcMain.on('hide:css', (event, href: unknown) => {
  let css = ''
  try {
    const frame = event.senderFrame
    if (frame && frame === event.sender.mainFrame) css = cssOn(veilHost(frame.url || String(href ?? '')))
  } catch {}
  event.returnValue = css
})

ipcMain.on('hide:picked', (event, pick: unknown) => {
  const wc = event.sender
  if (event.senderFrame !== wc.mainFrame) return
  const c = controllerOfPointing(wc)
  const rt = tabOf(wc)
  const p = clean(pick)
  if (c && rt && p) void picked(c, rt, p, 'point').catch(e => console.warn('[hide]', e))
})

ipcMain.on('hide:off', event => {
  const c = controllerOfPointing(event.sender)
  if (!c) return
  pointing.delete(c)
  drawBar(c)
})

ipcMain.on('hide:trouble', (event, reason: unknown) => {
  const c = controllerOfPointing(event.sender)
  if (c) say(c, `Couldn't hide that: ${String(reason).slice(0, 120)}`)
})

// Hidden on This Site… (Hidden.swift HiddenPanel)

function listData(c: WindowController): HideListData {
  const rt = activeRuntime(c)
  const id = c.record.active[c.record.space]
  const host = veilHost(rt?.contents?.getURL() ?? (id ? model.tabs.get(id)?.url : null))
  const { width } = c.base.getContentBounds()
  const r = rt?.view?.getBounds()
  return {
    title: host ?? 'This page',
    veils: veilsOn(host).map(v => ({ selector: v.selector, label: v.label, ...(v.note ? { note: v.note } : {}) })),
    // At the page's top right, as Edit Site Style… is.
    at: r ? { top: r.y + 8, right: Math.max(14, width - (r.x + r.width) + 14) } : { top: 8, right: 14 },
    key: keyOf('view.hide'),
  }
}

/** Over the whole window and without a veil: the page stays in view, and a
 * click anywhere outside the card puts it away. */
function openList(c: WindowController): void {
  stopPointing(c)
  const { width, height } = c.base.getContentBounds()
  c.sendOverlay({ kind: 'panel', name: HIDE_LIST, data: listData(c) })
  c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
}

function closeList(c: WindowController, refocus = true): void {
  if (!isPanel(c, HIDE_LIST)) return
  unpeek(c)
  c.sendOverlay({ kind: 'none' })
  if (refocus) c.focusPage()
}

function listChanged(c: WindowController): void {
  if (isPanel(c, HIDE_LIST)) c.sendOverlay({ kind: 'panel', name: HIDE_LIST, data: listData(c) })
}

/** Leaving the card puts the page back as it was. */
function unpeek(c: WindowController): void {
  const rt = activeRuntime(c)
  rt?.contents?.send('hide:css', cssFor(rt))
}

// commands

handle('view.hide', (_a, ctx) => {
  const c = need(ctx)
  if (pointing.has(c)) { stopPointing(c); return { hiding: false } }
  return startPointing(c)
})

handle('view.hidden', (_a, ctx) => {
  const c = need(ctx)
  if (isPanel(c, HIDE_LIST)) { closeList(c); return { list: false } }
  openList(c)
  return { list: true }
})

handle('hide.close', (_a, ctx) => { closeList(need(ctx)) })

handle('hide.peek', ({ selector }, ctx) => {
  const rt = activeRuntime(need(ctx))
  const wc = rt?.contents
  if (!rt || !wc || typeof selector !== 'string') return
  wc.send('hide:peek', { css: cssFor(rt, selector), selector })
})

handle('hide.unpeek', (_a, ctx) => { unpeek(need(ctx)) })

handle('hide.restore', ({ selector }, ctx) => {
  const c = need(ctx)
  const host = veilHost(activeRuntime(c)?.contents?.getURL())
  if (!host || typeof selector !== 'string') return
  restoreOn(host, selector)
  dress(host)
  listChanged(c)
})

handle('hide.restoreAll', (_a, ctx) => {
  const c = need(ctx)
  const host = veilHost(activeRuntime(c)?.contents?.getURL())
  if (!host) return
  restoreAllOn(host)
  dress(host)
  closeList(c)
  return say(c, 'Everything is back')
})

handle('hide.element', async ({ id, x, y }, ctx) => {
  const c = need(ctx)
  const rt = runtimes.get(id)
  const wc = rt?.contents
  if (!rt || !wc) return { hidden: false }
  const p = clean(await inPage(wc, call('at', Number(x) || 0, Number(y) || 0)))
  return p ? picked(c, rt, p, 'menu') : { hidden: false }
})

handle('hide.focus', (_a, ctx) => {
  const c = need(ctx)
  const p = pointing.get(c)
  if (p && !p.wc.isDestroyed()) p.wc.focus()
})

handle('hide.barSize', ({ width, height }, ctx) => {
  const c = need(ctx)
  const w = Number(width), h = Number(height)
  if (!(w > 0 && h > 0)) return
  barOf(c).size = { width: Math.min(2000, w), height: Math.min(400, h) }
  if (isPanel(c, HIDE_BAR)) placeBar(c)
})

// keys: Esc stops pointing or puts the list away, before anything else in
// the chain but a menu (studio/03 §4.4 point 6); Ctrl+Z while pointing is
// never the page's (App.swift pageFirst).

const escapeBefore = findAction('Escape', 'first')
shortcut('Escape', 'first', (c, k) => {
  const other = c.overlayLayer.kind === 'panel' && !isPanel(c, HIDE_BAR) && !isPanel(c, HIDE_LIST)
  if (!other && pointing.has(c)) { stopPointing(c); return true }
  if (isPanel(c, HIDE_LIST)) { closeList(c); return true }
  return escapeBefore ? escapeBefore(c, k) : false
})
shortcut('Ctrl+Z', 'first', c => (pointing.has(c) ? undo(c) : false))

// the page menu's Hide Element: only where there is something to take off

pageMenuHooks.hideable = async (wc, p) => {
  if (p.isEditable || !veilHost(p.pageURL)) return false
  const answer = inPage<boolean>(wc, call('can', p.x, p.y))
  const late = new Promise<null>(r => setTimeout(() => r(null), 250))
  return (await Promise.race([answer, late])) === true
}

// One pointing mode at a time; Edit Site Style… puts both away.
beforeCapture.push(c => stopPointing(c))
beforeStyle.push(c => { stopPointing(c); closeList(c, false) })

// the window around it changing

model.on('window-changed', (id: ID, slices: string[]) => {
  if (!slices?.some(s => s === 'activeID' || s === 'space')) return
  const c = controllerFor(id)
  if (!c) return
  const p = pointing.get(c)
  // Another tab in front: the pointing ends (Browser.swift:91); the list
  // follows the tab in front.
  if (p && c.record.active[c.record.space] !== p.tab) stopPointing(c)
  listChanged(c)
})

model.on('tab-closed', (id: ID) => {
  passing.delete(id)
  for (const c of allControllers()) {
    if (pointing.get(c)?.tab !== id) continue
    pointing.delete(c)
    drawBar(c)
  }
})

// the bench

benchRequest('hide.state', () => ({
  pointing: allControllers().filter(c => pointing.has(c)).map(c => ({ window: c.record.id, tab: pointing.get(c)!.tab })),
  said: said.slice(-20),
  hidden: all(),
  passing: Object.fromEntries(passing),
}))

/** Script in the preload's world of a tab's page (the picker's state). */
benchRequest('hide.page', async req => ({ value: await inPage(runtimes.get(String(req.id))?.contents, String(req.js)) }))
