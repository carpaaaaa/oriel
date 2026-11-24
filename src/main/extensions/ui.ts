// The extensions' place in the window (studio/04 §2): the puzzle and the
// pinned buttons (their state in the `ext` slice), the puzzle's list, the
// button's popup or side panel, the right-click menu, installing from a link
// or an id, Load Unpacked, turning off and removing, and the page that
// manages them. Pinned ids, turned-off extensions and unpacked sources are
// kept in extensions.json.

import { app, dialog, Menu, type Session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { downloadExtension, uninstallExtension } from 'electron-chrome-web-store'
import { brand } from '../../shared/brand'
import type { Rect } from '../../shared/state'
import type { ExtState, ExtView } from '../../shared/modules/extensions'
import { handle, run } from '../router'
import { need } from '../context'
import { model } from '../model/model'
import { allControllers, registerSlice, focusedController, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import { probe } from '../paths'
import { writeFileAtomic } from '../model/persist'
import { actionOf, popupUrl, sendEvent, tabDetails, onActionsChanged, handleApi } from './lib'
import { openPopup, closePopup, popupOf, onPopupChange, placeBeside, POP_ROOM, closedRecently } from './popup'
import { ask, askToAdd, localize, iconOf } from './ask'
import { panelOf, togglePanel, closePanel, behaviour, setPanelWidth, forget as forgetPanel, followTab } from './sidepanel'
import { closeOffscreen } from './offscreen'
import { stopHosts } from './native'
import { setupStore, offerFor } from './store'

const STORE = 'https://chromewebstore.google.com/category/extensions'
/** The profile's partition, for crx:// icons (main/index.ts makes it). */
const PARTITION = 'persist:personal'

let lib: ElectronChromeExtensions | null = null
let profile: Session | null = null
let extensionsRoot = ''
let unpackedRoot = ''

interface Saved { pinned: string[]; disabled: Record<string, string>; sources: Record<string, string>; order: string[] }
let saved: Saved = { pinned: [], disabled: {}, sources: {}, order: [] }
const savedFile = () => path.join(app.getPath('userData'), 'extensions.json')
function save(): void {
  // Atomic: a half-written file would lose the pins and the extensions turned off (studio/09 §3).
  try { writeFileAtomic(savedFile(), JSON.stringify(saved, null, 2)) } catch (e) { console.warn('[extensions] save', e) }
}

const busy = new Set<string>()
let said: ExtState['said'] = null
/** Per window: the puzzle's list, the manage page. */
const per = new WeakMap<WindowController, { menu: ExtState['menu']; puzzle: Rect | null; manage: boolean }>()
const of = (c: WindowController) => { let s = per.get(c); if (!s) { s = { menu: null, puzzle: null, manage: false }; per.set(c, s) } return s }

export function markAll(): void { for (const c of allControllers()) if (!c.base.isDestroyed()) c.mark('ext') }
function say(text: string, bad = false): void { said = { text, bad }; markAll() }

const isStore = (folder: string) => path.resolve(folder).startsWith(path.resolve(extensionsRoot) + path.sep)
const readManifest = (folder: string): Record<string, any> | null => { try { return JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')) } catch { return null } }

function activeContents(c: WindowController): Electron.WebContents | null {
  const id = c.record.active[c.record.space]
  return (id && runtimes.get(id)?.contents) || null
}

function colour(c: unknown): string | undefined {
  if (typeof c === 'string') return c
  if (Array.isArray(c) && c.length >= 3) return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] ?? 255) / 255})`
  return undefined
}

function view(c: WindowController, ext: Electron.Extension | null, id: string, folder: string): ExtView {
  const m = (ext?.manifest ?? readManifest(folder) ?? {}) as Record<string, any>
  const tabId = activeContents(c)?.id ?? -1
  const a = ext && lib ? actionOf(lib, id, tabId) : null
  const name = ext?.name ?? localize(folder, m, m.name) ?? id
  return {
    id,
    name,
    version: ext?.version ?? m.version ?? '',
    icon: ext ? `crx://extension-icon/${id}/32/2?tabId=${tabId}&partition=${encodeURIComponent(PARTITION)}&t=${a?.iconModified ?? 0}` : null,
    enabled: !!ext,
    pinned: saved.pinned.includes(id),
    action: !!(m.action || m.browser_action || m.page_action),
    title: a?.title || name,
    badge: a?.text ? { text: String(a.text), colour: colour(a.color) } : null,
    fromStore: isStore(folder),
    folder: isStore(folder) ? undefined : saved.sources[id] ?? folder,
    options: !!(m.options_ui?.page || m.options_page),
  }
}

