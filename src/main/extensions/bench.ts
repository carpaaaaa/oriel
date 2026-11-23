// Bench requests of the extensions module (test/extensions_*.py).

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { installExtension } from 'electron-chrome-web-store'
import { benchRequest } from '../bench/server'
import { getExtensions, getProfile } from './index'
import { dnr } from './dnr/engine'
import { benchMatcher } from './dnr/bench'
import { boundCommands } from './commands'
import { badgeOf } from './lib'
import { runtimes } from '../views/tabs'

const profile = () => { const p = getProfile(); if (!p) throw new Error('no profile'); return p }

benchRequest('extensions.install', async req => {
  const ext = await installExtension(String(req.id), { session: profile(), extensionsPath: path.join(app.getPath('userData'), 'Extensions') })
  return { id: ext.id, name: ext.name, version: ext.version }
})

/** Tests only: a folder as is (Load Unpacked, without the copy). */
benchRequest('extensions.loadUnpacked', async req => {
  const ext = await profile().extensions.loadExtension(String(req.path))
  return { id: ext.id, name: ext.name, version: ext.version }
})

benchRequest('extensions.remove', req => {
  profile().extensions.removeExtension(String(req.id))
  return {}
})

benchRequest('extensions.list', () => ({
  extensions: profile().extensions.getAllExtensions().map(e => ({ id: e.id, name: e.name, version: e.version, manifest_version: e.manifest.manifest_version, path: e.path })),
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
  requests: dnr.timing.requests,
  meanUs: dnr.timing.requests ? Math.round(dnr.timing.totalMs / dnr.timing.requests * 1000 * 10) / 10 : 0,
  maxUs: Math.round(dnr.timing.maxMs * 1000),
}))

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

/** The webContents id of a Search tab: the id extensions see as tabId. */
benchRequest('extensions.tabId', req => {
  return { tabId: runtimes.get(String(req.tab))?.contents?.id ?? null }
})
