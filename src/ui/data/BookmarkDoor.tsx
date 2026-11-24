// The bookmark button and what hangs off it (BookmarkDoor, BookmarksDropdown,
// BookmarkCard; Bookmarks.swift:1130-1420, studio/05 §3.2, studio/01 §4.3,
// §5.9). The button: a door of 26, the ribbon at 11 medium, filled on a page
// that is kept; at the end of the tab strip, in the column's foot, or up
// beside back, forward and reload; gone with Settings › Appearance › Tabs ›
// Buttons under the column › Bookmarks unticked (foot.bookmarks.hidden).
// A click opens the list: the tree (a folder opens in place, a site opens,
// a middle click opens it behind), then Add This Page or Edit This
// Bookmark…. ⇧⌘B and those rows open the card: the name, kept as typed, the
// folder, Remove, Done. Owned by the data module.

import { createSignal, For, onMount, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Bookmark, BookmarkFill } from '../lib/icons'
import { G } from '../sidebar/glyphs'
import type { BookmarkCardView, BookmarkLine } from '../../shared/modules/data'

const rectOf = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }

export function BookmarkDoor(p: { where: 'foot' | 'strip' }) {
  const here = () => (p.where === 'foot' ? state.sidebar.layout !== 'top' : state.sidebar.layout === 'top')
  const kept = () => !!state.data?.bookmarked
  return (
    <Show when={here() && !state.prefs?.['foot.bookmarks.hidden']}>
      <button class="door bookmark-door" classList={{ kept: kept() }} title="Bookmarks" aria-label="Bookmarks" data-where={p.where}
        onClick={e => void cmd({ do: 'bookmark.popover', anchor: rectOf(e.currentTarget) })}>
        {kept() ? <BookmarkFill size={14} /> : <Bookmark size={14} />}
      </button>
    </Show>
  )
}

/** The popover, in the overlay: the card and its arrow, `room` in from the
 * overlay's edges. A click beside it or Escape closes it; a press elsewhere
 * in the window, or the window losing the keys, too (main/data/door.ts). */