/** Installed extensions in the order they came. */
function installed(): { ext: Electron.Extension | null; id: string; folder: string }[] {
  const loaded = profile?.extensions.getAllExtensions() ?? []
  const all = [
    ...loaded.map(ext => ({ ext: ext as Electron.Extension | null, id: ext.id, folder: ext.path })),
    ...Object.entries(saved.disabled).filter(([id]) => !loaded.some(e => e.id === id)).map(([id, folder]) => ({ ext: null, id, folder })),
  ]
  for (const e of all) if (!saved.order.includes(e.id)) saved.order.push(e.id)
  return all.sort((a, b) => saved.order.indexOf(a.id) - saved.order.indexOf(b.id))
}

export function sliceFor(c: WindowController): ExtState {
  const s = of(c)
  const p = popupOf(c)
  const panel = panelOf(c)
  return {
    list: installed().map(e => view(c, e.ext, e.id, e.folder)),
    menu: s.menu,
    popup: p?.shown && p.placed ? { id: p.id, rect: p.placed.rect, arrow: p.placed.arrow } : null,
    busy: [...busy],
    said,
    manage: s.manage,
    panel: panel ? { id: panel.id, side: c.record.sidebar.side === 'right' ? 'left' : 'right', width: panel.width } : null,
    store: offerFor(c),
  }
}

/** Where a button would be when none was given (a key, action.openPopup):
 * the Mac's fallbacks, the column's foot or the window's top right. */
function fallbackAnchor(c: WindowController): Rect {
  const s = of(c)
  if (s.puzzle) return s.puzzle
  const { width, height } = c.base.getContentBounds()
  return c.record.sidebar.layout === 'side'
    ? { x: c.record.sidebar.side === 'left' ? 24 : width - 50, y: height - 40, width: 26, height: 26 }
    : { x: width - 60, y: 40, width: 1, height: 1 }
}

// ---- the puzzle's list

const LIST = { width: 280, pad: 6, row: 30, rows: 360, empty: 42, foot: 3 * 28 + 13 }

function closeMenu(c: WindowController): void {
  const s = of(c)
  if (!s.menu) return
  s.menu = null
  if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'ext.list') c.sendOverlay({ kind: 'none' })
  c.mark('ext')
}

function openMenu(c: WindowController, anchor: Rect): void {
  closePopup(c)
  const s = of(c)
  s.puzzle = anchor
  const rows = installed().filter(e => e.ext && view(c, e.ext, e.id, e.folder).action).length
  const height = LIST.pad * 2 + (rows ? Math.min(LIST.rows, rows * LIST.row) : LIST.empty) + LIST.foot
  const placed = placeBeside(c, anchor, { width: LIST.width, height })!
  s.menu = { anchor: placed.rect, ...placed } as never
  c.sendOverlay({ kind: 'panel', name: 'ext.list' })
  const r = placed.rect
  c.setOverlayRegion({ x: r.x - POP_ROOM, y: r.y - POP_ROOM, width: r.width + POP_ROOM * 2, height: r.height + POP_ROOM * 2 }, true)
  c.mark('ext')
}

// ---- pressing a button (studio/04 §2.3 "Click su un pulsante")

