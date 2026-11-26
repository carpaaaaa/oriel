// The pages module's part of every page (studio/06 §2.1-§2.3, §3.5, §1.11):
// Shield's hiding rules and YouTube's script, Global Privacy Control's
// navigator.globalPrivacyControl, videos that wait for a click, scrolling
// with the middle button, Alt-click into Split View, the peek's click, the
// Esc's reminder over a full screen. What each page
// gets is asked of the main process once, as the page starts (pagePrefs in
// src/main/pages/page.ts), and told again when a switch moves. The main
// frame's only, as the other preload parts. Owned by the pages module.

import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { youtubePage, youtubeSkipper } from './youtube'
import { holdPictureInPicture, setFloatOn, setupFloat } from './float'
import { setupCapture } from './capture'
import { setupReader } from './reader'
import { runScriptlets, watchPage, type Watch } from './blocker'
import { handOn } from './blank'
import { hideShorts, setCopyFree } from './sites'
import { scrollbarCSS } from './scrollbar'

interface PagePrefs {
  /** Shield's hiding rules for this site, or nothing while it is off or paused. */
  css: string
  /** The lists' scriptlets for this page (run once, as it starts). */
  scripts: string[]
  /** The lists' procedural filters for this page. */
  extended: unknown[]
  /** Ask for the generic rules matching the page's classes and ids. */
  dom: boolean
  /** YouTube's hosts while Shield works here, null otherwise. */
  youtube: string[] | null
  standIn: string
  gpc: boolean
  mediaClick: boolean
  escapeTwice: boolean
  autoscroll: boolean
  optionSplit: boolean
  /** off | shift | optionShift | optionCommand */
  peek: string
  /** The site's own style (Edit Site Style…), when Your own style is on. */
  style: string
  /** YouTube's hosts while Hide YouTube Shorts is on. */
  noShorts: string[] | null
  /** Copying set free on this page. */
  copyFree: boolean
  /** Settings > Floating video is on. */
  floatOn: boolean
  bars?: boolean
  backspace?: boolean
}

let p: PagePrefs | null = null
try { p = ipcRenderer.sendSync('pages:prefs', location.href) as PagePrefs | null } catch {}

if (p) start(p)

