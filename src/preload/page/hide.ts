// Hide Elements in the page (studio/01 §10.38-§10.40; Curtain.swift Veiling).
//
// What is hidden on this site arrives before the page has drawn anything:
// asked of the main process as the document starts and put in as a
// stylesheet of the user's origin (webFrame.insertCSS), which a page's
// Content-Security-Policy doesn't stop and whose !important outranks every
// rule of the page's own, its style="… !important" included (§10.39).
// The pointing mode sleeps here until Ctrl+Shift+H wakes it: an outline
// follows the pointer, ↑ and ↓ widen and narrow it, a click hides. Every
// press is the picker's then, never the page's. The main frame's only.
// A pick names exactly what was picked (Search 1.0.21); one named by its
// place or by a product id is hidden on a later visit only once it is seen
// to be the same thing again (Search 1.0.22, Veiling.marks); Alt held takes
// every element like the one outlined (Search 1.0.22).
// Owned by the hide module.

import { ipcRenderer, webFrame } from 'electron'

/** A pick. `print` and `family`: what it was and where else to look for it,
 * for one named by its place or by a product id (Search 1.0.22). */
export interface HidePick { selector: string; label: string; note: string; print?: string; family?: string }

// the sheets: what is hidden, the one shown from the list, the crosshair

const sheets: Record<'veil' | 'peek' | 'point', string | null> = { veil: null, peek: null, point: null }
function sheet(name: keyof typeof sheets, css: string): void {
  const old = sheets[name]
  sheets[name] = null
  // The new one in before the old one goes: nothing shows in between.
  if (css) { try { sheets[name] = webFrame.insertCSS(css, { cssOrigin: 'user' }) } catch {} }
  if (old) { try { webFrame.removeInsertedCSS(old) } catch {} }
}

/** The site's sheet on the page, and the things it checks first marked. */
function veil(css: string): void {
  guard(css)
  sheet('veil', css)
}

// the marks: which things on the page are the ones hidden (Search 1.0.22,
// Veiling.marks, idea 1194). A thing named by where it sat, or by a product
// id, is hidden only once it is seen to be the same thing: what it says
// close enough at the same place, or word for word, the only one, elsewhere
// among its kind. Checked again whenever the page changes, before it is
// drawn, so a grid built after load, or in another order, gets neither a
// hidden card back nor a cart's product hidden instead. Nothing the same
// enough, nothing hidden.

const MARK = 'data-oriel-veiled'

/** Its kind, the picture it carries, and what it says, from the document
 * rather than the screen, so a hidden thing reads the same. */
function print(el: Element): string {
  const media = /^(IMG|VIDEO|IFRAME)$/.test(el.tagName) ? el : el.querySelector('img,video,iframe')
  const src = media ? (media.getAttribute('src') || '').split('?')[0].slice(0, 200) : ''
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)
  return el.tagName.toLowerCase() + '\n' + src + '\n' + text
}

function parts(p: string): { tag: string; src: string; text: string } {
  const at = p.indexOf('\n'), next = p.indexOf('\n', at + 1)
  return { tag: p.slice(0, at), src: p.slice(at + 1, next), text: p.slice(next + 1) }
}

const words = (text: string) => [...new Set(text.toLowerCase().split(' ').filter(Boolean))]

/** The same thing at the same place: of the same kind, and three quarters
 * of its words in common (a price or a date may move), or, with no words at
 * all, the same picture. */
function alike(el: Element, was: string): boolean {
  const a = parts(was), b = parts(print(el))
  if (a.tag !== b.tag) return false
  if (!a.text || !b.text) return !a.text && !b.text && a.src === b.src
  const x = words(a.text), y = words(b.text)
  const shared = x.filter(w => y.includes(w)).length
  return shared / (x.length + y.length - shared) >= 0.75
}

/** One thing to check, from the site's sheet: its mark, selector, print and family. */
interface Guard { k: string; s: string; p: string; f: string }
let guards: Guard[] = []
let seen: MutationObserver | null = null

function mark(el: Element, key: string, on: boolean): void {
  const list = (el.getAttribute(MARK) || '').split(' ').filter(k => k && k !== key)
  if (on) list.push(key)
  if (list.length) el.setAttribute(MARK, list.join(' '))
  else el.removeAttribute(MARK)
}

