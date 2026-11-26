// Frames a page makes by script (an iframe with no address, written into
// with document.write): Chromium runs no preload in them, so what a page or
// a frame is given would stop at their door (studio/06 §2.1, §2.3, §2.4).
// The frame that makes them hands its own share on, before its script gets
// hold of them: hooks in its world see each new frame as it goes into the
// page, is written in, or is first reached (contentWindow, contentDocument),
// and give it, in its own world,
//  - Prevent cross-site tracking: a site inside another reads no cookies
//    and writes none through a frame of its own (the same rule as its own);
//  - Tell sites not to sell or share your data: navigator.globalPrivacyControl;
//  - Block ads and trackers: the hiding rules and scriptlets of its maker,
//    whose site it is (as uBlock Origin treats an about:blank frame), user
//    stylesheets and scripts its page can't refuse (from here, by webFrame).
// The hooks take nothing from the page: what they call was kept before the
// page's own scripts, and each looks as it did.

import { contextBridge, webFrame } from 'electron'

export interface Share {
  /** Hiding rules (the maker's own) and scriptlets, asked when a frame comes. */
  cosmetics: () => { css: string; scripts: string[] }
  noCookies: boolean
  gpc: boolean
}

/** Puts the hooks in this frame's world (and its own cookie rule there). */
export function handOn(share: Share): void {
  const dress = (name: string) => {
    let f: Electron.WebFrame | null = null
    try { f = webFrame.findFrameByName(name) } catch {}
    if (!f) return
    const { css, scripts } = share.cosmetics()
    if (css) { try { f.insertCSS(css, { cssOrigin: 'user' }) } catch {} }
    // At once: before the maker's next line can reach it.
    for (const s of scripts) { try { void f.executeJavaScript(s).catch(() => {}) } catch {} }
  }
  try { contextBridge.executeInMainWorld({ func: hooks, args: [dress, share.noCookies, share.gpc] }) } catch {}
}