export function press(c: WindowController, id: string, anchor?: Rect): void {
  if (!lib || !profile?.extensions.getExtension(id)) return
  closeMenu(c)
  const tab = activeContents(c)
  if (behaviour(id)) { togglePanel(c, id); return }
  const url = popupUrl(lib, id, tab?.id ?? -1)
  if (url) {
    const open = popupOf(c)
    if ((open && open.id === id) || closedRecently(c, id)) { closePopup(c); return }
    openPopup(c, profile, id, url, anchor ?? fallbackAnchor(c))
    return
  }
  sendEvent(lib, id, 'browserAction.onClicked', tabDetails(lib, tab ?? undefined))
}

// ---- installing, turning off, removing

function idIn(text: string): string | null {
  return /[a-p]{32}/.exec(String(text).toLowerCase())?.[0] ?? null
}

export async function install(text: string): Promise<void> {
  const id = idIn(text)
  if (!id) return say("That isn't a Chrome Web Store link or extension id", true)
  if (profile?.extensions.getExtension(id) || saved.disabled[id]) return say('Already installed', true)
  if (busy.has(id)) return
  busy.add(id); markAll()
  let folder: string | null = null
  try {
    folder = await downloadExtension(id, extensionsRoot)
    const m = readManifest(folder) ?? {}
    const name = localize(folder, m, m.name) || id
    if (!(await askToAdd(name, m, brand.name, iconOf(folder, m)))) {
      fs.rmSync(path.dirname(folder), { recursive: true, force: true })
      return
    }
    const ext = await profile!.extensions.loadExtension(folder)
    say(`${ext.name} is installed`)
  } catch (e) {
    if (folder) fs.rmSync(path.dirname(folder), { recursive: true, force: true })
    const why = String((e as Error)?.message ?? e)
    say(/404|204|noupdate/i.test(why)
      ? 'The Chrome Web Store has nothing for that id. It may have been taken down, or only exist for old versions of Chrome'
      : `Couldn't install the extension: ${why}`, true)
  } finally {
    busy.delete(id); markAll()
  }
}

/** The Web Store page's own button: the same question first. */
export async function beforeStoreInstall(details: { id: string; localizedName: string; manifest: chrome.runtime.Manifest; icon: Electron.NativeImage }): Promise<{ action: 'allow' | 'deny' }> {
  const ok = await askToAdd(details.localizedName, details.manifest as never, brand.name, details.icon.isEmpty() ? undefined : details.icon.resize({ width: 64, height: 64 }))
  return { action: ok ? 'allow' : 'deny' }
}

function letGo(id: string): void {
  for (const c of allControllers()) {
    if (popupOf(c)?.id === id) closePopup(c)
    if (panelOf(c)?.id === id) closePanel(c)
  }
  forgetPanel(id)
  closeOffscreen(id)
  stopHosts(id)
}

export async function remove(id: string, confirm = true): Promise<void> {
  const ext = profile?.extensions.getExtension(id)
  const folder = ext?.path ?? saved.disabled[id]
  if (!folder) return
  const name = ext?.name ?? localize(folder, readManifest(folder) ?? {}, readManifest(folder)?.name) ?? id
  if (confirm) {
    const answer = await ask({ message: `Remove “${name}”?`, detail: 'Its settings and data go with it.', buttons: ['Remove', 'Cancel'], cancel: 1 })
    if (answer !== 'Remove') return
  }
  letGo(id)
  if (isStore(folder)) await uninstallExtension(id, { session: profile!, extensionsPath: extensionsRoot }).catch(() => {})
  else {
    if (ext) profile!.extensions.removeExtension(id)
    if (path.resolve(folder).startsWith(path.resolve(unpackedRoot) + path.sep)) fs.rmSync(folder, { recursive: true, force: true })
  }
  // Its settings and data go with it (studio/04 §2.8).
  await profile!.clearStorageData({ origin: `chrome-extension://${id}` }).catch(() => {})
  saved.pinned = saved.pinned.filter(p => p !== id)
  delete saved.disabled[id]
  delete saved.sources[id]
  saved.order = saved.order.filter(p => p !== id)
  save()
  markAll()
}

