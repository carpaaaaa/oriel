// Updates, as Search for Mac has them (studio/06 §4, Updater.swift): checked
// at launch and then every hour (a 60-minute timer that checks once more
// than 50 minutes have gone by), fetched quietly and put in place for the
// next launch when "Install updates on its own" is on (update.install, on),
// otherwise said and waiting for Install. Settings › About shows the stage:
// Updates / Oriel <v> is downloading… / is ready (Relaunch now) / is out
// (Install).
//
// On Windows the feed is the repository's GitHub Releases, through
// electron-updater (latest.yml, sha512 of the installer, NSIS per user):
// the installer is run silently when Oriel quits, or at once with Relaunch
// now. Outside a package, ORIEL_UPDATE_FEED=<url> points it at a generic
// feed instead (tests); a test world with no feed uses the bench's fake one.
// An installed copy never reads that variable (testhooks.ts).
//
// The portable build can't put a new version in place (it runs from its own
// .exe, and electron-updater would run the NSIS installer): it never checks,
// and Settings says it updates by downloading the new version.

import { app, net } from 'electron'
import { model } from '../model/model'
import { handle } from '../router'
import { probe } from '../paths'
import { benchRequest } from '../bench/server'
import { allControllers, overlayFree } from '../views/window'
import { openInternal, scheme, tellPages } from './internal'
import { hidePanel, markAllSettings, settingsPart, showPanel } from './slice'
import { said, setKey } from './prefs'
import { testEnv } from '../testhooks'

export type Stage =
  | { kind: 'none' }
  | { kind: 'fetching'; version: string; notes?: string }
  | { kind: 'ready'; version: string; notes?: string }
  | { kind: 'waiting'; version: string; notes?: string }

interface Found { version: string; notes?: string }
interface Source {
  check(): Promise<Found | null>
  download(): Promise<void>
  install(): void
}

export const update = {
  stage: { kind: 'none' } as Stage,
  checking: false,
  /** ms of the last check, from update.checked. */
  get checked(): number | null { const v = model.pref<number | string>('update.checked'); return v ? Number(new Date(v)) || Number(v) : null },
}

/** What the bench's fake feed offers, in a test world. */
const fake: { version: string | null; notes?: string; downloads: number; installs: number; checks: number; failDownload?: boolean } = { version: null, downloads: 0, installs: 0, checks: 0 }

/** Release notes as a line: GitHub gives HTML or Markdown. */
function plain(notes: unknown): string | undefined {
  const text = Array.isArray(notes) ? notes.map(n => (n as { note?: string }).note ?? '').join('\n') : typeof notes === 'string' ? notes : ''
  const flat = text.replace(/<[^>]+>/g, ' ').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  return flat ? (flat.length > 140 ? flat.slice(0, 139).trimEnd() + '…' : flat) : undefined
}

let real: import('electron-updater').AppUpdater | null = null
function electronUpdater(feed?: string): Source {
  const ensure = () => {
    if (real) return real
    // Loaded only where it runs: it reads the app's update config on first use.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false
    autoUpdater.logger = { info: () => {}, warn: (m: unknown) => console.warn('[update]', m), error: (m: unknown) => console.warn('[update]', m), debug: () => {} } as never
    if (feed) { autoUpdater.forceDevUpdateConfig = true; autoUpdater.setFeedURL({ provider: 'generic', url: feed }) }
    real = autoUpdater
    return autoUpdater
  }
  return {
    async check() {
      const r = await ensure().checkForUpdates()
      if (!r || !r.isUpdateAvailable) return null
      return { version: r.updateInfo.version, notes: plain(r.updateInfo.releaseNotes) }
    },
    async download() {
      if (fakeActions) { fake.downloads++; return }
      await ensure().downloadUpdate()
    },
    install() {
      if (fakeActions) { fake.installs++; return }
      ensure().quitAndInstall(true, true)
    },
  }
}

/** A test world with a real feed: what it finds is real, fetching and
 * installing are only counted (ORIEL_UPDATE_FAKE_INSTALL=1). */
const fakeActions = probe && testEnv('ORIEL_UPDATE_FAKE_INSTALL') === '1'

const fakeSource: Source = {
  async check() { fake.checks++; return fake.version ? { version: fake.version, notes: fake.notes } : null },
  async download() { fake.downloads++; await new Promise(r => setTimeout(r, 300)); if (fake.failDownload) throw new Error('download failed') },
  install() { fake.installs++ },
}

const feed = testEnv('ORIEL_UPDATE_FEED')
/** electron-builder's portable launcher sets these for the app it unpacks. */
export const portable = !!(process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE)
/** Installed from the Microsoft Store (an MSIX package): the Store updates
 * it, and a package's files can't be replaced from inside anyway. */
