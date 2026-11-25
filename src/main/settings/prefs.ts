// What Settings' rows do (studio/06 §1): the keys they write, the rows that
// write several keys at once (SettingsIndex.swift "merged controls"), and
// the rows that are buttons (Make default, Clear, Set Up Like Arc...).

import { app, dialog, nativeTheme, session as electronSession, shell } from 'electron'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultOf, defaults, moduleDefaults } from '../../shared/prefs'
import { brand } from '../../shared/brand'
import { model } from '../model/model'
import { handle, run } from '../router'
import { need } from '../context'
import { probe } from '../paths'
import { allControllers, type WindowController } from '../views/window'
import { openInternal, scheme } from './internal'
import { forgetPermissions } from './permissions'
import { forgetDownloadAddresses } from './downloads'
import { arm, confirmWipe, KEY as WIPE_KEY } from './wipe'
import { check, install, relaunch, updateFacts, updateNow } from './updater'
import { askDefault, defaultFacts, dismissOffer, recheck } from './browser'
import { testEnv } from '../testhooks'

/** What Oriel said last (the Mac's announcement line), for the bench. */
export const said: string[] = []
function say(text: string): { said: string } { said.push(text); return { said: text } }

/** Answers a test gives in place of a dialog: a test world never opens one
 * on the screen of whoever works beside it. */
export const probeAnswers: { folder?: string | null; saveAs?: string | null; opened: string[] } = { opened: [] }

/** Every key with its value now: written, or its default (what an Oriel page reads). */
export function allPrefs(): Record<string, unknown> {
  const out: Record<string, unknown> = { ...defaults, ...moduleDefaults }
  for (const [k, v] of Object.entries(model.prefs)) if (v !== undefined) out[k] = v
  return out
}

/** Write a key; its default is written as no key (studio/06 §1.17). */
export function setKey(key: string, value: unknown): void {
  const fallback = defaultOf(key)
  const same = JSON.stringify(value) === JSON.stringify(fallback)
  model.setPref(key, same && fallback !== undefined ? undefined : value)
  mirror(key)
}

export const pref = <T = unknown>(key: string): T => model.pref<T>(key)

/** Keys other modules still read under the skeleton's first names; kept in
 * step until they read Prefs.swift's (see the settings module's report). */
function mirror(key: string): void {
  if (key === 'sidebar' || key === 'sidebar.position' || key === 'sidebar.icons') {
    model.setPref('tabs.layout', pref<boolean>('sidebar') ? 'side' : 'top')
    model.setPref('sidebar.side', pref<string>('sidebar.position') === 'right' ? 'right' : 'left')
    for (const c of allControllers()) {
      c.record.sidebar = {
        ...c.record.sidebar,
        layout: pref<boolean>('sidebar') ? 'side' : 'top',
        side: pref<string>('sidebar.position') === 'right' ? 'right' : 'left',
        icons: !!pref<boolean>('sidebar.icons'),
      }
      model.touch(c.record, ['sidebar'])
    }
  }
  if (key === 'look') applyLook()
}

function applyLook(): void {
  if (testEnv('SEARCH_LOOK')) return
  const look = pref<string>('look')
  nativeTheme.themeSource = look === 'light' || look === 'dark' ? look : 'system'
}
// After the model has read prefs.json and before the first window is made
// (index.ts loads the model, then waits for the extensions).
app.whenReady().then(() => setImmediate(applyLook))

// merged rows (SettingsIndex.swift: TabsLayout, SleepChoice, FloatOwn, PeekChoice, pinsKeepSite)

type Layout = 'top' | 'left' | 'right' | 'icons'
export function tabsLayout(): Layout {
  if (!pref<boolean>('sidebar')) return 'top'
  if (pref<boolean>('sidebar.icons')) return 'icons'
  return pref<string>('sidebar.position') === 'right' ? 'right' : 'left'
}
function setTabsLayout(v: Layout): void {
  if (v === 'top') return setKey('sidebar', false)
  if (v === 'icons') { setKey('sidebar.icons', true); setKey('sidebar', true); return }
  setKey('sidebar.position', v); setKey('sidebar.icons', false); setKey('sidebar', true)
}