function start(first: PagePrefs): void {
  let now = first

  // Main world, before the page's own scripts: the lists' scriptlets, then
  // Search's own for YouTube.
  if (first.scripts?.length) runScriptlets(first.scripts)
  // Before the page's own scripts too: copying set free, YouTube without Shorts (sites.ts).
  setCopyFree(!!first.copyFree)
  hideShorts(first.noShorts ?? null)
  // Picture in picture is the floating video's or none, from the page's start.
  setFloatOn(first.floatOn !== false)
  holdPictureInPicture()
  // Only on YouTube itself: elsewhere its 7 KB would be compiled to do nothing.
  if (first.youtube?.includes(location.hostname)) {
    try { contextBridge.executeInMainWorld({ func: youtubePage, args: [first.youtube, first.standIn] }) } catch {}
    try { youtubeSkipper(first.youtube) } catch {}
  }
  // navigator.globalPrivacyControl, here and in the frames the page makes by
  // script, which also get its hiding rules and scriptlets (blank.ts).
  handOn({ cosmetics: () => ({ css: now.css, scripts: now.scripts ?? [] }), noCookies: false, gpc: first.gpc })

  // Videos wait for a click: a page's own play() is refused without one,
  // as WebKit refuses it (NotAllowedError), from this page's start.
  if (first.mediaClick) {
    try {
      contextBridge.executeInMainWorld({
        func: () => {
          const play = HTMLMediaElement.prototype.play
          const freed = new WeakSet<HTMLMediaElement>()
          Object.defineProperty(HTMLMediaElement.prototype, 'play', {
            value: ({ play(this: HTMLMediaElement) {
              if (freed.has(this) || navigator.userActivation?.isActive) { freed.add(this); return Reflect.apply(play, this, []) }
              return Promise.reject(new DOMException('play() can only be initiated by a user gesture.', 'NotAllowedError'))
            } }).play,
            writable: true, enumerable: true, configurable: true,
          })
        },
      })
    } catch {}
  }
  // A page leaving full screen by its own hand says so first (Esc twice
  // puts back only what an Escape took).
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        for (const name of ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen'] as const) {
          const f = (Document.prototype as unknown as Record<string, unknown>)[name]
          if (typeof f !== 'function') continue
          Object.defineProperty(Document.prototype, name, {
            value: { [name](this: Document, ...a: unknown[]) { document.dispatchEvent(new Event('__oriel_fs_own')); return Reflect.apply(f, this, a) } }[name],
            writable: true, enumerable: true, configurable: true,
          })
        }
      },
    })
  } catch {}

  // Stylesheets of the user's origin: the page's own can't undo them.
  const sheets: Record<string, string | null> = { shield: null, style: null, bar: null }
  const sheet = (name: string, css: string, origin: 'user' | 'author' = 'user') => {
    const key = sheets[name]
    if (key) { try { webFrame.removeInsertedCSS(key) } catch {} sheets[name] = null }
    if (css) { try { sheets[name] = webFrame.insertCSS(css, { cssOrigin: origin }) } catch {} }
  }
  // The generic rules for the page's classes and ids, added as they come.
  let found: string[] = []
  let watch: Watch | null = null
  const unfound = () => { for (const key of found) { try { webFrame.removeInsertedCSS(key) } catch {} } found = [] }
  const follow = (q: PagePrefs) => {
    watch?.stop(); watch = null; unfound()
    if (q.css && (q.dom || q.extended?.length)) {
      watch = watchPage(q.dom, q.extended ?? [], css => { try { found.push(webFrame.insertCSS(css, { cssOrigin: 'user' })) } catch {} })
    }
  }
  follow(first)
  const dress = (q: PagePrefs) => {
    sheet('shield', q.css)
    sheet('style', q.style, 'author')
    sheet('bar', q.bars === false ? '' : scrollbarCSS)
  }
  dress(first)

  ipcRenderer.on('pages:prefs', (_e, q: PagePrefs) => {
    const was = now
    now = q
    hideShorts(q.noShorts ?? null)
    setFloatOn(q.floatOn !== false)
    if (q.css !== was.css || q.style !== was.style || q.bars !== was.bars) dress(q)
    // Off or paused here, or back on: the page's own rules go or come back.
    if (!q.css !== !was.css || q.dom !== was.dom) follow(q)
  })

  // Videos wait for a click (Safari's Never Auto-Play): a video or sound
  // plays only from a click or a key, and once played that way it may go on.
  const freed = new WeakSet<HTMLMediaElement>()
  const quiet = (el: Element) => { if (now.mediaClick && el instanceof HTMLMediaElement && el.autoplay) el.autoplay = false }
  // The page is watched only while the setting is on (off by default).
  const media = new MutationObserver(records => {
    if (!now.mediaClick) return
    for (const r of records) for (const n of r.addedNodes) {
      if (n instanceof HTMLMediaElement) quiet(n)
      else if (n instanceof Element && n.querySelector('video, audio')) n.querySelectorAll('video, audio').forEach(quiet)
    }
  })
  let watchingMedia = false
  const watchMedia = (on: boolean) => {
    if (on === watchingMedia) return
    watchingMedia = on
    if (on) media.observe(document, { childList: true, subtree: true })
    else media.disconnect()
  }
  watchMedia(!!first.mediaClick)
  ipcRenderer.on('pages:prefs', (_e, q: PagePrefs) => watchMedia(!!q.mediaClick))
  document.addEventListener('play', e => {
    const el = e.target
    if (!(el instanceof HTMLMediaElement) || !now.mediaClick || freed.has(el)) return
    if (navigator.userActivation?.isActive) { freed.add(el); return }
    el.pause()
  }, true)

  // Out of sight for half a minute (another tab in front, the window
  // minimized), the page lets its caches go: decoded pictures and the like
  // come back when it is seen again.
  let purge: ReturnType<typeof setTimeout> | undefined
  document.addEventListener('visibilitychange', () => {
    clearTimeout(purge)
    if (document.visibilityState === 'hidden') purge = setTimeout(() => { try { webFrame.clearCache() } catch {} }, 30_000)
  })

  // A link clicked with the peek's keys, or Alt-clicked into Split View.
  const linkOf = (e: MouseEvent): string | null => {
    const path = e.composedPath()
    for (const n of path) {
      if (n instanceof HTMLAnchorElement || n instanceof HTMLAreaElement) {
        const href = n.href
        return /^https?:/i.test(href) ? href : null
      }
    }
    return null
  }
  const peekKeys = (e: MouseEvent) => {
    const ctrl = process.platform === 'darwin' ? e.metaKey : e.ctrlKey
    switch (now.peek) {
      case 'shift': return e.shiftKey && !e.altKey && !ctrl
      case 'optionShift': return e.shiftKey && e.altKey && !ctrl
      case 'optionCommand': return !e.shiftKey && e.altKey && ctrl
      default: return false
    }
  }
  window.addEventListener('click', e => {
    if (e.button !== 0 || !e.isTrusted || e.defaultPrevented) return
    const url = linkOf(e)
    if (!url) return
    const ctrl = process.platform === 'darwin' ? e.metaKey : e.ctrlKey
    let how: 'peek' | 'split' | null = null
    if (peekKeys(e)) how = 'peek'
    else if (now.optionSplit && e.altKey && !e.shiftKey && !ctrl) how = 'split'
    else if (e.altKey && !e.shiftKey && !ctrl) {
      // Off, Alt-click follows the link as a click does (Chromium would
      // download it): the same click again, without Alt.
      const a = e.composedPath().find(n => n instanceof HTMLAnchorElement || n instanceof HTMLAreaElement) as HTMLAnchorElement | undefined
      if (!a) return
      e.preventDefault()
      e.stopImmediatePropagation()
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, clientX: e.clientX, clientY: e.clientY }))
      return
    }
    if (!how) return
    e.preventDefault()
    e.stopImmediatePropagation()
    ipcRenderer.send('pages:link', { url, how })
  }, true)

  autoScroll(() => now.autoscroll)
  setupFloat()
  setupCapture()
  setupReader()

  // The element that filled the screen, to put back after an Escape.
  // Backspace goes back and Shift+Backspace forward, only when nothing is being typed in (Search 1.0.21).
  const typing = (): boolean => {
    let el: Element | null = document.activeElement
    while (el && el.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
    if (!el) return false
    if (el instanceof HTMLInputElement) return !/^(button|checkbox|radio|range|submit|reset|image|file|color)$/.test(el.type)
    return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable || document.designMode === 'on'
  }
  window.addEventListener('keydown', e => {
    if (!now.backspace || e.key !== 'Backspace' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented || typing()) return
    e.preventDefault()
    try { ipcRenderer.send('pages:history', e.shiftKey ? 'forward' : 'back') } catch {}
  }, true)
  let full: WeakRef<Element> | null = null
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) full = new WeakRef(document.fullscreenElement) }, true)
  // The window follows the page's full screen (window/pagefull.ts): told by
  // the page itself, since Electron stops saying so after a first time.
  document.addEventListener('fullscreenchange', () => { try { ipcRenderer.send('pages:fullscreen', !!document.fullscreenElement) } catch {} }, true)
  document.addEventListener('__oriel_fs_own', () => { if (now.escapeTwice) { try { ipcRenderer.sendSync('pages:fs-own') } catch {} } }, true)
  ;(globalThis as unknown as { __orielFullAgain: () => Promise<boolean> | boolean }).__orielFullAgain = () => {
    const el = full?.deref()
    if (!el || !el.isConnected) return false
    return el.requestFullscreen().then(() => true, () => false)
  }

  // Esc's reminder over a full screen (FullScreenEscape.ReminderView).
  let pill: HTMLElement | null = null
  ipcRenderer.on('pages:esc-reminder', (_e, show: boolean) => {
    if (!show) { try { pill?.hidePopover() } catch {} pill?.remove(); pill = null; return }
    if (!pill) pill = reminderPill()
    if (!pill.isConnected) document.documentElement.appendChild(pill)
    try { pill.hidePopover() } catch {}
    try { pill.showPopover() } catch {}
  })
}

