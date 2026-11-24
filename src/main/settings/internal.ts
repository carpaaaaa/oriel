// Oriel's own pages in a tab: oriel://settings, oriel://downloads... (search://
// on the Mac, InternalPages.swift; studio/06 §1.0, 02 §8.8). One bundle
// (out/ui/page.html) serves them all; the page to draw is the address's host.
//
// They are Oriel's, never a website's: a site can't frame them, fetch them,
// load them as an image or script, or navigate to them; only they get the
// bridge (preload/page/internal.ts), and the main process checks every
// command comes from one of them.

import { app, ipcMain, type Session, type WebContents } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brand } from '../../shared/brand'
import type { Command } from '../../shared/commands'
import { model } from '../model/model'
import { run, handle } from '../router'
import { hooks, onPageSession, runtimes } from '../views/tabs'
import { allControllers, controllerFor, type WindowController } from '../views/window'
import { need } from '../context'
import { allPrefs } from './prefs'
import { isInternal } from './openers'

const here = path.dirname(fileURLToPath(import.meta.url))
const uiDir = path.join(here, '../ui')
const assetsDir = path.join(uiDir, 'assets')

export const scheme = brand.scheme
export { isInternal, refusesInternal } from './openers'

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.map': 'application/json',
}

/** Never framed, never read by another origin, never sniffed. */
const guard = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

/** Requests let through: typed or opened by Oriel (no site behind them), or
 * from an Oriel page itself. Kept for the bench. */
export const refused: { url: string; site: string | null; origin: string | null }[] = []

function answer(request: Request): Response {
  const url = new URL(request.url)
  const site = request.headers.get('sec-fetch-site')
  const origin = request.headers.get('origin')
  const fromSite = (site && site !== 'none' && site !== 'same-origin') || (origin && origin !== 'null' && !origin.startsWith(`${scheme}://`))
  if (fromSite) {
    refused.push({ url: request.url, site, origin })
    return new Response('', { status: 403, headers: guard })
  }
  let file = path.join(uiDir, 'page.html')
  const at = url.pathname.indexOf('/assets/')
  if (at >= 0) {
    const wanted = path.normalize(path.join(assetsDir, decodeURIComponent(url.pathname.slice(at + 8))))
    if (!wanted.startsWith(assetsDir + path.sep) || !existsSync(wanted)) return new Response('', { status: 404, headers: guard })
    file = wanted
  }
  const type = types[path.extname(file)] ?? 'application/octet-stream'
  return new Response(readFileSync(file), { status: 200, headers: { ...guard, 'Content-Type': type } })
}

const served = new WeakSet<Session>()

/** Every session pages live in serves oriel:// (studio/02 §8.8). */
export function serveInternal(s: Session): void {
  if (served.has(s)) return
  served.add(s)
  if (!s.protocol.isProtocolHandled(scheme)) s.protocol.handle(scheme, answer)
}

onPageSession(s => serveInternal(s))

// A site navigating itself or a frame to an Oriel page is stopped there, and
// so is a redirect to one (Oriel's pages never redirect; studio/09 §1.4).
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-redirect', details => {
    if (!isInternal(details.url)) return
    refused.push({ url: details.url, site: 'redirect', origin: details.initiator?.url ?? null })
    details.preventDefault()
  })
  wc.on('will-frame-navigate', details => {
    if (!isInternal(details.url)) return
    const from = details.initiator?.url ?? ''
    if (!details.isMainFrame || !isInternal(from)) {
      refused.push({ url: details.url, site: 'navigation', origin: from })
      details.preventDefault()
      // The tabs module took the address at did-start-navigation; the page
      // never left, so the tab says where it still is.
      if (details.isMainFrame) setTimeout(() => {
        const where = tabOf(wc)
        if (where && !wc.isDestroyed() && model.tabs.get(where.tab)?.url !== wc.getURL()) model.updateTab(where.tab, { url: wc.getURL(), title: wc.getTitle() })
      }, 30)
    }
  })
})

// the bridge's other end

const pages = new Set<WebContents>()

/** The tab of an Oriel page, and its window. */
export function tabOf(wc: WebContents): { tab: string; window: WindowController | null } | null {
  for (const [id, rt] of runtimes) {
    if (rt.contents === wc) {
      const win = model.windowOf(id)
      return { tab: id, window: win ? controllerFor(win.id) ?? null : null }
    }
  }
  return null
}

/** What each Oriel page may ask of the main process, never everything: its
 * module names its commands ("history.list"; "download." for a family) and
 * the window-state parts it may read. Every page has `common`. */
interface PageGrant { commands: string[]; slices: string[] }
const grants = new Map<string, PageGrant>()
const common = ['internal.open', 'internal.state', 'tab.new', 'settings.values', 'settings.open']

/** For any module: what its oriel://<page> may do.
 *   allowPage('extensions', { commands: ['extension.pin', 'extension.remove'], slices: ['extensions'] })
 * then, in the page: window.oriel.cmd({ do: 'extension.pin', id, pinned: true }),
 * window.oriel.cmd({ do: 'internal.state', slice: 'extensions' }), and
 * window.oriel.on(u => u.kind === 'extensions' && ...), fed by tellPages('extensions', value, 'extensions'). */