export const sleepChoice = () => (pref<boolean>('tabs.sleep') ? (pref<string>('tabs.sleep.pace') || 'normal') : 'never')
export const floatOwn = () => (pref<boolean>('float.away') ? 'tabsOrApps' : pref<boolean>('float.leave') ? 'tabs' : 'never')
export const peekChoice = () => (pref<boolean>('links.peek') ? (pref<string>('links.peekClick') || 'shift') : 'off')
export const pinsKeepSite = () => !!(pref<boolean>('pins.home') || pref<boolean>('pins.peek'))

/** What Settings shows for the rows made of several keys (SettingsIndex.values). */
export function mergedValues(): Record<string, unknown> {
  return {
    'tabs.layout': tabsLayout(), 'tabs.sleep': sleepChoice(), 'float.own': floatOwn(),
    'pins.keep': pinsKeepSite(), 'links.peek': peekChoice(), 'arc': looksLikeArc(),
  }
}

const merged: Record<string, (v: unknown) => boolean> = {
  'tabs.layout': v => { if (!['top', 'left', 'right', 'icons'].includes(v as string)) return false; setTabsLayout(v as Layout); return true },
  'tabs.sleep': v => {
    if (v === 'never') { setKey('tabs.sleep', false); return true }
    if (!['later', 'normal', 'sooner'].includes(v as string)) return false
    setKey('tabs.sleep.pace', v); setKey('tabs.sleep', true); return true
  },
  'float.own': v => {
    if (!['never', 'tabs', 'tabsOrApps'].includes(v as string)) return false
    setKey('float.leave', v !== 'never'); setKey('float.away', v === 'tabsOrApps'); return true
  },
  'pins.keep': v => { setKey('pins.home', !!v); setKey('pins.peek', !!v); return true },
  'links.peek': v => {
    if (v === 'off') { setKey('links.peek', false); return true }
    if (!['shift', 'optionShift', 'optionCommand'].includes(v as string)) return false
    setKey('links.peekClick', v); setKey('links.peek', true); return true
  },
  'sidebar.narrowIcons': v => { setKey('sidebar.narrowIcons', !!v); if (!v) setKey('sidebar.narrowed', false); return true },
}

const known = (key: string) => key in defaults || defaultOf(key) !== undefined

handle('settings.set', async ({ id, value }, ctx) => {
  if (merged[id]) { if (!merged[id](value)) throw new Error(`bad value for ${id}`); return settingsValues() }
  if (id === 'sync') {
    // The tabs module's sync.ts turns it on and off as the key changes.
    if (!value) { setKey('sync.folder', ''); return settingsValues() }
    const folder = await chooseFolder(need(ctx), pref<string>('sync.folder') || shareFolder(), {
      title: 'Sync with your other computers',
      message: `Choose a folder your computers share, in OneDrive or Dropbox for example. Turn on sync with the same folder in ${brand.name} on each one.`,
      button: 'Sync Here',
    })
    if (folder) setKey('sync.folder', folder)
    return settingsValues()
  }
  if (!known(id)) throw new Error(`no setting ${id}`)
  // Clearing everything at every quit asks first (settings/wipe.ts).
  if (id === WIPE_KEY && value === true && !pref<boolean>(WIPE_KEY)) {
    if (!confirmWipe(need(ctx).base)) return settingsValues()
    arm()
  }
  setKey(id, value)
  return settingsValues()
})

// facts a row's words depend on

const home = os.homedir()
export function downloadsFolder(): string { return pref<string>('downloads') || app.getPath('downloads') }
const tilde = (p: string) => (p.startsWith(home) ? '~' + p.slice(home.length) : p)

function arcFile(): string {
  if (process.platform === 'win32') {
    const packages = path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Packages')
    try {
      const dir = require('node:fs').readdirSync(packages).find((d: string) => d.startsWith('TheBrowserCompany.Arc'))
      if (dir) return path.join(packages, dir, 'LocalCache', 'Local', 'Arc', 'StorableSidebar.json')
    } catch {}
    return ''
  }
  return path.join(home, 'Library', 'Application Support', 'Arc', 'StorableSidebar.json')
}