/** "Press Esc again to exit full screen", light on dark, in the top layer
 * so it shows over the element that fills the screen. Styles by script, not
 * markup, so no page's policy stops them. */
function reminderPill(): HTMLElement {
  const host = document.createElement('div')
  host.popover = 'manual'
  host.style.cssText = 'all:initial;position:fixed;inset:44px auto auto 50%;transform:translateX(-50%);margin:0;border:0;padding:0;' +
    'background:transparent;pointer-events:none;overflow:visible;z-index:2147483647'
  host.setAttribute('aria-live', 'assertive')
  const root = host.attachShadow({ mode: 'closed' })
  const bar = document.createElement('div')
  bar.setAttribute('role', 'status')
  bar.setAttribute('aria-label', 'Press Esc again to exit full screen')
  Object.assign(bar.style, {
    display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 18px', borderRadius: '18px',
    background: 'rgba(0,0,0,.72)', color: '#fff', font: '500 14px/1 system-ui, "Segoe UI", sans-serif', whiteSpace: 'nowrap',
  })
  const key = document.createElement('span')
  key.textContent = 'Esc'
  Object.assign(key.style, {
    font: '600 12px/1 system-ui, "Segoe UI", sans-serif', padding: '0 6px', height: '20px', display: 'inline-flex', alignItems: 'center',
    border: '1px solid rgba(255,255,255,.6)', borderRadius: '5px',
  })
  const a = document.createElement('span'); a.textContent = 'Press'
  const b = document.createElement('span'); b.textContent = 'again to exit full screen'
  bar.append(a, key, b)
  root.appendChild(bar)
  host.dataset.orielReminder = ''
  return host
}

