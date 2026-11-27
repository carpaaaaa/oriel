// An address field's right-click menu (Search 1.0.22, Omnibox.swift
// AddressEditor): Undo, Redo, Cut, Copy, Paste, and Paste and Go when the
// clipboard holds a website's address, then Select All, as Oriel draws its
// menus. Plain Paste still only fills the field. The field over the page
// draws it in its own view (Field.tsx), so the field stays; the fields of
// the interface (a blank tab's, the field raised from any app, the address
// line's, the address in the tab) have it drawn in the overlay above
// everything, and get the keys back after.

import { cmd, state } from '../lib/store'
import { listen, type Entry } from '../menus/bridge'
import { onPick, openMenu } from '../menus/open'

export type FieldAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll' | 'pasteGo'

/** The source the overlay's menu is up for (menus/open.ts menuFor). */
export const FIELD_MENU = 'field'

const can = (what: string) => { try { return document.queryCommandEnabled(what) } catch { return true } }

/** The rows, for the input as it is now; `url`: the clipboard's website. */
export function fieldEntries(input: HTMLInputElement, url: string | null): Entry[] {
  const selected = input.selectionStart !== input.selectionEnd
  const act = (action: FieldAction): Entry['act'] => ({ ui: 'field.menu', data: { action } })
  const rows: Entry[] = [
    { label: 'Undo', accel: 'Ctrl+Z', enabled: can('undo'), act: act('undo') },
    { label: 'Redo', accel: 'Ctrl+Y', enabled: can('redo'), act: act('redo') },
    { separator: true },
    { label: 'Cut', accel: 'Ctrl+X', enabled: selected, act: act('cut') },
    { label: 'Copy', accel: 'Ctrl+C', enabled: selected, act: act('copy') },
    { label: 'Paste', accel: 'Ctrl+V', act: act('paste') },
  ]
  if (url) rows.push({ label: 'Paste and Go', act: act('pasteGo') })
  rows.push({ separator: true }, { label: 'Select All', accel: 'Ctrl+A', enabled: !!input.value, act: act('selectAll') })
  return rows
}

/** What the clipboard holds that Paste and Go would open. */
export async function clipWebsite(): Promise<string | null> {
  const r = await cmd({ do: 'field.clip' }).catch(() => null) as { url: string | null } | null
  return r?.url ?? null
}

/** A row picked, for the field in `where` ('ui' or 'overlay'); `tab`: the
 * address in the tab, whose Paste and Go sends that tab. */
export async function doFieldAction(input: HTMLInputElement, action: FieldAction, where: 'ui' | 'overlay', tab = false): Promise<void> {
  if (action === 'pasteGo') { await cmd({ do: 'field.pasteGo', where: tab ? 'tab' : 'field' }); return }
  input.focus()
  await cmd({ do: 'field.edit', action, where })
}

// the interface's fields: the menu in the overlay

let target: { input: HTMLInputElement; tab: boolean } | null = null
let wired = false

function wire(): void {
  if (wired) return
  wired = true
  onPick('field.menu', (_id, data) => {
    const t = target
    const action = (data as { action?: FieldAction } | undefined)?.action
    if (!t || !action) return
    // Gone to a page: the keys stay with it.
    if (action === 'pasteGo') target = null
    void doFieldAction(t.input, action, 'ui', t.tab)
  })
  // The menu gone, picked or not: the keys back to the field it was for.
  listen(m => {
    if (m.type !== 'shown' || m.window !== state.windowID || m.source !== null || !target) return
    setTimeout(() => {
      const t = target
      target = null
      if (!t?.input.isConnected) return
      t.input.focus()
      void cmd({ do: 'field.focusUI' })
    }, 40)
  })
}

/** Right-click on a field of the interface. */
export async function openFieldMenu(e: MouseEvent, input: HTMLInputElement, tab = false): Promise<void> {
  e.preventDefault()
  wire()
  const at = { x: e.clientX, y: e.clientY }
  const url = await clipWebsite()
  if (!input.isConnected) return
  target = { input, tab }
  openMenu(fieldEntries(input, url), at, FIELD_MENU)
}
