// Hide the blocker from sites, the page's half (src/main/pages/stealth.ts
// is the network's). What a page measures to tell an ad blocker is there,
// and what it is shown instead, for the loads Shield refused and only those
// (the main process noted each one, and is asked only when a load fails):
//  - a script, a picture or a stylesheet that fails: its error event never
//    reaches the page, a load event does, after the stand-in script for it
//    (uBlock Origin's adsbygoogle.js, gpt.js...) has run;
//  - a fetch that fails: it resolves, with an empty 200;
//  - an XMLHttpRequest that fails: status 200, then load, never error;
//  - a bait element (empty, with an ad's name, off the screen or a pixel
//    big): the hiding rules don't collapse it, so it measures as it would
//    without a blocker. A real ad's box, with something in it, stays hidden.
// The hooks in the page's world take what they call before the page's own
// scripts run, and each reads as the original does (toString).

import { contextBridge, ipcRenderer, webFrame } from 'electron'

/** The switch, as this page was last told (off: no question is asked). */
let active = true
/** Addresses lately found not refused (a dead endpoint polled, a broken
 * picture): not asked again for two seconds. */
const misses = new Map<string, number>()

/** Refused by Oriel, or null; for a script, with the stand-in to run first.
 * Asked only when a load fails, never for one that went through. */
function hushed(url: string, script = false): { standIn?: string } | null {
  if (!active || !/^https?:/i.test(url)) return null
  const now = Date.now()
  const missed = misses.get(url)
  if (missed !== undefined && now - missed < 2000) return null
  let r: { standIn?: string } | null = null
  try { r = ipcRenderer.sendSync('pages:hushed', url, script) as { standIn?: string } | null } catch {}
  if (!r) {
    misses.set(url, now)
    if (misses.size > 300) misses.delete(misses.keys().next().value!)
  }
  return r
}

/** A stand-in in the page's world, at once, whatever the page's CSP says. */
function runInPage(body: string): void {
  try { void webFrame.executeJavaScript(`(function(){try{\n${body}\n}catch(e){}})();`).catch(() => {}) } catch {}
}

/** The address an element was loading, for the elements whose failure a page reads. */
function addressOf(t: EventTarget | null): string {
  if (t instanceof HTMLScriptElement) return t.src
  if (t instanceof HTMLImageElement) return t.currentSrc || t.src
  if (t instanceof HTMLLinkElement) return t.href
  if (t instanceof HTMLInputElement && t.type === 'image') return t.src
  return ''
}

export interface Stealth { set(on: boolean): void }

/** Puts the hooks in this frame, before its scripts. `on` follows the switch
 * live for the bait boxes; the main process answers for the rest. */
export function setupStealth(): Stealth {
  let on = true

  // 1. A refused script, picture or stylesheet: the first listener of all
  // (the preload runs before the page), in the capture phase at the window,
  // which every error event of an element in the page passes first.
  window.addEventListener('error', (e: Event) => {
    const t = e.target
    if (!t || t === window || e instanceof ErrorEvent) return
    const url = addressOf(t)
    if (!url) return
    const script = t instanceof HTMLScriptElement
    const r = hushed(url, script)
    if (!r) return
    e.stopImmediatePropagation()
    if (r.standIn && script) runInPage(r.standIn)
    try { t.dispatchEvent(new Event('load')) } catch {}
  }, true)

  // 2. fetch and XMLHttpRequest, in the page's world.
  const ask = (url: unknown): boolean => typeof url === 'string' && !!hushed(url)
  try { contextBridge.executeInMainWorld({ func: pageHooks, args: [ask] }) } catch {}

  // 3. Bait boxes.
  const bait = baitGuard(() => on)

  return { set(v: boolean) { on = v; active = v; bait.set(v) } }
}

