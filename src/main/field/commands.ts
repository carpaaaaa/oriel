// The field: opening, typing, suggestions, going. Owned by the field module.

import { net } from 'electron'
import { handle } from '../router'
import { model } from '../model/model'
import type { WindowController } from '../views/window'
import { runtimeFor } from '../views/tabs'
import { displayAddress, resolveInput } from '../address'
import { engines } from '../../shared/prefs'
import type { Suggestion } from '../../shared/state'
import { need } from '../context'

// the field

export function openField(c: WindowController, target: 'new' | 'here'): void {
  const active = model.activeTab(c.record)
  const here = target === 'here' && active && !active.empty
  c.record.field = { open: true, target, text: here ? active!.url : '', suggestions: [], selected: 0, refused: c.record.field.refused }
  model.touch(c.record, ['field'])
  if (active?.empty && target === 'new') { c.ui.webContents.focus(); return }
  c.sendOverlay({ kind: 'field' })
}

export function closeField(c: WindowController): void {
  if (!c.record.field.open) return
  c.record.field = { ...c.record.field, open: false, text: '', suggestions: [], selected: 0 }
  model.touch(c.record, ['field'])
  if (c.overlayLayer.kind === 'field') c.sendOverlay({ kind: 'none' })
}

let suggestSerial = 0
handle('field.open', ({ target }, ctx) => openField(need(ctx), target))
handle('field.close', (_a, ctx) => { const c = need(ctx); closeField(c); c.focusPage() })
handle('field.move', ({ by }, ctx) => {
  const c = need(ctx)
  const n = c.record.field.suggestions.length
  if (!n) return
  c.record.field = { ...c.record.field, selected: (c.record.field.selected + by + n) % n }
  model.touch(c.record, ['field'])
})
handle('field.input', async ({ text }, ctx) => {
  const c = need(ctx)
  const serial = ++suggestSerial
  c.record.field = { ...c.record.field, text, suggestions: localSuggestions(c, text), selected: 0 }
  model.touch(c.record, ['field'])
  const remote = await remoteSuggestions(text).catch(() => [])
  if (serial !== suggestSerial || !c.record.field.open) return
  const local = localSuggestions(c, text)
  const seen = new Set(local.map(s => s.url))
  c.record.field = { ...c.record.field, suggestions: [...local, ...remote.filter(s => !seen.has(s.url))].slice(0, 8) }
  model.touch(c.record, ['field'])
})
handle('field.commit', ({ index, text, newTab }, ctx) => {
  const c = need(ctx)
  const f = c.record.field
  const picked = index != null ? f.suggestions[index] : undefined
  const typed = text ?? f.text
  if (!picked && !typed.trim()) { c.record.field = { ...f, refused: f.refused + 1 }; model.touch(c.record, ['field']); return }
  if (picked?.tabID) { closeField(c); model.selectTab(c.record, picked.tabID); c.focusPage(); return }
  const url = picked?.url ?? resolveInput(typed, model.pref<string>('search.engine')).url
  const active = model.activeTab(c.record)
  closeField(c)
  if (!newTab && active && (active.empty || f.target === 'here')) {
    runtimeFor(active.id, c.pageSession).go(url)
  } else {
    const tab = model.addTab(c.record, { url, empty: false })
    runtimeFor(tab.id, c.pageSession).go(url)
  }
  c.placePages()
  c.focusPage()
})

function localSuggestions(c: WindowController, text: string): Suggestion[] {
  const t = text.trim()
  if (!t) return []
  const { url, searched } = resolveInput(t, model.pref<string>('search.engine'))
  const engine = engines[model.pref<string>('search.engine')] ?? engines.google
  const first: Suggestion = searched
    ? { kind: 'search', title: t, detail: `${engine.name} Search`, url }
    : { kind: 'url', title: displayAddress(url), url }
  const lower = t.toLowerCase()
  const open: Suggestion[] = model.spaceTabs(c.record)
    .map(id => model.tabs.get(id)!)
    .filter(tab => tab && !tab.empty && (tab.title.toLowerCase().includes(lower) || tab.url.toLowerCase().includes(lower)))
    .slice(0, 3)
    .map(tab => ({ kind: 'tab', title: tab.title || displayAddress(tab.url), detail: displayAddress(tab.url), url: tab.url, favicon: tab.favicon, tabID: tab.id }))
  return [first, ...open]
}

async function remoteSuggestions(text: string): Promise<Suggestion[]> {
  const t = text.trim()
  if (!t || !model.pref<boolean>('search.suggestions')) return []
  const engine = engines[model.pref<string>('search.engine')] ?? engines.google
  if (!engine.suggest) return []
  const res = await net.fetch(engine.suggest.replace('%s', encodeURIComponent(t)))
  const data = await res.json() as unknown[]
  const words = (Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []) as string[]
  return words.slice(0, 5).filter(w => w !== t).map(w => ({ kind: 'search', title: w, url: engine.search.replace('%s', encodeURIComponent(w)) }))
}
