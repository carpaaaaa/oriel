// Core commands: tabs, the field, the column, the window, layout. Modules
// (field/, tabs/, ...) take these over and grow them; this is the skeleton
// every one of them starts from.

import { BaseWindow, net, Menu } from 'electron'
import { handle } from './router'
import { model } from './model/model'
import { allControllers, controllerFor, focusedController, WindowController } from './views/window'
import { runtimeFor, runtimes } from './views/tabs'
import { displayAddress, resolveInput } from './address'
import { engines } from '../shared/prefs'
import type { Suggestion } from '../shared/state'
import type { Context } from './router'
import { wireKeys } from './keys'

function need(ctx: Context): WindowController {
  const c = ctx.window ?? focusedController()
  if (!c) throw new Error('no window')
  return c
}

function tabRuntime(c: WindowController, id?: string) {
  const tabID = id ?? c.record.active[c.record.space]
  return tabID ? runtimeFor(tabID, c.pageSession) : null
}

// tabs

handle('tab.select', ({ id }, ctx) => {
  const c = need(ctx)
  model.selectTab(c.record, id)
  closeField(c)
  c.focusPage()
})

handle('tab.close', ({ id }, ctx) => model.closeTab(need(ctx).record, id))

handle('tab.new', ({ url, background, after }, ctx) => {
  const c = need(ctx)
  const tab = model.addTab(c.record, { url: url ? resolveInput(url).url : undefined, background, after, empty: !url })
  if (!url) openField(c, 'new')
  return tab.id
})

handle('tab.go', ({ id, input }, ctx) => {
  const c = need(ctx)
  tabRuntime(c, id)?.go(input)
  c.placePages()
  c.focusPage()
})

handle('tab.back', ({ id }, ctx) => tabRuntime(need(ctx), id)?.contents?.navigationHistory.goBack())
handle('tab.forward', ({ id }, ctx) => tabRuntime(need(ctx), id)?.contents?.navigationHistory.goForward())
handle('tab.reload', ({ id, hard }, ctx) => {
  const wc = tabRuntime(need(ctx), id)?.contents
  if (hard) wc?.reloadIgnoringCache(); else wc?.reload()
})
handle('tab.stop', ({ id }, ctx) => tabRuntime(need(ctx), id)?.contents?.stop())
handle('tab.move', ({ id, to }, ctx) => model.moveTab(need(ctx).record, id, to))
handle('tab.pin', ({ id }, ctx) => model.pinTab(need(ctx).record, id))
handle('tab.unpin', ({ id }, ctx) => model.unpinTab(need(ctx).record, id))
handle('tab.mute', ({ id, muted }, ctx) => {
  tabRuntime(need(ctx), id)?.contents?.setAudioMuted(muted)
  model.updateTab(id, { muted })
})
handle('tab.rename', ({ id, name }) => model.updateTab(id, { name: name || undefined }))
handle('tab.duplicate', ({ id }, ctx) => {
  const t = model.tabs.get(id)
  if (t?.url) model.addTab(need(ctx).record, { url: t.url, title: t.title, after: id, empty: false })
})
handle('tab.reopen', (_a, ctx) => model.reopen(need(ctx).record)?.id)
handle('tab.sleep', ({ id }) => runtimes.get(id)?.sleep())
handle('tab.menu', ({ id, x, y }, ctx) => {
  const c = need(ctx)
  const t = model.tabs.get(id)
  if (!t) return
  Menu.buildFromTemplate([
    { label: 'New Tab Below', click: () => model.addTab(c.record, { after: id, empty: true }) },
    { label: 'Duplicate', enabled: !!t.url, click: () => model.addTab(c.record, { url: t.url, after: id, empty: false }) },
    { type: 'separator' },
    { label: t.pinID ? 'Unpin' : 'Pin', click: () => t.pinID ? model.unpinTab(c.record, id) : model.pinTab(c.record, id) },
    { label: t.muted ? 'Unmute' : 'Mute', click: () => model.updateTab(id, { muted: !t.muted }) },
    { type: 'separator' },
    { label: 'Close Tab', click: () => model.closeTab(c.record, id) },
  ]).popup({ window: c.base as never, x, y })
})

// spaces