export const store = !!process.windowsStore || (probe && testEnv('ORIEL_STORE') === '1')
/** Installed builds use GitHub; a test world uses a feed it names, or the
 * fake; the portable build and the Store's none. */
const source: Source | null = portable || store ? null : feed ? electronUpdater(feed) : probe ? fakeSource : app.isPackaged ? electronUpdater() : null

function changed(): void {
  tellPages('update', updateFacts(), 'settings')
  if (popup) { popup = popupFrom(update.stage) ?? popup; markAllSettings() }
}

export function updateFacts() {
  const s = update.stage
  return {
    stage: s, checking: update.checking, checked: update.checked, active: !!source, portable, store,
    // A pending update, once its popup is out of the way: Settings shows it
    // as its first section (the user's own wish, 24 Nov 2026).
    pending: s.kind !== 'none' && !popup ? { version: s.version, notes: s.notes, ready: s.kind === 'ready', fetching: s.kind === 'fetching' } : null,
  }
}

// The popup at launch (asked for by the user, 24 Nov 2026, over the Mac's
// quiet line): a new version found by the first check after Oriel opens
// floats over the window with its notes and Update and Restart; the X puts
// it away for that version (updates.dismissed), until a newer one comes.
// Only at launch, never from the hourly check: it doesn't break into
// browsing; a version found while Oriel is open waits for the next launch,
// and Settings shows it meanwhile.

export interface UpdatePopup { version: string; notes?: string; ready: boolean; fetching: boolean }
let popup: UpdatePopup | null = null
let popupWindow: string | null = null

/** "0.10.0" is newer than "0.9.2"; anything newer than nothing. */
export function newer(a: string, b: string): boolean {
  if (!b) return true
  const x = a.split(/[.+-]/).map(n => parseInt(n, 10) || 0), y = b.split(/[.+-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) }
  return false
}

function popupFrom(s: Stage): UpdatePopup | null {
  return s.kind === 'none' ? null : { version: s.version, notes: s.notes, ready: s.kind === 'ready', fetching: s.kind === 'fetching' }
}

function placePopup(tries = 0): void {
  const c = allControllers()[0]
  if (!popup) return
  if (!c) { if (tries < 40) setTimeout(() => placePopup(tries + 1), 500); return }
  const layer = c.overlayLayer
  // Something else floats there (the field, a menu, a question): wait it out.
  if (!overlayFree(layer) && !(layer.kind === 'panel' && layer.name === 'settings.update')) { setTimeout(() => placePopup(tries + 1), 400); return }
  popupWindow = c.record.id
  const b = c.base.getContentBounds()
  // A plate over the whole window, with the panels' veil (studio/02 §4.6).
  showPanel(c, 'settings.update', { x: 0, y: 0, width: b.width, height: b.height }, popup)
  markAllSettings()
}

function showPopup(): void {
  const p = popupFrom(update.stage)
  if (!p || !newer(p.version, model.pref<string>('updates.dismissed') ?? '')) return
  popup = p
  shown.push(p.version)
  placePopup()
  changed()
}

/** The popup's X (or Escape): not again for this version. */
export function dismissPopup(): void {
  if (!popup) return
  setKey('updates.dismissed', popup.version)
  popup = null
  for (const c of allControllers()) hidePanel(c, 'settings.update')
  popupWindow = null
  markAllSettings()
  changed()
}

/** Update and Restart: fetched if it isn't yet, then put in place and opened. */
export async function updateNow(): Promise<void> {
  if (update.stage.kind === 'waiting') await fetchIt(update.stage)
  if (update.stage.kind === 'ready') {
    if (popup) { popup = null; for (const c of allControllers()) hidePanel(c, 'settings.update'); markAllSettings() }
    source?.install()
  }
  changed()
}

/** Versions the popup was shown for, for the bench. */
const shown: string[] = []

settingsPart(c => ({ update: popup && popupWindow === c.record.id ? popupFrom(update.stage) : null }))

async function fetchIt(found: Found): Promise<void> {
  if (!source) return
  update.stage = { kind: 'fetching', version: found.version, notes: found.notes }
  changed()
  try {
    await source.download()
    update.stage = { kind: 'ready', version: found.version, notes: found.notes }
  } catch (error) {
    console.warn('[update] download', error)
    update.stage = { kind: 'waiting', version: found.version, notes: found.notes }
  }
  changed()
}

/** Checks the feed; `byHand` says "This is the latest one" when nothing's new;
 * `atLaunch` may float the popup. */
