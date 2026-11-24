// Capture pages (studio/06 §1.5 #86; Snap.swift), as Arc's Capture: with
// Settings › Browsing › Pages › Capture pages on, View › Capture… puts a
// light layer over the page (src/preload/page/capture.ts); an area dragged,
// an element clicked or Whole Page is drawn, copied and saved as a PNG in
// the downloads folder, "Capture 2026-11-17 at 14.03.22.png", and nothing
// else. The command again, or Escape, and nothing is taken. Off, the
// command says so and does nothing.

import { clipboard, ClipboardItem, ipcMain, nativeImage, type WebContents } from 'electron'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Rect } from '../../shared/state'
import { handle } from '../router'
import { need } from '../context'
import { runtimes } from '../views/tabs'
import type { WindowController } from '../views/window'
import { downloadsFolder } from '../settings/prefs'
import { pref } from './facts'

const PRELOAD_WORLD = 999

interface Choice { kind: 'area' | 'element' | 'page'; x: number; y: number; w: number; h: number; dw: number; dh: number }

/** What was taken, for the bench: path, size in pixels, and what was said. */
export const captures: { path: string; width: number; height: number; said: string; kind: string }[] = []

/** SnapGeometry.fileName: a time, never the site. */
export function captureName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `Capture ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.png`
}

/** "name 2.png", "name 3.png" (Browser.free), never over a file there. */
function free(folder: string, name: string): string {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length)
  let file = path.join(folder, name)
  for (let n = 2; existsSync(file); n++) file = path.join(folder, `${stem} ${n}${ext}`)
  return file
}

async function wholePage(wc: WebContents, c: Choice): Promise<{ image: Electron.NativeImage; cropped: boolean }> {
  // The whole length, through Chromium's own screenshot past the viewport.
  const most = 16384
  const height = Math.min(c.dh, most)
  const dbg = wc.debugger
  let mine = false
  try {
    if (!dbg.isAttached()) { dbg.attach('1.3'); mine = true }
    const shot = await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true, fromSurface: true,
      clip: { x: 0, y: 0, width: Math.max(1, c.dw), height: Math.max(1, height), scale: 1 },
    }) as { data: string }
    return { image: nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64')), cropped: height < c.dh }
  } catch {
    // The page's tools open hold the debugger: what is on screen, its top.
    return { image: await wc.capturePage(), cropped: true }
  } finally {
    if (mine) try { dbg.detach() } catch {}
  }
}

export async function snap(wc: WebContents, c: Choice, shy: boolean): Promise<{ said: string; path?: string }> {
  let image: Electron.NativeImage
  let cropped = false
  if (c.kind === 'page') {
    ({ image, cropped } = await wholePage(wc, c))
  } else {
    if (c.w < 1 || c.h < 1) return { said: 'Nothing there to capture' }
    const zoom = wc.getZoomFactor()
    const rect: Rect = { x: Math.round(c.x * zoom), y: Math.round(c.y * zoom), width: Math.round(c.w * zoom), height: Math.round(c.h * zoom) }
    image = await wc.capturePage(rect)
  }
  if (image.isEmpty()) return { said: "Couldn't capture this page" }
  const png = image.toPNG()
  // Windows' clipboard history keeps it either way (the Mac marks a private tab's copy).
  void shy
  try { await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]) } catch {}
  const folder = downloadsFolder()
  const file = free(folder, captureName(new Date()))
  const copied = cropped ? 'The top of the page copied' : 'Copied'
  let said: string
  try {
    await writeFile(file, png)
    said = `${copied} and saved to ${path.basename(folder)}`
  } catch {
    said = `${copied}, but couldn't save it`
  }
  const size = image.getSize()
  const scale = image.getScaleFactors?.()[0] ?? 1
  captures.push({ path: file, width: Math.round(size.width * scale), height: Math.round(size.height * scale), said, kind: c.kind })
  if (captures.length > 20) captures.shift()
  return { said, path: file }
}

/** Other pointing modes stop before the layer comes up (Hide Elements, main/hide). */
export const beforeCapture: ((c: WindowController) => void)[] = []

/** Pages with the layer up now, and whether each is a private tab's. */
const layered = new WeakSet<WebContents>()
const layerShy = new WeakMap<WebContents, boolean>()

/** What the layer chose: an area, an element, the whole page, or nothing. */
ipcMain.on('pages:capture', (event, choice: Choice | null) => {
  const wc = event.sender
  if (!layered.has(wc)) return
  layered.delete(wc)
  if (choice && pref<boolean>('pages.capture')) void snap(wc, choice, !!layerShy.get(wc))
})

handle('view.capture', async ({ mode, rect }, ctx) => {
  const c = need(ctx)
  if (!pref<boolean>('pages.capture')) return { said: 'Capture pages is off in Settings › Browsing' }
  const id = c.record.active[c.record.space]
  const rt = id ? runtimes.get(id) : undefined
  const wc = rt?.contents
  if (!wc || !/^(https?|file|data):/i.test(wc.getURL())) return { said: 'Nothing there to capture' }
  const shy = !!rt?.record?.shy
  const run = (code: string) => wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code }], false)
  // The bench's way in, past the layer (Snap.swift snap(_:in:to:)).
  if (mode) {
    const page = await run("globalThis.__orielCapture ? globalThis.__orielCapture.choice('page') : null") as Choice | null
    const choice: Choice = { kind: mode, x: rect?.x ?? 0, y: rect?.y ?? 0, w: rect?.width ?? 0, h: rect?.height ?? 0, dw: page?.dw ?? 0, dh: page?.dh ?? 0 }
    return snap(wc, choice, shy)
  }
  // The command again: the layer comes down.
  if (layered.has(wc)) { layered.delete(wc); await run('globalThis.__orielCapture && globalThis.__orielCapture.off()'); return { layer: false } }
  for (const f of beforeCapture) f(c)
  layered.add(wc)
  layerShy.set(wc, shy)
  c.focusPage()
  await run('globalThis.__orielCapture ? globalThis.__orielCapture.on() : null').catch(() => layered.delete(wc))
  return { layer: true }
})