function pass(): void {
  for (const g of guards) {
    let found: Element[] = []
    try { found = [...document.querySelectorAll(g.s)].filter(el => alike(el, g.p)) } catch {}
    // Not at its place: word for word, and the only one, among its kind.
    if (!found.length && g.f && parts(g.p).text.length >= 4) {
      try {
        const kin = document.querySelectorAll(g.f)
        for (let i = 0; i < kin.length && i < 1000; i++) if (print(kin[i]) === g.p) found.push(kin[i])
      } catch {}
    }
    if (found.length !== 1) found = []
    for (const el of document.querySelectorAll(`[${MARK}~="${g.k}"]`)) if (!found.includes(el)) mark(el, g.k, false)
    for (const el of found) mark(el, g.k, true)
  }
}

/** The things to check, read from the comments in the site's sheet. */
function guard(css: string): void {
  guards = []
  const re = /\/\*oriel-guard (.*?)\*\//g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    try {
      const g = JSON.parse(m[1]) as Guard
      if (g && typeof g.k === 'string' && /^v[0-9a-z]+$/.test(g.k) && typeof g.s === 'string' && typeof g.p === 'string') guards.push({ ...g, f: typeof g.f === 'string' ? g.f : '' })
    } catch {}
  }
  if (guards.length && !seen) {
    // A mutation observer's turn comes before the frame: nothing is seen arriving.
    seen = new MutationObserver(() => { if (guards.length) pass() })
    seen.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'class', 'id'] })
  }
  pass()
}

const ask = () => { try { return String(ipcRenderer.sendSync('hide:css', location.href) ?? '') } catch { return '' } }
veil(ask())
// A page back from the back-forward cache wears what is hidden now.
addEventListener('pageshow', e => { if (e.persisted) { veil(ask()); sheet('peek', '') } })

ipcRenderer.on('hide:css', (_e, css: string) => { veil(String(css ?? '')); sheet('peek', '') })
ipcRenderer.on('hide:peek', (_e, p: { css: string; selector: string }) => peek(String(p?.css ?? ''), String(p?.selector ?? '')))
ipcRenderer.on('hide:pointing', (_e, on: boolean) => (on ? start() : off()))

/** Whether what `selector` names is still on screen (Tab.stillShows):
 * nothing matching is not "still there". */
function shows(selector: string): boolean {
  try {
    const el = document.querySelector(selector)
    return !!el && getComputedStyle(el).display !== 'none'
  } catch { return false }
}

/** One hidden thing back while the pointer rests on its row: the sheet
 * without it, so it comes back with the layout it had, outlined. A checked
 * one keeps its mark (its check is out of the sheet), which finds it. */
