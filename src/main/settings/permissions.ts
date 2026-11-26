// Site permissions (studio/06 §2.6, CaptureChoices.swift, Browser.swift:1973-2149,
// :9340-9535, PageQuestions.swift). Electron grants everything unless told
// otherwise; here every page session asks as Search does: camera, microphone,
// location and notifications are asked for with the question rising from
// the page's foot and remembered per origin under the Mac's keys
// (`capture.<origin>|0|1|2|location|notifications`), never for a private
// tab. What WebKit doesn't offer a page is refused; what it gives without
// asking is given.

import { openCompose } from '../tabs/pagelinks'
import type { Session, WebContents } from 'electron'
import type { ID } from '../../shared/state'
import type { PermissionAsk, PermissionKind, SavedPermission } from '../../shared/modules/settings'
import { model } from '../model/model'
import { handle } from '../router'
import { need } from '../context'
import { onPageSession, runtimes } from '../views/tabs'
import { controllerFor, overlayFree, type WindowController } from '../views/window'
import { isInternal } from './internal'
import { markSettings, settingsPart, showPanel, hidePanel } from './slice'

const suffix: Record<PermissionKind, string> = { camera: '0', microphone: '1', cameraAndMicrophone: '2', location: 'location', notifications: 'notifications' }
const titles: Record<PermissionKind, string> = { camera: 'Camera', microphone: 'Microphone', cameraAndMicrophone: 'Camera and microphone together', location: 'Location', notifications: 'Notifications' }
export const listedKinds: PermissionKind[] = ['camera', 'microphone', 'location', 'notifications']
const isMedia = (k: PermissionKind) => k === 'camera' || k === 'microphone' || k === 'cameraAndMicrophone'

/** scheme://host[:port], the port left out when it is the scheme's own. */
export function originOf(url: string | undefined): string {
  try { const u = new URL(url ?? ''); return u.origin === 'null' ? `${u.protocol}//${u.host}` : u.origin } catch { return '' }
}

/** Both spellings for media, with and without a default port (CaptureChoices.keys). */
export function keysFor(kind: PermissionKind, origin: string): string[] {
  const original = `capture.${origin}|${suffix[kind]}`
  if (!isMedia(kind)) return [original]
  let u: URL
  try { u = new URL(origin) } catch { return [original] }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return [original]
  const port = u.protocol === 'https:' ? '443' : '80'
  if (u.port && u.port !== port) return [original]
  const bare = `${u.protocol}//${u.hostname}`
  return [`capture.${bare}|${suffix[kind]}`, `capture.${bare}:${port}|${suffix[kind]}`]
}

const read = (key: string) => model.prefs[key]

/** A refusal wins over a grant saved under the other spelling. */
export function mediaDecision(kind: PermissionKind, origin: string): boolean | null {
  const answers = keysFor(kind, origin).map(read).filter((v): v is boolean => typeof v === 'boolean')
  if (answers.includes(false)) return false
  return answers.includes(true) ? true : null
}

export function choice(kind: PermissionKind, origin: string): 'ask' | 'allow' | 'refuse' | 'different' {
  const saved = keysFor(kind, origin).map(read).filter((v): v is boolean => typeof v === 'boolean')
  if (!saved.length) return 'ask'
  if (new Set(saved).size > 1) return 'different'
  return saved[0] ? 'allow' : 'refuse'
}

/** Writes (or with null removes) a site's answer, both spellings. */
export function setChoice(value: boolean | null, kind: PermissionKind, origin: string): void {
  const keys = new Set(keysFor(kind, origin))
  if (kind === 'cameraAndMicrophone') for (const k of [...keysFor('camera', origin), ...keysFor('microphone', origin)]) keys.add(k)
  for (const key of keys) model.setPref(key, value ?? undefined)
}

