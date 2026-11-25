// Darken pages that stay light (Settings › Appearance, pages.dusk; Dusk.swift):
// only while Oriel is dark, a page with no dark look of its own is turned
// over with a filter on its root and its pictures turned back, as the Mac
// does while its colour twins are made. Whether a page needs it is measured
// (its ground's colour), never read off what it declares; a page already dark
// is left alone. Off by default.

import { nativeTheme, type WebContents } from 'electron'
import { model } from '../model/model'
import { runtimes } from '../views/tabs'
import { pageAttached } from '../views/window'

const CSS = `html { filter: invert(.9) hue-rotate(180deg) !important; background: #fff; }
img, video, picture, canvas, svg image, iframe, embed, object, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }`

/** The page's ground, light (true) or dark, sampled where it is painted. */
const MEASURE = `(() => {
  const ground = e => { if (!e) return null; const c = getComputedStyle(e).backgroundColor; const m = c.match(/[\\d.]+/g); if (!m) return null;
    const [r, g, b, a = 1] = m.map(Number); return a < 0.5 ? null : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
  const l = ground(document.body) ?? ground(document.documentElement) ?? 1
  return l > 0.5
})()`

const applied = new Map<WebContents, string>()
const wanted = () => !!model.pref<boolean>('pages.dusk') && nativeTheme.shouldUseDarkColors

async function look(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return
  const key = applied.get(wc)
  if (key) { applied.delete(wc); await wc.removeInsertedCSS(key).catch(() => {}) }
  if (!wanted() || wc.getURL().startsWith('oriel:')) return
  // Google's editors draw their own pages: a filter over them spoils them (Search 1.0.21).
  if (/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\//.test(wc.getURL())) return
  const light = await wc.executeJavaScriptInIsolatedWorld(1002, [{ code: MEASURE }]).catch(() => false)
  if (light && !wc.isDestroyed() && wanted()) applied.set(wc, await wc.insertCSS(CSS))
}

const watched = new WeakSet<WebContents>()
pageAttached.push((_id, wc) => {
  if (watched.has(wc)) return
  watched.add(wc)
  wc.on('dom-ready', () => void look(wc))
  wc.on('destroyed', () => applied.delete(wc))
  void look(wc)
})

function all(): void { for (const rt of runtimes.values()) if (rt.contents) void look(rt.contents) }

let was = wanted()
nativeTheme.on('updated', () => { if (wanted() !== was) { was = wanted(); all() } })
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs') || wanted() === was) return
  was = wanted()
  all()
})

/** For the tests: whether a page is darkened. */
export const darkened = (wc: WebContents) => applied.has(wc)
