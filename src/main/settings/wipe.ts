// Clear everything when Oriel quits (carpa, 25 Nov 2026): Settings › Privacy ›
// "Clear all data when Oriel quits" (privacy.clearOnQuit, off by default, and
// asking first when it is turned on). Each time Oriel quits, the cookies and
// site data, the cache, the history, the saved passwords, the list of
// downloads, the closed and the open tabs the next launch would bring back,
// and the choices about camera, microphone, location and notifications go.
// Bookmarks, pins, spaces, Settings and the files already downloaded stay.
//
// The data is Chromium's (the sessions) and Oriel's own files (history.json,
// vault.json, session.json, archive.json, downloads.json, icons/). A marker
// file says a run began with the mode on and no clean end yet: a launch that
// finds it (the app was killed, the PC lost power) wipes first.

import { app, dialog, session as electronSession, type BaseWindow } from 'electron'
import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { brand } from '../../shared/brand'
import { model } from '../model/model'
import { flushJSON, removeFile } from '../model/persist'
import { dataFile, probe } from '../paths'
import { onPageSession } from '../views/tabs'
import { benchRequest } from '../bench/server'
import { forgetPermissions } from './permissions'
import { forgetDownloadAddresses } from './downloads'

export const KEY = 'privacy.clearOnQuit'
const MARKER = 'wipe.pending'
const FILES = ['history.json', 'vault.json', 'session.json', 'archive.json', 'downloads.json']
const FOLDERS = ['icons']

/** Persistent sessions seen (the personal one, each space with a store of its own). */
const stores = new Set<Electron.Session>()
onPageSession((s, partition) => { if (partition.startsWith('persist:')) stores.add(s) })

const on = () => model.pref<boolean>(KEY) === true

/** A test world's answers to the question, in place of a dialog on someone's screen. */
const answers: string[] = []
let asked = 0

/** The question asked when the mode is turned on. True: turn it on. */
export function confirmWipe(parent: BaseWindow | null): boolean {
  asked++
  if (probe) return (answers.shift() ?? 'cancel') === 'on'
  const options: Electron.MessageBoxSyncOptions = {
    type: 'warning',
    message: `Clear all data every time ${brand.name} quits?`,
    detail: [
      `Each time you quit, ${brand.name} will erase, for good:`,
      '',
      '•  cookies and site data: you are signed out of every site',
      '•  saved passwords and passkeys',
      '•  history, the cache and the list of downloads',
      '•  closed tabs, and the tabs that would come back at the next launch',
      '•  your choices about camera, microphone, location and notifications',
      '',
      'Bookmarks, pins, spaces, Settings and files you downloaded stay. This cannot be undone.',
    ].join('\n'),
    buttons: ['Turn On', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  }
  const choice = parent && !parent.isDestroyed() ? dialog.showMessageBoxSync(parent as never, options) : dialog.showMessageBoxSync(options)
  return choice === 0
}

/** A run with the mode on has begun: an end without the wipe is noticed next launch. */
export function arm(): void {
  try { writeFileSync(dataFile(MARKER), '') } catch { /* the folder is there by now */ }
}

function files(): void {
  for (const name of FILES) removeFile(name)
  for (const name of FOLDERS) { try { rmSync(dataFile(name), { recursive: true, force: true }) } catch { /* in use: gone at the next launch */ } }
}

async function sessions(list: Iterable<Electron.Session>): Promise<void> {
  await Promise.allSettled([...list].map(async s => {
    await s.clearStorageData()
    await s.clearCache()
    await s.clearAuthCache()
    await s.clearHostResolverCache()
    await s.clearCodeCaches({})
    await s.cookies.flushStore()
  }))
}

/** Everything, now (quit, or a launch after an end without it). */
export async function wipeAll(): Promise<void> {
  forgetPermissions()
  forgetDownloadAddresses()
  // What is still waiting to be written reaches the disk first, to be deleted after it.
  flushJSON()
  const all = new Set(stores)
  all.add(electronSession.fromPartition('persist:personal'))
  await Promise.race([sessions(all), new Promise(r => setTimeout(r, 8000))])
  files()
  try { unlinkSync(dataFile(MARKER)) } catch { /* not there */ }
}

let quitting = false
app.on('before-quit', e => {
  if (quitting || !on()) return
  quitting = true
  e.preventDefault()
  // Windows asked to wait: the process goes only when it has finished.
  void wipeAll().catch(error => console.warn('[wipe]', error)).finally(() => app.exit(0))
})

// A launch that finds the marker: the last run had the mode on and didn't end
// with the wipe. The files go before the model reads them.
app.whenReady().then(() => {
  let want = false
  try { want = JSON.parse(readFileSync(dataFile('prefs.json'), 'utf8'))?.[KEY] === true } catch { /* no settings yet */ }
  if (!want) { try { unlinkSync(dataFile(MARKER)) } catch { /* none */ } return }
  if (existsSync(dataFile(MARKER))) {
    files()
    // Sessions come up as tabs need them: each one is wiped as it is made.
    onPageSession(s => { void sessions([s]) })
    void sessions([electronSession.fromPartition('persist:personal')])
  }
  arm()
})

benchRequest('settingsb.wipeAnswer', req => { answers.push(String(req.answer)); return {} })
benchRequest('settingsb.wipeAsked', () => ({ asked }))