export function allowPage(page: string, grant: Partial<PageGrant>): void {
  const g = grants.get(page) ?? { commands: [], slices: [] }
  g.commands.push(...(grant.commands ?? []))
  g.slices.push(...(grant.slices ?? []))
  grants.set(page, g)
}

const passwordsCommands = ['passwords.list', 'passwords.remove', 'passwords.removeAll', 'passwords.reveal', 'passwords.copy', 'passwords.add', 'passwords.forgetNever']
allowPage('settings', {
  commands: ['settings.', 'permission.', 'import.open', 'passwords.list', 'passwords.forgetNever', 'history.clear', 'downloads.show'],
  slices: ['prefs'],
})
allowPage('downloads', { commands: ['download.', 'downloads.show'], slices: ['downloads', 'settings'] })
allowPage('passwords', { commands: [...passwordsCommands, 'import.open', 'import.file'] })
allowPage('release-notes', { commands: ['update.notes'] })
// The data module's page (src/ui/data/HistoryPage.tsx).
allowPage('history', { commands: ['history.list', 'history.forget', 'history.clear', 'tab.go'] })

const hostOf = (url: string) => { try { return new URL(url).host } catch { return '' } }
const fits = (list: string[], name: string) => list.some(a => (a.endsWith('.') ? name.startsWith(a) : name === a))

ipcMain.handle('oriel:command', async (event, command: Command) => {
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame || !isInternal(frame.url)) throw new Error('not an Oriel page')
  const page = hostOf(frame.url)
  const name = String(command?.do ?? '')
  const grant = grants.get(page)
  if (!fits(common, name) && !(grant && fits(grant.commands, name))) throw new Error(`not for oriel://${page}: ${name}`)
  if (!pages.has(event.sender)) {
    pages.add(event.sender)
    event.sender.once('destroyed', () => pages.delete(event.sender))
  }
  const where = tabOf(event.sender)
  if (name === 'internal.state') {
    const slice = String((command as { slice?: string }).slice ?? '')
    if (!grant?.slices.includes(slice)) throw new Error(`oriel://${page} doesn't read ${slice}`)
    return where?.window ? (where.window.state() as unknown as Record<string, unknown>)[slice] ?? null : null
  }
  return run(command as never, { window: where?.window ?? null })
})

/** Tell open Oriel pages something new (kind: 'prefs', 'downloads'...): all
 * of them, those of one page ('extensions'), or those `only` picks. */
export function tellPages(kind: string, value: unknown, only?: string | ((wc: WebContents) => boolean)): void {
  for (const wc of pages) {
    if (wc.isDestroyed()) { pages.delete(wc); continue }
    if (typeof only === 'string' && hostOf(wc.getURL()) !== only) continue
    if (typeof only === 'function' && !only(wc)) continue
    wc.send('oriel:update', { kind, value })
  }
}

let prefsTimer: NodeJS.Timeout | null = null
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs') || prefsTimer) return
  prefsTimer = setTimeout(() => { prefsTimer = null; tellPages('prefs', allPrefs(), 'settings') }, 0)
})

/** Opens an Oriel page in this window: the tab already showing that kind of
 * page if there is one (one of each, InternalPages.swift; the tabs module's
 * showInternal), else a new tab. */
export async function openInternal(c: WindowController, url: string): Promise<string | null> {
  await run({ do: 'tab.new', url } as never, { window: c })
  const host = new URL(url).host
  const id = model.spaceTabs(c.record).find(t => model.tabs.get(t)?.internal === host)
  return id ?? c.record.active[c.record.space] ?? null
}

// The tabs module keeps no page behind an internal tab (views/tabs.ts fill()
// and load() skip them): here the Oriel page is the tab's page, loaded into
// the view it makes, and moved to another section in place.
function loadInternal(id: string, wc: WebContents): void {
  const t = model.tabs.get(id)
  if (!t?.internal || wc.isDestroyed()) return
  const now = wc.getURL()
  if (now === t.url) return
  try {
    if (isInternal(now) && new URL(now).host === new URL(t.url).host) { wc.send('oriel:update', { kind: 'go', value: t.url }); return }
  } catch {}
  wc.loadURL(t.url).catch(() => {})
}

app.whenReady().then(() => setImmediate(() => {
  const previous = hooks.created
  hooks.created = (tab, contents) => {
    previous?.(tab, contents)
    // After the tabs module's fill(), which leaves an internal tab blank.
    setImmediate(() => loadInternal(tab.id, contents))
  }
}))

model.on('tab-changed', (tab: { id: string; internal?: string }, patch: Record<string, unknown>) => {
  if (!tab.internal || !('url' in patch || 'internal' in patch)) return
  const wc = runtimes.get(tab.id)?.contents
  if (wc) loadInternal(tab.id, wc)
})

handle('internal.open', ({ url }, ctx) => {
  if (!isInternal(url)) throw new Error('not an Oriel page')
  return openInternal(need(ctx), url)
})

/** A tab's page, by id, when it is an Oriel page (for the bench). */
export function internalContents(id: string): WebContents | null {
  const wc = runtimes.get(id)?.contents
  return wc && isInternal(wc.getURL()) ? wc : null
}

export function windows(): WindowController[] { return allControllers() }

// The same, asked by the interface or the bench (no page grant to check).
handle('internal.state', ({ slice }, ctx) => (need(ctx).state() as unknown as Record<string, unknown>)[slice] ?? null)