/** Facts other modules add for their rows (sync: the folder's line). */
export const moreFacts: Record<string, () => unknown> = {}

export function settingsValues() {
  return {
    prefs: allPrefs(),
    merged: mergedValues(),
    facts: {
      downloadsFolder: tilde(downloadsFolder()),
      downloadsFolderName: path.basename(downloadsFolder()),
      // What Windows chose for https and mailto (settings/browser.ts).
      ...defaultFacts(),
      arcHere: !!arcFile() && existsSync(arcFile()),
      arcUndoable: !!arcBefore && looksLikeArc(),
      version: app.getVersion(),
      name: brand.name,
      platform: process.platform,
      dark: nativeTheme.shouldUseDarkColors,
      update: updateFacts(),
      ...Object.fromEntries(Object.entries(moreFacts).map(([k, f]) => [k, f()])),
    },
  }
}
// Settings opening reads Windows' answer afresh (settings/browser.ts).
handle('settings.values', async () => { await recheck(); return settingsValues() })

handle('settings.open', async ({ page, find }, ctx) => {
  const c = need(ctx)
  const section = page ?? (updateFacts().pending ? 'update' : (pref<string>('settings.page') || 'general'))
  const id = await openInternal(c, `${scheme}://settings/${section}${find ? `?find=${encodeURIComponent(find)}` : ''}`)
  return { tab: id }
})

// rows that are buttons

async function chooseFolder(c: WindowController, from: string, o: { title?: string; message?: string; button?: string } = {}): Promise<string | null> {
  if (probe) return probeAnswers.folder ?? null
  const r = await dialog.showOpenDialog(c.base as never, {
    defaultPath: from, buttonLabel: o.button ?? 'Use this folder', title: o.title, message: o.message,
    properties: ['openDirectory', 'createDirectory'],
  })
  return r.canceled ? null : r.filePaths[0] ?? null
}

/** Where the sync folder picker starts (Sync.choose starts in iCloud
 * Drive): OneDrive, iCloud Drive or Dropbox when there is one, Documents
 * otherwise. */
