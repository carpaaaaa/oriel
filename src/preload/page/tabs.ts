// Camera, microphone or screen in use by the page (studio/01 §2.21, §9.23):
// Electron says nothing of it, and a tab on a call must never sleep. The
// page's getUserMedia and getDisplayMedia are wrapped before its scripts run;
// live tracks are counted, and the count's turning on or off is told to the
// main process. Owned by the tabs module (wired in page.ts by the
// orchestrator).

import { contextBridge, ipcRenderer } from 'electron'

try {
  contextBridge.executeInMainWorld({
    func: () => {
      const media = navigator.mediaDevices as MediaDevices | undefined
      if (!media) return
      const live = new Set<MediaStreamTrack>()
      let was = false
      const tell = () => {
        const on = live.size > 0
        if (on === was) return
        was = on
        document.dispatchEvent(new Event(on ? '__tabs_capture_on' : '__tabs_capture_off'))
      }
      for (const name of ['getUserMedia', 'getDisplayMedia'] as const) {
        const original = media[name]?.bind(media) as ((...a: unknown[]) => Promise<MediaStream>) | undefined
        if (!original) continue
        const wrapped = async (...args: unknown[]) => {
          const stream = await original(...args)
          for (const track of stream.getTracks()) {
            live.add(track)
            track.addEventListener('ended', () => { live.delete(track); tell() })
            const stop = track.stop.bind(track)
            track.stop = () => { stop(); live.delete(track); tell() }
          }
          tell()
          return stream
        }
        Object.defineProperty(media, name, { value: wrapped, configurable: true, writable: true })
      }
    },
  })
  document.addEventListener('__tabs_capture_on', () => ipcRenderer.send('search:tab-capture', true))
  document.addEventListener('__tabs_capture_off', () => ipcRenderer.send('search:tab-capture', false))
} catch {
  // An older Electron, or a page that won't take it: nothing said, as before.
}

// Where a link goes (Settings › Browsing › Show where links go, StatusLine.swift;
// studio/08 B `links.show`): the address under the pointer, told only when it
// changes, from every frame. Read here, apart from the page's scripts.
{
  let shown = ''
  const linkIn = (path: EventTarget[]): string => {
    for (const node of path) {
      const el = node as Element
      if (el.nodeType !== 1 || (el.localName !== 'a' && el.localName !== 'area')) continue
      const raw = (el as HTMLAnchorElement).href as unknown
      const href = typeof raw === 'string' ? raw : (raw as { baseVal?: string } | null)?.baseVal
      if (!href) continue
      try {
        const address = new URL(href, el.baseURI).href
        return address.startsWith('javascript:') ? '' : address.slice(0, 600)
      } catch { return '' }
    }
    return ''
  }
  const report = (address: string, e?: MouseEvent) => {
    if (address === shown) return
    shown = address
    ipcRenderer.send('search:tab-link', { url: address, x: e?.clientX ?? 0, y: e?.clientY ?? 0, w: innerWidth, h: innerHeight })
  }
  addEventListener('mouseover', e => report(linkIn(e.composedPath()), e), { passive: true, capture: true })
  addEventListener('mouseout', e => { if (!e.relatedTarget) report('') }, { passive: true, capture: true })
  addEventListener('pagehide', () => report(''))
}

// A swipe back or forward with two fingers on a precision touchpad, as a
// horizontal wheel the page doesn't scroll with (studio/01 §7.36-§7.38; the
// tabs module needs it for Swipe back closes a tab a link opened). Windows
// gives no start or end of the gesture: a run of wheel events across, then
// a quiet moment, is one.
{
  let run = 0
  let quiet: ReturnType<typeof setTimeout> | null = null
  const scrolls = (el: Element, dx: number) => (dx < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  const scrollsAcross = (target: EventTarget | null, dx: number): boolean => {
    for (let el = target as Element | null; el && el.nodeType === 1; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowX) && scrolls(el, dx)) return true
    }
    const root = document.scrollingElement
    return !!root && scrolls(root, dx)
  }
  addEventListener('wheel', e => {
    if (!e.isTrusted || window !== window.top || e.ctrlKey) return
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 2 || scrollsAcross(e.target, e.deltaX)) { run = 0; return }
    run += e.deltaX
    if (quiet) clearTimeout(quiet)
    quiet = setTimeout(() => {
      quiet = null
      const total = run
      run = 0
      if (Math.abs(total) >= 120) ipcRenderer.send('search:tab-swipe', total < 0 ? 'back' : 'forward')
    }, 160)
  }, { passive: true, capture: true })
}