export async function enable(id: string, on: boolean): Promise<void> {
  if (!profile) return
  if (!on) {
    const ext = profile.extensions.getExtension(id)
    if (!ext) return
    letGo(id)
    saved.disabled[id] = ext.path
    save()
    profile.extensions.removeExtension(id)
  } else {
    const folder = saved.disabled[id]
    if (!folder) return
    delete saved.disabled[id]
    save()
    await profile.extensions.loadExtension(folder).catch(e => say(`Couldn't start: ${(e as Error).message}`, true))
  }
  markAll()
}

/** Load Unpacked: the folder is copied, so moving it breaks nothing
 * (studio/04 §2.2, 5); Reload copies it again. */
export async function loadUnpacked(c: WindowController | null, given?: string): Promise<void> {
  let source = given
  if (!source) {
    if (probe) return
    const r = await dialog.showOpenDialog(c?.base as never, { title: 'Load Extension', message: "Choose the folder that holds the extension's manifest.json.", buttonLabel: 'Load', properties: ['openDirectory'] })
    if (r.canceled || !r.filePaths[0]) return
    source = r.filePaths[0]
  }
  if (!fs.existsSync(path.join(source, 'manifest.json'))) return say('That folder has no manifest.json', true)
  const to = path.join(unpackedRoot, path.basename(source))
  for (const e of profile!.extensions.getAllExtensions()) if (path.resolve(e.path) === path.resolve(to)) return say('Already installed. Press Reload to take its changes', true)
  try {
    fs.rmSync(to, { recursive: true, force: true })
    fs.cpSync(source, to, { recursive: true, dereference: false, filter: f => !fs.lstatSync(f).isSymbolicLink() })
    const ext = await profile!.extensions.loadExtension(to)
    saved.sources[ext.id] = source
    save()
    say(`${ext.name} is installed`)
  } catch (e) {
    say(`Couldn't install the extension: ${(e as Error).message}`, true)
  }
}

export async function reload(id: string): Promise<void> {
  const ext = profile?.extensions.getExtension(id)
  if (!ext || isStore(ext.path)) return
  const source = saved.sources[id]
  if (source && !fs.existsSync(source)) return say(`The folder ${ext.name} was loaded from is gone`, true)
  letGo(id)
  profile!.extensions.removeExtension(id)
  if (source) {
    fs.rmSync(ext.path, { recursive: true, force: true })
    fs.cpSync(source, ext.path, { recursive: true, filter: f => !fs.lstatSync(f).isSymbolicLink() })
  }
  try {
    const again = await profile!.extensions.loadExtension(ext.path)
    say(`${again.name} reloaded`)
  } catch (e) {
    say(`${ext.name} couldn't start: ${(e as Error).message}`, true)
  }
}

function openOptions(c: WindowController, id: string): void {
  const m = profile?.extensions.getExtension(id)?.manifest as Record<string, any> | undefined
  const page = m?.options_ui?.page ?? m?.options_page
  if (page) model.open(c.record, `chrome-extension://${id}/${String(page).replace(/^\//, '')}`, { foreground: true })
}

/** Right click on a button or a row (studio/04 §2.3 "Tasto destro"). */
function context(c: WindowController, id: string, x: number, y: number): void {
  const ext = profile?.extensions.getExtension(id)
  if (!ext) return
  const m = ext.manifest as Record<string, any>
  const pinned = saved.pinned.includes(id)
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: pinned ? 'Unpin' : 'Pin to Toolbar', click: () => setPinned(id, !pinned) },
  ]
  if (m.options_ui?.page || m.options_page) items.push({ label: 'Options…', click: () => openOptions(c, id) })
  if (!isStore(ext.path)) items.push({ label: 'Reload', click: () => void reload(id) })
  items.push({ type: 'separator' }, { label: `Remove “${ext.name}”…`, click: () => void remove(id) })
  Menu.buildFromTemplate(items).popup({ window: c.base as never, x: Math.round(x), y: Math.round(y) })
}

function setPinned(id: string, on: boolean): void {
  saved.pinned = saved.pinned.filter(p => p !== id)
  if (on) saved.pinned.push(id)
  save()
  markAll()
}

// ---- wiring