handle('space.select', ({ id }, ctx) => {
  const c = need(ctx)
  c.record.space = id
  if (!model.spaceTabs(c.record).length) model.addTab(c.record, { empty: true })
  model.touch(c.record, ['space', 'tabs', 'pins', 'activeID'])
})
handle('space.step', ({ by }, ctx) => {
  const c = need(ctx)
  const i = model.spaces.findIndex(s => s.id === c.record.space)
  const next = model.spaces[(i + by + model.spaces.length) % model.spaces.length]
  if (next) { c.record.space = next.id; if (!model.spaceTabs(c.record).length) model.addTab(c.record, { empty: true }); model.touch(c.record, ['space', 'tabs', 'pins', 'activeID']) }
})

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

// the column

handle('sidebar.resize', ({ width }, ctx) => {
  const c = need(ctx)
  const w = Math.max(176, Math.min(440, Math.round(width)))
  c.record.sidebar = { ...c.record.sidebar, width: w }
  model.touch(c.record, ['sidebar'])
  model.setPref('sidebar.width', w)
})
handle('sidebar.toggle', (_a, ctx) => {
  const c = need(ctx)
  c.record.sidebar = { ...c.record.sidebar, folded: !c.record.sidebar.folded }
  model.touch(c.record, ['sidebar'])
})
handle('sidebar.fold', ({ folded }, ctx) => {
  const c = need(ctx)
  c.record.sidebar = { ...c.record.sidebar, folded }
  model.touch(c.record, ['sidebar'])
})

// the window

handle('window.minimize', (_a, ctx) => need(ctx).base.minimize())
handle('window.maximize', (_a, ctx) => { const b = need(ctx).base; b.isMaximized() ? b.unmaximize() : b.maximize() })
handle('window.close', (_a, ctx) => need(ctx).base.close())
handle('window.new', ({ shy }) => { openWindow({ shy }) })
handle('window.startDrag', () => { /* win/drag.ts (koffi) on Windows; the CSS drag region elsewhere */ })
handle('window.menu', () => {})

// layout

handle('layout.slots', ({ slots }, ctx) => need(ctx).setSlots(slots))
handle('overlay.region', ({ rect, focus }, ctx) => need(ctx).setOverlayRegion(rect, focus))
handle('prefs.set', ({ key, value }) => model.setPref(key, value))
handle('page.data', () => null)
handle('menu.pick', () => {})

// opening windows

let pageSessionFor: (shy: boolean, windowID: string) => Electron.Session = () => { throw new Error('sessions not set') }
export function setSessions(f: typeof pageSessionFor): void { pageSessionFor = f }

export function openWindow(options: { shy?: boolean; restore?: boolean } = {}): WindowController {
  const record = model.newWindow(options)
  const c = new WindowController(record, pageSessionFor(!!options.shy, record.id))
  wireKeys(c, c.ui.webContents, false)
  wireKeys(c, c.overlay.webContents, false)
  return c
}

model.on('close-window', (id: string) => controllerFor(id)?.base.close())

export { allControllers, BaseWindow }

// pins

handle('pin.open', ({ id }, ctx) => {
  const c = need(ctx)
  const pin = model.pins.find(p => p.id === id)
  if (!pin) return
  const open = model.spaceTabs(c.record).find(t => model.tabs.get(t)?.pinID === id)
  if (open) { model.selectTab(c.record, open); return }
  const tab = model.addTab(c.record, { url: pin.home, title: pin.title, pinID: pin.id, home: pin.home, favicon: pin.favicon, empty: false })
  model.selectTab(c.record, tab.id)
})
handle('pin.home', ({ id }, ctx) => {
  const c = need(ctx)
  const pin = model.pins.find(p => p.id === id)
  const tabID = model.spaceTabs(c.record).find(t => model.tabs.get(t)?.pinID === id)
  if (pin && tabID) runtimeFor(tabID, c.pageSession).go(pin.home)
})
handle('pin.remove', ({ id }) => {
  model.pins = model.pins.filter(p => p.id !== id)
  for (const t of model.tabs.values()) if (t.pinID === id) model.updateTab(t.id, { pinID: undefined })
  model.savePins()
})
handle('pin.move', ({ id, to, folder }) => {
  const i = model.pins.findIndex(p => p.id === id)
  if (i < 0) return
  const [pin] = model.pins.splice(i, 1)
  if (folder !== undefined) pin.folder = folder ?? undefined
  model.pins.splice(Math.max(0, Math.min(to, model.pins.length)), 0, pin)
  model.savePins()
})
handle('space.new', ({ name }) => {
  const id = crypto.randomUUID()
  model.spaces.push({ id, name: name ?? `Space ${model.spaces.length + 1}`, colour: 0 })
  model.saveSpaces()
  return id
})
