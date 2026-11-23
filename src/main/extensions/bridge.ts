// How the APIs Search adds reach an extension's pages and service worker, the
// way electron-chrome-extensions does it: a preload registered on the
// profile session for both kinds of context, and IPC back here. The
// extension is always the one the sender belongs to (its frame's address or
// its worker's scope), never what the renderer says.

import { app, ipcMain, type Session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { extensionPreload } from '../../preload/extensions'

const CHANNEL = 'search-ext:call'
// TODO(brand): brand.name from src/shared/brand.ts once merged.
const BRAND = 'Oriel'

type Handler = (extensionId: string, args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

/** An API call extensions can make: "dnr.updateDynamicRules"... */
export function onExtensionCall(name: string, handler: Handler): void { handlers.set(name, handler) }

function idOf(url: string | undefined): string | null {
  return /^chrome-extension:\/\/([a-p]{32})\//.exec(url ?? '')?.[1] ?? null
}

async function dispatch(profile: Session, id: string | null, method: unknown, args: unknown): Promise<{ value?: unknown; error?: string }> {
  if (!id || !profile.extensions.getExtension(id)) return { error: 'Not an extension context.' }
  const handler = handlers.get(String(method))
  if (!handler) return { error: `${String(method)} isn't available in ${BRAND}.` }
  try {
    return { value: await handler(id, Array.isArray(args) ? args : []) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Call before electron-chrome-extensions registers its preload: ours must
 * run first. */
export function setupBridge(profile: Session, constants: Record<string, unknown>, methods: string[]): void {
  const file = path.join(app.getPath('userData'), 'search-extensions-preload.cjs')
  const text = `"use strict";\n(${extensionPreload.toString()})(require, ${JSON.stringify(constants)}, ${JSON.stringify(methods)});\n`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text)
  profile.registerPreloadScript({ id: 'search-extensions-frame', type: 'frame', filePath: file })
  profile.registerPreloadScript({ id: 'search-extensions-worker', type: 'service-worker', filePath: file })

  ipcMain.handle(CHANNEL, (event, method, args) => {
    const e = event as unknown as { type?: string; serviceWorker?: Electron.ServiceWorkerMain; session?: Session }
    if (e.type === 'service-worker') {
      if (e.session !== profile) return { error: 'Not an extension context.' }
      return dispatch(profile, idOf(e.serviceWorker?.scope), method, args)
    }
    if (event.sender.session !== profile) return { error: 'Not an extension context.' }
    return dispatch(profile, idOf(event.senderFrame?.url), method, args)
  })

  const seen = new WeakSet<Electron.ServiceWorkerMain>()
  profile.serviceWorkers.on('running-status-changed', ({ versionId, runningStatus }) => {
    if (runningStatus !== 'starting') return
    const worker = profile.serviceWorkers.getWorkerFromVersionID(versionId)
    if (!worker || seen.has(worker) || !worker.scope.startsWith('chrome-extension://')) return
    seen.add(worker)
    worker.ipc.handle(CHANNEL, (_event, method, args) => dispatch(profile, idOf(worker.scope), method, args))
  })
}