function peek(css: string, selector: string): void {
  veil(css)
  sheet('peek', selector ? `${selector} { outline: 2px solid rgba(23,23,23,.9) !important; outline-offset: 2px !important; }` : '')
  try { document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
}

// the outline (Curtain.swift chrome, place)

let host: HTMLElement | null = null, frame: HTMLElement | null = null, tag: HTMLElement | null = null

function chrome(): void {
  if (!host) {
    // A name no page styles, in a closed shadow: nothing of the page's
    // reaches it, and no hidden selector can match it.
    host = document.createElement('oriel-veil')
    host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;margin:0;border:0;padding:0;' +
      'background:transparent;overflow:visible;pointer-events:none;z-index:2147483646'
    const root = host.attachShadow({ mode: 'closed' })
    const look = new CSSStyleSheet()
    look.replaceSync(
      '.frame{position:fixed;pointer-events:none;box-sizing:border-box;border:2px solid rgba(23,23,23,.9);background:rgba(23,23,23,.07);' +
      'border-radius:4px;transition:all .07s ease-out;display:none}' +
      '.tag{position:absolute;font:500 11px system-ui,"Segoe UI",sans-serif;color:#fff;background:#171717;padding:2px 7px;' +
      'border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}')
    root.adoptedStyleSheets = [look]
    frame = document.createElement('div')
    frame.className = 'frame'
    tag = document.createElement('div')
    tag.className = 'tag'
    frame.appendChild(tag)
    root.appendChild(frame)
    // In the top layer, over a page's own modal dialog too.
    host.popover = 'manual'
  }
  if (!host.isConnected) document.documentElement.appendChild(host)
  try { if (!host.matches(':popover-open')) host.showPopover() } catch {}
}

function place(el: Element): void {
  chrome()
  const r = el.getBoundingClientRect()
  const box = frame!
  box.style.display = 'block'
  box.style.left = r.left + 'px'
  box.style.top = r.top + 'px'
  box.style.width = r.width + 'px'
  box.style.height = r.height + 'px'
  // Alt held: how many are like it, before anything goes (Search 1.0.22).
  tag!.textContent = name(el) + (every ? ' · ' + likeIt(el) : '')
  // Above the element if there is room above it, tucked inside its top
  // edge if there isn't; never off the left or right edge either.
  tag!.style.top = r.top >= 26 ? '-21px' : '3px'
  tag!.style.left = Math.max(2, -r.left + 4) + 'px'
  tag!.style.maxWidth = Math.max(80, innerWidth - Math.max(0, r.left) - 16) + 'px'
}

const unframe = () => { if (frame) frame.style.display = 'none' }

// what it is, in words (Curtain.swift name, shape)

const known: Record<string, string> = {
  nav: 'Navigation', header: 'Header', footer: 'Footer', aside: 'Sidebar',
  form: 'Form', dialog: 'Dialog', video: 'Video', img: 'Image',
  button: 'Button', iframe: 'Embed', figure: 'Figure', table: 'Table',
}

const clip = (text: string, n: number) => (text.length > n ? text.slice(0, n) + '…' : text)

/** What it calls itself, then what kind of thing it is, then what it says. */
function name(el: Element): string {
  const said = el.getAttribute('aria-label') || el.getAttribute('title')
  if (said && said.trim()) return clip(said.trim(), 40)
  const tagName = el.tagName.toLowerCase()
  if (known[tagName]) return known[tagName]
  const role = el.getAttribute('role')
  if (role) return role.charAt(0).toUpperCase() + role.slice(1)
  const text = ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ')
  return text ? clip(text, 40) : tagName
}

/** How big, and which corner: two sidebars read alike, rarely the same shape in the same place. */
function shape(el: Element): string {
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2
  const side = cx < innerWidth / 3 ? 'left' : cx > innerWidth * 2 / 3 ? 'right' : 'centre'
  const band = cy < innerHeight / 3 ? 'top' : cy > innerHeight * 2 / 3 ? 'bottom' : 'middle'
  return Math.round(r.width) + '×' + Math.round(r.height) + ' · ' + band + ' ' + side
}

// the selector (Curtain.swift selectorFor, Search 1.0.21 and 1.0.22)

/** A class worth hanging a rule on: a word, not a build artefact. */
const steady = (c: string) => /^[a-zA-Z][\w-]{2,29}$/.test(c) && !/\d{3,}/.test(c) && !/^(css|sc|jsx|emotion|svelte|styles?)-/.test(c)

/** An id a person gave it, not one a framework counted out. */
const steadyId = (id: string) => /^[a-zA-Z][\w-]{0,59}$/.test(id) && !/\d{3,}/.test(id)

/** What the selector names must be this one thing, now: not one like it,
 * and not several (a list of cards, one of them picked). */
function only(sel: string, el: Element): boolean {
  try {
    const all = document.querySelectorAll(sel)
    return all.length === 1 && all[0] === el
  } catch { return false }
}

const classesOf = (el: Element) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/) : []).filter(steady).slice(0, 2)

/** Its place among its parent's children of its kind, always written out:
 * a step without it would match every sibling of that kind that a later
 * visit brings (idea 1133). */
function step(node: Element): string {
  const tagName = node.tagName.toLowerCase()
  const parent = node.parentElement
  if (!parent) return tagName
  const kin = Array.prototype.filter.call(parent.children, (c: Element) => c.tagName === node.tagName) as Element[]
  return `${tagName}:nth-of-type(${kin.indexOf(node) + 1})`
}

/** A path of such steps from the nearest thing with a steady id of its own
 * (or from the body), the picked thing's own step with its steady classes
 * too: it names one element at most, and when the page is laid out
 * otherwise on a later visit it names none rather than the wrong one. */
function path(el: Element, anchored: boolean): string {
  const out: string[] = []
  let node: Element | null = el
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node === document.body) { out.unshift('body'); break }
    if (anchored && node !== el && node.id && steadyId(node.id) && only('#' + CSS.escape(node.id), node)) {
      out.unshift('#' + CSS.escape(node.id))
      break
    }
    let here = step(node)
    if (node === el) {
      const classes = classesOf(el)
      if (classes.length) here = here.replace(/:nth-of-type/, '.' + classes.map(c => CSS.escape(c)).join('.') + ':nth-of-type')
    }
    out.unshift(here)
    node = node.parentElement
  }
  return out.join(' > ')
}