function shareFolder(): string {
  const tries = [process.env.OneDrive, process.env.OneDriveConsumer, path.join(home, 'iCloudDrive'),
    path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'), path.join(home, 'Dropbox')]
  return tries.find(p => p && existsSync(p)) ?? app.getPath('documents')
}

/** The page sessions of the profile and of private windows. */
function pageSessions(): Electron.Session[] {
  const all = new Set<Electron.Session>([electronSession.fromPartition('persist:personal')])
  for (const c of allControllers()) all.add(c.pageSession)
  return [...all]
}

/** Opens a link of Windows' own (Settings › Default apps). Never in a test. */
export function openSystem(url: string): void {
  if (probe) { probeAnswers.opened.push(url); return }
  void shell.openExternal(url)
}

handle('settings.do', async ({ id, arg }, ctx) => {
  const c = need(ctx)
  switch (id) {
    case 'general.default':
      // Windows lets a browser only open its page in Settings, where the
      // person presses Set default (settings/browser.ts).
      askDefault('browser')
      return settingsValues()
    case 'mail.default':
      askDefault('mail')
      return settingsValues()
    case 'default.dismiss':
      // The first launch's offer put away (its X, Escape, Done).
      dismissOffer()
      return settingsValues()
    case 'general.import':
      return run({ do: 'import.open' } as never, { window: c })
    case 'arc.import':
      return run({ do: 'import.open', source: 'arc' } as never, { window: c })
    case 'downloads.folder': {
      const folder = await chooseFolder(c, downloadsFolder())
      if (folder) setKey('downloads', folder)
      return settingsValues()
    }
    case 'passwords.open':
      return openInternal(c, `${scheme}://passwords`)
    case 'downloads.list':
      return openInternal(c, `${scheme}://downloads`)
    case 'privacy.forget':
      forgetPermissions()
      return say('Camera, microphone, location and notification choices forgotten')
    case 'clear.history':
      await run({ do: 'history.clear' } as never, { window: c }).catch(() => {})
      forgetDownloadAddresses()
      return say('History cleared')
    case 'clear.cookies':
      await Promise.all(pageSessions().map(s => s.clearStorageData()))
      return say('Signed out of everything')
    case 'clear.cache':
      await Promise.all(pageSessions().map(async s => { await s.clearCache(); await s.clearStorageData({ storages: ['cachestorage'] }) }))
      return say('Cache cleared')
    case 'arc.setup': {
      const changed = setUpLikeArc()
      return say(changed.length ? 'Turned on: ' + changed.join(', ') : 'Already set up like Arc')
    }
    case 'arc.undo':
      undoArc()
      return say('Put back as it was')
    case 'updates.check': {
      const m = await check(true)
      return m ? say(m) : settingsValues()
    }
    case 'updates.install':
      await install()
      return settingsValues()
    case 'updates.relaunch':
      relaunch()
      return settingsValues()
    case 'updates.now':
      await updateNow()
      return settingsValues()
    case 'profiles':
      return say('Profiles come in a later version')
    default:
      void arg
      throw new Error(`no action ${id}`)
  }
})


// Set Up Like Arc (SettingsIndex.swift setUpLikeArc, LikeArc)

let arcBefore: Record<string, unknown> | null = null
const arcKeys = ['sidebar', 'sidebar.icons', 'sidebar.position', 'spaces', 'pins.list', 'pins.home', 'pins.peek', 'newtab.floating',
  'tabs.close.after', 'float.leave', 'float.away', 'tabs.swipeBackCloses', 'links.peek', 'links.peekClick']

export function looksLikeArc(): boolean {
  return tabsLayout() === 'left' && !!pref('spaces') && !!pref('pins.list') && !!pref('pins.home') && !!pref('pins.peek')
    && !!pref('newtab.floating') && Number(pref('tabs.close.after')) !== 0 && floatOwn() !== 'never'
    && !!pref('tabs.swipeBackCloses') && !!pref('links.peek')
}

function setUpLikeArc(): string[] {
  const was = Object.fromEntries(arcKeys.map(k => [k, pref(k)]))
  const changed: string[] = []
  if (tabsLayout() !== 'left') { setTabsLayout('left'); changed.push('tabs on the left') }
  if (!pref('spaces')) { setKey('spaces', true); changed.push('Spaces') }
  if (!pref('pins.list')) { setKey('pins.list', true); changed.push('pinned rows') }
  if (!(pref('pins.home') && pref('pins.peek'))) { merged['pins.keep'](true); changed.push('pins keep their site') }
  if (!pref('newtab.floating')) { setKey('newtab.floating', true); changed.push('the floating new tab') }
  if (Number(pref('tabs.close.after')) === 0) { setKey('tabs.close.after', 12); changed.push('tabs close after 12 hours') }
  if (floatOwn() === 'never') { merged['float.own']('tabs'); changed.push('the video floats on its own') }
  if (!pref('tabs.swipeBackCloses')) { setKey('tabs.swipeBackCloses', true); changed.push("swipe back closes a link's tab") }
  if (!pref('links.peek')) { merged['links.peek']('shift'); changed.push('Shift-click peeks at a link') }
  if (changed.length) arcBefore = was
  return changed
}

function undoArc(): void {
  if (!arcBefore) return
  // Only what differs is written back.
  for (const k of arcKeys) if (JSON.stringify(pref(k)) !== JSON.stringify(arcBefore[k])) setKey(k, arcBefore[k])
  arcBefore = null
}

// keys.ts's table (studio/03 §4): Settings… Ctrl+,, Passwords… Alt+Shift+L,
// Show History… Ctrl+H, Clear Browsing Data… Ctrl+Shift+Delete.
handle('app.settings', (_a, ctx) => run({ do: 'settings.open' } as never, ctx))
handle('app.passwords', (_a, ctx) => openInternal(need(ctx), `${scheme}://passwords`))
handle('history.show', (_a, ctx) => openInternal(need(ctx), `${scheme}://history`))
// The clearing controls are part of History (Browser.clearBrowsingData).
handle('history.clearData', (_a, ctx) => openInternal(need(ctx), `${scheme}://history/clear`))
