// Bring Things Over: the panel's state and what its controls do
// (ImportPanel.swift, studio/05 §1.12). Drawn in the overlay by
// src/ui/data/ImportPanel.tsx from the window's data state.

import { dialog, session } from 'electron'
import type { ImportPanelState, ImportSaid, ImportSourceView } from '../../shared/modules/data'
import { handle } from '../router'
import { need } from '../context'
import type { WindowController } from '../views/window'
import { mark, showPanel, windowData } from '../data/store'
import { records } from '../data/meta'
import { benchRequest } from '../bench/server'
import { installed, byName, profilesOf, usualOf, type Source } from './sources'
import { bookmarksSaid, broughtBefore, importHooks, listed, n, plural, preview, takeBookmarks, takePlaces, dayMonth } from './bring'
import { readPasswords, passwordsSaid, passwordMode } from './passwords'
import { bringFile } from './file'
import { sweepScratch } from './read'
import { keyAsks } from './dpapi'
import { browserExe, startExport, stopExport, trashFile } from './export'
import { probe } from '../paths'

sweepScratch()

// Until the extensions module says otherwise: what the profile session has.
importHooks.installedExtensions = () => {
  try { return session.fromPartition('persist:personal').extensions.getAllExtensions().map(e => e.id) } catch { return [] }
}

function view(source: Source): ImportSourceView {
  const profiles = profilesOf(source)
  const record = records.of(source.name)
  const can = ['bookmarks', 'history']
  const mode = passwordMode(source)
  if (mode !== 'none') can.push('passwords')
  const line = listed(can)
  return {
    id: source.name,
    name: source.name,
    family: source.family,
    profiles: profiles.map(p => ({ id: p.id, name: p.name })),
    usual: usualOf(source, profiles),
    canBring: line[0].toUpperCase() + line.slice(1),
    passwords: mode,
    exportAt: source.exportAt,
    assist: !!browserExe(source),
    record: record ? { date: record.date, bookmarks: record.bookmarks, places: record.places, passwords: record.passwords, recorded: record.bookmarkIDs.length > 0 } : undefined,
  }
}

const key = (source: string, profile: string | null) => `${source}/${profile ?? ''}`

/** The profile to read: the one chosen, or the one used most recently; null
 * for all of them. */
function profileOf(s: ImportPanelState, source: string): string | null {
  const v = s.sources.find(x => x.id === source)
  const id = s.chosen[source] ?? v?.usual ?? ''
  return id ? id : null
}

function panel(c: WindowController): ImportPanelState | null { return windowData(c).import }

function count(c: WindowController, source: string): void {
  const s = panel(c)
  const src = byName(source)
  if (!s || !src) return
  const k = key(source, profileOf(s, source))
  if (s.previews[k]) return
  setImmediate(() => {
    const now = panel(c)
    if (!now) return
    const p = preview(src, profileOf(now, source))
    // Already here: not offered again.
    const have = new Set(importHooks.installedExtensions())
    now.previews = { ...now.previews, [k]: { ...p, extensions: p.extensions.filter(id => !have.has(id)) } }
    mark(c)
  })
}

export function openPanel(c: WindowController, options: { source?: string; extensions?: boolean } = {}): void {
  const d = windowData(c)
  d.import = {
    looking: true, sources: [], pick: null, chosen: {}, previews: {},
    wants: options.extensions
      ? { passwords: false, bookmarks: false, history: false, extensions: true, replace: false }
      : { passwords: true, bookmarks: true, history: true, extensions: false, replace: false },
    consent: {}, bringing: false, brought: null, how: null, clearFile: null, waiting: null,
  }
  mark(c)
  showPanel(c, 'data.import')
  const { width, height } = c.base.getContentBounds()
  c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
  setTimeout(() => {
    const s = panel(c)
    if (!s) return
    s.sources = installed().map(view)
    s.pick = s.sources.find(x => x.id === options.source)?.id ?? s.sources[0]?.id ?? null
    s.looking = false
    mark(c)
    for (const v of s.sources) count(c, v.id)
  }, 0)
}

function closePanel(c: WindowController): void {
  stopExport(c)
  windowData(c).import = null
  mark(c)
  if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === 'data.import') c.sendOverlay({ kind: 'none' })
  c.focusPage()
}

