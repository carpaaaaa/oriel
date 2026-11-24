// Settings › Themes in the main process (HomeTheme.swift:81-122; studio/02
// §8.2, §8.3): the chosen picture is copied into Oriel's own folder, Theme,
// one at a time, so moving or deleting the original never leaves the blank
// tab bare; its bytes go to the interface, which decodes and paints them.
// Everything else (the walls, stickers, colours) is drawn in the interface.
// Owned by the themes module.

import { dialog, nativeTheme, systemPreferences } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { handle } from '../router'
import { need } from '../context'
import { dataFile, probe } from '../paths'
import { benchRequest } from '../bench/server'
import { allowPage } from '../settings/internal'
import { pref, setKey } from '../settings/prefs'

/** Where the kept copy lives. */
export const folder = () => dataFile('Theme')

/** The picture types the Open dialog offers (UTType.image, as Windows names them). */
const kinds = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'tif', 'tiff', 'heic', 'heif', 'ico']

const inside = (p: string) => {
  const f = path.resolve(folder()) + path.sep
  return path.resolve(p).toLowerCase().startsWith(f.toLowerCase())
}

/** Copies a picture into the theme folder; the path it went to, or null. */
export function keep(source: string): string | null {
  // The kept copy chosen again: removing the old one would delete it.
  if (inside(source)) return source
  try {
    if (!statSync(source).isFile()) return null
    mkdirSync(folder(), { recursive: true })
    const ext = path.extname(source).slice(1).toLowerCase() || 'img'
    // A name of its own each time (home.<n>.<ext>), so the interface sees a
    // new picture even when it has the old one's type.
    const target = path.join(folder(), `home.${Date.now().toString(36)}.${ext}`)
    // One picture at a time: the old one goes, so none pile up.
    for (const old of readdirSync(folder())) if (old.startsWith('home.')) rmSync(path.join(folder(), old), { force: true })
    copyFileSync(source, target)
    return target
  } catch {
    return null
  }
}

/** Drops the kept copy, if it is ours. */
export function forget(p: string | null | undefined): void {
  if (!p || !inside(p)) return
  rmSync(p, { force: true })
}

/** What the Open dialog answers in a test world (never a dialog on screen). */
const answers: { file: string | null } = { file: null }

async function chooseFile(ctx: Parameters<typeof need>[0]): Promise<string | null> {
  if (probe) return answers.file
  const c = need(ctx)
  const r = await dialog.showOpenDialog(c.base as never, {
    buttonLabel: 'Choose',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: kinds }],
  })
  return r.canceled ? null : r.filePaths[0] ?? null
}

function choosePicked(source: string | null): { path: string } | null {
  // Cancelled, or not copied: what was there stays.
  if (!source) return null
  const kept = keep(source)
  if (!kept) return null
  const old = pref<string>('home.theme.image')
  setKey('home.theme.image', kept)
  if (old && old !== kept) forget(old)
  setKey('home.theme', 'custom')
  return { path: kept }
}

handle('themes.choose', async (_a, ctx) => choosePicked(await chooseFile(ctx)))

handle('themes.forget', () => {
  forget(pref<string>('home.theme.image'))
  setKey('home.theme.image', '')
  if (pref<string>('home.theme') === 'custom') setKey('home.theme', 'off')
  return null
})

handle('themes.picture', ({ path: p }) => {
  // Only the kept copy, never any file a caller names.
  if (!p || p !== pref<string>('home.theme.image') || !existsSync(p)) return null
  try { return { bytes: new Uint8Array(readFileSync(p)) } } catch { return null }
})

function accent(): string {
  try {
    const c = systemPreferences.getAccentColor?.()
    if (c && /^[0-9a-f]{6,8}$/i.test(c)) return '#' + c.slice(0, 6).toUpperCase()
  } catch {}
  return '#007AFF'
}

handle('themes.facts', () => ({ accent: accent(), dark: nativeTheme.shouldUseDarkColors }))

// Settings › Themes runs in oriel://settings.
allowPage('settings', { commands: ['themes.'] })

// The bench: a picture chosen without the dialog, and where things are.
benchRequest('themes.pick', req => ({ value: choosePicked(typeof req.file === 'string' ? req.file : null) }))
benchRequest('themes.answer', req => { answers.file = typeof req.file === 'string' ? req.file : null; return {} })
benchRequest('themes.folder', () => ({ folder: folder(), files: existsSync(folder()) ? readdirSync(folder()) : [] }))
