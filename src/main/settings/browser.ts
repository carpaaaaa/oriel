// Oriel as Windows' browser (studio/06 §1.1 general.default and mail.default,
// studio/07 §4.1, studio/03 §3.1). The installer lists Oriel among Windows'
// browsers (build/installer.nsh: StartMenuInternet, Capabilities,
// RegisteredApplications, the OrielURL and OrielHTML ProgIDs). No app may
// make itself the default on Windows 11, so Make default opens Oriel's own
// page in Settings › Apps › Default apps, where Set default is at the top,
// and what Windows chose is read back each time Oriel comes to the front.
// The first launch offers it once, as the Mac's welcome does (Welcome.swift,
// "Links from other apps.").
//
// A test world never reads the registry: the bench gives the answers
// (settings.default).

import { app } from 'electron'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { brand } from '../../shared/brand'
import { addDefaults } from '../../shared/prefs'
import { fileURL } from '../address'
import { benchRequest } from '../bench/server'
import { model } from '../model/model'
import { probe } from '../paths'
import { testEnv } from '../testhooks'
import { allControllers, controllerFor } from '../views/window'
import { tellPages } from './internal'
import { openSystem, said, setKey } from './prefs'
import { hidePanel, markAllSettings, settingsPart, showPanel } from './slice'
import { portable, store } from './updater'

/** What the installer writes (build/installer.nsh). The deep link names the
 * RegisteredApplications value, so the two must match. */
export const REGISTERED = brand.name
export const PROGID_URL = 'OrielURL'
export const PROGID_HTML = 'OrielHTML'
/** Files Windows hands over: Chrome's list, without .pdf until Oriel shows PDFs. */
export const FILE_TYPES = ['.htm', '.html', '.shtml', '.xht', '.xhtml', '.svg', '.webp']

addDefaults({ 'browser.offered': false })

/** How Oriel can become the default here: through Settings, not at all as
 * the portable copy, or not until the installer has listed it. */
export type How = 'settings' | 'portable' | 'unregistered'
interface Answer { browser: boolean; mail: boolean; scope: 'user' | 'machine' | null }

/** What Windows would say, in a test world (settings.default; from launch
 * with ORIEL_DEFAULT_FAKE='{"browser":true}'). */
const fake: Answer & { portable: boolean } = { browser: false, mail: false, scope: 'user', portable: false }
if (probe) try { Object.assign(fake, JSON.parse(testEnv('ORIEL_DEFAULT_FAKE') ?? '{}')) } catch {}

let answer: Answer = probe ? { browser: fake.browser, mail: fake.mail, scope: fake.scope } : { browser: false, mail: false, scope: null }
/** Make default pressed and Windows hasn't changed yet: the row says what to click. */
const asked = { browser: false, mail: false }

export function how(): How {
  if (portable || (probe && fake.portable)) return 'portable'
  return answer.scope ? 'settings' : 'unregistered'
}

export function defaultFacts() {
  return { isDefault: answer.browser, mailDefault: answer.mail, defaultHow: how(), defaultAsked: asked.browser, mailAsked: asked.mail }
}

/** Oriel's page in Settings › Apps › Default apps (registeredAppMachine for
 * an install for everyone). */
export function settingsLink(): string {
  // Installed from the Store, Windows knows Oriel by its package (registeredAUMID).
  const aumid = storeAUMID()
  if (aumid) return `ms-settings:defaultapps?registeredAUMID=${encodeURIComponent(aumid)}`
  // A package somewhere unexpected: Default apps itself, Oriel is listed there.
  if (store) return 'ms-settings:defaultapps'
  return `ms-settings:defaultapps?${answer.scope === 'machine' ? 'registeredAppMachine' : 'registeredAppUser'}=${encodeURIComponent(REGISTERED)}`
}

/** The Store's package: its manifest lists Oriel for http, https, mailto and
 * web files (build/appx-extensions.xml, package.json build.appx), and
 * Windows names Oriel by Package Family Name!Oriel. The family comes from
 * where Windows installed it: WindowsApps\Name_Version_Arch_Resource_PublisherId. */
