// Tabs, pins, pin folders, groups and spaces: the commands (studio/01 §2,
// §3, §6, §7, §9). Owned by the tabs module.

import { Menu, clipboard, type MenuItemConstructorOptions } from 'electron'
import { handle } from '../router'
import { model, spaceIcons, internalKind, type TabRecord } from '../model/model'
import { runtimeFor, runtimes } from '../views/tabs'
import { resolveInput } from '../address'
import { need, tabRuntime } from '../context'
import { closeField, fieldShowing, launch, openField, putAway, stayUp } from '../field/commands'
import type { WindowController } from '../views/window'
import { putToSleep } from './sleep'

const win = (c: WindowController) => c.record
const resolve = (input: string) => (internalKind(input.trim()) ? input.trim() : resolveInput(input, model.pref<string>('search.engine')).url)

// tabs

handle('tab.select', ({ id }, ctx) => {
  const c = need(ctx)
  const same = model.activeTab(win(c))?.id === id
  model.selectTab(win(c), id)
  // The tab already in front: ⌘T's floating field stays (Browser.select, §3.5).
  if (same && stayUp(c)) return
  closeField(c)
  c.focusPage()
})

handle('tab.close', ({ id }, ctx) => model.closeTab(win(need(ctx)), id))

/** ⌘W (Browser.closeFront, §3.10): the field raised over a page first; ⌘T's
 * floating field keeps what was typed for the next ⌘T (§3.5). */
handle('tab.closeFront', (_a, ctx) => {
  const c = need(ctx)
  const active = model.activeTab(win(c))
  if (fieldShowing(c) && active && !active.empty) { putAway(c); c.focusPage(); return }
  model.closeFront(win(c))
})

handle('tab.new', ({ url, background, after }, ctx) => {
  const c = need(ctx)
  const w = win(c)
  if (!url) {
    const tab = model.newTab(w)
    openField(c, 'new')
    return tab.id
  }
  const address = resolve(url)
  if (after && model.tabs.has(after)) return model.openFromPage(w, after, address, background ? 'background-tab' : 'foreground-tab').id
  // A page from outside: into the empty tab on screen with nothing typed in
  // it, else a new tab in front (Browser.arrive, §3.40).
  const active = model.activeTab(w)
  if (!background && active?.empty && !active.shy && !w.field.text) {
    runtimeFor(active.id).load(address)
    closeField(c)
    c.focusPage()
    return active.id
  }
  return model.open(w, address, { foreground: !background }).id
})

/** The + button, the column's New tab and its menu: ⌘T's (Browser.launch). */
handle('tab.blank', (_a, ctx) => {
  const c = need(ctx)
  if (launch(c)) return null
  const tab = model.newTab(win(c))
  openField(c, 'new')
  return tab.id
})

handle('tab.newPrivate', (_a, ctx) => {
  const c = need(ctx)
  const tab = model.newShyTab(win(c))
  openField(c, 'new')
  return tab.id
})

handle('tab.open', ({ url, foreground, from, link, atEnd, mayWait, loose }, ctx) => {
  return model.open(win(need(ctx)), resolve(url), { foreground, from, link, atEnd, mayWait, loose }).id
})

handle('tab.go', ({ id, input }, ctx) => {
  const c = need(ctx)
  tabRuntime(c, id)?.go(input)
  c.placePages()
  c.focusPage()
})

handle('tab.back', ({ id }, ctx) => tabRuntime(need(ctx), id)?.contents?.navigationHistory.goBack())
handle('tab.forward', ({ id }, ctx) => tabRuntime(need(ctx), id)?.contents?.navigationHistory.goForward())
handle('tab.reload', ({ id, hard }, ctx) => tabRuntime(need(ctx), id)?.reload(hard))
handle('tab.stop', ({ id }, ctx) => tabRuntime(need(ctx), id)?.contents?.stop())
handle('tab.move', ({ id, to }, ctx) => model.moveTab(win(need(ctx)), id, to))
handle('tab.pin', ({ id }, ctx) => model.pinTab(win(need(ctx)), id))
handle('tab.pinRow', ({ id }, ctx) => model.pinTab(win(need(ctx)), id, true))
handle('tab.unpin', ({ id }, ctx) => model.unpinTab(win(need(ctx)), id))
handle('tab.mute', ({ id, muted }) => model.updateTab(id, { muted }))

