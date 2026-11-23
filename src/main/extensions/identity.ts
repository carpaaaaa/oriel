// chrome.identity (studio/04 §3.1, ExtensionAuth on the Mac): the flow ends
// the moment its page heads for https://<id>.chromiumapp.org/, whose address
// is the answer; nothing is ever loaded from there.
//   - Interactive: a tab in front; closing it, or ten minutes, is a no.
//   - Not interactive (the default, as in Chrome): a view never on screen,
//     signed in as the tabs are; it fails once the page has loaded (unless
//     abortOnLoadForNonInteractive is false) or after the time asked, at
//     most a minute. One flow per extension; a new one ends the last.
//   - getAuthToken needs Chrome's Google account: refused with the Mac's words.

import { WebContentsView, type Session } from 'electron'
import { run } from '../router'
import { focusedController } from '../views/window'
import { runtimeFor } from '../views/tabs'
import { model } from '../model/model'

const DECLINED = 'The user did not approve access.'
const QUIET = 'User interaction required.'
const LONGEST = 60_000

let profile: Session | null = null
export function setupIdentity(p: Session): void { profile = p }

const flows = new Map<string, (r: { url?: string; error?: string }) => void>()

function isMine(url: string, id: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname.toLowerCase() === `${id}.chromiumapp.org` } catch { return false }
}

/** Watch a page for its way to the extension's chromiumapp.org. */
function watch(wc: Electron.WebContents, id: string, end: (url: string) => void): void {
  const check = (e: { preventDefault(): void }, url: string) => { if (isMine(url, id)) { e.preventDefault(); end(url) } }
  wc.on('will-navigate', (e, url) => check(e, url))
  wc.on('will-redirect', (e, url) => check(e, url))
  wc.on('will-frame-navigate', e => check(e, e.url))
  wc.setWindowOpenHandler(({ url }) => { if (isMine(url, id)) end(url); return { action: 'deny' } })
}

async function launch(id: string, spec: { url?: string; interactive?: boolean; abortOnLoadForNonInteractive?: boolean; timeoutMsForNonInteractive?: number }): Promise<string> {
  let url: URL
  try { url = new URL(String(spec.url ?? '')) } catch { throw new Error('Authorization page could not be loaded.') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Authorization page could not be loaded.')
  flows.get(id)?.({ error: spec.interactive ? DECLINED : QUIET })
  return new Promise<string>((resolve, reject) => {
    let finished = false
    const cleanups: (() => void)[] = []
    const finish = (r: { url?: string; error?: string }) => {
      if (finished) return
      finished = true
      if (flows.get(id) === finish) flows.delete(id)
      for (const f of cleanups) try { f() } catch { /* gone */ }
      if (r.url) resolve(r.url); else reject(new Error(r.error ?? DECLINED))
    }
    flows.set(id, finish)

    if (spec.interactive) {
      const c = focusedController()
      if (!c) return finish({ error: DECLINED })
      void (async () => {
        const tabId = await run({ do: 'tab.new', url: url.href } as never, { window: c }) as string
        const view = runtimeFor(tabId, c.pageSession).ensure()
        c.placePages()
        const wc = view.webContents
        watch(wc, id, u => finish({ url: u }))
        wc.once('destroyed', () => finish({ error: DECLINED }))
        const timer = setTimeout(() => finish({ error: DECLINED }), 600_000)
        cleanups.push(() => clearTimeout(timer), () => { const win = model.windowOf(tabId); if (win) model.closeTab(win, tabId) })
      })()
      return
    }

    if (!profile) return finish({ error: QUIET })
    const view = new WebContentsView({ webPreferences: { session: profile, sandbox: true, contextIsolation: true } })
    const wc = view.webContents
    watch(wc, id, u => finish({ url: u }))
    wc.on('did-fail-load', (_e, code, _d, _u, main) => { if (main && code !== -3) finish({ error: QUIET }) })
    if (spec.abortOnLoadForNonInteractive !== false) wc.on('did-finish-load', () => setTimeout(() => finish({ error: QUIET }), 0))
    const limit = Math.min(Math.max(spec.timeoutMsForNonInteractive ?? LONGEST, 500), LONGEST)
    const timer = setTimeout(() => finish({ error: QUIET }), limit)
    cleanups.push(() => clearTimeout(timer), () => { if (!wc.isDestroyed()) wc.close() })
    void wc.loadURL(url.href).catch(() => {})
  })
}

export const identityApi: Record<string, (id: string, ...args: any[]) => unknown> = {
  launchWebAuthFlow: (id, spec = {}) => launch(id, spec),
  getAuthToken: () => { throw new Error('getAuthToken needs a Google account signed into Chrome; this extension would need launchWebAuthFlow instead') },
  getProfileUserInfo: () => ({ email: '', id: '' }),
  removeCachedAuthToken: () => undefined,
  clearAllCachedAuthTokens: () => undefined,
}

/** chrome.tabGroups, minimal: no groups yet (Claude only needs it there). */
export const tabGroupsApi: Record<string, (id: string, ...args: any[]) => unknown> = {
  query: () => [],
  get: (_id, groupId: number) => { throw new Error(`No group with id: ${groupId}.`) },
  update: (_id, groupId: number) => { throw new Error(`No group with id: ${groupId}.`) },
  move: (_id, groupId: number) => { throw new Error(`No group with id: ${groupId}.`) },
}