/** The saved answers, as Settings › Privacy lists them (CaptureChoices.saved). */
export function saved(): SavedPermission[] {
  const out = new Map<string, SavedPermission>()
  for (const key of Object.keys(model.prefs)) {
    if (!key.startsWith('capture.') || typeof model.prefs[key] !== 'boolean') continue
    const split = key.lastIndexOf('|')
    const kind = listedKinds.find(k => suffix[k] === key.slice(split + 1))
    let origin = key.slice('capture.'.length, split)
    if (!kind || !origin) continue
    let alternativeSpelling = false
    try {
      const u = new URL(origin)
      if ((u.protocol === 'https:' && key.includes(':443|')) || (u.protocol === 'http:' && key.includes(':80|'))) {
        if (isMedia(kind)) origin = `${u.protocol}//${u.hostname}`
        else alternativeSpelling = true
      }
    } catch {}
    const answer = choice(kind, origin)
    if (answer === 'ask') continue
    const entry: SavedPermission = { origin, kind, choice: answer, alternativeSpelling }
    out.set(`${origin}|${suffix[kind]}`, entry)
  }
  return [...out.values()].sort((a, b) => `${a.origin}|${suffix[a.kind]}`.localeCompare(`${b.origin}|${suffix[b.kind]}`))
}

/** Forget choices: every capture.* and nofloat.* key (Browser.forgetCaptureChoices). */
export function forgetPermissions(): void {
  for (const key of Object.keys(model.prefs)) if (key.startsWith('capture.') || key.startsWith('nofloat.')) model.setPref(key, undefined)
}

// asking

interface Pending {
  ask: PermissionAsk
  win: ID
  /** "capture.<origin>|<suffix>" or '' for a private tab. */
  about: string
  kind: PermissionKind
  origin: string
  combined: boolean
  decide: (granted: boolean) => void
}

/** The question on screen in each window: one at a time (06 §2.6). */
const shown = new Map<ID, Pending>()
/** Questions of a tab behind, waiting until you go to it. */
const held = new Map<ID, (() => void)[]>()
/** What was asked and answered, for the bench. */
export const asked: { host: string; wants: string; answer?: string }[] = []

export function askingIn(c: WindowController): PermissionAsk | null { return shown.get(c.record.id)?.ask ?? null }

function tabOfContents(wc: WebContents | null): ID | null {
  if (!wc) return null
  for (const [id, rt] of runtimes) if (rt.contents === wc) return id
  return null
}

const name = (k: PermissionKind) => (k === 'cameraAndMicrophone' ? 'camera and microphone' : k)

let counter = 0

function ask(tab: ID, show: () => void, drop: () => void): void {
  const win = model.windowOf(tab)
  if (!win) return drop()
  if (win.active[win.space] === tab && model.onScreen(tab)) return show()
  const list = held.get(tab) ?? []
  list.push(show)
  held.set(tab, list)
}

function present(tab: ID, p: Omit<Pending, 'ask' | 'win'> & { host: string; wants: string; once: boolean; keeps: boolean }): void {
  const win = model.windowOf(tab)
  const c = win && controllerFor(win.id)
  if (!win || !c) return p.decide(false)
  // A second page asking while the first is waiting is refused, not queued.
  if (shown.has(win.id)) return p.decide(false)
  const ask: PermissionAsk = { id: String(++counter), tab, host: p.host, wants: p.wants, once: p.once, keeps: p.keeps, shown: Date.now() }
  shown.set(win.id, { ask, win: win.id, about: p.about, kind: p.kind, origin: p.origin, combined: p.combined, decide: p.decide })
  asked.push({ host: p.host, wants: p.wants })
  markSettings(c)
  showQuestion(c)
}

function showQuestion(c: WindowController): void {
  const p = shown.get(c.record.id)
  if (!p) return
  const layer = c.overlayLayer
  // Something else floats there (the field, a menu, another panel): wait it out.
  if (!overlayFree(layer) && !(layer.kind === 'panel' && layer.name === 'settings.permission')) { setTimeout(() => showQuestion(c), 400); return }
  const view = runtimes.get(p.ask.tab)?.view
  const b = view?.getBounds()
  if (!b || !b.width) { setTimeout(() => showQuestion(c), 200); return }
  // The bars rise from the page's foot, 30 above it, centred (App.swift bars).
  const width = Math.min(b.width - 24, 680), height = 96
  showPanel(c, 'settings.permission', { x: Math.round(b.x + (b.width - width) / 2), y: b.y + b.height - height, width, height })
}

function settle(winID: ID, granted: boolean, answer: string): void {
  const p = shown.get(winID)
  if (!p) return
  shown.delete(winID)
  const last = asked.findLast(a => a.host === p.ask.host && a.wants === p.ask.wants && !a.answer)
  if (last) last.answer = answer
  p.decide(granted)
  const c = controllerFor(winID)
  if (c) { hidePanel(c, 'settings.permission'); markSettings(c) }
}

