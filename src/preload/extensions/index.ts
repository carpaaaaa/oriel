// Preload for the extensions' own contexts (their pages and service
// workers), next to electron-chrome-extensions' one and registered before it,
// because that one freezes `chrome` at its end (studio/04 §3.5, studio/07
// §1.2). It puts in what Electron lacks or gets wrong:
//   - chrome.declarativeNetRequest backed by Search's engine (Electron's own
//     ignores static rulesets and is never used);
//   - `browser` as the same object as `chrome`, as in Chrome: Electron's is a
//     different, smaller one, so `browser.commands` was undefined and uBlock
//     Origin Lite's worker died at start.
//
// The build has no entry for this file yet, so the main process writes it to
// disk from this function's text (main/extensions/bridge.ts). Self-contained:
// no imports, `require` comes in as an argument.

export function extensionPreload(require: (id: string) => any, constants: Record<string, unknown>, methods: string[]): void {
  // A worker's preload has no `location`: the main world checks it there.
  const worker = typeof process !== 'undefined' && (process as any).type === 'service-worker'
  const href: string = (globalThis as any).location?.href ?? ''
  if (!worker && !href.startsWith('chrome-extension://')) return
  const { contextBridge, ipcRenderer } = require('electron')

  contextBridge.exposeInMainWorld('__searchExt', {
    call: (method: string, args: unknown[]) => ipcRenderer.invoke('search-ext:call', method, args),
  })

  // Runs in the extension's own world.
  function mainWorld(constants: Record<string, unknown>, methods: string[]): void {
    const g = globalThis as any
    const bridge = g.__searchExt
    try { delete g.__searchExt } catch { /* not configurable */ }
    if (!String(g.location?.href ?? '').startsWith('chrome-extension://')) return
    const chrome = g.chrome
    if (!chrome || !chrome.runtime || !bridge) return

    if (g.browser !== chrome) {
      try { Object.defineProperty(g, 'browser', { value: chrome, writable: true, configurable: true }) } catch { /* keep Electron's */ }
    }

    const native = chrome.declarativeNetRequest
    if (!native) return // no permission for it

    const withLastError = (message: string, f: () => void) => {
      let set = false
      try { Object.defineProperty(chrome.runtime, 'lastError', { value: { message }, configurable: true }); set = true } catch { /* read-only */ }
      try { f() } finally { if (set) try { delete chrome.runtime.lastError } catch { /* ignore */ } }
    }

    const wrap = (name: string) => function (...args: any[]) {
      const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null
      const promise = bridge.call('dnr.' + name, args).then((reply: any) => {
        if (reply && reply.error !== undefined) throw new Error(reply.error)
        return reply ? reply.value : undefined
      })
      if (!callback) return promise
      promise.then((value: unknown) => callback(value), (e: Error) => withLastError(e.message, () => callback()))
    }

    const api: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(constants)) api[k] = v
    for (const k of Object.keys(native)) if (typeof native[k] !== 'function') api[k] = native[k]
    for (const m of methods) api[m] = wrap(m)
    try {
      Object.defineProperty(chrome, 'declarativeNetRequest', { value: api, enumerable: true, configurable: true, writable: true })
    } catch {
      // `chrome` already frozen: change Electron's object in place.
      for (const m of methods) try { native[m] = api[m] } catch { /* read-only */ }
    }
  }

  contextBridge.executeInMainWorld({ func: mainWorld, args: [constants, methods] })
}
