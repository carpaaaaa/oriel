// An address field's right-click menu (Search 1.0.22, Omnibox.swift
// AddressEditor, PasteAndGoTests): the editing rows, and Paste and Go when
// the clipboard holds a website's address, in the window's field, the
// address in the tab and the field raised from any app. Plain Paste still
// only fills the field. The interface draws the menu (ui/field/menu.ts);
// these are its answers and its commands. Owned by the field module.

import { clipboard } from 'electron'
import { handle } from '../router'
import { need } from '../context'
import { website } from '../address'
import { mem, pasteAndGo } from './commands'
import { tabPasteAndGo } from './tabedit'

handle('field.clip', async () => ({ url: website(await clipboard.readText()) }))

handle('field.pasteGo', async ({ where }, ctx) => {
  const c = need(ctx)
  // Read again as it is picked: only a website's address goes (AddressEditor.go).
  const url = website(await clipboard.readText())
  if (!url) return
  if (where === 'tab' && tabPasteAndGo(c, url)) return
  pasteAndGo(c, url)
})

const edits = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

handle('field.edit', ({ action, where }, ctx) => {
  const c = need(ctx)
  if (!edits.has(action)) return
  const wc = where === 'overlay' ? c.overlay.webContents : c.ui.webContents
  if (wc.isDestroyed()) return
  wc.focus()
  wc[action]()
})

handle('field.menuUp', ({ up }, ctx) => { mem(need(ctx)).menuUp = !!up })

handle('field.focusUI', (_a, ctx) => {
  const c = need(ctx)
  if (!c.ui.webContents.isDestroyed()) c.ui.webContents.focus()
})
