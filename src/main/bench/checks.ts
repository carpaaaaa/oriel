// The bench's view of the checks of studio/09: what the guards refused
// (§1.1, §1.4), a stranger with the interface's bridge, what an installed
// copy would make of the test knobs (§1.2), a write Windows holds (§3).
// Only answers in a test world.

import { WebContentsView, session } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { benchRequest } from './server'
import { refusedOpens } from '../settings/openers'
import { testEnv, testHooksAllowed } from '../testhooks'
import { refusedNavigations } from '../views/guard'
import { allControllers, uiPreload } from '../views/window'
import { writeJSONNow } from '../model/persist'
import { dataFile } from '../paths'

benchRequest('guard.state', () => ({
  navigations: [...refusedNavigations],
  opens: [...refusedOpens],
  views: allControllers().map(c => ({ ui: c.ui.webContents.getURL(), overlay: c.overlay.webContents.getURL() })),
}))

/** A view Oriel didn't make for a window's interface, with the interface's
 * preload all the same (so window.search exists in it), at `url`: what its
 * commands and hello get. */
benchRequest('guard.stranger', async req => {
  const view = new WebContentsView({
    webPreferences: { preload: uiPreload, sandbox: true, contextIsolation: true, session: session.defaultSession, additionalArguments: ['--search-root=chrome'] },
  })
  try {
    await view.webContents.loadURL(String(req.url))
    const js = (call: string) => `typeof window.search !== 'object' ? 'no bridge' : ${call}.then(v => v === null ? 'nothing' : 'answered', e => 'refused: ' + e.message)`
    const cmd = await view.webContents.executeJavaScript(js(`window.search.cmd(${JSON.stringify(req.cmd)})`), true)
    const hello = await view.webContents.executeJavaScript(js('window.search.hello()'), true)
    const overlay = await view.webContents.executeJavaScript(js('window.search.overlayNow()'), true)
    return { cmd, hello, overlay }
  } finally {
    view.webContents.close()
  }
})

benchRequest('guard.hooks', req => {
  const name = String(req.name ?? '')
  return { allowed: testHooksAllowed(), packaged: testHooksAllowed(true), env: testEnv(name) ?? null, packagedEnv: testEnv(name, true) ?? null }
})

/** A write whose rename keeps failing (a folder sits where the file goes, as
 * an antivirus holding it would): how long it waited, and how much of that
 * the processor was busy. */
benchRequest('guards.heldWrite', () => {
  const name = 'held-by-the-bench.json'
  const there = dataFile(name)
  mkdirSync(there, { recursive: true })
  writeFileSync(path.join(there, 'inside'), 'x')
  const cpu = process.cpuUsage()
  const start = Date.now()
  let threw = false
  try { writeJSONNow(name, { a: 1 }) } catch { threw = true }
  const wallMs = Date.now() - start
  const used = process.cpuUsage(cpu)
  rmSync(there, { recursive: true, force: true })
  return { threw, wallMs, cpuMs: Math.round((used.user + used.system) / 1000) }
})
