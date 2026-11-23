// Bench requests of the extensions module (test/extensions_*.py).

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { installExtension } from 'electron-chrome-web-store'
import { benchRequest } from '../bench/server'
import { getExtensions, getProfile, unpackedPath } from './index'
import { dnr } from './dnr/engine'
import { benchMatcher } from './dnr/bench'
import { boundCommands } from './commands'
import { badgeOf } from './lib'
import { runtimes } from '../views/tabs'
import { allControllers, focusedController } from '../views/window'
import { answerNext, asked } from './ask'
import { popupOf } from './popup'
import { panelOf } from './sidepanel'
import { offscreenOf } from './offscreen'

const profile = () => { const p = getProfile(); if (!p) throw new Error('no profile'); return p }

benchRequest('extensions.install', async req => {
  const ext = await installExtension(String(req.id), { session: profile(), extensionsPath: path.join(app.getPath('userData'), 'Extensions') })
  return { id: ext.id, name: ext.name, version: ext.version }
})

/** A folder in place, or with {copy: true} copied first into Unpacked/ as
 * Load Unpacked does on the Mac (studio/04 §2.2, 5); the copy is prepared. */
benchRequest('extensions.loadUnpacked', async req => {
  let folder = String(req.path)
  if (req.copy) {
    const to = path.join(unpackedPath(), path.basename(folder))
    fs.rmSync(to, { recursive: true, force: true })
    fs.cpSync(folder, to, { recursive: true })
    folder = to
  }
  const ext = await profile().extensions.loadExtension(folder)
  return { id: ext.id, name: ext.name, version: ext.version, path: ext.path }
})

benchRequest('extensions.remove', req => {
  profile().extensions.removeExtension(String(req.id))
  return {}
})

benchRequest('extensions.list', () => ({
  extensions: profile().extensions.getAllExtensions().map(e => ({
    id: e.id, name: e.name, version: e.version, manifest_version: e.manifest.manifest_version, path: e.path,
    popup: (e.manifest as { action?: { default_popup?: string } }).action?.default_popup ?? null,
  })),
}))

/** chrome.declarativeNetRequest.<method>(...args) as the extension `id`. */
benchRequest('extensions.dnr', async req => {
  const f = dnr.api[String(req.method)]
  if (!f) throw new Error(`no method ${req.method}`)
  return { value: (await f(String(req.id), ...((req.args as unknown[]) ?? []))) ?? null }
})

/** What the engine would do with a request: {url, type, method, initiator}. */
benchRequest('extensions.dnrSimulate', req => dnr.simulate(req as never))

benchRequest('extensions.dnrState', req => {
  const st = dnr.state(String(req.id))
  if (!st) return { loaded: false }
  return {
    loaded: true,
    enabled: [...st.enabled],
    staticRules: st.sources.static.all.length,
    dynamicRules: st.dynamic.length,
    sessionRules: st.session.length,
    warnings: st.warnings.slice(0, 40),
    badge: st.badge,
    tabCounts: Object.fromEntries(st.tabCounts),
    index: st.sources.static.main.stats(),
  }
})

benchRequest('extensions.dnrTiming', () => ({
  ...(() => {
    const s = [...dnr.timing.samples].sort((a, b) => a - b)
    const at = (f: number) => s.length ? Math.round(s[Math.floor(s.length * f)] * 1000 * 10) / 10 : 0
    return { p50Us: at(0.5), p90Us: at(0.9), p99Us: at(0.99) }
  })(),
  requests: dnr.timing.requests,
  meanUs: dnr.timing.requests ? Math.round(dnr.timing.totalMs / dnr.timing.requests * 1000 * 10) / 10 : 0,
  maxUs: Math.round(dnr.timing.maxMs * 1000),
}))

benchRequest('extensions.dnrTimingReset', () => {
  Object.assign(dnr.timing, { requests: 0, totalMs: 0, maxMs: 0, samples: [] })
  return {}
})

/** {files: [...rule files], total, requests} */
benchRequest('extensions.dnrBench', req => benchMatcher({
  files: ((req.files as string[]) ?? []).filter(f => fs.existsSync(f)),
  total: Number(req.total ?? 0),
  requests: Number(req.requests ?? 20000),
}))

benchRequest('extensions.commands', () => ({ bound: boundCommands() }))

benchRequest('extensions.badge', req => {
  const e = getExtensions()
  return { text: e ? badgeOf(e, String(req.id), Number(req.tabId)) ?? null : null }
})

/** The webContents id of a tab: the id extensions see as tabId. */
benchRequest('extensions.tabId', req => {
  return { tabId: runtimes.get(String(req.tab))?.contents?.id ?? null }
})

// The interface and the APIs added in the second round (test/extensions_ui.py,
// test/extensions_apis.py).

/** The buttons to press for the next questions (none shows in a test world). */
benchRequest('extensions.answer', req => { answerNext((req.answers as string[]) ?? []); return {} })
benchRequest('extensions.asked', () => ({ asked }))

function windowOf(req: Record<string, unknown>) {
  const c = req.window ? allControllers().find(x => x.record.id === req.window) : focusedController()
  if (!c) throw new Error('no window')
  return c
}

benchRequest('extensions.popup', req => {
  const p = popupOf(windowOf(req))
  if (!p) return { open: false }
  const wc = p.view.webContents
  return { open: true, id: p.id, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), shown: p.shown, bounds: p.view.getBounds(), size: p.size }
})
benchRequest('extensions.popupEval', async req => {
  const p = popupOf(windowOf(req))
  if (!p) throw new Error('no popup')
  return { value: await p.view.webContents.executeJavaScript(String(req.js), true) }
})

benchRequest('extensions.panel', req => {
  const c = windowOf(req)
  const panel = panelOf(c)
  const id = c.record.active[c.record.space]
  const page = id ? runtimes.get(id)?.view?.getBounds() ?? null : null
  if (!panel) return { open: false, page }
  const wc = panel.view.webContents
  return { open: true, id: panel.id, url: wc.getURL(), title: wc.getTitle(), bounds: panel.view.getBounds(), page }
})
benchRequest('extensions.panelEval', async req => {
  const panel = panelOf(windowOf(req))
  if (!panel) throw new Error('no panel')
  return { value: await panel.view.webContents.executeJavaScript(String(req.js), true) }
})

benchRequest('extensions.offscreen', async req => {
  const wc = offscreenOf(String(req.id))
  if (!wc) return { open: false }
  return { open: true, url: wc.getURL(), value: req.js ? await wc.executeJavaScript(String(req.js), true) : null }
})
