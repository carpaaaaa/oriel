// Tabs, pins and spaces: the commands. Owned by the tabs module.

import { Menu } from 'electron'
import { handle } from '../router'
import { model } from '../model/model'
import { runtimeFor, runtimes } from '../views/tabs'
import { resolveInput } from '../address'
import { need, tabRuntime } from '../context'
import { closeField, openField } from '../field/commands'

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

