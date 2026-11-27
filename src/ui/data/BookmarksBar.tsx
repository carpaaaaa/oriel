// The bookmarks bar (Settings › Appearance › Show the bookmarks bar; studio/02
// §4.5, BookmarksBar.swift:27-205): a row of 30 right above the page, always
// there while it is on, the top level of the bookmarks left to right. A site
// opens in the tab in front as the bookmark button's list opens it (a middle
// or Ctrl-click behind); a folder opens its own list under it; what doesn't
// fit goes behind "»", which opens the whole list. Items 22 high, 8 of
// padding, radius 6; titles 12, at most 150 wide; the site's icon at 13.
// With Icons only on the bookmarks bar, a site is its icon, its name on
// hover; folders keep their names. With Show the bookmarks bar only on new
// tabs, it is above a new tab alone and goes as a page opens in it (Search
// 1.0.20), the column folded away or hidden until the edge included (Search
// 1.0.22), leaving room then for the column's edge. Owned by the data module.
// Oriel's own (carpa, 27 Nov 2026, filing bookmarks was awkward): the folder
// called Home stays out while a new tab shows it (main/data/door.ts); an item
// drags along the bar, before another or into a folder (its middle half);
// a right click gives it the list's menu (Open, Edit…, Move to, Remove).

import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { state, cmd, activeTab } from '../lib/store'
import { G } from '../sidebar/glyphs'
import { openMenu } from '../menus/open'
import type { Entry } from '../menus/bridge'
import type { BookmarkLine } from '../../shared/modules/data'

const rectOf = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }

/** Only on new tabs (bookmarks.newTabOnly), while the bar is above the page. */
const newTabOnly = () => !!state.prefs?.['bookmarks.newTabOnly'] && !state.prefs?.['bookmarks.side']

/** On, and with something to show or say: the row is there; with Only on
 * new tabs, while the tab on screen is a new one (a split is pages). */
export const barShown = () => !!state.prefs?.['bookmarks.bar'] && Array.isArray(state.data?.bar)
  && (!newTabOnly() || (!!activeTab()?.empty && !state.splits?.some(s => s.tabs.includes(state.activeID ?? ''))))

type Folder = { id: string; title: string; depth: number }
/** Where a drag would put the item: into a folder, before a bookmark (the end for null). */
type Drop = { into: string | null; before: string | null; x?: number; folder?: string }

/** The bar's right-click menu: the list's (BookmarkDoor.tsx entriesFor), for an item of the top level. */
async function barMenu(l: BookmarkLine, el: HTMLElement, at: { x: number; y: number }): Promise<void> {
  const r = await cmd({ do: 'bookmark.folders' }) as { folders: Folder[] } | null
  const folders = r?.folders ?? []
  const anchor = rectOf(el)
  const home = state.data?.home ?? null
  // Not into itself nor anything inside it.
  const at0 = folders.findIndex(f => f.id === l.id)
  const inside = new Set<string>()
  if (at0 >= 0) {
    inside.add(l.id)
    for (let i = at0 + 1; i < folders.length && folders[i].depth > folders[at0].depth; i++) inside.add(folders[i].id)
  }
  const moveTo: Entry = {
    label: 'Move to',
    submenu: [
      { label: 'Top Level', checked: true, act: { cmd: { do: 'bookmark.moveTo', id: l.id, folder: null } } },
      ...(folders.some(f => !inside.has(f.id)) ? [{ separator: true }] : []),
      ...folders.filter(f => !inside.has(f.id)).map(f => ({
        label: '   '.repeat(f.depth) + f.title + (f.id === home && state.prefs?.['home.grid'] ? ' (new tab)' : ''),
        act: { cmd: { do: 'bookmark.moveTo' as const, id: l.id, folder: f.id } },
      })),
    ],
  }
  const entries: Entry[] = l.folder ? [
    { label: 'Rename…', act: { cmd: { do: 'bookmark.edit', id: l.id, kind: 'rename', anchor } } },
    { label: 'New Folder Inside…', act: { cmd: { do: 'bookmark.edit', id: l.id, kind: 'folder', anchor } } },
    moveTo,
    { separator: true },
    { label: 'Remove', act: { cmd: { do: 'bookmark.edit', id: l.id, kind: 'remove', anchor } } },
  ] : [
    { label: 'Open', act: { cmd: { do: 'bookmark.pick', url: l.url! } } },
    { label: 'Open in New Tab', act: { cmd: { do: 'bookmark.pick', url: l.url!, newTab: true } } },
    { separator: true },
    { label: 'Edit…', act: { cmd: { do: 'bookmark.edit', id: l.id, kind: 'card', anchor } } },
    moveTo,
    ...(state.prefs?.['home.grid'] ? [{ label: 'Show on New Tab', act: { cmd: { do: 'bookmark.home' as const, id: l.id, on: true } } }] : []),
    { separator: true },
    { label: 'Remove', act: { cmd: { do: 'bookmark.edit', id: l.id, kind: 'remove', anchor } } },
  ]
  openMenu(entries, at, `bookmark:${l.id}`)
}