/** Rename (§2.9, §3.49): a pin's name is every window's; no name, the title. */
handle('tab.rename', ({ id, name }) => {
  const t = model.tabs.get(id)
  if (!t) return
  const trimmed = name?.trim() || null
  if (t.pinID) { model.renamePin(t.pinID, trimmed); return }
  model.updateTab(id, trimmed ? { name: trimmed } : { name: undefined, letGo: t.name ? Date.now() : t.letGo })
  const w = model.windowOf(id)
  if (w) model.sessionNow(w, t.space)
})

handle('tab.duplicate', ({ id }, ctx) => model.duplicate(win(need(ctx)), id)?.id)
handle('tab.reopen', (_a, ctx) => model.reopen(win(need(ctx)))?.id)
handle('tab.reopenGhost', ({ id }, ctx) => model.reopenGhost(win(need(ctx)), id)?.id)
/** The page let go at once, its history kept (the mechanism; §2.28). */
handle('tab.sleep', ({ id }) => runtimes.get(id)?.sleep())
handle('tab.putToSleep', ({ id }) => putToSleep(id))
handle('tab.tryAgain', ({ id }) => {
  const t = model.tabs.get(id)
  if (!t) return
  if (t.error?.url && !t.dead) model.updateTab(id, { url: t.error.url })
  runtimeFor(id).revive(true)
})
handle('tab.closeOthers', ({ id }, ctx) => {
  const w = win(need(ctx))
  model.closeOthers(w, w.picked.includes(id) ? w.picked : [id])
})
handle('tab.closeBelow', ({ id }, ctx) => model.closeBelow(win(need(ctx)), id))
handle('tab.closeMany', ({ ids }, ctx) => model.closePicked(win(need(ctx)), ids))
handle('tab.pick', ({ id, mode }, ctx) => model.pick(win(need(ctx)), id, mode))
handle('tab.nth', ({ n }, ctx) => { const c = need(ctx); model.nth(win(c), n); closeField(c); c.focusPage() })
handle('tab.step', ({ by }, ctx) => { const c = need(ctx); model.step(win(c), by); closeField(c); c.focusPage() })
handle('tab.switch', ({ by }, ctx) => model.switchStep(win(need(ctx)), by))
handle('tab.switchEnd', ({ cancel }, ctx) => { const c = need(ctx); model.switchEnd(win(c), cancel); c.focusPage() })
handle('tab.group', ({ ids, group }, ctx) => model.moveToGroup(win(need(ctx)), ids, group))
handle('tab.toSpace', ({ ids, space }, ctx) => model.moveToSpace(win(need(ctx)), ids, space))

// pins

const pinTab = (c: WindowController, pinID: string): TabRecord | undefined =>
  model.spaceTabs(win(c)).map(id => model.tabs.get(id)!).find(t => t?.pinID === pinID)

handle('pin.open', ({ id }, ctx) => {
  const c = need(ctx)
  const t = pinTab(c, id)
  if (t) { model.selectTab(win(c), t.id); closeField(c); c.focusPage() }
})
handle('pin.home', ({ id }, ctx) => model.goHome(win(need(ctx)), id))
/** Delete: unpinned and closed (§6.6). */
handle('pin.remove', ({ id }, ctx) => model.deletePin(win(need(ctx)), id))
handle('pin.move', ({ id, to, folder }, ctx) => model.movePin(win(need(ctx)), id, to, folder))
handle('pin.listed', ({ id, listed }) => model.setListed(id, listed))
handle('pin.letter', ({ id, letter }) => model.setLetter(id, letter))
handle('pin.rehome', ({ id }, ctx) => model.rehome(win(need(ctx)), id))
handle('pin.share', ({ id, everywhere }, ctx) => model.sharePin(win(need(ctx)), id, everywhere))
handle('pin.folder', ({ id, folder }) => model.pinToFolder(id, folder))
handle('pinFolder.new', ({ pin, parent, name }, ctx) => model.newFolder(win(need(ctx)), { pin, parent, name }))
handle('pinFolder.rename', ({ id, name }, ctx) => model.renameFolder(win(need(ctx)), id, name))
handle('pinFolder.fold', ({ id, folded }, ctx) => model.foldFolder(win(need(ctx)), id, folded))
handle('pinFolder.delete', ({ id }, ctx) => model.deleteFolder(win(need(ctx)), id))
handle('pinFolder.move', ({ id, parent }, ctx) => model.moveFolder(win(need(ctx)), id, parent))