/** In the page's world (serialized: nothing from outside it). */
function pageHooks(ask: (url: string) => boolean): void {
  const { apply, construct } = Reflect
  const gopd = Object.getOwnPropertyDescriptor
  const defp = Object.defineProperty
  const mapGet = WeakMap.prototype.get
  const mapSet = WeakMap.prototype.set
  const setHas = WeakSet.prototype.has
  const setAdd = WeakSet.prototype.add
  const setDel = WeakSet.prototype.delete
  const then = Promise.prototype.then
  const listen = EventTarget.prototype.addEventListener
  const dispatch = EventTarget.prototype.dispatchEvent
  const stop = Event.prototype.stopImmediatePropagation
  const nameOf = gopd(DOMException.prototype, 'name')?.get
  const Str = String
  const URLC = URL
  const ResponseC = Response
  const RequestC = Request
  const ProgressEventC = ProgressEvent
  const ProxyC = Proxy
  const baseOf = gopd(Node.prototype, 'baseURI')!.get!
  const requestUrl = gopd(Request.prototype, 'url')!.get!
  const doc = document
  const me = window

  // Each hook reads as its original does (over any mask already there).
  const originals = new WeakMap<object, object>()
  const toString = Function.prototype.toString
  const masked = { toString(this: unknown) { return apply(toString, (typeof this === 'function' && apply(mapGet, originals, [this])) || this, []) } }.toString
  apply(mapSet, originals, [masked, toString])
  defp(Function.prototype, 'toString', { value: masked, writable: true, enumerable: false, configurable: true })
  const same = <T extends object>(hook: T, original: object): T => {
    apply(mapSet, originals, [hook, original])
    try { defp(hook, 'length', { value: (original as { length: number }).length }) } catch {}
    return hook
  }
  const resolve = (u: unknown): string => {
    try { return new URLC(Str(u), apply(baseOf, doc, []) as string).href } catch { return '' }
  }

  // fetch: a refused one resolves with an empty 200 (an abort still rejects).
  const fetchD = gopd(me, 'fetch')
  if (fetchD && typeof fetchD.value === 'function') {
    const native = fetchD.value as typeof fetch
    const hook = { fetch(this: unknown, ...a: unknown[]) {
      const p = apply(native, this, a) as Promise<Response>
      let url = ''
      try { url = a[0] instanceof RequestC ? apply(requestUrl, a[0], []) as string : resolve(a[0]) } catch {}
      if (!url) return p
      return apply(then, p, [undefined, (error: unknown) => {
        let name = ''
        try { name = error instanceof DOMException && nameOf ? apply(nameOf, error, []) as string : (error as Error)?.name } catch {}
        if (name === 'TypeError' && ask(url)) return new ResponseC('', { status: 200, statusText: 'OK' })
        throw error
      }])
    } }.fetch
    defp(me, 'fetch', { ...fetchD, value: same(hook, native) })
  }

  // XMLHttpRequest: our listeners go on each one as it is made, so they
  // are its first. A refused one reads status 200 from its last
  // readystatechange on, and its error event becomes a load event.
  const XHR = me.XMLHttpRequest
  const XP = XHR?.prototype
  if (!XHR || !XP) return
  const readyStateOf = gopd(XP, 'readyState')?.get
  const statusOf = gopd(XP, 'status')?.get
  if (!readyStateOf || !statusOf) return
  const urls = new WeakMap<object, string>()
  const faked = new WeakSet<object>()
  const onState = function (this: XMLHttpRequest) {
    if (apply(readyStateOf, this, []) !== 4 || apply(statusOf, this, []) !== 0) return
    const url = apply(mapGet, urls, [this]) as string | undefined
    if (url && ask(url)) apply(setAdd, faked, [this])
  }
  const onError = function (this: XMLHttpRequest, e: Event) {
    if (!apply(setHas, faked, [this])) return
    apply(stop, e, [])
    try { apply(dispatch, this, [new ProgressEventC('load')]) } catch {}
  }
  const made = new ProxyC(XHR, {
    construct(target, args, newTarget) {
      const x = construct(target, args, newTarget) as XMLHttpRequest
      try { apply(listen, x, ['readystatechange', onState]); apply(listen, x, ['error', onError]) } catch {}
      return x
    },
  })
  apply(mapSet, originals, [made, XHR])
  const xhrD = gopd(me, 'XMLHttpRequest')
  if (xhrD) defp(me, 'XMLHttpRequest', { ...xhrD, value: made })
  // XMLHttpRequest.prototype.constructor is XMLHttpRequest, as before.
  const ctorD = gopd(XP, 'constructor')
  if (ctorD) defp(XP, 'constructor', { ...ctorD, value: made })

  const openD = gopd(XP, 'open')
  if (openD && typeof openD.value === 'function') {
    const open = openD.value as (...a: unknown[]) => void
    const hook = { open(this: XMLHttpRequest, ...a: unknown[]) {
      try { apply(setDel, faked, [this]); apply(mapSet, urls, [this, resolve(a[1])]) } catch {}
      return apply(open, this, a)
    } }.open
    defp(XP, 'open', { ...openD, value: same(hook, open) })
  }
  const fake = (name: string, value: (x: XMLHttpRequest) => unknown) => {
    const d = gopd(XP, name)
    if (!d?.get) return
    const g = d.get
    const get = gopd({ get [name]() { return apply(setHas, faked, [this]) ? value(this as XMLHttpRequest) : apply(g, this, []) } }, name)!.get!
    defp(XP, name, { ...d, get: same(get, g) })
  }
  fake('status', () => 200)
  fake('statusText', () => 'OK')
  fake('responseURL', x => (apply(mapGet, urls, [x]) as string | undefined) ?? '')
}

