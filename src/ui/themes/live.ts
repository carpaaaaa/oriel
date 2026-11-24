// What a painting depends on outside the prefs: the look (light or dark), the
// screen's scale, and the chosen picture's pixels. Works in the window's
// interface (window.search) and in Oriel's pages (window.oriel) alike.

import { createSignal, createResource, type Accessor } from 'solid-js'

const root = document.documentElement
const [lookNow, setLook] = createSignal<'light' | 'dark'>(root.dataset.look === 'dark' ? 'dark' : 'light')
new MutationObserver(() => setLook(root.dataset.look === 'dark' ? 'dark' : 'light'))
  .observe(root, { attributes: true, attributeFilter: ['data-look'] })
export const look = lookNow

const [scaleNow, setScale] = createSignal(window.devicePixelRatio || 1)
function watchScale(): void {
  const q = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
  q.addEventListener('change', () => { setScale(window.devicePixelRatio || 1); watchScale() }, { once: true })
}
watchScale()
export const scale = scaleNow

type Cmd = (c: never) => Promise<unknown>
const send = (c: object): Promise<unknown> => {
  const w = window as unknown as { oriel?: { cmd: Cmd }; search?: { cmd: Cmd } }
  return (w.oriel ?? w.search)!.cmd(c as never)
}

/** The kept copy's pixels, decoded straight from its bytes (no address, so
 * no page policy is in the way). Nil when it can't be read: shown as Off. */
const decoded = new Map<string, Promise<ImageBitmap | null>>()
export function loadPicture(path: string): Promise<ImageBitmap | null> {
  if (!path) return Promise.resolve(null)
  let p = decoded.get(path)
  if (!p) {
    p = (send({ do: 'themes.picture', path }) as Promise<{ bytes: Uint8Array } | null>)
      .then(r => (r?.bytes?.length ? createImageBitmap(new Blob([r.bytes as BlobPart])) : null))
      .catch(() => null)
    decoded.set(path, p)
    // Only the last few are kept.
    if (decoded.size > 4) decoded.delete(decoded.keys().next().value!)
    p.then(b => { if (!b) decoded.delete(path) })
  }
  return p
}

export function picture(path: Accessor<string>) {
  const [bitmap] = createResource(path, p => loadPicture(p), { initialValue: null })
  return () => (path() ? bitmap() ?? null : null)
}
