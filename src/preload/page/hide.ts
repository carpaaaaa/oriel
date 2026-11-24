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
// Owned by the hide module.

import { ipcRenderer, webFrame } from 'electron'

export interface HidePick { selector: string; label: string; note: string }

// the sheets: what is hidden, the one shown from the list, the crosshair

const sheets: Record<'veil' | 'peek' | 'point', string | null> = { veil: null, peek: null, point: null }
function sheet(name: keyof typeof sheets, css: string): void {
  const old = sheets[name]
  sheets[name] = null
  // The new one in before the old one goes: nothing shows in between.
  if (css) { try { sheets[name] = webFrame.insertCSS(css, { cssOrigin: 'user' }) } catch {} }
  if (old) { try { webFrame.removeInsertedCSS(old) } catch {} }
}

const ask = () => { try { return String(ipcRenderer.sendSync('hide:css', location.href) ?? '') } catch { return '' } }
sheet('veil', ask())
// A page back from the back-forward cache wears what is hidden now.
addEventListener('pageshow', e => { if (e.persisted) { sheet('veil', ask()); sheet('peek', '') } })

ipcRenderer.on('hide:css', (_e, css: string) => { sheet('veil', String(css ?? '')); sheet('peek', '') })
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
 * without it, so it comes back with the layout it had, outlined. */
function peek(css: string, selector: string): void {
  sheet('veil', css)
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
  tag!.textContent = name(el)
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

// the selector (Curtain.swift selectorFor)

/** A class worth hanging a rule on: a word, not a build artefact. */
const steady = (c: string) => /^[a-zA-Z][\w-]{2,29}$/.test(c) && !/\d{3,}/.test(c) && !/^(css|sc|jsx|emotion|svelte|styles?)-/.test(c)

function unique(sel: string): boolean {
  try { return document.querySelectorAll(sel).length === 1 } catch { return false }
}

function selectorFor(el: Element): string {
  if (el.id && unique('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id)
  const hooks = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'aria-label', 'name', 'role']
  for (const hook of hooks) {
    const v = el.getAttribute(hook)
    if (v) {
      const s = `${el.tagName.toLowerCase()}[${hook}="${CSS.escape(v)}"]`
      if (unique(s)) return s
    }
  }
  const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(steady) : []
  if (classes.length) {
    const byClass = el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.')
    if (unique(byClass)) return byClass
  }
  // Last resort: a path, anchored on the nearest thing with a name.
  const parts: string[] = []
  let node: Element | null = el
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node.id && unique('#' + CSS.escape(node.id))) { parts.unshift('#' + CSS.escape(node.id)); break }
    const tagName = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    if (!parent) { parts.unshift(tagName); break }
    const kin = Array.prototype.filter.call(parent.children, (c: Element) => c.tagName === node!.tagName) as Element[]
    parts.unshift(kin.length > 1 ? `${tagName}:nth-of-type(${kin.indexOf(node) + 1})` : tagName)
    node = parent
  }
  return parts.join(' > ')
}

const describe = (el: Element): HidePick => ({ selector: selectorFor(el), label: name(el), note: shape(el) })

/** Nothing a person would mean: the page itself, or the outline. */
const nothing = (el: Element | null) => !el || el === host || el === document.documentElement || el === document.body

// pointing (Curtain.swift picker)

let live = false
let target: Element | null = null
/** What the pointer is over, and the things ↓ steps back into once ↑ has
 * made the outline wider than that. */
let under: Element | null = null
let trail: Element[] = []

function onMove(e: MouseEvent): void {
  if (!live) return
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
    ipcRenderer.send('hide:picked', describe(el!))
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
  wear(css: string, selector: string): boolean { sheet('veil', css); sheet('peek', ''); return shows(selector) },
  shows,
  can: (x: number, y: number) => !!underMenu(x, y),
  at(x: number, y: number): HidePick | null { const el = underMenu(x, y); return el ? describe(el) : null },
  live: () => live,
  /** What the outline is round now, for the bench. */
  outlined: () => (target && frame?.style.display === 'block' ? { id: target.id, tag: target.tagName.toLowerCase(), label: name(target) } : null),
}