export const STORE_APP_ID = 'Oriel'
export function storeFamily(exe = process.execPath): string | null {
  if (!store) return null
  const m = /\\WindowsApps\\([^_\\]+)_[^_\\]+_[^_\\]+_[^_\\]*_([^_\\]+)\\/i.exec(exe)
  return m ? `${m[1]}_${m[2]}` : null
}
export function storeAUMID(): string | null {
  const family = storeFamily()
  return family ? `${family}!${STORE_APP_ID}` : null
}

// reading Windows' answer

const reg = () => path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
function query(args: string[]): Promise<string | null> {
  return new Promise(resolve => {
    execFile(reg(), ['query', ...args], { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(error ? null : String(stdout)))
  })
}

/** The ProgID in `reg query <scheme> /s`: UserChoiceLatest (Windows 11 from
 * 2025) before UserChoice. */
export function chosenProgId(out: string | null): string | null {
  if (!out) return null
  const found = new Map<string, string>()
  let key = ''
  for (const line of out.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) { key = line.trim().toLowerCase(); continue }
    const m = /^\s+ProgId\s+REG_SZ\s+(.+?)\s*$/i.exec(line)
    if (m && key) found.set(key, m[1])
  }
  for (const end of ['\\userchoicelatest\\progid', '\\userchoicelatest', '\\userchoice']) {
    for (const [k, v] of found) if (k.endsWith(end)) return v
  }
  return null
}

const ASSOC = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations'
const isOurs = (id: string | null) => (id ?? '').toLowerCase() === PROGID_URL.toLowerCase()

/** A Store app's choice reads as an AppX ProgID; whose it is, its class says. */
async function isOursPackaged(id: string | null): Promise<boolean> {
  const family = storeFamily()
  if (!family || !id || !/^AppX/i.test(id)) return false
  const out = await query([`HKCU\\Software\\Classes\\${id}\\Application`, '/v', 'AppUserModelID'])
    ?? await query([`HKCR\\${id}\\Application`, '/v', 'AppUserModelID'])
  return !!out && out.toLowerCase().includes(family.toLowerCase())
}

async function read(): Promise<Answer> {
  if (probe) return { browser: fake.browser, mail: fake.mail, scope: fake.scope }
  if (process.platform !== 'win32') return { browser: false, mail: false, scope: null }
  if (store) {
    const [https, mailto] = await Promise.all([query([`${ASSOC}\\https`, '/s']), query([`${ASSOC}\\mailto`, '/s'])])
    const [b, m] = await Promise.all([isOursPackaged(chosenProgId(https)), isOursPackaged(chosenProgId(mailto))])
    // The package itself lists Oriel among the browsers: always 'user'.
    return { browser: b, mail: m, scope: 'user' }
  }
  const [https, mailto, user, machine] = await Promise.all([
    query([`${ASSOC}\\https`, '/s']),
    query([`${ASSOC}\\mailto`, '/s']),
    query(['HKCU\\Software\\RegisteredApplications', '/v', REGISTERED]),
    query(['HKLM\\Software\\RegisteredApplications', '/v', REGISTERED]),
  ])
  return { browser: isOurs(chosenProgId(https)), mail: isOurs(chosenProgId(mailto)), scope: user ? 'user' : machine ? 'machine' : null }
}

let reading: Promise<void> | null = null
/** Reads what Windows chose; the row and the offer follow it. */
export function recheck(): Promise<void> {
  if (reading) return reading
  reading = (async () => {
    const was = answer
    try { answer = await read() } catch (error) { console.warn('[default browser]', error) }
    reading = null
    changed(was)
  })()
  return reading
}

function changed(was: Answer): void {
  // The Mac's announcements after becomeDefault, said once Windows has it.
  const now = answer.browser && !was.browser && asked.browser ? 'Links now open here'
    : answer.mail && !was.mail && asked.mail ? 'Email links now open here' : undefined
  if (answer.browser) asked.browser = false
  if (answer.mail) asked.mail = false
  if (!now && was.browser === answer.browser && was.mail === answer.mail && was.scope === answer.scope) return
  if (now) said.push(now)
  tellPages('default', { ...defaultFacts(), said: now }, 'settings')
  if (offer) markAllSettings()
}