// Bait boxes. A detector puts an empty element with an ad's name in the
// page, off the screen or a pixel big, and measures it: collapsed by a
// hiding rule, it says an ad blocker is there. Such an element is marked as
// it comes in (before any timer of the page's can run), and a rule of the
// user's origin with more weight than any hiding rule shows it again.

// The parts of an id or class word (split at - and _ and where a capital
// starts a part: adBanner, text_ad, top-ad-slot) that name an ad.
const AD_PARTS = new Set(['ad', 'ads', 'adv', 'advert', 'adverts', 'advertisement', 'advertisements', 'advertising', 'sponsor', 'sponsored', 'sponsors',
  'adsbox', 'adbox', 'adsense', 'adslot', 'adunit', 'adbanner', 'bannerad', 'textad', 'textads', 'googlead', 'googleads', 'doubleclick', 'adblock',
  'adblocker', 'adzone', 'adspace', 'adcontainer', 'adwrapper', 'adplaceholder', 'adframe', 'adsbygoogle'])

/** An id or class word an ad box wears: ad, ads, ad-slot, top_ad, adBanner, pub_300x250... */
export function adWord(word: string): boolean {
  if (/^pub_\d+x\d+/i.test(word)) return true
  for (const part of word.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/)) if (part && AD_PARTS.has(part.toLowerCase())) return true
  return false
}

const INLINE = new Set(['ins', 'span', 'a', 'img', 'b', 'i', 'em', 'strong', 'small', 'label', 'font'])
const SHOWS = ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'list-item']
const px = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN }

function baitGuard(enabled: () => boolean): { set(on: boolean): void } {
  const mark = 'o' + Math.random().toString(36).slice(2, 9)
  let sheet: string | null = null
  // Eight ids in :not() outweigh any hiding rule, of the page or of the lists.
  const css = SHOWS.map(s => `[${mark}="${s}"]:not(#o#r#i#e#l#a#d#s){display:${s}!important}`).join('\n')
  const dress = (on: boolean) => {
    if (on && !sheet) { try { sheet = webFrame.insertCSS(css, { cssOrigin: 'user' }) } catch {} }
    if (!on && sheet) { try { webFrame.removeInsertedCSS(sheet) } catch {} sheet = null }
  }

  const empty = (el: Element) => !el.firstElementChild && !(el.textContent ?? '').replace(/[\s ​]/g, '')
  const named = (el: Element) => {
    const words = `${el.id} ${el.getAttribute('class') ?? ''}`.split(/\s+/)
    for (const w of words) if (w && adWord(w)) return true
    return false
  }
  /** Off the screen, a pixel or two big, or see-through: a box no one is meant to see. */
  const unseen = (cs: CSSStyleDeclaration) => {
    const placed = cs.position === 'absolute' || cs.position === 'fixed'
    const far = (v: string) => { const n = px(v); return n <= -300 || n >= 5000 }
    if (placed && (far(cs.left) || far(cs.top) || far(cs.right) || far(cs.bottom))) return true
    const w = px(cs.width), h = px(cs.height)
    if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) return true
    // See-through only out of the page's flow: shown, it takes no room.
    return placed && (cs.opacity === '0' || cs.visibility === 'hidden')
  }
  const check = (el: Element) => {
    if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return
    const marked = el.hasAttribute(mark)
    // Cheapest first: most elements have children, and most names aren't an ad's.
    if (el.firstElementChild || !named(el) || !empty(el)) { if (marked) el.removeAttribute(mark); return }
    if (marked) return
    // Hidden by the page itself: not a box it wants seen.
    if (el.style.display === 'none') return
    let cs: CSSStyleDeclaration
    try { cs = getComputedStyle(el) } catch { return }
    if (!unseen(cs)) return
    const own = el.style.display
    const show = own && own !== 'none' && SHOWS.includes(own) ? own
      : cs.position === 'absolute' || cs.position === 'fixed' ? 'block'
        : INLINE.has(el.localName) ? 'inline-block' : 'block'
    el.setAttribute(mark, show)
  }

  const watch = new MutationObserver(records => {
    if (!enabled()) return
    for (const r of records) {
      if (r.type === 'attributes') { check(r.target as Element); continue }
      // Something went into a marked box: no longer bait.
      if (r.target instanceof Element && r.target.hasAttribute(mark)) check(r.target)
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue
        check(n as Element)
        // A bait inside what came in (a wrapper's innerHTML): its empty boxes, a few hundred at most.
        if ((n as Element).firstElementChild) {
          const all = (n as Element).getElementsByTagName('*')
          for (let i = 0, k = 0; i < all.length && k < 300; i++) { const el = all[i]; if (!el.firstElementChild) { k++; check(el) } }
        }
      }
    }
  })
  watch.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id'] })
  dress(enabled())
  return {
    set(on: boolean) {
      dress(on)
      if (!on) for (const el of document.querySelectorAll(`[${mark}]`)) el.removeAttribute(mark)
    },
  }
}
