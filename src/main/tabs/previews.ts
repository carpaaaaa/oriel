// Pictures of the pages for the Ctrl+Tab switcher (studio/01 §3.26;
// TabSwitcher.swift previews, cachePreview): each tab's page as it last
// looked in front, 360 wide, taken a moment after it comes to the front,
// when it finishes loading there, and when the switcher opens. A page out
// of sight can't be drawn, so a picture is always one of the page in front.
// Kept in memory only (a private tab's too, gone with it), the 48 latest.

import type { WebContents } from 'electron'
import type { ID } from '../../shared/state'
import { model } from '../model/model'
import { pageLoaded, runtimes } from '../views/tabs'
import { allControllers, registerSlice, controllerFor } from '../views/window'

const LIMIT = 48
const pictures = new Map<ID, string>()
const waiting = new Map<ID, ReturnType<typeof setTimeout>>()

function inFront(id: ID): boolean {
  const win = model.windowOf(id)
  return !!win && win.active[win.space] === id
}

async function take(id: ID): Promise<void> {
  const wc: WebContents | null | undefined = runtimes.get(id)?.contents
  if (!wc || wc.isDestroyed() || !inFront(id)) return
  try {
    const image = await wc.capturePage()
    // Another tab came to the front while it was drawn: this one may be blank.
    if (image.isEmpty() || !model.tabs.has(id) || !inFront(id)) return
    const size = image.getSize()
    const small = size.width > 360 ? image.resize({ width: 360, quality: 'good' }) : image
    pictures.delete(id)
    pictures.set(id, `data:image/jpeg;base64,${small.toJPEG(78).toString('base64')}`)
    while (pictures.size > LIMIT) pictures.delete(pictures.keys().next().value as ID)
    // The switcher up already: its card gets the picture now.
    const win = model.windowOf(id)
    if (win?.switcher?.cards.includes(id)) controllerFor(win.id)?.mark('switcherPictures')
  } catch { /* a page going away while drawn */ }
}

/** Soon, once the page has had time to paint; again moments later wins. */
function soon(id: ID, after = 600): void {
  clearTimeout(waiting.get(id))
  waiting.set(id, setTimeout(() => { waiting.delete(id); void take(id) }, after))
}

registerSlice('switcherPictures', c => {
  const s = c.record.switcher
  if (!s) return null
  const out: Record<ID, string> = {}
  for (const id of s.cards) { const p = pictures.get(id); if (p) out[id] = p }
  return out
})

// The switcher opening or closing sends the pictures along; a step of it
// (only the chosen card moving) doesn't send them again.
const open = new Set<string>()
model.on('window-changed', (id: string, slices: string[]) => {
  if (!slices.includes('switcher')) return
  if (!model.windows.has(id)) { open.delete(id); return }
  const up = !!model.windows.get(id)?.switcher
  if (up === open.has(id)) return
  if (up) open.add(id); else open.delete(id)
  controllerFor(id)?.mark('switcherPictures')
})

model.on('selected', (_w: unknown, id: ID) => soon(id))
model.on('tab-closed', (id: ID) => { pictures.delete(id); clearTimeout(waiting.get(id)); waiting.delete(id) })

/** The switcher opening: the page in front now, as it is. */
export function pictureFront(windowID: string): void {
  const win = allControllers().find(c => c.record.id === windowID)?.record
  const id = win?.active[win.space]
  if (id) void take(id)
}

// A page finished loading in front.
pageLoaded.push(id => { if (inFront(id)) soon(id, 300) })