handle('permission.answer', ({ answer }, ctx) => {
  const c = need(ctx)
  const p = shown.get(c.record.id)
  // A page can time a click to land where Allow is about to be: none in the first half second.
  if (!p || Date.now() - p.ask.shown < 500) return { taken: false }
  const grant = answer !== 'deny'
  const keep = answer !== 'once'
  if (keep && p.about) {
    if (p.kind === 'cameraAndMicrophone' && !grant) {
      // Refuse only the devices this question asked for.
      for (const device of ['camera', 'microphone'] as const) if (mediaDecision(device, p.origin) === null) setChoice(false, device, p.origin)
    } else setChoice(grant, p.kind, p.origin)
  }
  settle(c.record.id, grant, answer)
  return { taken: true }
})

// Leaving the tab refuses its question, and the page must hear it before it
// goes off screen: Chromium stops a hidden page's geolocation, dropping an
// answer that comes later and asking again once the page is back. The window
// detaches the page on this same change, so this listener goes first.
model.prependListener('window-changed', (winID: ID, slices: string[]) => {
  if (!slices.includes('activeID') && !slices.includes('space')) return
  const p = shown.get(winID)
  const win = p && model.windowOf(p.ask.tab)
  if (p && win && win.active[win.space] !== p.ask.tab) settle(winID, false, 'left')
})

// Going to a tab shows what it held; leaving the tab refuses its question.
model.on('selected', (win: { id: ID }, id: ID) => {
  const p = shown.get(win.id)
  if (p && p.ask.tab !== id) settle(win.id, false, 'left')
  const waiting = held.get(id)
  if (waiting) { held.delete(id); for (const show of waiting) show() }
})
model.on('tab-closed', (id: ID) => {
  held.delete(id)
  for (const [winID, p] of shown) if (p.ask.tab === id) settle(winID, false, 'closed')
})
model.on('tab-changed', (tab: { id: ID }, patch: Record<string, unknown>) => {
  // A page going elsewhere: its question is refused (Browser.cancelDisplay).
  if (!('url' in patch)) return
  for (const [winID, p] of shown) if (p.ask.tab === tab.id) settle(winID, false, 'navigated')
})

// the handlers

/** What WebKit gives a page without asking, and what it never offers. */
const given = new Set(['fullscreen', 'clipboard-sanitized-write', 'mediaKeySystem', 'fileSystem', 'storage-access', 'top-level-storage-access',
  'screen-wake-lock', 'persistent-storage', 'background-sync', 'background-fetch', 'periodic-background-sync', 'sensors'])