/** Its kind and steady classes, with no place: where to look for it when
 * its place holds something else, and what Alt takes. None without a
 * class, which would be every element of its kind. */
function family(el: Element): string {
  const classes = classesOf(el)
  return classes.length ? el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.') : ''
}

/** A data-* attribute that names the thing itself (a product's id, a SKU)
 * rather than a state or a place. */
const identities = /(^|-)(id|sku|ean|gtin|ref|product|item|offer)(-|$)/i

/** The most specific name that still survives the page's next visit: its
 * own steady id; a hook the site put there for its own tests; the product
 * id it carries; else its place. Each checked to name exactly this
 * element, or none is given and nothing is hidden. Words a page reuses (a
 * role, an aria-label, a class on its own) once named the only one there
 * was, and on a later visit every one of them (idea 1133). The last two
 * come with what the thing is, and are hidden on a later visit only once
 * they are seen to be that thing again (idea 1194). */
function selectorFor(el: Element): { s: string; p?: string; f?: string } | null {
  if (el.id && steadyId(el.id) && only('#' + CSS.escape(el.id), el)) return { s: '#' + CSS.escape(el.id) }
  const tagName = el.tagName.toLowerCase()
  for (const hook of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
    const v = el.getAttribute(hook)
    if (!v) continue
    const s = `${tagName}[${hook}="${CSS.escape(v)}"]`
    if (only(s, el)) return { s }
  }
  const p = print(el)
  for (const a of Array.from(el.attributes)) {
    if (!a.name.startsWith('data-') || !identities.test(a.name.slice(5))) continue
    if (!a.value || a.value.length > 80) continue
    const named = `${tagName}[${a.name}="${CSS.escape(a.value)}"]`
    if (only(named, el)) return { s: named, p }
  }
  const anchored = path(el, true)
  if (only(anchored, el)) return { s: anchored, p, f: family(el) }
  const whole = path(el, false)
  return only(whole, el) ? { s: whole, p, f: family(el) } : null
}

/** How many are like it: every element of its kind and classes. */
function alikeCount(el: Element): number {
  const kind = family(el)
  if (!kind) return 0
  try { return document.querySelectorAll(kind).length } catch { return 0 }
}

/** How many are like it, in words, for the outline while Alt is held. */
function likeIt(el: Element): string {
  const n = alikeCount(el)
  return n > 1 ? `all ${n} like it` : 'nothing else like it'
}

const NO_NAME = 'it has no name of its own on this page'

/** The one thing picked, or every one like it (Alt): a pattern, not one
 * thing, so worn as it is, unchecked, and new ones like it go too. */
function describe(el: Element, all = false): HidePick | { trouble: string } {
  if (all) {
    const n = alikeCount(el)
    if (n < 2) return { trouble: 'nothing else here looks like it' }
    return { selector: family(el), label: `All like “${name(el)}” (${n})`, note: shape(el) }
  }
  const sel = selectorFor(el)
  if (!sel) return { trouble: NO_NAME }
  return { selector: sel.s, label: name(el), note: shape(el), ...(sel.p ? { print: sel.p, family: sel.f ?? '' } : {}) }
}

/** Nothing a person would mean: the page itself, or the outline. */
const nothing = (el: Element | null) => !el || el === host || el === document.documentElement || el === document.body

// pointing (Curtain.swift picker)

let live = false
let target: Element | null = null
/** What the pointer is over, and the things ↓ steps back into once ↑ has
 * made the outline wider than that. */
let under: Element | null = null
let trail: Element[] = []
/** Alt held: a press takes every element like the one outlined, as Arc's
 * "Zap all related elements" does (Search 1.0.22, idea 1195). */
let every = false

function onMove(e: MouseEvent): void {
  if (!live) return
  every = e.altKey
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (nothing(el)) return
  // Still over the same thing: a wider choice made with ↑ stays, drawn
  // again where it is now.
  if (el === under && target) return place(target)
  under = el
  trail = []
  target = el
  place(el!)
}

// ↑ the thing around the one outlined, ↓ back in again. The pointer lands on
// what is innermost (the words of a cookie banner, not the banner), and
// hiding those left the banner where it was (#1270).
function onKey(e: KeyboardEvent): void {
  if (live && e.key === 'Alt') {
    every = e.type === 'keydown'
    if (target) place(target)
    swallow(e)
    return
  }
  if (e.type !== 'keydown') return
  if (!live || !target || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'ArrowUp') {
    const up = target.parentElement
    if (up && up !== document.body && up !== document.documentElement) {
      trail.push(target)
      target = up
      place(target)
    }
  } else if (e.key === 'ArrowDown') {
    if (trail.length) {
      target = trail.pop()!
      place(target)
    }
  } else {
    return
  }
  swallow(e)
}

