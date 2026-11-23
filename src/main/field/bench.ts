// The field module's bench requests (test worlds only).

import { benchRequest } from '../bench/server'
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
