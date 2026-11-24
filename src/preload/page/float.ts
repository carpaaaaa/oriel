// The floating video's part in the page (studio/06 §3.5; Float.swift
// Isolate, NativePiP.swift), in the preload's own world: the main process
// calls globalThis.__orielFloat with executeJavaScriptInIsolatedWorld.
//  - on: the video somebody watches is picked, everything else made
//    invisible and the video stretched to the viewport, so the whole page
//    can move into the little window and keep playing (Isolate.on);
//  - off: the page as it was;
//  - pip: Chromium's picture in picture for the same video (NativePiP);
//  - toggle, skip, where, gone: the little window's buttons and line.
// Owned by the pages module.

import { webFrame } from 'electron'

const MARK = 'data-oriel-float'

/** Isolate.on's sheet: the user's origin, so no rule of the page's outranks it. */
const SHEET = [
  'html.oriel-floating, html.oriel-floating body { background:#000 !important; overflow:hidden !important; margin:0 !important }',
  'html.oriel-floating body > * { visibility:hidden !important }',
  `html.oriel-floating body *:not([${MARK}]):not(:has([${MARK}])) { visibility:hidden !important }`,
  `html.oriel-floating [${MARK}] { visibility:visible !important; position:fixed !important; left:0 !important; top:0 !important;`,
  ' right:0 !important; bottom:0 !important; width:100vw !important; height:100vh !important; max-width:none !important;',
  ' max-height:none !important; min-width:0 !important; min-height:0 !important; margin:0 !important; padding:0 !important;',
  ' border:0 !important; clip-path:none !important; mask:none !important; transform:none !important; translate:none !important;',
  ' rotate:none !important; scale:none !important; opacity:1 !important; object-fit:contain !important; z-index:2147483647 !important;',
  ' background:#000 !important }',
  `html.oriel-floating body :has([${MARK}]) { overflow:visible !important; transform:none !important; filter:none !important;`,
  ' contain:none !important; perspective:none !important; backdrop-filter:none !important; will-change:auto !important;',
  ' clip-path:none !important; mask:none !important; container-type:normal !important }',
].join('\n')

export function setupFloat(): void {
  // Videos paused only because nobody could see the page, and videos heard
  // (Isolate.watch): what floats out on its own is one somebody watches.
  let unseen = new WeakSet<HTMLVideoElement>()
  const heard = new WeakSet<HTMLVideoElement>()
  document.addEventListener('pause', e => { if (e.isTrusted && document.visibilityState === 'hidden' && e.target instanceof HTMLVideoElement) unseen.add(e.target) }, true)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') unseen = new WeakSet() }, true)
  const listen = (e: Event) => { const v = e.target; if (v instanceof HTMLVideoElement && !v.paused && !v.muted && v.volume > 0) heard.add(v) }
  for (const n of ['play', 'playing', 'volumechange']) document.addEventListener(n, listen, true)

  /** Isolate.real: heard, long enough, big enough, not a preview in a link. */
  const real = (v: HTMLVideoElement) => {
    if (!(heard.has(v) || (!v.muted && v.volume > 0))) return false
    if (isFinite(v.duration) && v.duration > 0 && v.duration < 10) return false
    const b = v.getBoundingClientRect()
    if (v.videoWidth > 0 && b.width > 0 && b.height > 0 && b.width * b.height < 320 * 180) return false
    for (let up: HTMLElement | null = v; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
      if (up !== v && up.tagName === 'A' && up.hasAttribute('href')) return false
      const name = up.tagName + ' ' + (up.id || '') + ' ' + (typeof up.className === 'string' ? up.className : '')
      if (/(^|[\s_-])(preview|thumbnail)(?=$|[\s_-])/i.test(name) || /(^|[\s_-])(preview|thumbnail)[A-Z]/.test(name)) return false
    }
    return true
  }

  /** The largest playing video with a picture (Isolate.on's choice). */
  const pick = (quietly: boolean): HTMLVideoElement | null => {
    let best: HTMLVideoElement | null = null, area = -1
    for (const v of document.querySelectorAll('video')) {
      if ((v.paused && !unseen.has(v)) || v.ended || v.readyState < 2) continue
      if (quietly && !real(v)) continue
      const b = v.getBoundingClientRect()
      const a = b.width * b.height
      if (a >= area) { area = a; best = v }
    }
    return best
  }

  let sheet: string | null = null
  let video: HTMLVideoElement | null = null

  const api = {
    on(quietly: boolean): 'floating' | 'none' {
      const v = pick(quietly)
      if (!v) return 'none'
      api.off()
      video = v
      v.setAttribute(MARK, '')
      document.documentElement.classList.add('oriel-floating')
      try { sheet = webFrame.insertCSS(SHEET, { cssOrigin: 'user' }) } catch {}
      if (v.paused) v.play().catch(() => {})
      return 'floating'
    },
    off(): void {
      document.documentElement.classList.remove('oriel-floating')
      for (const el of document.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK)
      if (sheet) { try { webFrame.removeInsertedCSS(sheet) } catch {} sheet = null }
      video = null
    },
    /** Chromium's picture in picture (NativePiP.script): in, out, none or refused. */
    async pip(quietly: boolean, toggle: boolean): Promise<string> {
      if (document.pictureInPictureElement) {
        if (!toggle) return 'in'
        await document.exitPictureInPicture().catch(() => {})
        return 'out'
      }
      const v = pick(quietly)
      if (!v) return 'none'
      if (v.disablePictureInPicture) return 'refused'
      try { await v.requestPictureInPicture(); return 'in' } catch { return 'refused' }
    },
    async pipOff(): Promise<boolean> {
      if (!document.pictureInPictureElement) return false
      await document.exitPictureInPicture().catch(() => {})
      return true
    },
    toggle(): boolean {
      const v = video
      if (!v) return false
      if (v.paused) { v.play().catch(() => {}); return true }
      v.pause()
      return false
    },
    skip(seconds: number): void {
      const v = video
      if (!v || !isFinite(v.currentTime)) return
      const end = isFinite(v.duration) ? v.duration : Infinity
      v.currentTime = Math.max(0, Math.min(end, v.currentTime + seconds))
    },
    where(): [number, boolean] {
      const v = video
      if (!v) return [0, false]
      const through = isFinite(v.duration) && v.duration > 0 ? v.currentTime / v.duration : 0
      return [through, !v.paused]
    },
    /** The floated video gone from its page, or ended a while ago (Isolate.gone). */
    goneSince: 0,
    gone(): boolean {
      const v = video
      const shows = (x: HTMLVideoElement) => x.isConnected && !x.error && (!!x.currentSrc || !!x.srcObject) && x.readyState > 0
      const why = !v || !shows(v) ? 'gone' : v.ended ? 'ended' : null
      if (!why) { api.goneSince = 0; return false }
      if (!api.goneSince) { api.goneSince = Date.now(); return false }
      return Date.now() - api.goneSince >= (why === 'ended' ? 10000 : 1000)
    },
  }
  ;(globalThis as unknown as { __orielFloat: typeof api }).__orielFloat = api
}