export async function check(byHand = false, atLaunch = false): Promise<string | null> {
  if (!source || update.checking) return null
  if (update.stage.kind === 'fetching' || update.stage.kind === 'ready') return null
  update.checking = true
  changed()
  let found: Found | null = null
  try { found = await source.check() } catch (error) { console.warn('[update] check', error) }
  update.checking = false
  setKey('update.checked', Date.now())
  if (!found) {
    update.stage = { kind: 'none' }
    changed()
    if (byHand) { said.push('This is the latest one'); return 'This is the latest one' }
    return null
  }
  if (model.pref<boolean>('update.install')) {
    // Fetched quietly; the popup says it is ready once it is.
    await fetchIt(found)
  } else { update.stage = { kind: 'waiting', version: found.version, notes: found.notes }; changed() }
  if (atLaunch) showPopup()
  return null
}

/** Install (with Install updates on its own off): fetched, then ready. */
export async function install(): Promise<void> {
  if (update.stage.kind === 'waiting') await fetchIt(update.stage)
}

/** Relaunch now: the new version in place and opened. */
export function relaunch(): void {
  if (update.stage.kind === 'ready') source?.install()
}

// Turned back on with an update waiting, it is fetched at once (06 §1.12).
let installWas = !!model.pref<boolean>('update.install')
model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs')) return
  const now = !!model.pref<boolean>('update.install')
  if (now && !installWas && update.stage.kind === 'waiting') void install()
  installWas = now
})

// At launch, then every hour (Updater.swift:133).
const HOUR = 60 * 60 * 1000
app.whenReady().then(() => {
  installWas = !!model.pref<boolean>('update.install')
  if (!source) return
  setTimeout(() => void check(false, true), probe ? 1500 : 8000).unref?.()
  setInterval(() => {
    const last = update.checked
    if (!last || Date.now() - last > (50 / 60) * HOUR) void check()
  }, probe && testEnv('ORIEL_UPDATE_EVERY') ? Number(testEnv('ORIEL_UPDATE_EVERY')) : HOUR).unref?.()
})

handle('update.check', () => check(true))
handle('update.install', () => install())
handle('update.relaunch', () => relaunch())
handle('update.state', () => updateFacts())
handle('update.dismiss', () => dismissPopup())
handle('update.now', () => updateNow())

// What's New: every version's notes, from the repository's releases.

export interface ReleaseNotes { version: string; name: string; date: string; body: string }
let notesCache: { at: number; list: ReleaseNotes[] } | null = null
const fakeNotes: ReleaseNotes[] = []

handle('update.notes', async () => {
  if (probe && !testEnv('ORIEL_NOTES_FEED')) return { list: fakeNotes, error: null }
  if (notesCache && Date.now() - notesCache.at < 10 * 60 * 1000) return { list: notesCache.list, error: null }
  const url = testEnv('ORIEL_NOTES_FEED') ?? 'https://api.github.com/repos/carpaaaaa/oriel/releases?per_page=30'
  try {
    const r = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Oriel' } })
    if (!r.ok) throw new Error(String(r.status))
    const raw = await r.json() as { tag_name: string; name: string | null; published_at: string; body: string | null; draft: boolean; prerelease: boolean }[]
    const list = raw.filter(x => !x.draft && !x.prerelease).map(x => ({ version: x.tag_name.replace(/^v/, ''), name: x.name ?? '', date: x.published_at, body: x.body ?? '' }))
    notesCache = { at: Date.now(), list }
    return { list, error: null }
  } catch {
    return { list: [], error: "Couldn't reach GitHub. Try again in a moment." }
  }
})

// After an update, What's New once (WhatsNew.swift due): never on a fresh
// install (this version counts as seen), never twice for one version, and
// in a test world only when asked (ORIEL_WHATSNEW=1). A tab of its own, as
// Oriel's pages are, in the first window.
function whatsNewDue(): boolean {
  if (probe && !testEnv('ORIEL_WHATSNEW')) return false
  const now = app.getVersion()
  const seen = model.pref<string>('whatsnew.seen')
  if (seen === now) return false
  setKey('whatsnew.seen', now)
  return !!seen
}

app.whenReady().then(() => setTimeout(() => {
  if (!whatsNewDue()) return
  let tries = 0
  const open = () => {
    const c = allControllers()[0]
    if (c) { void openInternal(c, `${scheme}://release-notes`); return }
    if (++tries < 40) setTimeout(open, 500)
  }
  open()
}, 1200))

benchRequest('settings.updater', req => {
  if ('version' in req) fake.version = (req.version as string | null) ?? null
  if ('notes' in req) fake.notes = (req.notes as string | undefined) ?? undefined
  if ('failDownload' in req) fake.failDownload = !!req.failDownload
  if ('releases' in req) fakeNotes.splice(0, fakeNotes.length, ...(req.releases as ReleaseNotes[]))
  if (req.check) void check(true)
  return { stage: update.stage, checking: update.checking, checked: update.checked, fake: { ...fake }, active: !!source, feed: !!feed, portable, popup, shown: [...shown] }
})
