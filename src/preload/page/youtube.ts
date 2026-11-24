// YouTube's ads, part of Shield (studio/06 §2.2), ported from
// YouTubeAds.swift: the page-world script that takes the ad schedule out
// of the player's own data before the player reads it, answers YouTube's
// blocker tests with an empty 200, and starts a first video held at 0:00
// again; and the isolated-world skipper that plays an ad that came through
// anyway muted at 16×. Both only on YouTube's own hosts. Owned by the pages
// module. These functions are copied into the page as text: they reach
// nothing outside themselves.

export function youtubePage(hosts: string[], standIn: string): void {
  'use strict'
  if (hosts.indexOf(location.hostname) < 0) return
  const apply = Reflect.apply, owns = Object.prototype.hasOwnProperty, define = Object.defineProperty, isArray = Array.isArray
  const ads = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams']
  const marks = ['responseContext', 'playabilityStatus', 'streamingData', 'videoDetails']
  const plain = (o: any) => o !== null && typeof o === 'object' && !isArray(o)
  const youtubes = (o: any) => { for (let i = 0; i < marks.length; i++) if (apply(owns, o, [marks[i]])) return true; return false }
  const strip = (o: any) => {
    if (!plain(o) || !youtubes(o)) return false
    let cut = false
    for (let i = 0; i < ads.length; i++) if (apply(owns, o, [ads[i]])) { delete o[ads[i]]; cut = true }
    return cut
  }
  const wall = 'bkaEnforcementMessageViewModel'
  const walled = (v: any) => plain(v) && plain(v.errorScreen) && apply(owns, v.errorScreen, ['enforcementMessageViewModel'])
  const hold = (o: any) => {
    const aux = o.auxiliaryUi, shown = plain(aux) && plain(aux.messageRenderers) && aux.messageRenderers
    if (!shown || !apply(owns, shown, [wall]) || !apply(owns, o, ['playabilityStatus'])) return
    let status = o.playabilityStatus, details = o.videoDetails, refused = false
    define(o, 'playabilityStatus', { get() { return status }, set(v) { if (walled(v)) refused = true; else status = v }, enumerable: true, configurable: true })
    define(o, 'videoDetails', { get() { return details }, set(v) { if (v !== undefined || !refused) details = v }, enumerable: true, configurable: true })
  }
  const one = (o: any) => {
    if (!plain(o)) return
    strip(o)
    if (youtubes(o)) hold(o)
    if (apply(owns, o, ['playerResponse']) && plain(o.playerResponse)) {
      strip(o.playerResponse)
      if (youtubes(o.playerResponse)) hold(o.playerResponse)
    }
  }
  const prune = (value: any) => {
    try {
      if (isArray(value)) { for (let i = 0; i < value.length && i < 8; i++) one(value[i]) } else one(value)
    } catch {}
    return value
  }
  try {
    const parse = JSON.parse
    if (typeof parse === 'function') {
      define(JSON, 'parse', {
        value: ({ parse(_text: string, _reviver?: unknown) { return prune(apply(parse, JSON, arguments as unknown as unknown[])) } }).parse,
        writable: true, enumerable: false, configurable: true,
      })
    }
  } catch {}
  try {
    const json = typeof Response === 'function' && Response.prototype.json
    const then = Promise.prototype.then
    if (typeof json === 'function') {
      define(Response.prototype, 'json', {
        value: ({ json(this: Response) { return apply(then, apply(json, this, []), [prune]) } }).json,
        writable: true, enumerable: true, configurable: true,
      })
    }
  } catch {}
  const tested = new RegExp(standIn)
  const answered = (u: unknown) => { try { return tested.test(String(new URL(String(u), location.href))) } catch { return false } }
  try {
    const fetch = window.fetch
    if (typeof fetch === 'function') {
      window.fetch = ({ fetch(this: unknown, input: any, _init?: any) {
        const u = typeof input === 'string' || input instanceof URL ? input : input && input.url
        if (u && answered(u)) return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }))
        return apply(fetch, this, arguments as unknown as unknown[])
      } }).fetch as typeof window.fetch
    }
  } catch {}
  try {
    const X = XMLHttpRequest.prototype, open = X.open, send = X.send, asked = new WeakMap<object, string>()
    X.open = ({ open(this: XMLHttpRequest, _method: string, u: string) {
      if (answered(u)) asked.set(this, String(new URL(u, location.href))); else asked.delete(this)
      return apply(open, this, arguments as unknown as unknown[])
    } }).open as typeof X.open
    X.send = ({ send(this: XMLHttpRequest) {
      const u = asked.get(this)
      if (!u) return apply(send, this, arguments as unknown as unknown[])
      const request = this
      define(request, 'readyState', { value: 4 })
      define(request, 'status', { value: 200 })
      define(request, 'statusText', { value: 'OK' })
      define(request, 'responseText', { value: '' })
      define(request, 'response', { value: '' })
      define(request, 'responseURL', { value: u })
      setTimeout(() => {
        request.dispatchEvent(new Event('readystatechange'))
        request.dispatchEvent(new ProgressEvent('load'))
        request.dispatchEvent(new ProgressEvent('loadend'))
      }, 0)
    } }).send as typeof X.send
  } catch {}
  try {
    const beacon = navigator.sendBeacon
    if (typeof beacon === 'function') {
      navigator.sendBeacon = ({ sendBeacon(this: Navigator, u: string) { return answered(u) ? true : apply(beacon, this, arguments as unknown as unknown[]) } }).sendBeacon as typeof navigator.sendBeacon
    }
  } catch {}
  let cutFirst = false
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData']) {
    try {
      if (apply(owns, window, [name])) continue
      let held: unknown
      define(window, name, {
        get() { return held },
        set(value) {
          if (name === 'ytInitialPlayerResponse') { try { if (strip(value)) cutFirst = true } catch {} }
          held = prune(value)
        },
        enumerable: true, configurable: true,
      })
    } catch {}
  }
  const seconds = (t: string | null) => {
    if (!t) return 0
    if (/^\d+$/.test(t)) return +t
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t)
    return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0
  }
  try {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        if (!cutFirst || location.pathname !== '/watch' || location.hostname.indexOf('music.') === 0) return
        const query = new URLSearchParams(location.search), id = query.get('v')
        if (!id || query.get('list')) return
        const at = seconds(query.get('t') || query.get('start')), href = location.href
        const until = Date.now() + 10000
        const look = () => {
          if (location.href !== href || Date.now() > until) return
          const player = document.getElementById('movie_player') as any
          if (player && typeof player.loadVideoById === 'function') {
            const video = player.querySelector('video')
            if (video && !video.paused && video.currentTime > 0) return
            try { player.loadVideoById(id, at) } catch {}
            return
          }
          setTimeout(look, 100)
        }
        look()
      } catch {}
    }, { once: true })
  } catch {}
}

/** In the preload's own world: an ad that plays all the same goes by muted
 * and fast, and the video comes back as it was. */
export function youtubeSkipper(hosts: string[]): void {
  if (hosts.indexOf(location.hostname) < 0) return
  const held = new WeakMap<HTMLVideoElement, { muted: boolean; rate: number }>()
  const look = (event: Event) => {
    const video = event.target
    if (!(video instanceof HTMLVideoElement)) return
    const player = video.closest('.html5-video-player')
    const ad = !!player && player.classList.contains('ad-showing')
    let was = held.get(video)
    try {
      if (ad) {
        if (!was) { was = { muted: video.muted, rate: video.playbackRate }; held.set(video, was); video.muted = true }
        if (video.playbackRate !== 16) video.playbackRate = 16
      } else if (was) {
        held.delete(video)
        video.playbackRate = was.rate
        video.muted = was.muted
      }
    } catch {}
  }
  for (const type of ['playing', 'timeupdate', 'durationchange', 'emptied']) document.addEventListener(type, look, true)
}