function request(wc: WebContents | null, permission: string, callback: (granted: boolean) => void, details: Electron.PermissionRequest | Electron.MediaAccessPermissionRequest | Electron.OpenExternalPermissionRequest): void {
  const tab = tabOfContents(wc)
  const record = tab ? model.tabs.get(tab) : undefined
  // Oriel's own pages never ask for anything.
  if (wc && isInternal(wc.getURL())) return callback(false)
  if (given.has(permission)) return callback(true)
  if (permission === 'pointerLock') {
    const win = tab ? model.windowOf(tab) : null
    return callback(!!win && win.active[win.space] === tab)
  }
  if (permission === 'openExternal') {
    // mailto: and tel: go to their app without a question (Browser.swift:8791);
    // other apps' links wait for the question of 06 §3.4.
    const url = (details as Electron.OpenExternalPermissionRequest).externalURL ?? ''
    // With a webmail chosen (Settings › General › Email links open in), a
    // mailto: opens its compose page in a tab instead (the tabs module).
    if (tab && /^mailto:/i.test(url) && openCompose(tab, url)) return callback(false)
    return callback(/^(mailto|tel):/i.test(url))
  }
  if (!tab || !record) return callback(false)
  const shy = !!record.shy
  if (permission === 'media') {
    const types = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? []
    const video = types.includes('video'), audio = types.includes('audio')
    if (!video && !audio) return callback(false)
    const kind: PermissionKind = video && audio ? 'cameraAndMicrophone' : video ? 'camera' : 'microphone'
    const site = originOf((details as Electron.MediaAccessPermissionRequest).securityOrigin || details.requestingUrl)
    const host = hostOf(site, record.url)
    if (!shy && kind === 'cameraAndMicrophone') {
      if (mediaDecision('camera', site) === false || mediaDecision('microphone', site) === false) return callback(false)
      if (mediaDecision('camera', site) === true && mediaDecision('microphone', site) === true) return callback(true)
    } else if (!shy) {
      const remembered = mediaDecision(kind, site)
      if (remembered !== null) return callback(remembered)
    }
    let wants = name(kind)
    if (!shy && kind === 'cameraAndMicrophone') {
      if (mediaDecision('camera', site) === true) wants = 'microphone'
      else if (mediaDecision('microphone', site) === true) wants = 'camera'
    }
    return ask(tab, () => present(tab, { host, wants, once: false, keeps: !shy, about: shy ? '' : `${site}|${suffix[kind]}`, kind, origin: site, combined: kind === 'cameraAndMicrophone', decide: callback }), () => callback(false))
  }
  if (permission === 'geolocation') {
    // Only the page's own origin, never a frame's (SiteLocation.swift).
    if (!details.isMainFrame) return callback(false)
    const site = originOf(details.requestingUrl)
    if (!shy) { const c = choice('location', site); if (c === 'allow') return callback(true); if (c === 'refuse' || c === 'different') return callback(false) }
    return ask(tab, () => present(tab, { host: hostOf(site, record.url), wants: 'location', once: true, keeps: !shy, about: shy ? '' : `${site}|location`, kind: 'location', origin: site, combined: false, decide: callback }), () => callback(false))
  }
  if (permission === 'notifications') {
    // Only with Let sites ask on, never private, only the page's origin.
    if (!model.pref<boolean>('notifications.ask') || shy || !details.isMainFrame) return callback(false)
    const site = originOf(details.requestingUrl)
    const c = choice('notifications', site)
    if (c === 'allow') return callback(true)
    if (c === 'refuse' || c === 'different') return callback(false)
    return ask(tab, () => present(tab, { host: hostOf(site, record.url), wants: 'notifications', once: false, keeps: true, about: `${site}|notifications`, kind: 'notifications', origin: site, combined: false, decide: callback }), () => callback(false))
  }
  // display-capture waits for the screen question and picker (06 §2.6, P1);
  // clipboard-read, MIDI, HID, USB, serial, idle detection, window
  // management, local fonts, keyboard lock: WebKit offers none of them.
  callback(false)
}

function hostOf(site: string, page: string): string {
  try { return new URL(site).hostname || new URL(page).hostname || 'This page' } catch { return 'This page' }
}

function check(wc: WebContents | null, permission: string, origin: string, details: Electron.PermissionCheckHandlerHandlerDetails): boolean {
  if (wc && isInternal(wc.getURL())) return false
  if (given.has(permission)) return true
  const tab = tabOfContents(wc)
  if (tab && model.tabs.get(tab)?.shy) return false
  const site = originOf(details.securityOrigin || origin || details.requestingUrl)
  if (permission === 'media') {
    const kind: PermissionKind | null = details.mediaType === 'video' ? 'camera' : details.mediaType === 'audio' ? 'microphone' : null
    return !!kind && mediaDecision(kind, site) === true
  }
  if (permission === 'geolocation') return choice('location', site) === 'allow'
  if (permission === 'notifications') return !!model.pref<boolean>('notifications.ask') && choice('notifications', site) === 'allow'
  if (permission === 'pointerLock') return true
  return false
}

function guard(s: Session): void {
  s.setPermissionRequestHandler((wc, permission, callback, details) => request(wc, permission, callback, details as never))
  s.setPermissionCheckHandler((wc, permission, origin, details) => check(wc, permission, origin, details))
}

onPageSession(s => guard(s))

// Settings › Privacy

handle('permission.list', () => ({ saved: saved(), notificationsOn: !!model.pref<boolean>('notifications.ask'), titles }))
handle('permission.set', ({ origin, kind, value }) => { setChoice(value, kind, origin); return { saved: saved() } })
handle('permission.forget', () => { forgetPermissions(); return { saved: saved() } })

settingsPart(c => ({ asking: askingIn(c) }))
