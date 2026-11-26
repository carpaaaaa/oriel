// The bench socket (see shared/bench.ts). Only in a test world.

import net from 'node:net'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { app } from 'electron'
import type { BenchReply, BenchRequest } from '../../shared/bench'
import { benchAddress } from '../../shared/bench'
import { model } from '../model/model'
import { run } from '../router'
import { allControllers, controllerFor, focusedController, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'

type Extra = (req: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>
const extras = new Map<string, Extra>()

/** Modules add requests named "<module>.<name>". */
export function benchRequest(name: string, f: Extra): void { extras.set(name, f) }

function pickWindow(id?: string): WindowController {
  const c = id ? controllerFor(id) : focusedController()
  if (!c) throw new Error('no window')
  return c
}

async function answer(req: BenchRequest): Promise<BenchReply> {
  switch (req.do) {
    case 'state':
      return {
        ok: true,
        spaces: model.spaces,
        pins: model.pins,
        prefs: model.prefs,
        windows: allControllers().map(c => ({ ...c.state(), bounds: c.base.getBounds(), overlay: c.overlayLayer })),
        tabs: [...model.tabs.values()].map(t => ({ ...t, live: !!runtimes.get(t.id)?.view })),
        errors: ((globalThis as { orielErrors?: string[] }).orielErrors ?? []),
        gone: ((globalThis as { orielGone?: string[] }).orielGone ?? []),
      }
    case 'cmd': {
      const value = await run(req.cmd as never, { window: pickWindow(req.window) })
      return { ok: true, value: value ?? null }
    }
    case 'eval': {
      const wc = runtimes.get(req.id)?.contents
      if (!wc) return { ok: false, error: 'tab has no page' }
      // world: the preload's isolated world (999) instead of the page's own.
      const world = (req as { world?: number }).world
      if (world) return { ok: true, value: await wc.executeJavaScriptInIsolatedWorld(Number(world), [{ code: req.js }], true) }
      return { ok: true, value: await wc.executeJavaScript(req.js, true) }
    }
    case 'ui': {
      const c = pickWindow(req.window)
      const wc = (req.root === 'overlay' ? c.overlay : c.ui).webContents
      return { ok: true, value: await wc.executeJavaScript(req.js, true) }
    }
    case 'shot': {
      const c = pickWindow(req.window)
      const { width, height } = c.base.getContentBounds()
      // The window is several views; draw each at its place.
      // In their real stacking order: a popup above the overlay stays above it.
      const parts = [...c.base.contentView.children]
      const images = await Promise.all(parts.map(async v => {
        const b = v.getBounds()
        if (!b.width || !b.height || !(v as Electron.WebContentsView).webContents) return null
        return { b, png: (await (v as Electron.WebContentsView).webContents.capturePage()).toPNG().toString('base64') }
      }))
      const composite = images.filter(Boolean)
      // Compose in the interface's page (it has a canvas), then save.
      const data: string = await c.ui.webContents.executeJavaScript(`(${compose.toString()})(${JSON.stringify(composite)}, ${width}, ${height})`, true)
      writeFileSync(req.path, Buffer.from(data, 'base64'))
      return { ok: true, path: req.path, width, height }
    }
    case 'key': {
      const c = pickWindow(req.window)
      const wc = c.base.contentView.children.map(v => (v as Electron.WebContentsView).webContents).find(w => w?.isFocused()) ?? c.ui.webContents
      const modifiers = (req.modifiers ?? []) as Electron.InputEvent['modifiers']
      // phase 'down' or 'up' alone: a key held, then let go (Ctrl showing the tab numbers).
      if (req.phase !== 'up') wc.sendInputEvent({ type: 'keyDown', keyCode: req.key, modifiers })
      if (req.key.length === 1 && !req.phase) wc.sendInputEvent({ type: 'char', keyCode: req.key, modifiers })
      if (req.phase !== 'down') wc.sendInputEvent({ type: 'keyUp', keyCode: req.key, modifiers })
      return { ok: true }
    }
    case 'mouse': {
      const c = pickWindow(req.window)
      // The topmost view under the point gets it, as with a real pointer.
      const views = [...c.base.contentView.children].reverse() as Electron.WebContentsView[]
      const v = views.find(v => { const b = v.getBounds(); return req.x >= b.x && req.y >= b.y && req.x < b.x + b.width && req.y < b.y + b.height })
      if (!v) return { ok: false, error: 'nothing there' }
      const b = v.getBounds()
      const x = req.x - b.x, y = req.y - b.y, button = req.button ?? 'left', clickCount = req.clicks ?? 1
      // Keys held for the click (Ctrl-click, Shift-click): names as sendInputEvent has them.
      const modifiers = ((req as { modifiers?: unknown }).modifiers ?? []) as Electron.InputEvent['modifiers']
      v.webContents.sendInputEvent({ type: 'mouseMove', x, y, modifiers })
      // phase 'down' or 'up' alone: the button held (a tab giving under it), then let go.
      if (req.phase !== 'up') v.webContents.sendInputEvent({ type: 'mouseDown', x, y, button, clickCount, modifiers })
      if (req.phase !== 'down') v.webContents.sendInputEvent({ type: 'mouseUp', x, y, button, clickCount, modifiers })
      return { ok: true }
    }
    case 'focus' as never: {
      // Bring the window to the front, even from another Space (for a person to use it).
      const c = pickWindow((req as { window?: string }).window)
      c.base.setOpacity(1)
      c.base.setIgnoreMouseEvents(false)
      if (c.base.isMinimized()) c.base.restore()
      c.base.show()
      app.focus({ steal: true })
      c.base.focus()
      return { ok: true }
    }
    case 'settle':
      await new Promise(r => setTimeout(r, 50))
      return { ok: true }
    case 'quit':
      setTimeout(() => app.quit(), 10)
      return { ok: true }
    default: {
      const f = extras.get(req.do)
      if (!f) return { ok: false, error: `unknown request ${req.do}` }
      return { ok: true, ...(await f(req as Record<string, unknown>)) }
    }
  }
}

/** Runs in the interface page: lays the pictures out on a canvas. */
function compose(parts: { b: { x: number; y: number; width: number; height: number }; png: string }[], width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas')
  const scale = devicePixelRatio
  canvas.width = width * scale
  canvas.height = height * scale
  const g = canvas.getContext('2d')!
  return parts.reduce((p, part) => p.then(() => new Promise<void>(done => {
    const img = new Image()
    img.onload = () => { g.drawImage(img, part.b.x * scale, part.b.y * scale, part.b.width * scale, part.b.height * scale); done() }
    img.onerror = () => done()
    img.src = 'data:image/png;base64,' + part.png
  })), Promise.resolve()).then(() => canvas.toDataURL('image/png').split(',')[1])
}

export function startBench(world: string): void {
  const address = benchAddress(world, app.getPath('userData'), process.platform)
  if (process.platform !== 'win32' && existsSync(address)) unlinkSync(address)
  const server = net.createServer(socket => {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl)
        buffer = buffer.slice(nl + 1)
        if (!line.trim()) continue
        let req: BenchRequest
        try { req = JSON.parse(line) } catch { socket.write(JSON.stringify({ ok: false, error: 'bad json' }) + '\n'); continue }
        answer(req)
          .catch(e => ({ ok: false as const, error: String(e?.stack ?? e) }))
          .then(reply => socket.write(JSON.stringify(reply) + '\n'))
      }
    })
    socket.on('error', () => {})
  })
  server.listen(address, () => console.log(`[bench] ${address}`))
  app.on('will-quit', () => server.close())
}
