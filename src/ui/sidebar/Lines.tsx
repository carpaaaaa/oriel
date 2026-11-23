// The column's other lines: a group's heading (TabGroups.swift
// `GroupHeading`), a pin folder's (PinFolderViews.swift), the keep line
// with Clear (Side.swift `KeepLine`), New tab (`Quiet`), the ghost of a
// carried row (PinDrop.swift `RowGhost`).

import { Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import type { GroupView, PinFolderView, TabView } from '../../shared/state'
import { G } from './glyphs'
import { markSize, label, P } from './derive'
import { editing, setEditing, dropTarget } from './ui'
import { Mark, RenameField } from './Row'
import { openMenu } from '../menus/open'
import { folderMenu, groupMenu, columnMenu, pastable } from '../menus/build'
import { press } from './drag'

export function GroupHeading(p: { group: GroupView; compact?: boolean }) {
  const g = () => p.group
  const isEditing = () => editing()?.kind === 'group' && editing()?.id === g().id
  return (
    <div class="group-heading" classList={{ compact: !!p.compact, target: dropTarget() === `g:${g().id}`, folded: g().folded }}
      data-group={g().id}
      title={p.compact ? (g().folded ? `${g().name}, folded` : g().name) : undefined}
      onClick={() => { if (!isEditing()) void cmd({ do: 'group.fold', id: g().id }) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(groupMenu(g().id), { x: e.clientX, y: e.clientY }, `group:${g().id}`) }}>
      <Show when={!p.compact} fallback={<>
        <span class="initial">{(g().name[0] ?? '•').toUpperCase()}</span>
        <G.chevronDown pt={6.5} weight="bold" class="fold-mark" />
      </>}>
        <Show when={isEditing()} fallback={<span class="name">{g().name}</span>}>
          <RenameField initial={g().name} placeholder="Group name" class="rename heading-field"
            done={name => { if (name) void cmd({ do: 'group.rename', id: g().id, name }); setEditing(null) }} />
        </Show>
        <Show when={!isEditing()}><G.chevronDown pt={9} weight="medium" class="fold-mark" /></Show>
      </Show>
    </div>
  )
}

export function FolderHeading(p: { folder: PinFolderView; depth: number }) {
  const f = () => p.folder
  const isEditing = () => editing()?.kind === 'folder' && editing()?.id === f().id
  const size = () => markSize()
  return (
    <div class="folder-heading" classList={{ target: dropTarget() === `f:${f().id}`, folded: !f().open }}
      data-folder={f().id} style={{ 'padding-left': `${10 + p.depth * 14}px` }}
      onPointerDown={e => { if (!isEditing() && e.button === 0) press(e, { key: `f:${f().id}`, kind: 'folder', folder: f().id, el: e.currentTarget as HTMLElement }) }}
      onClick={() => { if (!isEditing() && !document.documentElement.classList.contains('carrying')) void cmd({ do: 'pinFolder.fold', id: f().id }) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMenu(folderMenu(f().id), { x: e.clientX, y: e.clientY }, `folder:${f().id}`) }}>
      <span class="chevron"><G.chevronRight pt={P.roomy() ? 9.5 : 8.5} weight="semibold" /></span>
      <span class="folder-mark" style={{ width: `${size()}px`, height: `${size()}px` }}>
        <Show when={f().live} fallback={f().open ? <G.folderFill pt={size() * 0.8} /> : <G.folder pt={size() * 0.8} />}>
          <G.radio pt={size() * 0.8} />
        </Show>
      </span>
      <Show when={isEditing()} fallback={<span class="name">{f().name}</span>}>
        <RenameField initial={f().name} placeholder="Folder name" class="rename heading-field"
          done={name => { if (name) void cmd({ do: 'pinFolder.rename', id: f().id, name }); setEditing(null) }} />
      </Show>
    </div>
  )
}

export function KeepLine(p: { clears: boolean }) {
  return (
    <div class="keep-line" onContextMenu={e => { e.preventDefault(); e.stopPropagation(); void openColumnMenu(e) }}>
      <span class="rule" />
      <Show when={p.clears}>
        <button class="clear" title={`Close the tabs under the line. Pins and groups stay; ${state.reopen?.title ?? 'Reopen Closed Tab'} brings them all back.`}
          onClick={() => {
            // Clear: the tabs under the line, those that came and go (§5.21).
            const known = new Set(state.groups.map(g => g.id))
            const ids = state.tabs.filter(t => !t.pinID && !(t.groupID && known.has(t.groupID))).map(t => t.id)
            if (ids.length) void cmd({ do: 'tab.closeMany', ids })
          }}>
          <G.arrowDown pt={8} weight="semibold" /><span>Clear</span>
        </button>
      </Show>
    </div>
  )
}

export function NewTabRow(p: { centred?: boolean }) {
  return (
    <button class="quiet" classList={{ centred: !!p.centred }} title="New Tab   Ctrl+T"
      onClick={() => void cmd({ do: 'tab.blank' })}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); void openColumnMenu(e) }}>
      <span class="quiet-icon"><G.plus pt={10} weight="medium" /></span>
      <Show when={!p.centred}><span class="quiet-title">New tab</span></Show>
    </button>
  )
}

export function RowGhost(p: { tab: TabView }) {
  return (
    <div class="row-ghost">
      <Mark tab={{ ...p.tab, label: label(p.tab) }} size={15} />
      <span class="title">{label(p.tab)}</span>
    </div>
  )
}

/** The column's own menu, with Paste and Go when the clipboard holds an address. */
export async function openColumnMenu(e: MouseEvent): Promise<void> {
  const at = { x: e.clientX, y: e.clientY }
  let paste: string | null = null
  try {
    paste = pastable(await navigator.clipboard.readText())
  } catch { /* no clipboard to read */ }
  openMenu(columnMenu(paste), at, 'column')
}