export function BookmarksPopover() {
  const pop = () => state.data?.popover ?? null
  const close = () => void cmd({ do: 'bookmark.popoverClose' })
  let region: HTMLDivElement | undefined
  onMount(() => region?.focus())
  return (
    <div ref={region} class="bm-region" tabindex={-1} onPointerDown={e => { if (e.target === e.currentTarget) close() }}
      onKeyDown={e => { if (e.key === 'Escape') close() }}>
      <Show when={pop()}>
        {v => (
          <>
            <Arrow side={v().arrow.side} at={v().arrow.at} card={v().rect} room={v().room} />
            <div class="bm-card" classList={{ 'bm-is-card': !!v().card }} data-bookmarks-popover
              style={{ left: `${v().room}px`, top: `${v().room}px`, width: `${v().rect.width}px`, height: `${v().rect.height}px` }}>
              <Show when={v().card} fallback={<List lines={v().lines} height={v().listHeight} kept={v().kept} keepable={v().keepable} />}>
                {c => <Card card={c()} />}
              </Show>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}

function Arrow(p: { side: 'top' | 'bottom' | 'left' | 'right'; at: number; card: { x: number; y: number; width: number; height: number }; room: number }) {
  const along = () => (p.side === 'top' || p.side === 'bottom' ? p.at - p.card.x : p.at - p.card.y)
  const style = () => {
    const a = Math.max(18, Math.min(along(), (p.side === 'top' || p.side === 'bottom' ? p.card.width : p.card.height) - 18))
    switch (p.side) {
      case 'top': return { left: `${p.room + a - 7}px`, top: `${p.room - 7}px` }
      case 'bottom': return { left: `${p.room + a - 7}px`, top: `${p.room + p.card.height - 7}px` }
      case 'left': return { left: `${p.room - 7}px`, top: `${p.room + a - 7}px` }
      default: return { left: `${p.room + p.card.width - 7}px`, top: `${p.room + a - 7}px` }
    }
  }
  return <span class="bm-arrow" style={style()} />
}

/** BookmarksDropdown: the tree as tall as its rows up to 360, then the foot. */
function List(p: { lines: BookmarkLine[]; height: number; kept: boolean; keepable: boolean }) {
  const arrows = () => p.lines.some(l => l.folder && l.depth === 0)
  return (
    <div class="bm-list">
      <Show when={p.lines.length} fallback={<p class="bm-none">No bookmarks yet</p>}>
        <div class="bm-rows" style={{ height: `${p.height}px` }}>
          <For each={p.lines}>{l => <Line line={l} arrows={arrows()} />}</For>
        </div>
      </Show>
      <div class="bm-rule" />
      <div class="bm-foot">
        <button class="bm-foot-row" data-bookmark-add disabled={!p.keepable} onClick={() => void cmd({ do: 'bookmarks.add' })}>
          <span class="bm-foot-symbol">{p.kept ? <BookmarkFill size={13} /> : <Bookmark size={13} />}</span>
          <span>{p.kept ? 'Edit This Bookmark…' : 'Add This Page'}</span>
        </button>
      </div>
    </div>
  )
}

function Line(p: { line: BookmarkLine; arrows: boolean }) {
  const l = () => p.line
  const [broken, setBroken] = createSignal(false)
  return (
    <Show when={!l().empty} fallback={<div class="bm-empty" style={{ 'padding-left': `${l().depth * 18 + 26}px` }}>Empty</div>}>
      <div class="bm-row" data-bookmark={l().id} data-folder={l().folder ? '1' : undefined} title={l().url ?? undefined}
        style={{ 'padding-left': `${l().depth * 18 + 10}px` }}
        onClick={() => void (l().folder ? cmd({ do: 'bookmark.popoverFold', id: l().id }) : l().url && cmd({ do: 'bookmark.pick', url: l().url! }))}
        onMouseDown={e => { if (e.button === 1) e.preventDefault() }}
        onAuxClick={e => { if (e.button === 1 && l().url) void cmd({ do: 'bookmark.pick', url: l().url!, newTab: true }) }}>
        <Show when={l().folder} fallback={<Show when={p.arrows}><span class="bm-chevron-room" /></Show>}>
          <span class="bm-chevron" classList={{ open: l().open }}><G.chevronRight pt={9} weight="semibold" /></span>
        </Show>
        <span class="bm-mark">
          <Show when={l().folder} fallback={
            <Show when={l().icon && !broken()} fallback={<span class="bm-letter">{l().letter}</span>}>
              <img src={l().icon!} alt="" onError={() => setBroken(true)} />
            </Show>
          }>
            <span class="bm-letter bm-folder"><G.folderFill pt={9} /></span>
          </Show>
        </span>
        <span class="bm-title" classList={{ unnamed: l().unnamed }}>{l().title}</span>
        <Show when={l().folder && l().count}><span class="bm-count">{l().count}</span></Show>
      </div>
    </Show>
  )
}

/** BookmarkCard: each change kept as it is made, so Done, Return, Escape and
 * a click elsewhere all only close it. */
function Card(p: { card: BookmarkCardView }) {
  let field!: HTMLInputElement
  const [naming, setNaming] = createSignal(false)
  let folderName: HTMLInputElement | undefined
  onMount(() => { field.value = p.card.title; queueMicrotask(() => { field.focus(); field.select() }) })
  const close = () => void cmd({ do: 'bookmark.popoverClose' })
  const rename = (typed: string) => {
    const name = typed.trim()
    if (name !== p.card.title) void cmd({ do: 'bookmark.rename', id: p.card.id, title: name })
  }
  const file = (folder: string | null) => void cmd({ do: 'bookmark.move', id: p.card.id, folder })
  const pick = (value: string) => {
    if (value === '+') { setNaming(true); queueMicrotask(() => folderName?.focus()); return }
    file(value === '' ? null : value)
  }
  const make = async () => {
    const name = folderName?.value.trim()
    setNaming(false)
    if (!name) return
    const made = await cmd({ do: 'bookmark.folder', title: name }) as { id: string } | null
    if (made?.id) file(made.id)
  }
  return (
    <div class="bm-bookmarked">
      <div class="bm-heading">Bookmarked</div>
      <div class="bm-lines">
        <label class="bm-line"><span class="bm-label">Name</span>
          <input ref={field} class="bm-field" data-bookmark-name placeholder={p.card.placeholder} spellcheck={false}
            onInput={e => rename(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') close() }} />
        </label>
        <label class="bm-line"><span class="bm-label">Folder</span>
          <Show when={!naming()} fallback={
            <input ref={folderName} class="bm-field" placeholder="Name" data-bookmark-new-folder
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); void make() } if (e.key === 'Escape') { e.stopPropagation(); setNaming(false) } }}
              onBlur={() => setNaming(false)} />
          }>
            <span class="bm-folder-pick">
              <G.folder pt={10.5} />
              <select class="bm-select" data-bookmark-folder value={p.card.folder ?? ''} onChange={e => pick(e.currentTarget.value)}>
                <option value="">Top Level</option>
                <For each={p.card.folders}>{f => <option value={f.id}>{'   '.repeat(f.depth) + f.title}</option>}</For>
                <option value="+">New Folder…</option>
              </select>
              <span class="bm-folder-name">{p.card.folderName}</span>
              <svg class="bm-updown" width="9" height="9" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 6 3.5-3.5L11.5 6M4.5 10l3.5 3.5 3.5-3.5" /></svg>
            </span>
          </Show>
        </label>
      </div>
      <div class="bm-buttons">
        <button class="bm-remove" data-bookmark-remove onClick={() => { close(); void cmd({ do: 'bookmark.remove', id: p.card.id }) }}>Remove</button>
        <button class="bm-done" data-bookmark-done onClick={close}>Done</button>
      </div>
    </div>
  )
}
