// The menus' items, in the Mac's order and words (studio/01 §4.35 TabMenu,
// §4.36 several tabs, §4.37 ColumnMenu, §6.25 a folder, §6.36-§6.47 a
// group, §7.12 a space; TabBar.swift:1786-2103, ColumnMenu.swift,
// PinFolderViews.swift:154-179, TabGroups.swift:280-300, Spaces.swift:1090).
// Items whose command doesn't exist yet are there, disabled (see the report).

import { state } from '../lib/store'
import type { Command } from '../../shared/commands'
import type { TabView } from '../../shared/state'
import type { Entry } from './bridge'
import {
  P, label, pinOf, folderEntries, canMakeIn, canMoveFolder, spaceSymbol, spaceIcons, spaceIconNames, currentSpace, spaceKeyMod,
} from '../sidebar/derive'
import { tint } from '../sidebar/look'

const sep: Entry = { separator: true }
const off = (label: string): Entry => ({ label, enabled: false })
const web = (t: TabView) => !t.empty && !t.internal && /^(https?|file):/i.test(t.url)
const same = (a?: string, b?: string) => (a ?? '').replace(/\/+$/, '') === (b ?? '').replace(/\/+$/, '')

function groupItems(ids: string[]): Entry {
  const tabs = ids.map(id => state.tabs.find(t => t.id === id)).filter(Boolean) as TabView[]
  const sub: Entry[] = [{ label: 'New Group', act: { ui: 'group.new', data: ids } }]
  if (state.groups.length) sub.push(sep)
  for (const g of state.groups) {
    sub.push({ label: g.name, enabled: !tabs.every(t => t.groupID === g.id), act: { cmd: { do: 'tab.group', ids, group: g.id } } })
  }
  if (tabs.some(t => t.groupID)) sub.push(sep, { label: 'Remove from Group', act: { cmd: { do: 'tab.group', ids, group: null } } })
  return { label: 'Move to Group', submenu: sub }
}

function spaceItems(ids: string[]): Entry | null {
  if (!P.spaces()) return null
  const others = state.spaces.filter(s => s.id !== state.space)
  const sub: Entry[] = others.map(s => ({ label: s.name, glyph: spaceSymbol(s), tint: tint(s), act: { cmd: { do: 'tab.toSpace', ids, space: s.id } } }))
  if (state.spaces.length > 1) sub.push(sep)
  sub.push({ label: 'New Space…', act: { ui: 'panel:ask', data: { kind: 'space.new', moving: ids, icon: nextIcon() } } })
  return { label: 'Move to Space', submenu: sub }
}

/** The first icon no space wears yet, else briefcase (Spaces.swift:680). */
export function nextIcon(): string {
  const used = new Set(state.spaces.map(spaceSymbol))
  return spaceIcons.find(i => !used.has(i)) ?? 'briefcase'
}

function closeItems(t: TabView): Entry[] {
  const row = state.tabs
  const at = row.findIndex(x => x.id === t.id)
  const below = row.slice(at + 1).some(x => !x.pinID)
  const reopen = state.reopen
  return [
    { label: 'Close Tab', act: { cmd: { do: 'tab.close', id: t.id } } },
    { label: 'Close Other Tabs', enabled: row.length >= 2, act: { cmd: { do: 'tab.closeOthers', id: t.id } } },
    { label: state.sidebar.layout === 'top' ? 'Close Tabs to the Right' : 'Close Tabs Below', enabled: below, act: { cmd: { do: 'tab.closeBelow', id: t.id } } },
    { label: reopen?.title ?? 'Reopen Closed Tab', enabled: !!reopen?.can, act: { cmd: { do: 'tab.reopen' } } },
  ]
}

/** Always Open <site> in <space> / Stop Opening (SpaceRoutes, §7.29). */
function siteRoute(t: TabView): Entry | null {
  if (!P.spaces() || !state.prefs['spaces.links'] || t.shy) return null
  let site = ''
  try { const u = new URL(t.url); if (!/^https?:$/.test(u.protocol)) return null; site = u.hostname.toLowerCase().replace(/^www\.(?=.*\.)/, '') } catch { return null }
  const space = state.spaces.find(s => s.id === state.space)
  if (!site || !space) return null
  const rules = (state.prefs['spaces.links.rules'] as { site: string; space: string }[] | undefined) ?? []
  const here = rules.find(r => r.site === site && r.space.toUpperCase() === space.id.toUpperCase())
  return here
    ? { label: `Stop Opening ${site} in ${space.name}`, act: { cmd: { do: 'spaces.route', url: t.url, space: null } as Command } }
    : { label: `Always Open ${site} in ${space.name}`, act: { cmd: { do: 'spaces.route', url: t.url, space: space.id } as Command } }
}