/** Every press swallowed: real pages act on pointerdown or mousedown and are
 * gone before a click completes, which looked like nothing happening. */
function swallow(e: Event): void {
  if (!live) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
}

function onPress(e: PointerEvent): void {
  if (!live) return
  swallow(e)
  // The left button picks (a pen or a finger too); the others only stay away from the page.
  if (e.button !== 0) return
  // The pointer may have arrived without ever moving: a click on the very
  // first element under it, or a touchpad tap.
  const el = target || document.elementFromPoint(e.clientX, e.clientY)
  if (nothing(el)) return
  try {
    const pick = describe(el!, e.altKey)
    if ('trouble' in pick) ipcRenderer.send('hide:trouble', pick.trouble)
    else ipcRenderer.send('hide:picked', pick)
  } catch (err) {
    ipcRenderer.send('hide:trouble', String(err))
  }
  target = null
  under = null
  trail = []
  unframe()
}

function start(): void {
  if (live) return
  live = true
  every = false
  chrome()
  document.documentElement.style.cursor = 'crosshair'
  sheet('point', '* { cursor: crosshair !important; }')
  // A touch too, only while pointing: a touch listener at the window that
  // isn't passive would hold up every page's scrolling.
  addEventListener('touchstart', swallow, { capture: true, passive: false })
}

function off(): void {
  if (!live) return
  live = false
  every = false
  target = null
  under = null
  trail = []
  unframe()
  try { host?.hidePopover() } catch {}
  document.documentElement.style.cursor = ''
  sheet('point', '')
  removeEventListener('touchstart', swallow, { capture: true })
  ipcRenderer.send('hide:off')
}

// Listening from the document's start, at the window, ahead of anything the
// page adds; asleep (one test) until pointing is on.
const presses = ['mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu', 'auxclick']
addEventListener('pointerdown', onPress, true)
for (const kind of presses) addEventListener(kind, swallow, true)
addEventListener('mousemove', onMove, true)
addEventListener('pointermove', onMove, true)
addEventListener('keydown', onKey, true)
addEventListener('keyup', onKey, true)
// The page going away ends the pointing with it: kept for Back, it would
// have come back still swallowing every click.
addEventListener('pagehide', off)

// the page menu's Hide Element: what the right click was on

let menuAt: { el: Element; x: number; y: number } | null = null
addEventListener('contextmenu', e => {
  const el = e.composedPath()[0]
  menuAt = el instanceof Element ? { el, x: e.clientX, y: e.clientY } : null
}, true)

/** The element at the menu's point (in the view's pixels, so the page's zoom
 * divides them): the one the right click was on when it is that click's,
 * else what is there (a click inside a frame: the frame). */
function underMenu(x: number, y: number): Element | null {
  const zoom = webFrame.getZoomFactor() || 1
  const cx = x / zoom, cy = y / zoom
  let el: Element | null = null
  if (menuAt && menuAt.el.isConnected && Math.abs(menuAt.x - cx) < 4 && Math.abs(menuAt.y - cy) < 4) {
    el = menuAt.el
    // Text inside an open shadow root: the element in the document holding it.
    while (el && el.getRootNode() !== document) el = (el.getRootNode() as ShadowRoot).host ?? null
  }
  if (!el) el = document.elementFromPoint(cx, cy)
  return nothing(el) ? null : el
}

// For the main process (executeJavaScriptInIsolatedWorld) and the bench:
// the preload's world only, never the page's.
;(globalThis as unknown as { __orielHide: unknown }).__orielHide = {
  /** Wears `css` and says whether `selector` is still on screen. */
  wear(css: string, selector: string): boolean { veil(css); sheet('peek', ''); return shows(selector) },
  shows,
  can: (x: number, y: number) => !!underMenu(x, y),
  at(x: number, y: number): HidePick | { trouble: string } | null { const el = underMenu(x, y); return el ? describe(el) : null },
  live: () => live,
  /** What the outline is round now, and what its tag says, for the bench. */
  outlined: () => (target && frame?.style.display === 'block' ? { id: target.id, tag: target.tagName.toLowerCase(), label: name(target), says: tag?.textContent ?? '' } : null),
}