export function BookmarksBar() {
  let row!: HTMLDivElement
  let bar!: HTMLDivElement
  const items = () => state.data?.bar ?? []
  const iconsOnly = () => !!state.prefs?.['bookmarks.iconsOnly']
  // How many fit before "»" (all of them until measured).
  const [fit, setFit] = createSignal(Infinity)
  const measure = () => {
    if (!row) return
    const kids = [...row.querySelectorAll<HTMLElement>('.bmbar-item')]
    if (!kids.length) { setFit(Infinity); return }
    const right = row.getBoundingClientRect().right
    const room = (n: number) => n < kids.length ? right - 30 : right
    let n = 0
    for (const k of kids) { if (k.getBoundingClientRect().right <= room(n + 1) + 0.5) n++; else break }
    setFit(n >= kids.length ? Infinity : n)
  }
  onMount(() => {
    const ro = new ResizeObserver(() => { setFit(Infinity); queueMicrotask(measure) })
    ro.observe(row)
    onCleanup(() => ro.disconnect())
  })
  createEffect(on(() => [items().map(i => i.id + i.title + (i.icon ? 1 : 0)).join(), iconsOnly()], () => { setFit(Infinity); queueMicrotask(measure) }))

  // Dragging: 5 px of travel with the button down, then the item follows
  // nowhere, a line shows where it goes (a folder lights up to take it).
  const [dragging, setDragging] = createSignal<string | null>(null)
  const [drop, setDrop] = createSignal<Drop | null>(null)
  let press: { id: string; x: number; y: number; pointer: number } | null = null
  let swallow = false

  const dropAt = (x: number): Drop => {
    const list = items()
    const kids = [...row.querySelectorAll<HTMLElement>('.bmbar-item:not(.gone)')]
    let last = row.getBoundingClientRect().left
    for (const el of kids) {
      const l = list.find(i => i.id === el.dataset.bookmark)
      if (!l) continue
      const r = el.getBoundingClientRect()
      last = r.right
      if (x > r.right + 1) continue
      if (l.folder && l.id !== dragging() && x >= r.left + r.width * 0.25 && x <= r.right - r.width * 0.25) return { into: l.id, before: null, folder: l.id }
      if (x < r.left + r.width / 2) return { into: null, before: l.id, x: r.left - 1 }
      const next = list[list.indexOf(l) + 1]
      return { into: null, before: next?.id ?? null, x: r.right + 1 }
    }
    return { into: null, before: null, x: last + 1 }
  }
  // Heard on the whole page while the button is down: an item drawn again
  // under the pointer (its icon arriving) never strands a drag.
  const listen = (on: boolean) => {
    if (on) { window.addEventListener('pointermove', move); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', cancel) }
    else { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', cancel) }
  }
  onCleanup(() => listen(false))
  const down = (l: BookmarkLine, e: PointerEvent) => {
    if (e.button !== 0) return
    press = { id: l.id, x: e.clientX, y: e.clientY, pointer: e.pointerId }
    listen(true)
  }
  function move(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointer) return
    if (!dragging()) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return
      setDragging(press.id)
    }
    setDrop(dropAt(e.clientX))
  }
  function release(e: PointerEvent) { up(e) }
  function cancel(e: PointerEvent) { up(e, true) }
  const up = (e: PointerEvent, cancelled = false) => {
    if (!press || e.pointerId !== press.pointer) return
    listen(false)
    const id = dragging(), d = drop()
    press = null
    setDragging(null)
    setDrop(null)
    if (!id) return
    // The click that follows the let-go isn't a pick.
    swallow = true
    setTimeout(() => { swallow = false }, 0)
    if (!cancelled && d) void cmd({ do: 'bookmark.place', id, into: d.into, before: d.before })
  }

  const open = (l: BookmarkLine, e: MouseEvent) => {
    if (swallow) return
    if (l.folder) { void cmd({ do: 'bookmark.popover', anchor: rectOf(e.currentTarget as Element), folder: l.id }); return }
    if (!l.url) return
    void cmd({ do: 'bookmark.pick', url: l.url, newTab: e.ctrlKey || e.metaKey })
  }
  const lineAt = () => {
    const d = drop()
    if (d?.x == null || !bar) return null
    return d.x - bar.getBoundingClientRect().left
  }

  // The column folded away down a side: the bar keeps clear of the edge
  // that brings it out (main/window/edges.ts), as Search 1.0.22 does.
  const edge = () => (state.sidebar.layout === 'side' && state.sidebar.folded ? (state.sidebar.side === 'right' ? 'right' : 'left') : null)
  return (
    <div class="bookmarks-bar" data-window-ui="bookmarks-bar" ref={bar} classList={{ 'edge-left': edge() === 'left', 'edge-right': edge() === 'right', 'bmbar-dragging': !!dragging() }}>
      <div class="bmbar-row" ref={row}>
        <Show when={items().length} fallback={<Show when={!state.data?.barHidden}><span class="bmbar-none">No bookmarks yet: Ctrl+Shift+B keeps the page you're on</span></Show>}>
          <For each={items()}>{(l, i) => (
            <button class="bmbar-item" classList={{ folder: l.folder, bare: iconsOnly() && !l.folder, gone: i() >= fit(), dragged: dragging() === l.id, 'drop-into': drop()?.folder === l.id }}
              title={l.folder ? l.title : `${l.title}\n${l.url ?? ''}`} data-bookmark={l.id}
              onClick={e => open(l, e)}
              onPointerDown={e => down(l, e)}
              onContextMenu={e => { e.preventDefault(); void barMenu(l, e.currentTarget, { x: e.clientX, y: e.clientY }) }}
              onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
              onAuxClick={e => { if (e.button === 1 && l.url) void cmd({ do: 'bookmark.pick', url: l.url, newTab: true }) }}>
              <Show when={l.folder} fallback={<Mark line={l} />}>
                <span class="bmbar-folder"><G.folder pt={10.5} /></span>
              </Show>
              <Show when={l.folder || !iconsOnly()}><span class="bmbar-title">{l.title}</span></Show>
              <Show when={l.folder}><G.chevronDown pt={7.5} weight="semibold" class="bmbar-chevron" /></Show>
            </button>
          )}</For>
        </Show>
      </div>
      <Show when={lineAt() != null}><span class="bmbar-drop" style={{ left: `${lineAt()! - 1}px` }} /></Show>
      <Show when={fit() !== Infinity}>
        <button class="bmbar-more" title="More bookmarks" aria-label="More bookmarks"
          onClick={e => void cmd({ do: 'bookmark.popover', anchor: rectOf(e.currentTarget) })}>
          <G.chevronRight pt={9} weight="semibold" /><G.chevronRight pt={9} weight="semibold" class="bmbar-second" />
        </button>
      </Show>
    </div>
  )
}

/** The site's icon at 13, or its letter. */
function Mark(p: { line: BookmarkLine }) {
  const [broken, setBroken] = createSignal(false)
  createEffect(on(() => p.line.icon, () => setBroken(false), { defer: true }))
  return (
    <span class="bmbar-mark">
      <Show when={p.line.icon && !broken()} fallback={<span class="bmbar-letter">{p.line.letter}</span>}>
        <img src={p.line.icon!} alt="" onError={() => setBroken(true)} />
      </Show>
    </span>
  )
}
