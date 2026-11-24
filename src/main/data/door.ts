// The bookmark button's popover (BookmarkDoor, Bookmarks.swift:1133-1420;
// studio/05 §3.2, studio/01 §4.3, §5.9): a click on the button opens the list
// (BookmarksDropdown: the tree, then Add This Page or Edit This Bookmark…),
// ⇧⌘B the card for the page in front (BookmarkCard: its name, its folder,
// Remove, Done). It hangs under the button, up beside the window's buttons
// on Windows (ui/data/where.ts), toward the page from the column's foot. A
// row's right-click menu (BookmarkOutline.Row: Open, Rename…, New Folder
// Inside…, Move to, Remove) is drawn over it, and its questions in its place.
// It goes on a pick, a click elsewhere, Escape, or when anything else floats.
// Owned by the data module.

import type { WebContents } from 'electron'
import type { BookmarkAskView, BookmarkLine, BookmarkNode, BookmarksPopover } from '../../shared/modules/data'
import type { ID, Rect } from '../../shared/state'
import { handle, run } from '../router'
import { need } from '../context'
import { model } from '../model/model'
import { controllerFor, type WindowController } from '../views/window'
import { runtimes } from '../views/tabs'
import { benchRequest } from '../bench/server'
import { bookmarks, dataPart, mark, onBookmarks } from './store'
import { isFolder, count } from './bookmarks'
import { lastFolder } from './places'
import { iconFor } from './icons'
import { editable, parse } from './urls'

/** The popover's measures (Bookmarks.swift:1352, :1365-1371, :1186): 280
 * wide; rows of 28 (27 and 1 between), the list as tall as its rows up to
 * 360, 6 round it; the foot's row 27 with 6 round it; the card 280 by 154. */
export const POP = { width: 280, line: 28, most: 360, empty: 44, foot: 39, card: 154, room: 22, gap: 6 }
/** The questions' heights (ui/data/BookmarkDoor.tsx Ask): 14 round them, the
 * heading 16, 10 between; a field or a line of 15 (Rename Bookmark's two),
 * the buttons 26. */
const ASK = { name: 116, nameDetail: 156, sure: 106 }

interface Open {
  anchor: Rect; card: string | null; expanded: Set<string>
  /** Opened off a folder on the bookmarks bar: that folder's list alone. */
  root?: string | null
  /** A row's right-click menu is up. */
  menu?: boolean
  /** A question in the list's place. */
  ask?: { kind: 'rename' | 'folder' | 'remove'; id: string } | null
}
const open = new Map<ID, Open>()
/** When a click elsewhere closed it: the button's own click that follows
 * closes rather than opens it again. */
const closedAt = new Map<ID, number>()

const mine = (c: WindowController) => c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'data.bookmarks'

/** A top level that is one folder and nothing else opens with it open
 * (BookmarksDropdown.opening). */
function opening(roots: BookmarkNode[]): Set<string> {
  return roots.length === 1 && isFolder(roots[0]) ? new Set([roots[0].id]) : new Set()
}

/** Every line that shows, the folders in `expanded` open (BookmarkOutline.lines). */
function lines(nodes: BookmarkNode[], expanded: Set<string>, depth = 0, out: BookmarkLine[] = []): BookmarkLine[] {
  for (const n of nodes) {
    const folder = isFolder(n)
    const isOpen = folder && expanded.has(n.id)
    const unnamed = !folder && !n.title.trim()
    const u = n.url ? parse(n.url) : null
    out.push({
      id: n.id, depth, folder, open: isOpen, count: folder ? count(n.children ?? []) : 0,
      title: unnamed ? (n.url ? editable(n.url) : '') : n.title, url: n.url, unnamed,
      icon: !folder && n.url ? iconFor(n.url) ?? null : null,
      letter: (u?.hostname.replace(/^www\./, '')[0] ?? '•').toUpperCase(),
    })
    if (!isOpen) continue
    const kids = n.children ?? []
    if (kids.length) lines(kids, expanded, depth + 1, out)
    else out.push({ id: n.id, depth: depth + 1, folder: false, open: false, count: 0, title: 'Empty', icon: null, letter: '', unnamed: false, empty: true })
  }
  return out
}

/** As tall as the rows it shows, up to 360 (BookmarksDropdown.listHeight). */
function listHeight(roots: BookmarkNode[], expanded: Set<string>): number {
  if (!roots.length) return POP.empty
  return Math.min(POP.most, lines(roots, expanded).length * POP.line + 12)
}