export function setupUI(e: ElectronChromeExtensions, p: Session, roots: { extensions: string; unpacked: string }): void {
  lib = e
  profile = p
  extensionsRoot = roots.extensions
  unpackedRoot = roots.unpacked
  try { saved = { ...saved, ...JSON.parse(fs.readFileSync(savedFile(), 'utf8')) } } catch { /* first time */ }
  registerSlice('ext', sliceFor)
  onActionsChanged(e, markAll)
  onPopupChange(c => { if (!c.base.isDestroyed()) c.mark('ext') })
  p.extensions.on('extension-loaded', markAll)
  p.extensions.on('extension-unloaded', (_e, ext) => { letGo(ext.id); markAll() })
  model.on('selected', (win: { id: string }) => {
    for (const c of allControllers()) if (c.record.id === win.id && !c.base.isDestroyed()) { closePopup(c); followTab(c); c.mark('ext') }
  })
  setupStore(p, {
    icon: id => (lib ? `crx://extension-icon/${id}/32/2?partition=${encodeURIComponent(PARTITION)}` : null),
    changed: c => { if (!c.base.isDestroyed()) c.mark('ext') },
  })
  // action.openPopup(): Oriel's popup, at the button.
  handleApi(e, 'browserAction.openPopup', ext => {
    const c = focusedController()
    if (c) press(c, ext.id)
  })
}

/** At start: folders loaded with Load Unpacked come back; turned-off ones stay off. */
export async function restoreAtStart(): Promise<void> {
  if (!profile) return
  for (const id of Object.keys(saved.disabled)) if (profile.extensions.getExtension(id)) profile.extensions.removeExtension(id)
  let folders: string[] = []
  try { folders = fs.readdirSync(unpackedRoot).map(f => path.join(unpackedRoot, f)).filter(f => fs.existsSync(path.join(f, 'manifest.json'))) } catch { /* none */ }
  for (const f of folders) {
    if (Object.values(saved.disabled).some(d => path.resolve(d) === path.resolve(f))) continue
    if (profile.extensions.getAllExtensions().some(x => path.resolve(x.path) === path.resolve(f))) continue
    await profile.extensions.loadExtension(f).catch(err => console.warn('[extensions] unpacked', f, err))
  }
}

handle('ext.menu', ({ anchor }, ctx) => { const c = need(ctx); of(c).menu ? closeMenu(c) : openMenu(c, anchor) })
handle('ext.menuClose', (_a, ctx) => closeMenu(need(ctx)))
handle('ext.press', ({ id, anchor }, ctx) => press(need(ctx), id, anchor))
handle('ext.popupClose', (_a, ctx) => closePopup(need(ctx)))
handle('ext.pin', ({ id, pinned }) => setPinned(id, pinned))
handle('ext.context', ({ id, x, y, overlay }, ctx) => {
  const c = need(ctx)
  const o = overlay ? c.overlay.getBounds() : { x: 0, y: 0 }
  context(c, id, x + o.x, y + o.y)
})
handle('ext.options', ({ id }, ctx) => openOptions(need(ctx), id))
handle('ext.remove', ({ id, ask: confirm }) => remove(id, confirm !== false))
handle('ext.enable', ({ id, on }) => enable(id, on))
handle('ext.install', ({ text }) => install(text))
handle('ext.store', (_a, ctx) => { model.open(need(ctx).record, STORE, { foreground: true }) })
handle('ext.loadUnpacked', ({ path: p }, ctx) => loadUnpacked(need(ctx), p))
handle('ext.reload', ({ id }) => reload(id))
handle('ext.manage', ({ open }, ctx) => {
  const c = need(ctx)
  closeMenu(c)
  of(c).manage = open
  if (open) {
    c.sendOverlay({ kind: 'panel', name: 'ext.manage' })
    const { width, height } = c.base.getContentBounds()
    c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
  } else if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'ext.manage') c.sendOverlay({ kind: 'none' })
  c.mark('ext')
})
handle('ext.panelClose', (_a, ctx) => closePanel(need(ctx)))
handle('ext.panelWidth', ({ width }, ctx) => setPanelWidth(need(ctx), width))