/** The host Keep This Site Awake keeps: http(s) only, any port. */
function siteOf(t: TabView): string | null {
  try { const u = new URL(t.url); return /^https?:$/.test(u.protocol) && u.hostname ? u.hostname.toLowerCase() : null } catch { return null }
}
function keptAwake(t: TabView): boolean {
  const site = siteOf(t)
  if (!site) return false
  if (t.shy) return !!t.awake
  return ((state.prefs['tabs.awakeSites'] as string[] | undefined) ?? []).includes(site)
}

/** Shield's host for a tab (without www), while Shield is on, outside a private tab. */
function shieldSite(t: TabView): string | null {
  if (t.shy || state.prefs['shield'] === false) return null
  return siteOf(t)?.replace(/^www\./, '') ?? null
}
/** A tab's site for Allow Copying on This Site: not while every site is free, not a private tab's. */
function copySite(t: TabView): string | null {
  if (t.shy || state.prefs['pages.allowCopy'] || !/^https?:/i.test(t.url)) return null
  return siteOf(t)?.replace(/^www\./, '') ?? null
}
const copyAllowed = (t: TabView) => { const s = copySite(t); return !!s && ((state.prefs['copy.sites'] as string[] | undefined) ?? []).includes(s) }

function shieldPaused(t: TabView): boolean {
  const site = shieldSite(t)
  return !!site && ((state.prefs['shield.paused'] as string[] | undefined) ?? []).includes(site)
}