function folders(nodes: BookmarkNode[], depth = 0, out: { id: string; title: string; depth: number }[] = []) {
  for (const n of nodes) if (isFolder(n)) { out.push({ id: n.id, title: n.title, depth }); folders(n.children ?? [], depth + 1, out) }
  return out
}

/** The folder a bookmark sits in, null at the top level. */
function parentOf(id: string, nodes: BookmarkNode[], parent: BookmarkNode | null = null): BookmarkNode | null | undefined {
  for (const n of nodes) {
    if (n.id === id) return parent
    const found = n.children ? parentOf(id, n.children, n) : undefined
    if (found !== undefined) return found
  }
  return undefined
}

function keepable(c: WindowController): string | null {
  const tab = model.activeTab(c.record)
  return tab && !tab.empty && !tab.internal && tab.url ? tab.url : null
}

/** Under the button from the top, toward the page from the column's foot
 * (arrowEdge .bottom, .trailing or .leading), inside the window drawn. */
function place(c: WindowController, anchor: Rect, height: number): Pick<BookmarksPopover, 'rect' | 'arrow'> {
  const { width: W, height: H } = c.base.getContentBounds()
  const m = c.frame.margin()
  const w = Math.min(POP.width, W - 16), h = Math.min(height, H - 16)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
  const cx = anchor.x + anchor.width / 2, cy = anchor.y + anchor.height / 2
  const sb = c.record.sidebar
  if (sb.layout === 'side' && cy > H / 2) {
    const left = sb.side !== 'right'
    const x = left ? anchor.x + anchor.width + POP.gap : anchor.x - POP.gap - w
    const y = clamp(cy - h / 2, m.top + 8, H - m.bottom - h - 8)
    return { rect: { x: Math.round(clamp(x, m.left + 8, W - m.right - w - 8)), y: Math.round(y), width: w, height: h }, arrow: { side: left ? 'left' : 'right', at: Math.round(cy) } }
  }
  const x = clamp(cx - w / 2, m.left + 8, W - m.right - w - 8)
  return { rect: { x: Math.round(x), y: Math.round(anchor.y + anchor.height + POP.gap), width: w, height: h }, arrow: { side: 'top', at: Math.round(cx) } }
}

/** The question asked, as the overlay draws it (Bookmarks.askRename: the
 * name it has in the field, its name or address when emptied; askNewFolder:
 * "Folder name"; askRemove: the sites going with a folder). */
function askView(o: Open): BookmarkAskView | null {
  const node = o.ask ? bookmarks().bookmark(o.ask.id) : undefined
  if (!o.ask || !node) return null
  const folder = isFolder(node)
  const label = !folder && !node.title.trim() && node.url ? editable(node.url) : node.title
  return {
    kind: o.ask.kind, id: node.id, folder, title: node.title,
    placeholder: o.ask.kind === 'folder' ? 'Folder name' : label,
    count: folder ? count(node.children ?? []) : 0,
  }
}

function askHeight(a: BookmarkAskView): number {
  if (a.kind === 'remove') return ASK.sure
  return a.kind === 'rename' && !a.folder ? ASK.nameDetail : ASK.name
}

function view(c: WindowController): BookmarksPopover | null {
  const o = open.get(c.record.id)
  if (!o) return null
  const all = bookmarks().roots
  const folder = o.root ? bookmarks().bookmark(o.root) : undefined
  const roots = folder && isFolder(folder) ? folder.children ?? [] : all
  const page = keepable(c)
  const card = o.card ? bookmarks().bookmark(o.card) : undefined
  const ask = card ? null : askView(o)
  const height = card ? POP.card : ask ? askHeight(ask) : listHeight(roots, o.expanded) + 1 + POP.foot
  const parent = card ? parentOf(card.id, all) ?? null : null
  return {
    ...place(c, o.anchor, height),
    room: POP.room,
    lines: card || ask ? [] : lines(roots, o.expanded),
    listHeight: listHeight(roots, o.expanded),
    kept: !!page && bookmarks().contains(page),
    keepable: !!page,
    card: card ? {
      id: card.id, title: card.title, placeholder: card.url ? editable(card.url) : '',
      folder: parent?.id ?? null, folderName: parent?.title ?? 'Top Level', folders: folders(all),
    } : null,
    ask,
    menu: !!o.menu && !card && !ask,
  }
}

dataPart(c => ({ popover: view(c), bar: model.pref<boolean>('bookmarks.bar') ? lines(bookmarks().roots, new Set()) : null }))

// The bookmarks bar turned on or off in Settings: every window's data again.
model.on('window-changed', (id: ID, slices: string[]) => { if (slices?.includes('prefs')) mark(controllerFor(id)) })

