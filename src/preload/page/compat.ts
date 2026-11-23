// Chrome's own page APIs that Chromium in Electron leaves out: window.chrome
// is there but empty, while Chrome has chrome.app, chrome.csi and
// chrome.loadTimes. Sites use them (and some read an empty window.chrome as
// "not a real browser"). Values follow Chrome's own shapes.
// Owned by the orchestrator.

import { contextBridge } from 'electron'

contextBridge.executeInMainWorld({
  func: () => {
    const w = window as unknown as { chrome?: Record<string, unknown> }
    const chrome = (w.chrome ??= {}) as Record<string, unknown>
    const native = (name: string, f: (...a: unknown[]) => unknown) => {
      Object.defineProperty(f, 'name', { value: name })
      const src = `function ${name}() { [native code] }`
      Object.defineProperty(f, 'toString', { value: () => src, enumerable: false })
      return f
    }
    if (!chrome.app) {
      const InstallState = { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }
      const RunningState = { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
      chrome.app = {
        isInstalled: false,
        InstallState,
        RunningState,
        getDetails: native('getDetails', () => null),
        getIsInstalled: native('getIsInstalled', () => false),
        installState: native('installState', (cb: unknown) => { if (typeof cb === 'function') setTimeout(() => cb('not_installed')) }),
        runningState: native('runningState', () => 'cannot_run'),
      }
    }
    const nav = () => performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const origin = performance.timeOrigin
    if (!chrome.csi) {
      chrome.csi = native('csi', () => {
        const n = nav()
        return { startE: Math.round(origin), onloadT: Math.round(origin + (n?.domContentLoadedEventEnd ?? 0)), pageT: performance.now(), tran: 15 }
      })
    }
    if (!chrome.loadTimes) {
      chrome.loadTimes = native('loadTimes', () => {
        const n = nav()
        const s = (ms: number | undefined) => (origin + (ms ?? 0)) / 1000
        const proto = (n as unknown as { nextHopProtocol?: string })?.nextHopProtocol ?? 'h2'
        return {
          requestTime: s(n?.requestStart), startLoadTime: s(n?.startTime), commitLoadTime: s(n?.responseStart),
          finishDocumentLoadTime: s(n?.domContentLoadedEventEnd), finishLoadTime: s(n?.loadEventEnd),
          firstPaintTime: s(performance.getEntriesByName('first-paint')[0]?.startTime), firstPaintAfterLoadTime: 0,
          navigationType: n?.type === 'reload' ? 'Reload' : n?.type === 'back_forward' ? 'BackForward' : 'Other',
          wasFetchedViaSpdy: proto === 'h2' || proto === 'h3', wasNpnNegotiated: proto === 'h2' || proto === 'h3',
          npnNegotiatedProtocol: proto, wasAlternateProtocolAvailable: false, connectionInfo: proto,
        }
      })
    }
  },
})
