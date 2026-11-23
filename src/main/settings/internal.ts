// Oriel's own pages in a tab: oriel://settings, oriel://downloads... (search://
// on the Mac, InternalPages.swift; studio/06 §1.0, 02 §8.8). One bundle
// (out/ui/page.html) serves them all; the page to draw is the address's host.
//
// They are Oriel's, never a website's: a site can't frame them, fetch them,
// load them as an image or script, or navigate to them; only they get the
// bridge (preload/page/internal.ts), and the main process checks every
// command comes from one of them.

import { app, ipcMain, session as electronSession, type Session, type WebContents } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brand } from '../../shared/brand'
import type { Command } from '../../shared/commands'
import { model } from '../model/model'
import { run, handle } from '../router'
import { runtimes } from '../views/tabs'
import { allControllers, controllerFor, type WindowController } from '../views/window'
import { need } from '../context'

const here = path.dirname(fileURLToPath(import.meta.url))
const uiDir = path.join(here, '../ui')
const assetsDir = path.join(uiDir, 'assets')

export const scheme = brand.scheme
export const isInternal = (url: string | undefined | null) => !!url && url.startsWith(`${scheme}:`)

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

app.on('session-created', s => { if (s !== electronSession.defaultSession) serveInternal(s) })

// A site navigating itself or a frame to an Oriel page is stopped there.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-frame-navigate', details => {
    if (!isInternal(details.url)) return
    const from = details.initiator?.url ?? ''
    if (!details.isMainFrame || !isInternal(from)) {
      refused.push({ url: details.url, site: 'navigation', origin: from })
      details.preventDefault()
    }
  })
})

/** For the tabs module's window-open hook: a website asking for a window at
 * an Oriel page gets nothing (Chrome refuses chrome:// the same way). */
export function refusesInternal(fromURL: string, toURL: string): boolean {
  return isInternal(toURL) && !isInternal(fromURL)
}

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

/** What an Oriel page may ask of the main process. */
const allowed = [
  'settings.', 'permission.', 'download.', 'internal.',
  'passwords.list', 'passwords.remove', 'passwords.removeAll', 'passwords.reveal', 'passwords.copy', 'passwords.add', 'passwords.forgetNever',
  'history.list', 'history.forget', 'history.clear', 'bookmark.list', 'import.open', 'tab.new', 'tab.go',
]

ipcMain.handle('oriel:command', async (event, command: Command) => {
  const frame = event.senderFrame
  if (!frame || frame !== event.sender.mainFrame || !isInternal(frame.url)) throw new Error('not an Oriel page')
  const name = String(command?.do ?? '')
  if (!allowed.some(a => (a.endsWith('.') ? name.startsWith(a) : name === a))) throw new Error(`not for a page: ${name}`)
  if (!pages.has(event.sender)) {
    pages.add(event.sender)
    event.sender.once('destroyed', () => pages.delete(event.sender))
  }
  const where = tabOf(event.sender)
  return run(command as never, { window: where?.window ?? null })
})

/** Tell every open Oriel page (kind: 'prefs', 'downloads', 'permissions'...). */
export function tellPages(kind: string, value: unknown, only?: (wc: WebContents) => boolean): void {
  for (const wc of pages) {
    if (wc.isDestroyed()) { pages.delete(wc); continue }
    if (only && !only(wc)) continue
    wc.send('oriel:update', { kind, value })
  }
}

let prefsTimer: NodeJS.Timeout | null = null
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs') || prefsTimer) return
  prefsTimer = setTimeout(() => { prefsTimer = null; tellPages('prefs', model.prefs) }, 0)
})

/** Opens an Oriel page in this window: the tab already showing that page if
 * there is one (one Settings per window, InternalPages.swift), else a new
 * tab beside the current one. */
export async function openInternal(c: WindowController, url: string): Promise<string | null> {
  const host = new URL(url).host
  const ids = model.spaceTabs(c.record)
  const existing = ids.find(id => {
    const t = model.tabs.get(id)
    try { return !!t && isInternal(t.url) && new URL(t.url).host === host } catch { return false }
  })
  if (existing) {
    await run({ do: 'tab.select', id: existing } as never, { window: c })
    const rt = runtimes.get(existing)
    const page = url.slice(`${scheme}://${host}`.length).replace(/^\//, '')
    if (rt?.contents && !rt.contents.isDestroyed()) rt.contents.send('oriel:update', { kind: 'go', value: page })
    return existing
  }
  await run({ do: 'tab.new', url } as never, { window: c })
  return c.record.active[c.record.space] ?? null
}

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