/** Everything chosen, brought in, and said line by line (ImportPanel.bring). */
export async function run(c: WindowController): Promise<ImportSaid[]> {
  const s = panel(c)
  if (!s || !s.pick || s.bringing) return []
  const source = byName(s.pick)
  if (!source) return []
  const profile = profileOf(s, source.name)
  const p = s.previews[key(source.name, profile)] ?? preview(source, profile)
  s.bringing = true
  s.brought = null
  mark(c)
  const said: ImportSaid[] = []
  try {
    // A kind it has none of isn't read at all.
    if (s.wants.passwords && p.passwords > 0 && passwordMode(source) !== 'none') {
      const consent = !!s.consent[source.name]
      said.push(passwordsSaid(source, await readPasswords(source, profile, consent)))
    }
    if (s.wants.bookmarks && p.bookmarks > 0) said.push(bookmarksSaid(source.name, takeBookmarks(source, profile, s.wants.replace)))
    if (s.wants.history && p.places > 0) said.push({ ok: true, text: `${n(takePlaces(source, profile))} places` })
    if (s.wants.extensions && p.extensions.length) {
      // Each from the store, fresh and checked, one question at a time.
      importHooks.installExtensions(p.extensions)
      said.push({ ok: true, text: p.extensions.length === 1 ? '1 extension to confirm' : `${p.extensions.length} extensions to confirm` })
    }
    // Another store's own (Opera's add-ons): not in the Chrome Web Store by that id.
    const elsewhere = p.extensionsElsewhere ?? []
    if (s.wants.extensions && elsewhere.length) {
      said.push({ ok: false, text: `Not in the Chrome Web Store, look for ${elsewhere.length === 1 ? 'it' : 'them'} there by name: ${elsewhere.join(', ')}` })
    }
  } finally {
    s.bringing = false
  }
  s.brought = said
  // The record changed: the row and "Brought before" say so.
  s.sources = s.sources.map(v => v.id === source.name ? view(source) : v)
  s.wants.replace = false
  mark(c)
  return said
}

handle('import.open', ({ source, extensions }, ctx) => openPanel(need(ctx), { source, extensions }))
handle('import.close', (_a, ctx) => closePanel(need(ctx)))
handle('import.pick', ({ source }, ctx) => {
  const c = need(ctx), s = panel(c)
  if (!s || s.bringing) return
  s.pick = source
  s.wants.replace = false
  s.brought = null
  s.how = null
  mark(c)
  count(c, source)
})

/** The guided export: the browser opened at its Export page, its file picked
 * up as it lands, brought in and sent to the Recycle Bin (import/export.ts). */
handle('import.export', ({ source }, ctx) => {
  const c = need(ctx), s = panel(c), src = byName(source)
  if (!s || !src || s.bringing) return false
  return startExport(c, src, profileOf(s, source), said => {
    const now = panel(c)
    if (!now) return
    now.brought = said
    // The record changed: the row and "Brought before" say so.
    now.sources = now.sources.map(v => v.id === src.name ? view(src) : v)
    mark(c)
  })
})
handle('import.exportStop', (_a, ctx) => stopExport(need(ctx)))
handle('import.profile', ({ source, profile }, ctx) => {
  const c = need(ctx), s = panel(c)
  if (!s) return
  s.chosen = { ...s.chosen, [source]: profile }
  s.brought = null
  mark(c)
  count(c, source)
})
handle('import.option', ({ key: k, on }, ctx) => {
  const c = need(ctx), s = panel(c)
  if (!s) return
  s.wants = { ...s.wants, [k]: on }
  mark(c)
})
handle('import.consent', ({ source, on }, ctx) => {
  const c = need(ctx), s = panel(c)
  if (!s) return
  s.consent = { ...s.consent, [source]: on }
  mark(c)
})
handle('import.how', ({ source }, ctx) => {
  const c = need(ctx), s = panel(c)
  if (!s) return
  s.how = source
  mark(c)
})
handle('import.run', (_a, ctx) => run(need(ctx)))

/** A file another browser exported: chosen in the system's picker, or
 * named (the bench). */
handle('import.file', async ({ path: given }, ctx) => {
  const c = need(ctx)
  let file = given
  if (!file) {
    if (probe) return null
    const picked = await dialog.showOpenDialog(c.base as never, {
      buttonLabel: 'Bring In',
      message: 'A file another browser exported: bookmarks (.html) or passwords (.csv).',
      filters: [{ name: 'Bookmarks or passwords', extensions: ['html', 'htm', 'csv', 'txt'] }],
      properties: ['openFile'],
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    file = picked.filePaths[0]
  }
  const result = bringFile(file)
  const s = panel(c)
  if (s) {
    s.brought = result.said
    s.clearFile = result.passwords > 0 ? file : null
    mark(c)
  }
  return result
})

/** The exported file holds passwords in the clear: into the Recycle Bin,
 * from where it can still come back. */
handle('import.trashFile', async ({ path: file }, ctx) => {
  const c = need(ctx), s = panel(c)
  if (s?.clearFile !== file) return false
  await trashFile(file)
  s.clearFile = null
  s.brought = [...(s.brought ?? []), { ok: true, text: 'The file went to the Recycle Bin' }]
  mark(c)
  return true
})

// bench

benchRequest('data.importSources', () => ({
  sources: installed().map(s => {
    const v = view(s)
    return { ...v, preview: preview(s, v.usual) }
  }),
}))
benchRequest('data.records', () => ({ records: records.all() }))
benchRequest('data.keyAsks', () => ({ value: keyAsks }))
export { plural, dayMonth, broughtBefore }