/** A tab's or a pin's menu (§4.35). */
export function tabMenu(t: TabView): Entry[] {
  const picked = state.picked ?? []
  // A plain copy of the picks: the store's own array can't cross to the main process (the menu didn't open).
  if (picked.length > 1 && picked.includes(t.id)) return manyMenu([...picked])
  const items: Entry[] = []
  const pin = t.pinID ? pinOf(t) : undefined
  if (!t.pinID && !t.shy) items.push(groupItems([t.id]))
  if (!t.pinID) {
    items.push({ label: 'Pin', enabled: web(t) && !t.shy, act: { cmd: { do: 'tab.pin', id: t.id } } })
    if (P.pinRows()) items.push({ label: 'Pin as Row', enabled: web(t) && !t.shy, act: { cmd: { do: 'tab.pinRow', id: t.id } } })
  } else if (pin) {
    if (P.pinRows()) items.push(t.listed
      ? { label: 'Show as Square', act: { cmd: { do: 'pin.listed', id: pin.id, listed: false } } }
      : { label: 'Show as Row', act: { cmd: { do: 'pin.listed', id: pin.id, listed: true } } })
    if (P.pinRows() && P.pinFolders()) {
      if (t.listed && !pin.everywhere) {
        const entries = folderEntries(state.pinFolders)
        const sub: Entry[] = entries.map(e => ({ label: e.title, enabled: pin.folder !== e.folder.id, act: { cmd: { do: 'pin.folder', id: pin.id, folder: e.folder.id } } }))
        if (pin.folder) sub.push(sep, { label: 'Remove from Folder', act: { cmd: { do: 'pin.folder', id: pin.id, folder: null } } })
        items.push({ label: 'New Folder', act: { ui: 'folder.new', data: { pin: pin.id } } }, off('New Live Folder…'),
          { label: 'Move to Folder', submenu: sub.length ? sub : [off('No Folders')] })
      } else items.push(off('New Live Folder…'))
    }
    items.push(t.listed
      ? { label: 'Back to Pinned Page', enabled: !!pin.home && !same(t.url, pin.home), act: { cmd: { do: 'pin.home', id: pin.id } } }
      : { label: 'Change Letter', act: { ui: 'letter', id: t.id } })
    items.push({ label: 'Replace Pinned Page with Current URL', enabled: web(t) && !same(t.url, pin.home), act: { cmd: { do: 'pin.rehome', id: pin.id } } })
    if (P.spaces()) items.push(pin.everywhere
      ? { label: 'Only in This Space', act: { cmd: { do: 'pin.share', id: pin.id, everywhere: false } } }
      : { label: 'Keep in Every Space', act: { cmd: { do: 'pin.share', id: pin.id, everywhere: true } } })
    items.push({ label: 'Unpin', act: { cmd: { do: 'tab.unpin', id: t.id } } }, { label: 'Delete', act: { cmd: { do: 'pin.remove', id: pin.id } } })
  }
  if (!pin?.everywhere) { const s = spaceItems([t.id]); if (s) items.push(s) }
  // Send links to a space (§7.29): this tab's site, to the space it is in.
  const routeItem = siteRoute(t)
  if (routeItem) items.push(routeItem)
  items.push(off('Open in Split View'))
  if (!t.pinID) items.push(off('Move to New Window'))
  // With links from other apps in a small window on (Browser.liftable).
  if (state.prefs['links.little'] !== false && !t.pinID) items.push({ label: 'Open in Small Window', enabled: web(t) && !t.shy && /^https?:/i.test(t.url), act: { cmd: { do: 'tab.little', id: t.id } } })
  items.push(
    sep,
    { label: 'Rename', act: { ui: 'rename', id: t.id } },
    { label: 'Duplicate', enabled: web(t), act: { cmd: { do: 'tab.duplicate', id: t.id } } },
    off('Site Information…'),
    { label: 'Copy Address', enabled: web(t), act: { copy: t.url } },
    { label: 'Copy as Markdown Link', enabled: web(t), act: { copy: `[${label(t).replace(/([[\]])/g, '\\$1')}](${t.url})` } },
    off('Copy Clean Link'),
    // Websites in the side panel (SidePanel.swift openInSidePanel): not a private tab's.
    { label: 'Open in Side Panel', enabled: web(t) && !t.shy && /^https?:/i.test(t.url), act: { cmd: { do: 'panel.site', url: t.url } } },
    { label: t.muted ? 'Unmute Tab' : 'Mute Tab', act: { cmd: { do: 'tab.mute', id: t.id, muted: !t.muted } } },
    // Block Ads and Trackers for this site (studio/06 §5.1): the Mac's site card
    // has a switch; here the words say what a click does, as Always Open / Stop
    // Opening (a tick, on nearly always, would move every label). Only while
    // Shield works, never in a private tab.
    ...(shieldSite(t) ? [shieldPaused(t)
      ? { label: 'Block Ads and Trackers on This Site', act: { cmd: { do: 'pages.shield.site', id: t.id, on: true } as Command } }
      : { label: 'Stop Blocking Ads on This Site', act: { cmd: { do: 'pages.shield.site', id: t.id, on: false } as Command } }] : []),
    // Copying set free here: on the tab, as the page itself may refuse the right click (sites.ts).
    ...(copySite(t) ? [{ label: 'Allow Copying on This Site', checked: copyAllowed(t) || undefined, act: { cmd: { do: 'pages.copy.site', id: t.id, on: !copyAllowed(t) } as Command } }] : []),
    // Keep This Site Awake (§9.24): on the Mac it is on the site's card; Oriel has none yet.
    // Its tick only when on: a column for it would move every label (the Mac's tab menu has none).
    ...(siteOf(t) ? [{ label: 'Keep This Site Awake', checked: keptAwake(t) || undefined, act: { cmd: { do: 'tab.keepAwake', id: t.id, on: !keptAwake(t) } as Command } }] : []),
    { label: 'Put to Sleep', enabled: !t.asleep && !t.empty && t.id !== state.activeID && !keptAwake(t), act: { cmd: { do: 'tab.putToSleep', id: t.id } } },
    sep,
    ...closeItems(t),
  )
  return items
}