function show(c: WindowController): void {
  const v = view(c)
  if (!v) return
  if (!mine(c)) c.sendOverlay({ kind: 'panel', name: 'data.bookmarks' })
  const r = v.rect, room = POP.room
  const x = r.x - room, y = r.y - room
  if (v.menu) {
    // The menu where the right click was, inside the window drawn: the
    // overlay on to its right and bottom edges, its corner where it was, so
    // the card stays put under the menu.
    const { width: W, height: H } = c.base.getContentBounds()
    const m = c.frame.margin()
    c.setOverlayRegion({ x, y, width: Math.max(r.width + room * 2, W - m.right - x), height: Math.max(r.height + room * 2, H - m.bottom - y) }, true)
  } else {
    c.setOverlayRegion({ x, y, width: r.width + room * 2, height: r.height + room * 2 }, true)
  }
  watchClicks(c)
  mark(c)
}

/** A transient popover: a press anywhere else in the window (the interface,
 * a page) or the window losing the keys closes it, as NSPopover's does. Not
 * the overlay's own blur: a page settling takes the keys without a click. */
const watching = new Map<ID, () => void>()
function watchClicks(c: WindowController): void {
  if (watching.has(c.record.id)) return
  const targets = [c.ui.webContents, ...model.spaceTabs(c.record).map(id => runtimes.get(id)?.contents)]
    .filter((wc): wc is WebContents => !!wc && !wc.isDestroyed())
  const press = (_e: unknown, input: { type: string }) => { if (input.type === 'mouseDown') closePopover(c, true) }
  const left = () => closePopover(c, true)
  for (const wc of targets) wc.on('input-event', press)
  c.base.on('blur', left)
  watching.set(c.record.id, () => {
    for (const wc of targets) if (!wc.isDestroyed()) wc.off('input-event', press)
    if (!c.base.isDestroyed()) c.base.off('blur', left)
  })
}
function unwatch(id: ID): void { watching.get(id)?.(); watching.delete(id) }

export function closePopover(c: WindowController, byClickElsewhere = false): void {
  if (!open.delete(c.record.id)) return
  unwatch(c.record.id)
  if (byClickElsewhere) closedAt.set(c.record.id, Date.now())
  if (mine(c)) c.sendOverlay({ kind: 'none' })
  mark(c)
}

/** The button: the list, never a card left from before (Browser.toggleBookmarks). */
handle('bookmark.popover', ({ anchor, folder }, ctx) => {
  const c = need(ctx)
  const was = open.get(c.record.id)
  // Another folder of the bar while one is open: that one's list instead.
  const other = !!was && (was.root ?? null) !== (folder ?? null)
  if (!other && (was || Date.now() - (closedAt.get(c.record.id) ?? 0) < 300)) {
    closedAt.delete(c.record.id)
    closePopover(c)
    return { open: false }
  }
  const inside = folder ? bookmarks().bookmark(folder) : undefined
  open.set(c.record.id, { anchor, card: null, root: inside ? folder : null, expanded: opening(inside?.children ?? bookmarks().roots) })
  show(c)
  return { open: true }
})

handle('bookmark.popoverClose', (_a, ctx) => closePopover(need(ctx), true))

handle('bookmark.popoverFold', ({ id }, ctx) => {
  const c = need(ctx)
  const o = open.get(c.record.id)
  if (!o) return
  if (o.expanded.has(id)) o.expanded.delete(id); else o.expanded.add(id)
  show(c)
})

/** In the tab in front only if it is empty and not a pin, else a new tab in
 * front (Browser.openBookmark); with a middle click behind, the list staying,
 * Shift with it in front and the list closing (Browser.pickBookmark). */
handle('bookmark.pick', async ({ url, newTab }, ctx) => {
  const c = need(ctx)
  const tab = model.activeTab(c.record)
  if (newTab) {
    await run({ do: 'tab.open', url, foreground: false, from: tab?.id, mayWait: true }, ctx)
    return
  }
  closePopover(c)
  if (tab && tab.empty && !tab.pinID) await run({ do: 'tab.go', id: tab.id, input: url }, ctx)
  else await run({ do: 'tab.open', url, foreground: true, from: tab?.id }, ctx)
})

/** ⇧⌘B (Browser.bookmarkCurrent): the page at the end of the list, filed in
 * the folder picked last on the card, and the card off the button; the card
 * for it if it was kept. With the tabs folded away there is no button to
 * hang the card from: it is only kept. */