// groups

handle('group.new', ({ ids }, ctx) => model.newGroup(win(need(ctx)), ids))
handle('group.rename', ({ id, name }, ctx) => model.renameGroup(win(need(ctx)), id, name))
handle('group.colour', ({ id, colour }, ctx) => model.colourGroup(win(need(ctx)), id, colour))
handle('group.fold', ({ id, folded }, ctx) => model.foldGroup(win(need(ctx)), id, folded))
handle('group.foldAll', ({ folded }, ctx) => model.foldAllGroups(win(need(ctx)), folded))
handle('group.ungroup', ({ id }, ctx) => model.ungroup(win(need(ctx)), id))
handle('group.close', ({ id }, ctx) => model.closeGroup(win(need(ctx)), id))
handle('group.newTab', ({ id }, ctx) => {
  const c = need(ctx)
  // Floating: the field comes up, and Return's tab goes to the group's end
  // (Browser.newTab(inGroup:), studio/01 §6.45). Never from a private tab.
  if (win(c).groups.some(g => g.id === id) && !model.activeTab(win(c))?.shy && launch(c, id)) return null
  const tab = model.newTabInGroup(win(c), id)
  if (tab) openField(c, 'new')
  return tab?.id
})
handle('group.toSpace', ({ id, space }, ctx) => model.moveGroupToSpace(win(need(ctx)), id, space))

// spaces

handle('space.select', ({ id }, ctx) => {
  const c = need(ctx)
  model.switchSpace(win(c), id)
  closeField(c)
  c.focusPage()
})
/** Next Space, Previous Space: they stop at the ends (§7.17). */
handle('space.step', ({ by }, ctx) => {
  const c = need(ctx)
  const i = model.spaces.findIndex(s => s.id === win(c).space)
  const next = model.spaces[i + by]
  if (next) { model.switchSpace(win(c), next.id); c.focusPage() }
})
handle('space.new', ({ name }, ctx) => model.createSpace(win(need(ctx)), { name: name ?? `Space ${model.spaces.length + 1}` }))
handle('space.create', ({ name, icon, signedOut, moving }, ctx) => model.createSpace(win(need(ctx)), { name, icon, signedOut, moving }))
handle('space.rename', ({ id, name }) => model.renameSpace(id, name))
handle('space.icon', ({ id, icon }) => model.setSpaceIcon(id, icon))
handle('space.colour', ({ id, colour }) => model.setSpaceColour(id, colour))
handle('space.gradient', ({ id, preset }) => model.setSpaceGradient(id, preset))
handle('space.strength', ({ id, strength }) => model.setSpaceStrength(id, strength))
handle('space.order', ({ id, by }) => model.orderSpace(id, by))
handle('space.delete', ({ id }, ctx) => model.deleteSpace(win(need(ctx)), id))

// the tab's menu (§4.35), as far as this module goes; Split View, windows
// and the side panel add theirs.