/** Several tabs picked (§4.36): what can be done to all, done to all. */
export function manyMenu(ids: string[]): Entry[] {
  const tabs = ids.map(id => state.tabs.find(t => t.id === id)).filter(Boolean) as TabView[]
  const n = tabs.length
  const items: Entry[] = []
  if (tabs.every(t => !t.pinID && !t.shy)) items.push(groupItems(ids))
  if (tabs.every(t => !t.pinID && web(t) && !t.shy)) {
    items.push({ label: `Pin ${n} Tabs`, act: { cmds: ids.map(id => ({ do: 'tab.pin', id }) as Command) } })
    if (P.pinRows()) items.push({ label: `Pin ${n} Tabs as Rows`, act: { cmds: ids.map(id => ({ do: 'tab.pinRow', id }) as Command) } })
  } else if (tabs.every(t => t.pinID)) items.push({ label: `Unpin ${n} Tabs`, act: { cmds: ids.map(id => ({ do: 'tab.unpin', id }) as Command) } })
  if (tabs.every(t => !pinOf(t)?.everywhere)) { const s = spaceItems(ids); if (s) items.push(s) }
  items.push(off(`Open ${n} Tabs in Split View`))
  const addresses = tabs.filter(web).map(t => t.url)
  const allMuted = tabs.every(t => t.muted)
  items.push(
    sep,
    { label: 'Copy Addresses', enabled: addresses.length > 0, act: { copy: addresses.join('\n') } },
    allMuted
      ? { label: `Unmute ${n} Tabs`, act: { cmds: tabs.map(t => ({ do: 'tab.mute', id: t.id, muted: false }) as Command) } }
      : { label: `Mute ${n} Tabs`, act: { cmds: tabs.filter(t => t.audible).map(t => ({ do: 'tab.mute', id: t.id, muted: true }) as Command) } },
    { label: `Put ${n} Tabs to Sleep`, enabled: tabs.some(t => !t.asleep && !t.empty && t.id !== state.activeID),
      act: { cmds: tabs.filter(t => !t.asleep && t.id !== state.activeID).map(t => ({ do: 'tab.putToSleep', id: t.id }) as Command) } },
    sep,
    { label: `Close ${n} Tabs`, act: { cmd: { do: 'tab.closeMany', ids } } },
    { label: 'Close Other Tabs', enabled: state.tabs.length > n, act: { cmd: { do: 'tab.closeOthers', id: ids[0] } } },
  )
  return items
}

/** Where the column has nothing of its own (§4.37, §5.41). */
export function columnMenu(paste: string | null): Entry[] {
  const items: Entry[] = [{ label: 'New Tab', act: { cmd: { do: 'tab.blank' } } }]
  if (P.pinRows() && P.pinFolders()) items.push({ label: 'New Folder', act: { ui: 'folder.new', data: {} } }, off('New Live Folder…'))
  if (paste) items.push(sep, { label: 'Paste and Go', act: { cmd: { do: 'tab.open', url: paste, foreground: true } } })
  items.push(sep, { label: 'Hide Sidebar', act: { cmd: { do: 'sidebar.fold', folded: true } } },
    { label: 'Sidebar Settings…', act: { cmd: { do: 'tab.open', url: 'oriel://settings', foreground: true } } })
  return items
}

/** An address on the clipboard, as ColumnMenu.swift:47-60 reads one. */
export function pastable(text: string): string | null {
  const t = text.trim()
  if (!t || t.length >= 4096 || /\s/.test(t)) return null
  try {
    const u = new URL(t)
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host) return t
  } catch { /* not a URL */ }
  if (t.includes('.') && !t.startsWith('.') && !t.endsWith('.') && !t.includes('://')) return `https://${t}`
  return null
}

/** A pin folder's heading (§6.25). */
export function folderMenu(id: string): Entry[] {
  const f = state.pinFolders.find(x => x.id === id)
  if (!f) return []
  const others = folderEntries(state.pinFolders).filter(e => e.folder.id !== id)
  const move: Entry[] = [{ label: 'Top of Pinned Rows', enabled: !!f.parent, act: { cmd: { do: 'pinFolder.move', id, parent: null } } }]
  if (others.length) move.push(sep)
  for (const e of others) move.push({ label: e.title, enabled: f.parent !== e.folder.id && canMoveFolder(id, e.folder.id), act: { cmd: { do: 'pinFolder.move', id, parent: e.folder.id } } })
  return [
    { label: 'Rename Folder', act: { ui: 'folder.rename', id } },
    { label: f.open ? 'Collapse Folder' : 'Expand Folder', act: { cmd: { do: 'pinFolder.fold', id, folded: f.open } } },
    ...(f.live ? [off('Refresh')] : [
      { label: 'New Folder Inside', enabled: canMakeIn(id), act: { ui: 'folder.new', data: { parent: id } } } as Entry,
      { ...off('New Live Folder Inside…') },
    ]),
    { label: 'Move Folder To', submenu: move },
    sep,
    { label: 'Delete Folder', act: { cmd: { do: 'pinFolder.delete', id } } },
  ]
}

