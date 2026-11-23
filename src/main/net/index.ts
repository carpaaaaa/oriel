// The only owner of session.webRequest. Electron allows one listener per
// webRequest event per session, so everything that looks at requests (the
// extensions' declarativeNetRequest, Search's own Shield, clean links, GPC,
// HTTPS first) registers here, in order, and this calls them in turn.
// Owned by the orchestrator.

import type { Session, OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from 'electron'

export type BeforeRequest = (d: OnBeforeRequestListenerDetails) => { cancel?: boolean; redirectURL?: string } | void
export type BeforeSendHeaders = (d: OnBeforeSendHeadersListenerDetails, headers: Record<string, string>) => { cancel?: boolean } | void
export type HeadersReceived = (d: OnHeadersReceivedListenerDetails, headers: Record<string, string[]>) => { cancel?: boolean } | void

interface Filter { name: string; order: number }
const before: (Filter & { f: BeforeRequest })[] = []
const sendHeaders: (Filter & { f: BeforeSendHeaders })[] = []
const received: (Filter & { f: HeadersReceived })[] = []

/** Lower order runs first. Search's own: Shield 100, DNR 200, clean links 300. */
export const net = {
  onBeforeRequest(name: string, order: number, f: BeforeRequest) { before.push({ name, order, f }); before.sort((a, b) => a.order - b.order) },
  onBeforeSendHeaders(name: string, order: number, f: BeforeSendHeaders) { sendHeaders.push({ name, order, f }); sendHeaders.sort((a, b) => a.order - b.order) },
  onHeadersReceived(name: string, order: number, f: HeadersReceived) { received.push({ name, order, f }); received.sort((a, b) => a.order - b.order) },
}

const attached = new WeakSet<Session>()

/** Every page session goes through here once. */
export function attachNet(session: Session): void {
  if (attached.has(session)) return
  attached.add(session)
  session.webRequest.onBeforeRequest((details, callback) => {
    for (const { f, name } of before) {
      try {
        const r = f(details)
        if (r && (r.cancel || r.redirectURL)) return callback(r)
      } catch (e) { console.warn(`[net] ${name}`, e) }
    }
    callback({})
  })
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }
    for (const { f, name } of sendHeaders) {
      try { if (f(details, headers)?.cancel) return callback({ cancel: true }) } catch (e) { console.warn(`[net] ${name}`, e) }
    }
    callback({ requestHeaders: headers })
  })
  session.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...(details.responseHeaders ?? {}) }
    for (const { f, name } of received) {
      try { if (f(details, headers)?.cancel) return callback({ cancel: true }) } catch (e) { console.warn(`[net] ${name}`, e) }
    }
    callback({ responseHeaders: headers })
  })
}