handle('tab.menu', ({ id, x, y }, ctx) => {
  const c = need(ctx)
  const w = win(c)
  const t = model.tabs.get(id)
  if (!t) return
  const web = !t.empty && !t.internal && /^(https?|file):/i.test(t.url)
  const rows = model.pref<boolean>('pins.list') && w.sidebar.layout === 'side'
  const items: MenuItemConstructorOptions[] = []
  if (!t.pinID && !t.shy && !t.bench) {
    items.push({
      label: 'Move to Group',
      submenu: [
        { label: 'New Group', click: () => model.newGroup(w, [id]) },
        ...(w.groups.length ? [{ type: 'separator' as const }] : []),
        ...w.groups.map(g => ({ label: g.name, enabled: t.groupID !== g.id, click: () => model.moveToGroup(w, [id], g.id) })),
        ...(t.groupID ? [{ type: 'separator' as const }, { label: 'Remove from Group', click: () => model.moveToGroup(w, [id], null) }] : []),
      ],
    })
  }
  if (!t.pinID) {
    items.push({ label: 'Pin', enabled: web && !t.shy, click: () => model.pinTab(w, id) })
    if (rows) items.push({ label: 'Pin as Row', enabled: web && !t.shy, click: () => model.pinTab(w, id, true) })
  } else {
    const pinID = t.pinID
    if (rows) items.push(t.listed ? { label: 'Show as Square', click: () => model.setListed(pinID, false) } : { label: 'Show as Row', click: () => model.setListed(pinID, true) })
    if (rows && model.pref<boolean>('pins.folders') && t.listed && !t.everywhere) {
      const folders = model.folderViews(w).filter(f => !f.live)
      items.push(
        { label: 'New Folder', click: () => model.newFolder(w, { pin: pinID }) },
        {
          label: 'Move to Folder',
          submenu: [
            ...folders.map(f => ({ label: '    '.repeat((f.depth ?? 1) - 1) + f.name, enabled: t.pinFolder !== f.id, click: () => model.pinToFolder(pinID, f.id) })),
            ...(t.pinFolder ? [{ type: 'separator' as const }, { label: 'Remove from Folder', click: () => model.pinToFolder(pinID, null) }] : []),
          ],
        },
      )
    }
    items.push(t.listed
      ? { label: 'Back to Pinned Page', enabled: !!t.home && t.url.replace(/\/+$/, '') !== t.home.replace(/\/+$/, ''), click: () => model.goHome(w, pinID) }
      : { label: 'Change Letter', enabled: false })
    items.push({ label: 'Replace Pinned Page with Current URL', enabled: web && t.url.replace(/\/+$/, '') !== (t.home ?? '').replace(/\/+$/, ''), click: () => model.rehome(w, pinID) })
    if (model.spacesOn()) items.push(t.everywhere ? { label: 'Only in This Space', click: () => model.sharePin(w, pinID, false) } : { label: 'Keep in Every Space', click: () => model.sharePin(w, pinID, true) })
    items.push({ label: 'Unpin', click: () => model.unpinTab(w, id) }, { label: 'Delete', click: () => model.deletePin(w, pinID) })
  }
  if (model.spacesOn() && !t.bench && !t.everywhere) {
    const others = model.spaces.filter(s => s.id !== t.space)
    items.push({
      label: 'Move to Space',
      submenu: [
        ...others.map(s => ({ label: s.name, click: () => model.moveToSpace(w, [id], s.id) })),
        ...(others.length > 1 ? [{ type: 'separator' as const }] : []),
        { label: 'New Space…', enabled: false },
      ],
    })
  }
  items.push(
    { type: 'separator' },
    { label: 'Rename', enabled: false },
    { label: 'Duplicate', enabled: web, click: () => model.duplicate(w, id) },
    { label: 'Copy Address', enabled: web, click: () => clipboard.writeText(t.url) },
    { label: t.muted ? 'Unmute Tab' : 'Mute Tab', click: () => model.updateTab(id, { muted: !t.muted }) },
    { label: 'Put to Sleep', enabled: !!runtimes.get(id)?.contents && !model.onScreen(id), click: () => void putToSleep(id) },
    { type: 'separator' },
    { label: 'Close Tab', click: () => model.closeTab(w, id) },
    { label: 'Close Other Tabs', enabled: model.spaceTabs(w).length >= 2, click: () => model.closeOthers(w, [id]) },
    { label: w.sidebar.layout === 'top' ? 'Close Tabs to the Right' : 'Close Tabs Below', enabled: model.tabsBelow(w, id).length > 0, click: () => model.closeBelow(w, id) },
    { label: model.reopenTitle(w), enabled: w.ghosts.length > 0 || model.closedWindows.length > 0, click: () => model.reopen(w) },
  )
  Menu.buildFromTemplate(items).popup({ window: c.base as never, x, y })
})

export { spaceIcons }
