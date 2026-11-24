// Reading Mode, Ctrl+Shift+R (studio/03 §6.2; Tab.toggleReader, Reader.swift),
// for Settings › Browsing › Reading mode's two switches: Read the site's own
// Markdown (reader.twins) and Reading mode follows light and dark
// (reader.follows, with the corner's choice kept in reader.look). The page
// part is the preload's (src/preload/page/reader.ts); the second press goes
// back to the page as it was, loaded again (its listeners went with it).

import { ipcMain, type WebContents } from 'electron'
import { model } from '../model/model'
import { handle } from '../router'
import { need } from '../context'
import { runtimes } from '../views/tabs'
import { addDefaults } from '../../shared/prefs'
import { pref } from './facts'

const PRELOAD_WORLD = 999

addDefaults({ 'reader.look': 'system' })

/** Pages in reading mode now, and how (the guess or the site's Markdown). */
const reading = new Map<WebContents, string>()
/** What the last attempt said, for the bench. */
export const readerSaid: string[] = []

/** Reader.look: light unless reading mode follows the window. */
export const readerLook = () => (pref<boolean>('reader.follows') ? (pref<string>('reader.look') || 'system') : 'light')

const watched = new WeakSet<WebContents>()

handle('view.reader', async (_a, ctx) => {
  const c = need(ctx)
  const id = c.record.active[c.record.space]
  const wc = id ? runtimes.get(id)?.contents : null
  if (!wc || !/^(https?|file):/i.test(wc.getURL())) { readerSaid.push('Nothing to read on this page'); return { said: 'Nothing to read on this page' } }
  if (reading.has(wc)) { reading.delete(wc); wc.reload(); return { reading: false } }
  if (!watched.has(wc)) {
    watched.add(wc)
    wc.on('did-navigate', () => reading.delete(wc))
    wc.once('destroyed', () => reading.delete(wc))
  }
  const o = { twins: !!pref<boolean>('reader.twins'), look: readerLook(), follows: !!pref<boolean>('reader.follows') }
  await wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code: `globalThis.__orielReader ? globalThis.__orielReader.read(${JSON.stringify(o)}) : false` }], false)
  return { asked: true }
})

ipcMain.on('pages:reader', (event, answer: { read: boolean; how?: string }) => {
  const wc = event.sender
  if (answer?.read) { reading.set(wc, answer.how ?? 'guess'); readerSaid.push(`read ${answer.how}`) }
  else readerSaid.push('Nothing to read on this page')
  if (readerSaid.length > 20) readerSaid.shift()
})

ipcMain.on('pages:reader-look', (event, look: string) => {
  if (!['light', 'dark', 'system'].includes(look) || !reading.has(event.sender) || !pref<boolean>('reader.follows')) return
  model.setPref('reader.look', look === 'system' ? undefined : look)
  // Every other article up now wears it too.
  for (const wc of reading.keys()) if (wc !== event.sender && !wc.isDestroyed()) {
    void wc.executeJavaScriptInIsolatedWorld(PRELOAD_WORLD, [{ code: `globalThis.__orielReader && globalThis.__orielReader.look(${JSON.stringify(look)})` }], false).catch(() => {})
  }
})

export function readerInfo(): { how: string; url: string }[] {
  return [...reading].filter(([wc]) => !wc.isDestroyed()).map(([wc, how]) => ({ how, url: wc.getURL() }))
}