/** Make default, from the row or the offer: Oriel's page in Settings. */
export function askDefault(which: 'browser' | 'mail'): boolean {
  if (how() !== 'settings') return false
  asked[which] = true
  openSystem(settingsLink())
  tellPages('default', defaultFacts(), 'settings')
  if (offer) markAllSettings()
  return true
}

// Back from Settings: Oriel coming to the front reads Windows' answer again.
let lastFront = 0
function onFront(force = false): void {
  if (!force && Date.now() - lastFront < 1000) return
  lastFront = Date.now()
  void recheck()
}
model.on('window-opened', (id: string) => setImmediate(() => controllerFor(id)?.base.on('focus', () => onFront())))

// links and files handed over by Windows

/** The links and files on a command line, as Oriel opens them: the
 * installer's commands pass them after "--" ("Oriel.exe" -- "%1"). */
export function linkArgs(argv: string[]): string[] {
  const out: string[] = []
  for (const a of argv) {
    if (/^(https?|file|mailto):/i.test(a)) out.push(a)
    else if (path.isAbsolute(a) && FILE_TYPES.includes(path.extname(a).toLowerCase())) {
      const url = fileURL(a)
      if (url) out.push(url)
    }
  }
  return out
}

// The first launch's offer (Welcome.swift links): once (browser.offered), on
// a fresh install only, never on the portable copy or when Oriel already is
// the default, and in a test world only when asked (ORIEL_DEFAULT_OFFER=1).
// A plate over the first window; its X, Escape or Done put it away.

const OFFER = 'settings.default'
let offer: { window: string } | null = null

settingsPart(c => ({ defaultOffer: offer && offer.window === c.record.id ? { isDefault: answer.browser, asked: asked.browser } : null }))

function placeOffer(tries = 0): void {
  const c = allControllers()[0]
  if (!c) { if (tries < 40) setTimeout(() => placeOffer(tries + 1), 500); return }
  const layer = c.overlayLayer
  // Something else floats there (the update, the field, a menu): wait it out.
  if (layer.kind !== 'none' && !(layer.kind === 'panel' && layer.name === OFFER)) {
    if (tries < 150) setTimeout(() => placeOffer(tries + 1), 400)
    return
  }
  offer = { window: c.record.id }
  setKey('browser.offered', true)
  const b = c.base.getContentBounds()
  showPanel(c, OFFER, { x: 0, y: 0, width: b.width, height: b.height })
  markAllSettings()
}

export function dismissOffer(): void {
  if (!offer) return
  const c = controllerFor(offer.window)
  offer = null
  if (c) hidePanel(c, OFFER)
  markAllSettings()
}

function offerDue(fresh: boolean): boolean {
  if (model.pref<boolean>('browser.offered')) return false
  if (probe) return testEnv('ORIEL_DEFAULT_OFFER') === '1'
  return process.platform === 'win32' && fresh
}

app.whenReady().then(() => setImmediate(() => {
  // Read before What's New marks this version seen: nothing seen yet is a
  // fresh install.
  const fresh = !model.pref<string>('whatsnew.seen')
  void recheck()
  setTimeout(async () => {
    if (!offerDue(fresh)) return
    await recheck()
    if (!answer.browser && how() === 'settings') placeOffer()
  }, probe ? 600 : 1500)
}))

/** What Windows would answer, and Oriel coming to the front (`front`), for a
 * test; `args` and `registry` ask how a command line or reg.exe's output reads. */
benchRequest('settings.default', async req => {
  if ('browser' in req) fake.browser = !!req.browser
  if ('mail' in req) fake.mail = !!req.mail
  if ('scope' in req) fake.scope = (req.scope as Answer['scope']) ?? null
  if ('portable' in req) fake.portable = !!req.portable
  if (req.front) { onFront(true); await reading }
  if (Array.isArray(req.args)) return { links: linkArgs(req.args as string[]) }
  if (typeof req.registry === 'string') return { progId: chosenProgId(req.registry) }
  return { answer, asked: { ...asked }, facts: defaultFacts(), offer: offer ? { ...offer } : null, link: settingsLink(), offered: !!model.pref('browser.offered') }
})
