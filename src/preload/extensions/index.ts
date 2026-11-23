// Preload for the extensions' own contexts (their pages and service
// workers), next to electron-chrome-extensions' one and registered before it,
// because that one freezes `chrome` at its end (studio/04 §3.5, studio/07
// §1.2). It puts in what Electron lacks or gets wrong:
//   - chrome.declarativeNetRequest backed by Oriel's engine (Electron's own
//     ignores static rulesets and is never used);
//   - sidePanel, offscreen, identity, tabGroups, for extensions that ask for
//     them in their manifest (studio/04 §3.1);
//   - `browser` as the same object as `chrome`, as in Chrome: Electron's is a
//     different, smaller one, so `browser.commands` was undefined and uBlock
//     Origin Lite's worker died at start;
//   - window.close() in a popup or a side panel closes it.
//
// The build has no entry for this file yet, so the main process writes it to
// disk from this function's text (main/extensions/bridge.ts). Self-contained:
// no imports, `require` comes in as an argument.

export function extensionPreload(require: (id: string) => any, constants: Record<string, unknown>, methods: string[], apis: string[]): void {
  // A worker's preload has no `location`: the main world checks it there.
  const worker = typeof process !== 'undefined' && (process as any).type === 'service-worker'
  const href: string = (globalThis as any).location?.href ?? ''
  if (!worker && !href.startsWith('chrome-extension://')) return
  const { contextBridge, ipcRenderer } = require('electron')

  contextBridge.exposeInMainWorld('__searchExt', {
    call: (method: string, args: unknown[]) => ipcRenderer.invoke('search-ext:call', method, args),
  })

  // Runs in the extension's own world.
  function mainWorld(constants: Record<string, unknown>, methods: string[], apis: string[]): void {
    const g = globalThis as any
    const bridge = g.__searchExt
    try { delete g.__searchExt } catch { /* not configurable */ }
    if (!String(g.location?.href ?? '').startsWith('chrome-extension://')) return
    const chrome = g.chrome
    if (!chrome || !chrome.runtime || !bridge) return

    if (g.browser !== chrome) {
      try { Object.defineProperty(g, 'browser', { value: chrome, writable: true, configurable: true }) } catch { /* keep Electron's */ }
    }

    const withLastError = (message: string, f: () => void) => {
      let set = false
      try { Object.defineProperty(chrome.runtime, 'lastError', { value: { message }, configurable: true }); set = true } catch { /* read-only */ }
      try { f() } finally { if (set) try { delete chrome.runtime.lastError } catch { /* ignore */ } }
    }

    const wrap = (name: string) => function (...args: any[]) {
      const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null
      const promise = bridge.call(name, args).then((reply: any) => {
        if (reply && reply.error !== undefined) throw new Error(reply.error)
        return reply ? reply.value : undefined
      })
      if (!callback) return promise
      promise.then((value: unknown) => callback(value), (e: Error) => withLastError(e.message, () => callback()))
    }

    class Event {
      private listeners: ((...a: unknown[]) => void)[] = []
      addListener(f: (...a: unknown[]) => void) { this.listeners.push(f) }
      removeListener(f: (...a: unknown[]) => void) { this.listeners = this.listeners.filter(l => l !== f) }
      hasListener(f: (...a: unknown[]) => void) { return this.listeners.includes(f) }
      hasListeners() { return this.listeners.length > 0 }
    }

    const define = (name: string, api: Record<string, unknown>, native?: Record<string, unknown>) => {
      try {
        Object.defineProperty(chrome, name, { value: api, enumerable: true, configurable: true, writable: true })
      } catch {
        // `chrome` already frozen: change Electron's object in place.
        if (native) for (const [k, v] of Object.entries(api)) try { native[k] = v } catch { /* read-only */ }
      }
    }

    // declarativeNetRequest, where Electron gives it (it does with the permission).
    const native = chrome.declarativeNetRequest
    if (native) {
      const api: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(constants)) api[k] = v
      for (const k of Object.keys(native)) if (typeof native[k] !== 'function') api[k] = native[k]
      for (const m of methods) api[m] = wrap('dnr.' + m)
      define('declarativeNetRequest', api, native)
    }

    // Namespaces Electron doesn't have, for extensions that ask for them.
    const manifest = chrome.runtime.getManifest?.() ?? {}
    const asked = new Set<string>([...(manifest.permissions ?? [])])
    const spaces: Record<string, Record<string, unknown>> = {}
    for (const full of apis) {
      const [ns, m] = full.split('.')
      if (asked.has(ns)) (spaces[ns] ??= {})[m] = wrap(full)
    }
    if (spaces.offscreen) {
      spaces.offscreen.Reason = Object.fromEntries(['TESTING', 'AUDIO_PLAYBACK', 'IFRAME_SCRIPTING', 'DOM_SCRAPING', 'BLOBS', 'DOM_PARSER', 'USER_MEDIA', 'DISPLAY_MEDIA', 'WEB_RTC', 'CLIPBOARD', 'LOCAL_STORAGE', 'WORKERS', 'BATTERY_STATUS', 'MATCH_MEDIA', 'GEOLOCATION'].map(k => [k, k]))
    }
    if (spaces.identity) {
      spaces.identity.getRedirectURL = (path = '') => 'https://' + chrome.runtime.id + '.chromiumapp.org/' + String(path).replace(/^\//, '')
      spaces.identity.onSignInChanged = new Event()
    }
    if (spaces.tabGroups) {
      spaces.tabGroups.TAB_GROUP_ID_NONE = -1
      spaces.tabGroups.Color = Object.fromEntries(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'].map(c => [c.toUpperCase(), c]))
      for (const e of ['onCreated', 'onRemoved', 'onUpdated', 'onMoved']) spaces.tabGroups[e] = new Event()
    }
    for (const [ns, api] of Object.entries(spaces)) define(ns, { ...(chrome[ns] ?? {}), ...api }, chrome[ns])

    // A popup or a side panel goes away on window.close(), as in Chrome.
    if (typeof document !== 'undefined' && typeof g.close === 'function') {
      const close = g.close.bind(g)
      g.close = () => { bridge.call('ui.close', []).then((r: any) => { if (!r?.value) close() }, () => close()) }
    }
  }

  contextBridge.executeInMainWorld({ func: mainWorld, args: [constants, methods, apis] })
}
