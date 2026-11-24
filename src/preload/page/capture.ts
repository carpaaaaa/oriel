// Capture… in the page (studio/06 §1.5 #86; Snap.swift script): one light
// layer over the page and three ways out of it: drag across an area, click
// an element (outlined under the pointer), or press Whole Page. Escape and
// nothing is taken. The layer is gone before the picture is drawn. Called
// by the main process through globalThis.__orielCapture in the preload's
// own world; the choice comes back as pages:capture. Owned by the pages module.

export interface CaptureChoice {
  kind: 'area' | 'element' | 'page'
  x: number; y: number; w: number; h: number
  dw: number; dh: number
}

import { ipcRenderer } from 'electron'

export function setupCapture(): void {
  let host: HTMLElement | null = null, frame: HTMLElement | null = null, tag: HTMLElement | null = null, band: HTMLElement | null = null
  let live = false, done: ((c: CaptureChoice | null) => void) | null = null
  let start: { x: number; y: number } | null = null, dragging = false, target: Element | null = null
  const accent = '0, 103, 192'

  const css = <T extends HTMLElement>(el: T, text: string) => { el.style.cssText = text; return el }

  function build(): void {
    host = css(document.createElement('div'), 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none')
    host.dataset.orielCapture = ''
    const root = host.attachShadow({ mode: 'closed' })
    const look = new CSSStyleSheet()
    look.replaceSync(
      `.frame{position:fixed;pointer-events:none;box-sizing:border-box;border-radius:4px;display:none;border:2px solid rgb(${accent});background:rgba(${accent},.12);box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 0 2px rgba(0,0,0,.35)}` +
      `.band{position:fixed;pointer-events:none;box-sizing:border-box;display:none;border:2px solid rgb(${accent});background:rgba(${accent},.08);box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 0 2px rgba(0,0,0,.35),0 0 0 100vmax rgba(0,0,0,.22)}` +
      `@media (prefers-color-scheme: dark){.frame{background:rgba(${accent},.24)}.band{background:rgba(${accent},.14);box-shadow:0 0 0 1px rgba(255,255,255,.9),0 0 0 2px rgba(0,0,0,.5),0 0 0 100vmax rgba(0,0,0,.4)}}`)
    root.adoptedStyleSheets = [look]
    frame = document.createElement('div')
    frame.className = 'frame'
    tag = css(document.createElement('div'), `position:absolute;font:500 11px system-ui,"Segoe UI",sans-serif;color:#fff;background:rgb(${accent});padding:2px 7px;border-radius:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 0 0 1px rgba(255,255,255,.6)`)
    frame.appendChild(tag)
    band = document.createElement('div')
    band.className = 'band'
    const bar = css(document.createElement('div'), 'position:fixed;top:12px;left:50%;transform:translateX(-50%);pointer-events:auto;display:flex;align-items:center;gap:10px;padding:5px 5px 5px 12px;border-radius:10px;background:rgba(23,23,23,.92);color:rgba(255,255,255,.75);cursor:default;font:500 12px system-ui,"Segoe UI",sans-serif;white-space:nowrap;box-shadow:0 0 0 1px rgba(255,255,255,.16),0 6px 18px rgba(0,0,0,.18)')
    const hint = document.createElement('span')
    hint.textContent = 'Drag an area or click an element'
    const whole = css(document.createElement('div'), 'padding:4px 10px;border-radius:7px;background:#fff;color:#171717;cursor:pointer')
    whole.textContent = 'Whole Page'
    whole.setAttribute('role', 'button')
    whole.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); finish(choice('page')) })
    const esc = css(document.createElement('div'), 'padding:4px 8px 4px 2px;color:rgba(255,255,255,.5);cursor:pointer')
    esc.textContent = 'esc'
    esc.addEventListener('click', e => { e.stopPropagation(); finish(null) })
    bar.append(hint, whole, esc)
    root.append(band, frame, bar)
    document.documentElement.appendChild(host)
  }

  const known: Record<string, string> = {
    nav: 'Navigation', header: 'Header', footer: 'Footer', aside: 'Sidebar', main: 'Main', article: 'Article', section: 'Section',
    form: 'Form', dialog: 'Dialog', video: 'Video', img: 'Image', picture: 'Image', svg: 'Graphic', canvas: 'Canvas', button: 'Button',
    iframe: 'Embed', figure: 'Figure', table: 'Table', pre: 'Code',
  }
  const name = (el: Element) => {
    const said = el.getAttribute('aria-label') || el.getAttribute('title')
    let what = said && said.trim() ? said.trim() : (known[el.tagName.toLowerCase()] || el.tagName.toLowerCase())
    if (what.length > 40) what = what.slice(0, 40) + '…'
    const r = el.getBoundingClientRect()
    return `${what} · ${Math.round(r.width)}×${Math.round(r.height)}`
  }
  const place = (el: Element) => {
    const r = el.getBoundingClientRect()
    Object.assign(frame!.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
    tag!.textContent = name(el)
    tag!.style.top = r.top >= 26 ? '-21px' : '3px'
    tag!.style.left = `${Math.max(2, -r.left + 4)}px`
  }
  const under = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)
    return !el || el === host || el === document.documentElement ? null : el
  }
  const choice = (kind: CaptureChoice['kind'], r?: { left: number; top: number; width: number; height: number }): CaptureChoice => {
    const doc = document.documentElement, body = document.body
    return {
      kind, x: r ? r.left : 0, y: r ? r.top : 0, w: r ? r.width : 0, h: r ? r.height : 0,
      dw: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, doc.clientWidth),
      dh: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0, doc.clientHeight),
    }
  }
  const ours = (e: Event) => e.target === host
  const swallow = (e: Event) => { if (!live || ours(e)) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation() }
  const onDown = (e: PointerEvent) => { if (!live || ours(e)) return; swallow(e); if (e.button !== 0) return; start = { x: e.clientX, y: e.clientY }; dragging = false }
  const onMove = (e: PointerEvent) => {
    if (!live) return
    if (start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (!dragging && dx * dx + dy * dy < 16) return
      dragging = true
      frame!.style.display = 'none'
      Object.assign(band!.style, { display: 'block', left: `${Math.min(start.x, e.clientX)}px`, top: `${Math.min(start.y, e.clientY)}px`, width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px` })
      return
    }
    if (ours(e)) { frame!.style.display = 'none'; target = null; return }
    const el = under(e.clientX, e.clientY)
    if (!el) return
    target = el
    place(el)
  }
  const after = ['click', 'dblclick', 'mouseup', 'auxclick', 'contextmenu']
  const eat = (e: Event) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation() }
  const trail = () => {
    after.forEach(k => window.addEventListener(k, eat, true))
    setTimeout(() => after.forEach(k => window.removeEventListener(k, eat, true)), 500)
  }
  const onUp = (e: PointerEvent) => {
    if (!live || !start) return
    swallow(e)
    const from = start
    start = null
    if (dragging) {
      dragging = false
      const r = { left: Math.min(from.x, e.clientX), top: Math.min(from.y, e.clientY), width: Math.abs(e.clientX - from.x), height: Math.abs(e.clientY - from.y) }
      if (r.width < 4 || r.height < 4) { band!.style.display = 'none'; return }
      trail()
      finish(choice('area', r))
      return
    }
    const el = target || under(e.clientX, e.clientY)
    if (!el) return
    trail()
    finish(choice('element', el.getBoundingClientRect()))
  }
  const onKey = (e: KeyboardEvent) => { if (!live || e.key !== 'Escape') return; swallow(e); finish(null) }
  const presses = ['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'touchstart', 'auxclick', 'dragstart', 'selectstart']
  const listen = (add: boolean) => {
    const how = add ? 'addEventListener' : 'removeEventListener'
    ;(window as any)[how]('pointerdown', onDown, true)
    ;(window as any)[how]('pointermove', onMove, true)
    ;(window as any)[how]('pointerup', onUp, true)
    ;(window as any)[how]('keydown', onKey, true)
    presses.forEach(k => (window as any)[how](k, swallow, true))
  }
  const teardown = () => {
    live = false; start = null; dragging = false; target = null
    listen(false)
    document.documentElement.style.cursor = ''
    host?.remove()
    host = null
  }
  const finish = (c: CaptureChoice | null) => {
    const answer = done
    done = null
    teardown()
    // After the layer has gone from the screen, so it is never in the picture.
    requestAnimationFrame(() => requestAnimationFrame(() => answer?.(c)))
  }

  ;(globalThis as unknown as { __orielCapture: unknown }).__orielCapture = {
    /** The layer up; what is chosen goes to the main process (pages:capture). */
    on(): boolean {
      if (live) finish(null)
      done = c => ipcRenderer.send('pages:capture', c)
      build()
      live = true
      document.documentElement.style.cursor = 'crosshair'
      listen(true)
      return true
    },
    off(): void { if (live) finish(null) },
    live: () => live,
    choice,
  }
}