/** A group's heading (TabGroups.swift:280-300). */
export function groupMenu(id: string): Entry[] {
  const g = state.groups.find(x => x.id === id)
  if (!g) return []
  const items: Entry[] = [
    { label: 'New Tab in Group', act: { cmd: { do: 'group.newTab', id } } },
    sep,
    { label: 'Rename Group', act: { ui: 'group.rename', id } },
    { label: g.folded ? 'Expand Group' : 'Collapse Group', act: { cmd: { do: 'group.fold', id, folded: !g.folded } } },
    { label: 'Colour…', act: { ui: 'panel:swatches', data: { kind: 'group', id, colour: g.colour ?? 0 } } },
  ]
  if (P.spaces() && state.spaces.length > 1) {
    items.push({ label: 'Move Group to Space', submenu: state.spaces.filter(s => s.id !== state.space)
      .map(s => ({ label: s.name, glyph: spaceSymbol(s), tint: tint(s), act: { cmd: { do: 'group.toSpace', id, space: s.id } } })) })
  }
  items.push(sep, { label: 'Ungroup Tabs', act: { cmd: { do: 'group.ungroup', id } } }, { label: 'Close Group', act: { cmd: { do: 'group.close', id } } })
  return items
}

/** The space's menu (Spaces.swift:1090-1207). Keys: Alt+1-9 on Windows, Ctrl+1-9 when swapped. */
export function spaceMenu(): Entry[] {
  const here = currentSpace()
  const items: Entry[] = state.spaces.map((s, i) => ({
    label: s.name, glyph: spaceSymbol(s), tint: tint(s), checked: s.id === state.space,
    accel: i < 9 ? `${spaceKeyMod()}+${i + 1}` : undefined, act: { cmd: { do: 'space.select', id: s.id } },
  }))
  items.push(sep, { label: 'New Space…', act: { ui: 'panel:ask', data: { kind: 'space.new', icon: nextIcon() } } })
  if (!here) return items
  const at = state.spaces.findIndex(s => s.id === here.id)
  items.push(
    sep,
    { label: `Rename “${here.name}”…`, act: { ui: 'panel:ask', data: { kind: 'space.rename', id: here.id, title: 'Rename Space', initial: here.name, placeholder: here.name, confirm: 'Rename' } } },
    { label: 'Icon', submenu: spaceIcons.map((icon, i) => ({ label: spaceIconNames[i], glyph: icon, checked: spaceSymbol(here) === icon, act: { cmd: { do: 'space.icon', id: here.id, icon } } })) },
    { label: 'Colour…', act: { ui: 'panel:swatches', data: { kind: 'space', id: here.id, colour: here.colour } } },
  )
  if (at > 0) items.push({ label: 'Move Left', act: { cmd: { do: 'space.order', id: here.id, by: -1 } } })
  if (at < state.spaces.length - 1) items.push({ label: 'Move Right', act: { cmd: { do: 'space.order', id: here.id, by: 1 } } })
  if (state.groups.length) {
    items.push(sep,
      { label: 'Fold All Groups', enabled: state.groups.some(g => !g.folded), act: { cmd: { do: 'group.foldAll', folded: true } } },
      { label: 'Unfold All Groups', enabled: state.groups.some(g => g.folded), act: { cmd: { do: 'group.foldAll', folded: false } } },
      sep)
  }
  items.push({ label: 'Downloads', submenu: [{ label: 'Same as Settings', checked: true, enabled: false }, sep, off('Choose Folder…')] })
  if (state.spaces.length > 1) {
    items.push(sep, { label: `Delete “${here.name}”…`, act: { ui: 'panel:sure', data: { kind: 'space.delete', id: here.id, name: here.name } } })
  }
  return items
}