/** Scrolling with the middle button (AutoScroll.swift): a click of the wheel
 * on a page, not on a link, leaves a mark, and the page scrolls towards the
 * pointer, faster the further away it is. Another click, Escape or the
 * wheel stops it; held and dragged, letting go stops it. */
function autoScroll(on: () => boolean): void {
  let active: { x: number; y: number; dx: number; dy: number; since: number; target: Element; badge: HTMLElement; cursor: string; frame: number } | null = null
  let swallow = -1
  const scroller = (start: Element | null): Element => {
    for (let el = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const s = getComputedStyle(el)
      if (/(auto|scroll|overlay)/.test(s.overflowY + s.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) return el
    }
    return document.scrollingElement || document.documentElement
  }
  const mark = (x: number, y: number) => {
    const host = document.createElement('div')
    host.style.cssText = `all:initial;position:fixed;z-index:2147483647;pointer-events:none;left:${x - 15}px;top:${y - 15}px;width:30px;height:30px;`
    host.dataset.orielAutoscroll = ''
    const root = host.attachShadow({ mode: 'closed' })
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', '0 0 30 30'); svg.setAttribute('width', '30'); svg.setAttribute('height', '30')
    ;(svg as unknown as HTMLElement).style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,.25))'
    const add = (tag: string, attrs: Record<string, string>) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); svg.appendChild(n) }
    add('circle', { cx: '15', cy: '15', r: '13.5', fill: 'rgba(255,255,255,.94)', stroke: 'rgba(0,0,0,.18)' })
    add('path', { d: 'M15 6.5l3.5 4.5h-7zM15 23.5l3.5-4.5h-7z', fill: 'rgba(0,0,0,.62)' })
    add('circle', { cx: '15', cy: '15', r: '1.6', fill: 'rgba(0,0,0,.62)' })
    root.appendChild(svg)
    document.documentElement.appendChild(host)
    return host
  }
  const speed = (d: number) => { const a = Math.abs(d) - 12; return a > 0 ? Math.sign(d) * Math.min(60, Math.pow(a / 10, 1.4)) : 0 }
  const tick = () => {
    if (!active) return
    active.target.scrollBy(speed(active.dx), speed(active.dy))
    active.frame = requestAnimationFrame(tick)
  }
  const move = (e: MouseEvent) => { if (!active) return; active.dx = e.clientX - active.x; active.dy = e.clientY - active.y }
  const stop = () => {
    if (!active) return
    cancelAnimationFrame(active.frame)
    active.badge.remove()
    document.documentElement.style.cursor = active.cursor
    removeEventListener('mousemove', move, true)
    active = null
  }
  addEventListener('mousedown', e => {
    swallow = -1
    if (active) { e.preventDefault(); e.stopPropagation(); stop(); swallow = e.button; return }
    if (e.button !== 1) return
    const t = e.target as Element | null
    const own = !!t?.closest?.('a[href], area[href], input, textarea, select, button, video, audio, iframe, [contenteditable=""], [contenteditable="true"]')
    // Off: Chromium on Windows scrolls with the wheel button by itself; a
    // pressed middle button the page didn't take stops it (a link still opens
    // on release, as auxclick).
    if (!on()) { if (!own) e.preventDefault(); return }
    if (own) return
    e.preventDefault()
    active = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, since: performance.now(), target: scroller(t), badge: mark(e.clientX, e.clientY), cursor: document.documentElement.style.cursor, frame: 0 }
    document.documentElement.style.cursor = 'all-scroll'
    addEventListener('mousemove', move, true)
    active.frame = requestAnimationFrame(tick)
  }, true)
  addEventListener('mouseup', e => {
    if (active && e.button === 1 && performance.now() - active.since > 250 && (Math.abs(active.dx) > 12 || Math.abs(active.dy) > 12)) { stop(); swallow = 1 }
  }, true)
  const eat = (e: MouseEvent) => {
    if (e.button === swallow) { swallow = -1; e.preventDefault(); e.stopPropagation() } else if (e.button === 1 && active) e.preventDefault()
  }
  addEventListener('click', eat, true)
  addEventListener('auxclick', eat, true)
  addEventListener('keydown', e => { if (active && e.key === 'Escape') { e.preventDefault(); stop() } }, true)
  addEventListener('wheel', stop, { capture: true, passive: true })
  addEventListener('blur', stop)
  document.addEventListener('visibilitychange', stop)
}
