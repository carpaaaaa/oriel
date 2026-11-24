// The field module's bench requests (test worlds only).

import { benchRequest } from '../bench/server'
import { focusedController } from '../views/window'
import { runtimes } from '../views/tabs'
import { provideData } from '../data/api'
import type { Suggestion } from '../../shared/state'
import { addressURL, editable, fileURL, identity, resolveInput } from '../address'
import { bindings, chordName, findBinding, live } from '../keys'
import { destination, siteMatch } from './engines'
import { completion, sendable } from './suggest'

/** A history and bookmarks of the test's own, in place of the data module's:
 * every word typed somewhere in the title or the address, in the given order. */
benchRequest('field.fake', req => {
  const rows = (req.places ?? []) as Suggestion[]
  provideData({
    async suggest(text: string, limit: number) {
      const words = text.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/\s+/).filter(Boolean)
      return rows.filter(r => words.every(w => `${r.title} ${r.url.replace(/^https?:\/\/(www\.)?/, '')}`.toLowerCase().includes(w))).slice(0, limit)
    },
  })
  return { count: rows.length }
})

benchRequest('field.address', req => {
  const text = String(req.text ?? '')
  return {
    address: addressURL(text), file: fileURL(text), destination: destination(text), resolved: resolveInput(text).url,
    editable: req.url ? editable(String(req.url)) : null, identity: req.url ? identity(String(req.url)) : null,
    site: siteMatch(text)?.name ?? null, sendable: sendable(text),
  }
})

benchRequest('field.complete', req => {
  const options = (req.options ?? []) as Suggestion[]
  return { ending: completion(String(req.text ?? ''), options) }
})

benchRequest('field.keys', () => ({
  bindings: bindings.map(b => ({ id: b.id, title: b.title, mac: b.mac, keys: b.keys, phase: b.phase, live: live(b), needs: b.needs?.do ?? null })),
}))

benchRequest('field.chord', req => {
  const name = chordName({
    key: String(req.key ?? ''), code: String(req.code ?? ''), ctrl: !!req.ctrl, shift: !!req.shift, alt: !!req.alt,
    meta: !!req.meta, altGraph: !!req.altGraph,
  })
  return { name, first: name ? findBinding(name, 'first')?.id ?? null : null, later: name ? findBinding(name, 'later')?.id ?? null : null }
})

/** A key sent to one view, whichever has the keys: a test window in the
 * background has none, and bench's own `key` then goes to the interface. */
benchRequest('field.key', req => {
  const c = focusedController()
  if (!c) throw new Error('no window')
  const id = c.record.active[c.record.space]
  const to = String(req.to ?? 'page')
  const wc = to === 'ui' ? c.ui.webContents : to === 'overlay' ? c.overlay.webContents : id ? runtimes.get(id)?.contents : null
  if (!wc) throw new Error(`no ${to}`)
  const key = String(req.key)
  const modifiers = (req.modifiers ?? []) as Electron.InputEvent['modifiers']
  wc.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers })
  if (key.length === 1) wc.sendInputEvent({ type: 'char', keyCode: key, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers })
  return {}
})

/** Where the interface and the overlay are in the window, to measure across them. */
benchRequest('field.views', () => {
  const c = focusedController()
  if (!c) throw new Error('no window')
  return { ui: c.ui.getBounds(), overlay: c.overlay.getBounds(), layer: c.overlayLayer.kind }
})

/** The pointer moved to a point of one view, without a click (for :hover). */
benchRequest('field.hover', req => {
  const c = focusedController()
  if (!c) throw new Error('no window')
  const wc = req.to === 'overlay' ? c.overlay.webContents : c.ui.webContents
  wc.sendInputEvent({ type: 'mouseMove', x: Number(req.x), y: Number(req.y) })
  if (req.click) {
    wc.sendInputEvent({ type: 'mouseDown', x: Number(req.x), y: Number(req.y), button: 'left', clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', x: Number(req.x), y: Number(req.y), button: 'left', clickCount: 1 })
  }
  return {}
})

/** The window's content to a size, as a person dragging its edge would. */
benchRequest('field.resize', req => {
  const c = focusedController()
  if (!c) throw new Error('no window')
  c.base.setContentSize(Math.round(Number(req.width)), Math.round(Number(req.height)))
  return { bounds: c.base.getContentBounds() }
})