/** In the page's world (serialized: nothing from outside it). */
function hooks(dress: (name: string) => void, noCookies: boolean, gpc: boolean): void {
  const { apply } = Reflect
  const gopd = Object.getOwnPropertyDescriptor
  const defp = Object.defineProperty
  const has = WeakSet.prototype.has
  const add = WeakSet.prototype.add
  const drop = WeakSet.prototype.delete
  const mapGet = WeakMap.prototype.get
  const mapSet = WeakMap.prototype.set
  const random = Math.random
  const protoOf = Object.getPrototypeOf
  const Str = String
  const trim = String.prototype.trim
  const lower = String.prototype.toLowerCase
  const MO = MutationObserver
  const observe = MutationObserver.prototype.observe
  const disconnect = MutationObserver.prototype.disconnect
  const listen = EventTarget.prototype.addEventListener
  const targetOf = gopd(Event.prototype, 'target')!.get!
  const localNameOf = gopd(Element.prototype, 'localName')!.get!
  const attribute = Element.prototype.getAttribute
  const hasAttribute = Element.prototype.hasAttribute
  const urlOf = gopd(Document.prototype, 'URL')!.get!
  const readyStateOf = gopd(Document.prototype, 'readyState')!.get!
  const lengthOf = gopd(window, 'length')?.get
  const frameElementOf = gopd(window, 'frameElement')?.get
  const nameOf = gopd(window, 'name')
  const toString = Function.prototype.toString
  const nodesLength = gopd(NodeList.prototype, 'length')!.get!
  const nodeAt = NodeList.prototype.item
  const addedOf = gopd(MutationRecord.prototype, 'addedNodes')!.get!
  const me = window

  /** Each hook's original, so it reads as the original does. */
  const originals = new WeakMap<object, object>()
  const masked = { toString(this: unknown) { return apply(toString, (typeof this === 'function' && apply(mapGet, originals, [this])) || this, []) } }.toString
  apply(mapSet, originals, [masked, toString])
  defp(Function.prototype, 'toString', { value: masked, writable: true, enumerable: false, configurable: true })
  const same = <T extends object>(hook: T, original: object): T => {
    apply(mapSet, originals, [hook, original])
    try { defp(hook, 'length', { value: (original as { length: number }).length }) } catch {}
    return hook
  }

  const cookieGet = gopd({ get cookie() { return '' } }, 'cookie')!.get!
  const cookieSet = gopd({ set cookie(_v: string) {} }, 'cookie')!.set!
  const gpcGet = gopd({ get globalPrivacyControl() { return gpc } }, 'globalPrivacyControl')!.get!

  const realms = new WeakSet<object>()
  const documents = new WeakSet<object>()
  /** Frames of another site (no look inside): asked again once one loads. */
  const foreign = new WeakSet<object>()
  const contentWindows = new WeakMap<object, () => Window | null>()
  let names = 0
  const seed = String(apply(random, Math, [])).slice(2, 10)

  const docOf = (w: Window): Document | null => { try { return w.document } catch { return null } }

  /** A realm: its cookies, its navigator, and the hooks. */
  function guard(w: Window & typeof globalThis): void {
    let D: object
    try { D = w.Document } catch { return }
    if (!D || apply(has, realms, [D])) return
    apply(add, realms, [D])
    if (noCookies) {
      try {
        const P = w.Document.prototype
        const d = gopd(P, 'cookie')
        if (d) defp(P, 'cookie', { get: cookieGet, set: cookieSet, enumerable: d.enumerable, configurable: true })
      } catch {}
      try {
        const store = (w as unknown as { CookieStore?: { prototype: object } }).CookieStore
        if (store) {
          const refuse = () => Promise.reject(new DOMException('Cookies are blocked in this frame.', 'SecurityError'))
          defp(store.prototype, 'get', { value: () => Promise.resolve(null), writable: true, configurable: true })
          defp(store.prototype, 'getAll', { value: () => Promise.resolve([]), writable: true, configurable: true })
          defp(store.prototype, 'set', { value: refuse, writable: true, configurable: true })
          defp(store.prototype, 'delete', { value: refuse, writable: true, configurable: true })
        }
      } catch {}
    }
    try { defp(w.Navigator.prototype, 'globalPrivacyControl', { get: gpcGet, enumerable: true, configurable: true }) } catch {}
    hook(w)
  }

  const FRAME_TAGS = 'iframe,frame,object,embed'
  const isFrameTag = (n: unknown) => n === 'iframe' || n === 'frame' || n === 'object' || n === 'embed'
  const nodeTypeOf = gopd(Node.prototype, 'nodeType')!.get!
  const elementSelect = Element.prototype.querySelector
  const fragmentSelect = DocumentFragment.prototype.querySelector
  const indexOf = String.prototype.indexOf

  /** What a call puts in the page may hold a frame: a frame element, one
   * inside an element or a fragment, or markup that opens one. Anything
   * else leaves the frames as they were, and costs no look. */
  function framey(a: unknown): boolean {
    if (typeof a === 'string') {
      // Markup only: a string with no tag in it is no frame (and no copy of it is made).
      if (apply(indexOf, a, ['<']) < 0) return false
      const l = apply(lower, a, []) as string
      return apply(indexOf, l, ['<iframe']) >= 0 || apply(indexOf, l, ['<frame']) >= 0 || apply(indexOf, l, ['<object']) >= 0 || apply(indexOf, l, ['<embed']) >= 0
    }
    if (!a || typeof a !== 'object') return false
    try {
      const type = apply(nodeTypeOf, a, [])
      if (type === 1) return isFrameTag(apply(localNameOf, a, [])) || apply(elementSelect, a, [FRAME_TAGS]) !== null
      if (type === 11) return apply(fragmentSelect, a, [FRAME_TAGS]) !== null
    } catch {}
    return false
  }

  /** A frame element just put in (in a shadow root too, which a look from
   * the document misses), then every frame. */
  function settle(a: unknown[]): void {
    for (let i = 0; i < a.length; i++) {
      const el = a[i]
      try {
        if (!el || typeof el !== 'object' || apply(nodeTypeOf, el, []) !== 1 || !isFrameTag(apply(localNameOf, el, []))) continue
        if (!noCookies && addressed(el as Element)) continue
        const cw = apply(mapGet, contentWindows, [protoOf(el)]) as (() => Window | null) | undefined
        if (cw) reach(el, cw)
      } catch {}
    }
    scan()
  }

  function method(proto: object | undefined, name: string, always = false): void {
    const d = proto && gopd(proto, name)
    if (!d || typeof d.value !== 'function') return
    const f = d.value as (...a: unknown[]) => unknown
    const hookFn = { [name](this: unknown, ...a: unknown[]) {
      let maybe = always
      for (let i = 0; !maybe && i < a.length; i++) maybe = framey(a[i])
      try { return apply(f, this, a) } finally { if (maybe) settle(a) }
    } }[name]
    defp(proto, name, { value: same(hookFn, f), writable: d.writable, enumerable: d.enumerable, configurable: d.configurable })
  }

  function setter(proto: object | undefined, name: string): void {
    const d = proto && gopd(proto, name)
    if (!d || !d.set) return
    const s = d.set
    const set = gopd({ set [name](v: unknown) { const maybe = framey(v); try { apply(s, this, [v]) } finally { if (maybe) scan() } } }, name)!.set!
    defp(proto, name, { get: d.get, set: same(set, s), enumerable: d.enumerable, configurable: d.configurable })
  }

  /** A look inside a frame from its element (getSVGDocument): its share first. */
  function touch(proto: object | undefined, name: string, cw: (() => Window | null) | undefined): void {
    const d = proto && gopd(proto, name)
    if (!d || typeof d.value !== 'function' || !cw) return
    const f = d.value as (...a: unknown[]) => unknown
    const hookFn = { [name](this: unknown, ...a: unknown[]) { reach(this, cw); return apply(f, this, a) } }[name]
    defp(proto, name, { value: same(hookFn, f), writable: d.writable, enumerable: d.enumerable, configurable: d.configurable })
  }

  /** contentWindow and contentDocument: the frame is given its share first. */
  function getter(proto: object | undefined, name: string, cw: (() => Window | null) | undefined): void {
    const d = proto && gopd(proto, name)
    if (!d || !d.get || !cw) return
    const g = d.get
    const get = gopd({ get [name]() { reach(this, cw); return apply(g, this, []) } }, name)!.get!
    defp(proto, name, { get: same(get, g), set: d.set, enumerable: d.enumerable, configurable: d.configurable })
  }

  /** What puts a node in a page, or writes one in (indexed loops: a page
   * can't step in through an array's iterator). */
  const METHODS: [string, string[]][] = [
    ['Node', ['appendChild', 'insertBefore', 'replaceChild']],
    ['Element', ['append', 'prepend', 'before', 'after', 'replaceWith', 'replaceChildren', 'insertAdjacentElement', 'insertAdjacentHTML', 'setHTMLUnsafe', 'setHTML', 'moveBefore']],
    ['CharacterData', ['before', 'after', 'replaceWith']],
    ['DocumentType', ['before', 'after', 'replaceWith']],
    ['Document', ['append', 'prepend', 'replaceChildren', 'moveBefore', 'write', 'writeln', 'execCommand']],
    ['HTMLDocument', ['write', 'writeln']],
    ['ShadowRoot', ['setHTMLUnsafe', 'setHTML']],
    ['Range', ['insertNode']],
  ]
  const SETTERS: [string, string][] = [['Element', 'innerHTML'], ['Element', 'outerHTML'], ['ShadowRoot', 'innerHTML']]
  const FRAMES = ['HTMLIFrameElement', 'HTMLFrameElement', 'HTMLObjectElement']

  function hook(w: Window & typeof globalThis): void {
    const P = (n: string) => (w as unknown as Record<string, { prototype?: object } | undefined>)[n]?.prototype
    for (let i = 0; i < METHODS.length; i++) { const proto = P(METHODS[i][0]); const list = METHODS[i][1]; for (let j = 0; j < list.length; j++) method(proto, list[j]) }
    // Moves what the range holds (its frames load again): always a look.
    method(P('Range'), 'surroundContents', true)
    for (let i = 0; i < SETTERS.length; i++) setter(P(SETTERS[i][0]), SETTERS[i][1])
    for (let i = 0; i < FRAMES.length; i++) {
      const proto = P(FRAMES[i])
      const cw = proto && gopd(proto, 'contentWindow')?.get as (() => Window | null) | undefined
      if (proto && cw) apply(mapSet, contentWindows, [proto, cw])
      getter(proto, 'contentWindow', cw)
      getter(proto, 'contentDocument', cw)
      touch(proto, 'getSVGDocument', cw)
    }
    const doc = docOf(w)
    if (!doc) return
    // Frames in the page's own markup: seen before its next script runs.
    if (apply(readyStateOf, doc, []) === 'loading') {
      const mo = new MO(records => {
        for (let i = 0; i < records.length; i++) {
          const added = apply(addedOf, records[i], []) as NodeList
          const n = apply(nodesLength, added, []) as number
          for (let j = 0; j < n; j++) if (framey(apply(nodeAt, added, [j]))) { scan(); return }
        }
      })
      apply(observe, mo, [doc, { childList: true, subtree: true }])
      apply(listen, doc, ['DOMContentLoaded', () => apply(disconnect, mo, []), { once: true }])
    }
    // A frame that loads again (sent to about:blank, say) is looked at again.
    apply(listen, w, ['load', (e: Event) => {
      const t = apply(targetOf, e, []) as Element | null
      if (!t || t === (w as unknown) || t === (doc as unknown)) return
      let cw: (() => Window | null) | undefined
      try { cw = apply(mapGet, contentWindows, [protoOf(t)]) as typeof cw } catch {}
      if (cw) reach(t, cw)
    }, true])
  }

  function reach(el: unknown, cw: () => Window | null): void {
    try {
      const w = apply(cw, el, []) as Window | null
      if (!w) return
      apply(drop, foreign, [w])
      visit(w, 0)
    } catch {}
  }

  /** A frame element with an address of its own to load (src, srcdoc,
   * an object's data): its preload looks after it once it has. */
  function addressed(el: Element): boolean {
    try {
      if (apply(hasAttribute, el, ['srcdoc'])) return true
      const tag = apply(localNameOf, el, [])
      const src = apply(lower, apply(trim, Str(apply(attribute, el, [tag === 'object' ? 'data' : 'src']) ?? ''), []), [])
      return src !== '' && src !== 'about:blank'
    } catch { return false }
  }

  const elementOf = (w: Window): Element | null => {
    try { return apply(frameElementOf!, w, []) as Element | null } catch { try { return w.frameElement } catch { return null } }
  }

  /** The maker's hiding rules and scriptlets, from the preload (by a name
   * the frame wears for that moment alone). */
  function handOver(w: Window): void {
    const set = nameOf?.set
    const get = nameOf?.get
    let before = ''
    try { before = Str(get ? apply(get, w, []) : w.name) } catch {}
    const name = `oriel-${seed}-${++names}`
    try {
      if (set) apply(set, w, [name]); else w.name = name
      dress(name)
    } catch {} finally {
      try { if (set) apply(set, w, [before]); else w.name = before } catch {}
    }
  }

  /** A frame of this one's site. Its about:blank document (one it makes,
   * or the first of a frame still loading its address) gets the rules here;
   * one it makes gets the hiding rules and scriptlets too. A later document
   * in a window first seen as about:blank never had its preload (Chromium
   * keeps that window for the frame's next page of the same site): it gets
   * them from here. Any other document had its preload, which sees to it. */
  function visit(w: Window, depth: number): void {
    if (apply(has, foreign, [w])) return
    const doc = docOf(w)
    if (!doc) { apply(add, foreign, [w]); return }
    if (!apply(has, documents, [doc])) {
      apply(add, documents, [doc])
      let url = ''
      try { url = apply(urlOf, doc, []) as string } catch {}
      let D: object | null = null
      try { D = (w as Window & typeof globalThis).Document } catch {}
      if (url === 'about:blank') {
        guard(w as Window & typeof globalThis)
        const el = elementOf(w)
        if (!el || !addressed(el)) handOver(w)
      } else if (D && apply(has, realms, [D])) handOver(w)
      else return
    }
    if (depth < 8) frames(w, depth + 1)
  }

  const selectAll = Document.prototype.querySelectorAll

  /** A frame's frames. Where its cookies are kept from it, every one at
   * once (window[i], which the page could reach first). Elsewhere only the
   * ones with no address to load: a look inside one still loading would
   * keep its next page from getting its preload. */
  function frames(w: Window, depth: number): void {
    if (noCookies) {
      let n = 0
      try { n = apply(lengthOf!, w, []) as number } catch { try { n = w.length } catch { return } }
      for (let i = 0; i < n; i++) {
        let c: Window | null = null
        try { c = (w as unknown as Record<number, Window>)[i] } catch {}
        if (c) visit(c, depth)
      }
      return
    }
    const doc = docOf(w)
    if (!doc) return
    let list: NodeList
    try { list = apply(selectAll, doc, [FRAME_TAGS]) as NodeList } catch { return }
    const n = apply(nodesLength, list, []) as number
    for (let i = 0; i < n; i++) {
      const el = apply(nodeAt, list, [i]) as Element
      if (!el || addressed(el)) continue
      let cw: (() => Window | null) | undefined
      try { cw = apply(mapGet, contentWindows, [protoOf(el)]) as typeof cw } catch {}
      let c: Window | null = null
      try { c = cw ? apply(cw, el, []) as Window | null : (el as HTMLIFrameElement).contentWindow } catch {}
      if (c) visit(c, depth)
    }
  }

  let scanning = false
  function scan(): void {
    if (scanning) return
    scanning = true
    try { frames(me, 0) } catch {} finally { scanning = false }
  }

  guard(me as Window & typeof globalThis)
  scan()
}