handle('bookmarks.add', async (_a, ctx) => {
  const c = need(ctx)
  const page = keepable(c)
  if (!page) return null
  const tab = model.activeTab(c.record)!
  const was = bookmarks().forURL(page)
  const node = was ?? bookmarks().add(page, tab.title, lastFolder())
  if (!node) return null
  mark(c)
  const o = open.get(c.record.id)
  // With the tabs folded away the button is still up beside the window's
  // buttons on Windows; with none to hang the card from, it is only kept.
  const door = o ? null : await doorRect(c)
  if (c.record.sidebar.folded && !o && !door) return { id: node.id, added: !was, card: false }
  const anchor = o?.anchor ?? door ?? fallbackAnchor(c)
  open.set(c.record.id, { anchor, card: node.id, expanded: o?.expanded ?? opening(bookmarks().roots) })
  show(c)
  return { id: node.id, added: !was, card: true }
})

/** Where the button is when ⇧⌘B asks and it wasn't pressed, read from the
 * window's interface. */
async function doorRect(c: WindowController): Promise<Rect | null> {
  try {
    const r = await c.ui.webContents.executeJavaScript(
      "(() => { const e = document.querySelector('.bookmark-door'); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, width: b.width, height: b.height } : null })()")
    if (r) return r as Rect
  } catch {}
  return null
}

/** Else where it would be: the column's foot on the Mac, otherwise up
 * beside the window's buttons (12 before them). */
function fallbackAnchor(c: WindowController): Rect {
  const { width, height } = c.base.getContentBounds()
  const windows = c.chrome === 'windows'
  if (!windows && c.record.sidebar.layout === 'side')
    return { x: c.record.sidebar.side === 'left' ? 52 : width - 78, y: height - 36, width: 26, height: 26 }
  const controls = windows ? (model.pref<string>('window.buttons') === 'classic' ? 138 : 96) : 0
  return { x: width - controls - 12 - 26, y: 13, width: 26, height: 26 }
}

// A row's right-click menu and its questions (BookmarkOutline.Row contextMenu,
// Bookmarks.askRename, askNewFolder, askRemove), the list staying open.

handle('bookmark.menu', ({ open: up }, ctx) => {
  const c = need(ctx)
  const o = open.get(c.record.id)
  if (!o) return null
  if (!!o.menu !== up) { o.menu = up; show(c) }
  return { folders: folders(bookmarks().roots) }
})

handle('bookmark.ask', ({ id, kind }, ctx) => {
  const c = need(ctx)
  const o = open.get(c.record.id)
  const node = bookmarks().bookmark(id)
  if (!o || !node) return
  o.menu = false
  // A folder with something in it asks first: it all goes with it, and there
  // is no taking it back. Anything else goes at once.
  if (kind === 'remove' && !(isFolder(node) && node.children?.length)) { bookmarks().remove(id); show(c); return }
  o.ask = { kind, id }
  show(c)
})

handle('bookmark.askClose', (_a, ctx) => {
  const c = need(ctx)
  const o = open.get(c.record.id)
  if (!o?.ask) return
  o.ask = null
  show(c)
})

/** An empty name: a bookmark's is kept empty (its address then reads in the
 * list), a folder's changes nothing, a new folder isn't made. */
handle('bookmark.answer', ({ title }, ctx) => {
  const c = need(ctx)
  const o = open.get(c.record.id)
  const a = o?.ask
  if (!o || !a) return
  o.ask = null
  const node = bookmarks().bookmark(a.id)
  const name = (title ?? '').trim()
  if (node && a.kind === 'rename') {
    if ((name || !isFolder(node)) && name !== node.title) bookmarks().rename(a.id, name)
  } else if (node && a.kind === 'folder') {
    if (bookmarks().newFolder(name, a.id)) o.expanded.add(a.id)
  } else if (node) {
    bookmarks().remove(a.id)
  }
  show(c)
})

handle('bookmark.moveTo', ({ id, folder }) => { bookmarks().move(id, folder) })

// The popover goes when anything else takes the overlay's place, and with
// the bookmark it was a card for.
model.on('window-changed', (id: ID) => {
  const c = controllerFor(id)
  const o = open.get(id)
  if (!c || !o) return
  if (!mine(c)) { open.delete(id); unwatch(id); mark(c) }
})
onBookmarks(() => {
  for (const [id, o] of open) {
    const c = controllerFor(id)
    if (!c) continue
    if (o.card && !bookmarks().bookmark(o.card)) closePopover(c)
    else show(c)
  }
})

// bench: the popover as the window has it
benchRequest('data.popover', req => {
  const c = req.window ? controllerFor(String(req.window)) : undefined
  const any = c ?? [...open.keys()].map(controllerFor).find(Boolean)
  return { popover: any ? view(any) : null, overlay: any ? any.overlayLayer : null }
})
