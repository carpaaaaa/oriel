// The bookmarks bar (Settings › Appearance › Show the bookmarks bar; studio/02
// §4.5, BookmarksBar.swift:27-205): a row of 30 right above the page, always
// there while it is on, the top level of the bookmarks left to right. A site
// opens in the tab in front as the bookmark button's list opens it (a middle
// or Ctrl-click behind); a folder opens its own list under it; what doesn't
// fit goes behind "»", which opens the whole list. Items 22 high, 8 of
// padding, radius 6; titles 12, at most 150 wide; the site's icon at 13.
// With Icons only on the bookmarks bar, a site is its icon, its name on
// hover; folders keep their names. Owned by the data module.

import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { G } from '../sidebar/glyphs'
import type { BookmarkLine } from '../../shared/modules/data'

const rectOf = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }

/** On, and with something to show or say: the row is there. */
export const barShown = () => !!state.prefs?.['bookmarks.bar'] && Array.isArray(state.data?.bar)

export function BookmarksBar() {
  let row!: HTMLDivElement
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

  const open = (l: BookmarkLine, e: MouseEvent) => {
    if (l.folder) { void cmd({ do: 'bookmark.popover', anchor: rectOf(e.currentTarget as Element), folder: l.id }); return }
    if (!l.url) return
    void cmd({ do: 'bookmark.pick', url: l.url, newTab: e.ctrlKey || e.metaKey })
  }

  return (
    <div class="bookmarks-bar" data-window-ui="bookmarks-bar">
      <div class="bmbar-row" ref={row}>
        <Show when={items().length} fallback={<span class="bmbar-none">No bookmarks yet: Ctrl+Shift+B keeps the page you're on</span>}>
          <For each={items()}>{(l, i) => (
            <button class="bmbar-item" classList={{ folder: l.folder, bare: iconsOnly() && !l.folder, gone: i() >= fit() }}
              title={l.folder ? l.title : `${l.title}\n${l.url ?? ''}`} data-bookmark={l.id}
              onClick={e => open(l, e)}
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
