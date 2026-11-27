// Downloads (studio/06 §3.1-3.2; Browser.swift:9806-10033, Fetching.swift,
// Recall.swift, Loot.swift): where a file goes ("name 2.ext", never "(1)"),
// asking where if Settings says so, the list (downloads.json, 50 at most,
// the Mac's format), pause, resume, retry, cancel, open, show in the folder,
// the button's progress, and the taskbar's (setProgressBar), which stands in
// for the Mac's progress on the file in the Dock. Each download's speed and
// time left are measured here (Chromium's own rate, smoothed), so the list,
// the card and the button's tooltip say how fast it comes and when it ends;
// a download starting shows the card by the button for a few seconds
// (downloads.peek), so it never goes unnoticed.

import { app, clipboard, dialog, nativeImage, shell, type DownloadItem, type Session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, promises as fsp, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DownloadEntry } from '../../shared/modules/settings'
import type { DownloadView, ID } from '../../shared/state'
import { model, textScale } from '../model/model'
import { readJSON, writeJSON, toAppleDate, fromAppleDate } from '../model/persist'
import { handle } from '../router'
import { need } from '../context'
import { probe } from '../paths'
import { testEnv } from '../testhooks'
import { onPageSession, runtimes } from '../views/tabs'
import { allControllers, registerSlice, type WindowController } from '../views/window'
import { openInternal, scheme, tellPages } from './internal'
import { downloadsFolder, probeAnswers, said } from './prefs'
import { markAllSettings, settingsPart, showPanel, hidePanel, markSettings } from './slice'

/** downloads.json, as Loot.swift writes it: date in seconds since 2001;
 * `size` (bytes) is Oriel's, for the list. */
interface Keep { name: string; from: string; path: string; date: number; address?: string; size?: number }

interface Live {
  entry: DownloadEntry
  item: DownloadItem | null
  session: Session
  /** A private tab's: never listed, never kept. */
  shy: boolean
  /** The name a retry is numbered afresh from. */
  retryName: string
  /** When bytes last came in, for Stalled. */
  moved?: number
  /** The last sample the speed was measured from. */
  sampledAt?: number
  sampledBytes?: number
}

const live = new Map<ID, Live>()
/** The last one in: the button says so (arrow.down) until then, and goes
 * if nothing else keeps it (Fetches.settle, linger 5 s). */
let doneUntil = 0
let doneTimer: NodeJS.Timeout | null = null
const LINGER = 5000
let kept: Keep[] = []
let loaded = false
let started = 0
const open = new Set<ID>()
/** Downloads started from each window: its card shows for a few seconds on each (downloads.peek). */
const peeks = new Map<ID, number>()
/** Paths being written now, so two files of one name don't take the same one. */
const taken = new Set<string>()

function keptList(): Keep[] {
  if (!loaded) { loaded = true; kept = readJSON<Keep[]>('downloads.json', []).filter(k => k && typeof k.path === 'string') }
  return kept
}
function saveKept(): void { writeJSON('downloads.json', () => kept) }

const say = (text: string) => { said.push(text) }

/** Speed (bytes a second) and time left (seconds) of one download, from
 * Chromium's own rate where it gives one, else the bytes since the last
 * sample; smoothed, so the numbers don't jump with every packet. Nothing
 * while it isn't coming in (paused, failed, stalled). */
function measure(l: Live, now = Date.now()): void {
  const e = l.entry
  if (e.state !== 'downloading' || !l.item || e.stalled) { e.speed = e.state === 'downloading' && l.item ? 0 : undefined; e.left = undefined; l.sampledAt = undefined; return }
  if (l.sampledAt === undefined) { l.sampledAt = now; l.sampledBytes = e.received; return }
  const dt = (now - l.sampledAt) / 1000
  if (dt < 0.4) return
  let rate = 0
  try { rate = l.item.getCurrentBytesPerSecond() } catch {}
  if (!(rate > 0)) rate = Math.max(0, (e.received - (l.sampledBytes ?? e.received)) / dt)
  l.sampledAt = now
  l.sampledBytes = e.received
  e.speed = e.speed ? Math.round(e.speed * 0.65 + rate * 0.35) : Math.round(rate)
  e.left = e.total > 0 && e.speed > 0 ? Math.max(0, Math.round((e.total - e.received) / e.speed)) : undefined
}

/** Only the last part of a name a page gives: never a path out of the folder. */
export function fileName(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? ''
  return ['', '.', '..'].includes(last) ? 'download' : last
}

/** "report.pdf", then "report 2.pdf", "report 3.pdf" (Browser.free). */
export function freeName(name: string, folder: string): string {
  const ext = path.extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  let candidate = path.join(folder, name)
  for (let n = 2; existsSync(candidate) || taken.has(candidate); n++) candidate = path.join(folder, `${stem} ${n}${ext}`)
  return candidate
}

function canWrite(folder: string): boolean {
  try {
    mkdirSync(folder, { recursive: true })
    const probeFile = path.join(folder, `.oriel-${process.pid}-${Date.now()}`)
    writeFileSync(probeFile, '')
    unlinkSync(probeFile)
    return true
  } catch { return false }
}

/** The address kept with a download: http(s) only, without a user or password (Keep.address). */
function address(url: string): string | undefined {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    u.username = ''; u.password = ''
    return u.href
  } catch { return undefined }
}
const hostOf = (url: string) => { try { return new URL(url).hostname } catch { return '' } }

function tabOf(wc: WebContents | null | undefined): ID | null {
  if (!wc) return null
  for (const [id, rt] of runtimes) if (rt.contents === wc) return id
  return null
}

function windowFor(tab: ID | null): WindowController | null {
  const win = tab ? model.windowOf(tab) : null
  return (win && allControllers().find(c => c.record.id === win.id)) || allControllers().find(c => c.base.isFocused()) || allControllers()[0] || null
}

// arriving

/** A file already chosen for an address about to arrive: the page menu's
 * Save Image As… asks first (contextmenu module, studio/06 §5.3). */
export const placeFor = new Map<string, string>()

async function arrive(s: Session, item: DownloadItem, wc: WebContents | null): Promise<void> {
  const tab = tabOf(wc)
  const shy = !s.isPersistent() || !!(tab && model.tabs.get(tab)?.shy)
  const url = item.getURLChain()[0] ?? item.getURL()
  const retried = takeRetry(item)
  const name = fileName(retried ?? item.getFilename())
  const folder = downloadsFolder()
  const placed = placeFor.get(url)
  placeFor.delete(url)
  const asks = !placed && (!!model.pref<boolean>('downloads.ask') || !canWrite(folder))
  let file: string | null
  if (placed) file = placed
  else if (asks) {
    if (probe) file = probeAnswers.saveAs ?? null
    else {
      // The save sheet, opened at the downloads folder (Browser.askWhere).
      item.setSaveDialogOptions({ defaultPath: path.join(folder, name), properties: ['createDirectory', 'showOverwriteConfirmation'] })
      file = ''
    }
  } else file = freeName(name, folder)
  if (file === null) { item.cancel(); return }
  if (file) { item.setSavePath(file); taken.add(file) }
  const id = randomUUID()
  const entry: DownloadEntry = {
    id, name: file ? path.basename(file) : name, url: shy ? undefined : address(url), from: hostOf(url), path: file || undefined,
    received: 0, total: item.getTotalBytes(), state: 'downloading', canResume: false, canRetry: /^https?:/i.test(url) && item.getURLChain().length > 0,
    date: Date.now(),
  }
  live.set(id, { entry, item, session: s, shy, retryName: retried ?? name, moved: Date.now() })
  watchStalls()
  started++
  doneUntil = 0
  // The card shows by the button in the window it came from, for a few
  // seconds (Settings › Downloads › Show downloads as they start).
  if (model.pref<boolean>('downloads.peek') !== false) {
    const c = windowFor(tab)
    if (c) peeks.set(c.record.id, (peeks.get(c.record.id) ?? 0) + 1)
    // Windows closed since: their counts go.
    const ids = new Set(allControllers().map(w => w.record.id))
    for (const k of peeks.keys()) if (!ids.has(k)) { peeks.delete(k); cards.delete(k) }
  }
  say(`Downloading ${entry.name}`)
  item.on('updated', (_e, state) => {
    const before = entry.received
    entry.received = item.getReceivedBytes()
    const l = live.get(id)
    if (l && entry.received > before) { l.moved = Date.now(); entry.stalled = false }
    entry.total = item.getTotalBytes()
    if (!entry.path && item.getSavePath()) { entry.path = item.getSavePath(); entry.name = path.basename(entry.path) }
    // Cut off (the network, the server) is a failure that may resume, never
    // a pause: Paused is only ever what you asked for.
    const was = entry.state
    entry.state = state === 'interrupted' ? 'failed' : item.isPaused() ? 'paused' : 'downloading'
    if (entry.state === 'failed' && was !== 'failed') { say('Download failed'); settle(false) }
    entry.canResume = item.canResume()
    entry.error = state === 'interrupted' ? (entry.canResume ? 'The connection was lost.' : 'The download failed.') : undefined
    if (l) measure(l)
    if (entry.state === 'downloading') watchStalls()
    changed()
  })
  item.once('done', (_e, state) => {
    if (entry.path) taken.delete(entry.path)
    entry.received = item.getReceivedBytes()
    if (!entry.path && item.getSavePath()) { entry.path = item.getSavePath(); entry.name = path.basename(entry.path) }
    const l = live.get(id)
    if (l) l.item = null
    entry.speed = undefined
    entry.left = undefined
    if (state === 'completed') {
      live.delete(id)
      settle(true)
      if (entry.path) looked.delete(entry.path)
      if (entry.path && process.platform === 'win32') markDownloaded(entry.path, url)
      if (shy) say(`Saved ${entry.name}`)
      else {
        const list = keptList().filter(k => k.path !== entry.path)
        list.unshift({ name: entry.name, from: entry.from, path: entry.path ?? '', date: toAppleDate(Date.now()), ...(entry.url ? { address: entry.url } : {}), ...(entry.received > 0 ? { size: entry.received } : {}) })
        kept = list.slice(0, 50)
        saveKept()
        say(`Saved ${entry.name}`)
      }
      flash()
    } else if (state === 'cancelled') {
      live.delete(id)
      settle(false)
    } else {
      entry.state = 'failed'
      entry.canResume = false
      entry.error = 'The download failed.'
      settle(false)
      say('Download failed')
      // A private download that failed leaves nothing behind (06 §3.1).
      if (shy) { live.delete(id); if (entry.path) try { unlinkSync(entry.path) } catch {} }
    }
    changed()
  })
  changed()
}

/** Windows' mark of the web, as a browser's download wears it (06 §3.1):
 * Defender and SmartScreen check the file when it is first opened. */
function markDownloaded(file: string, url: string): void {
  try {
    if (existsSync(`${file}:Zone.Identifier`)) return
    const from = address(url)
    writeFileSync(`${file}:Zone.Identifier`, `[ZoneTransfer]\r\nZoneId=3\r\n${from ? `HostUrl=${from}\r\n` : ''}`)
  } catch {}
}

/** Retried downloads: the name each is numbered afresh from, by address. */
const retrying = new Map<string, string>()
/** The name a retried download asked for, whichever of its addresses (or
 * their written form) the retry was made with. */
function takeRetry(item: DownloadItem): string | undefined {
  for (const u of [...item.getURLChain(), item.getURL()]) {
    for (const k of [u, address(u)]) {
      if (k && retrying.has(k)) { const name = retrying.get(k); retrying.delete(k); return name }
    }
  }
  return undefined
}
/** Still Chromium's: cancelling it ends it and takes its part-file away. */
const unfinished = (item: DownloadItem | null) => !!item && item.getState() !== 'completed' && item.getState() !== 'cancelled'

onPageSession(s => s.on('will-download', (_e, item, wc) => { void arrive(s, item, wc) }))

// telling

let tellTimer: NodeJS.Timeout | null = null
/** What the taskbar was told last, for the bench. */
export const progressSaid: { value: number; mode: string }[] = []

function changed(): void {
  markAllSettings()
  for (const c of allControllers()) c.mark('downloads')
  if (tellTimer) return
  tellTimer = setTimeout(() => { tellTimer = null; tellPages('downloads', listed(), 'downloads'); taskbar() }, 50)
}

/** A download coming in: stopped and failed ones are no activity (Fetches.running). */
function running(): boolean {
  return [...live.values()].some(l => l.item && ['downloading', 'resuming', 'pausing'].includes(l.entry.state))
}

/** The last one in, the circle says so for 5 s, then goes; one that failed
 * with nothing else running takes it away at once (Fetches.settle). */
function settle(succeeded: boolean): void {
  if (running()) return
  if (doneTimer) { clearTimeout(doneTimer); doneTimer = null }
  if (!succeeded) { doneUntil = 0; return }
  doneUntil = Date.now() + LINGER
  doneTimer = setTimeout(() => { doneTimer = null; changed() }, LINGER + 20)
  doneTimer.unref?.()
}
const done = () => !running() && Date.now() < doneUntil

function progress(): number | null {
  const going = [...live.values()].filter(l => l.item && !['failed', 'completed'].includes(l.entry.state))
  if (!going.length) return -1
  if (going.some(l => !l.entry.total)) return null
  const total = going.reduce((n, l) => n + l.entry.total, 0)
  return total ? going.reduce((n, l) => n + l.entry.received, 0) / total : null
}

/** Everything coming in, summed on the taskbar button (studio/06 §3.2). */
function taskbar(): void {
  const going = [...live.values()].filter(l => l.item && !['failed', 'completed'].includes(l.entry.state))
  const p = progress()
  const mode = !going.length ? 'none' : p === null ? 'indeterminate' : going.every(l => l.entry.state === 'paused') ? 'paused' : 'normal'
  const value = !going.length ? -1 : p === null ? 2 : p
  const last = progressSaid[progressSaid.length - 1]
  if (last && last.value === value && last.mode === mode) return
  progressSaid.splice(0, progressSaid.length, { value, mode })
  for (const c of allControllers()) {
    try { c.base.setProgressBar(value, { mode: mode as 'none' | 'normal' | 'indeterminate' | 'paused' }) } catch {}
  }
}

// Stalled (Search 1.0.21): a download with nothing coming in for this long says so, and says
// Downloading again the moment bytes come. Looked at every 2 seconds while one is going.
const STALL = Number(testEnv('ORIEL_STALL_MS')) || 10_000
let stallTimer: NodeJS.Timeout | null = null
function watchStalls(): void {
  if (stallTimer) return
  stallTimer = setInterval(() => {
    let touched = false, going = false
    for (const l of live.values()) {
      if (!l.item) continue
      if (l.entry.state === 'downloading' || l.entry.stalled) going = true
      const stalled = l.entry.state === 'downloading' && Date.now() - (l.moved ?? Date.now()) >= STALL
      if (stalled !== !!l.entry.stalled) { l.entry.stalled = stalled; touched = true }
      // Nothing came in for a while: the speed falls, and the time left goes.
      if (l.entry.state === 'downloading' && l.entry.speed && Date.now() - (l.moved ?? Date.now()) >= 2500) {
        l.entry.speed = Math.round(l.entry.speed * 0.4)
        if (l.entry.speed < 512) { l.entry.speed = 0; l.entry.left = undefined }
        else if (l.entry.total > 0) l.entry.left = Math.round((l.entry.total - l.entry.received) / l.entry.speed)
        touched = true
      }
    }
    if (touched) changed()
    // Nothing coming in: no more looks until the next download.
    if (!going && stallTimer) { clearInterval(stallTimer); stallTimer = null }
  }, 1000)
  stallTimer.unref?.()
}

/** A file in: the taskbar button flashes, as the Mac's Downloads stack bounces. */
function flash(): void {
  if (probe || process.platform !== 'win32') return
  for (const c of allControllers()) if (!c.base.isFocused()) c.base.flashFrame(true)
}

/** Is a kept file still there, and how big: asked of the disk in the
 * background, at most every few seconds a file (the list is made again many
 * times a second while a download comes in, and a slow or network drive must
 * never hold the window). What is known meanwhile is said; news re-tell the list. */
const looked = new Map<string, { at: number; there: boolean; size?: number; asking?: boolean }>()
function lookAt(file: string): { there: boolean; size?: number } {
  const was = looked.get(file)
  if (was && (was.asking || Date.now() - was.at < 3000)) return was
  const now = { at: Date.now(), there: was?.there ?? true, size: was?.size, asking: true }
  looked.set(file, now)
  if (looked.size > 200) looked.delete(looked.keys().next().value!)
  fsp.stat(file).then(st => ({ there: st.isFile(), size: st.size }), () => ({ there: false, size: undefined })).then(r => {
    const news = r.there !== now.there || r.size !== now.size
    Object.assign(now, r, { at: Date.now(), asking: false })
    if (news) changed()
  })
  return now
}

function listed(): { current: DownloadEntry[]; completed: DownloadEntry[]; folder: string; folderName: string } {
  const current = [...live.values()].filter(l => !l.shy).map(l => ({ ...l.entry }))
  const completed = keptList().map((k): DownloadEntry => {
    const seen = k.path ? lookAt(k.path) : { there: false }
    return {
      id: `kept:${k.path}`, name: k.name, from: k.from, path: k.path, url: k.address, received: 0, total: 0, state: 'completed',
      canResume: false, canRetry: false, date: fromAppleDate(k.date), there: seen.there, size: seen.there ? seen.size : k.size,
    }
  })
  return { current, completed, folder: downloadsFolder(), folderName: path.basename(downloadsFolder()) }
}

/** What is coming in, summed: for the button's tooltip and the card's head. */
function summary(): { active: number; speed: number; left: number | null } {
  const going = [...live.values()].filter(l => l.item && !l.shy && ['downloading', 'resuming', 'pausing'].includes(l.entry.state))
  const speed = going.reduce((n, l) => n + (l.entry.speed ?? 0), 0)
  const known = going.length > 0 && going.every(l => l.entry.total > 0)
  const rest = going.reduce((n, l) => n + Math.max(0, l.entry.total - l.entry.received), 0)
  return { active: going.length, speed, left: known && speed > 0 ? Math.round(rest / speed) : null }
}

/** The skeleton's DownloadView, for any module drawing a list of its own. */
// Made from what's kept, without asking the disk whether each file is still
// there (the view has no place for it): it is made on every change.
registerSlice('downloads', (): DownloadView[] => [
  ...[...live.values()].filter(l => !l.shy).map(({ entry: e }): DownloadView => ({ id: e.id, name: e.name, url: e.url ?? '', received: e.received, total: e.total, state: e.state === 'failed' ? 'interrupted' : 'progressing', path: e.path })),
  ...keptList().map((k): DownloadView => ({ id: `kept:${k.path}`, name: k.name, url: k.address ?? '', received: 0, total: 0, state: 'completed', path: k.path })),
])

settingsPart(c => ({
  downloadsOpen: open.has(c.record.id),
  // FetchDoor.shows: a download coming in or just in, one stopped or failed
  // still listed, Always show the downloads button, or its list hanging.
  // Finished ones in the list don't keep it (Fetching.swift:699-701).
  downloadsButton: live.size > 0 || done() || !!model.pref<boolean>('downloads.button') || open.has(c.record.id),
  downloadsProgress: progress(),
  downloadsDone: done(),
  downloadsStarted: started,
  downloadsPeek: peeks.get(c.record.id) ?? 0,
  downloadsNow: summary(),
}))

// Always show the downloads button, ticked or unticked: the button at once.
model.on('window-changed', (_id: string, slices: string[]) => { if (slices.includes('prefs')) markAllSettings() })

// commands

function find(id: ID): { live?: Live; keep?: Keep } {
  const l = live.get(id)
  if (l) return { live: l }
  const keep = id.startsWith('kept:') ? keptList().find(k => `kept:${k.path}` === id) : undefined
  return { keep }
}

/** Opening a file or a folder: never in a test world, where it would open
 * on the screen of whoever works beside it. */
function openPath(p: string, how: 'open' | 'reveal'): void {
  if (probe) { probeAnswers.opened.push(`${how}:${p}`); return }
  if (how === 'reveal') shell.showItemInFolder(p)
  else void shell.openPath(p)
}

handle('download.list', () => listed())
handle('download.pause', ({ id }) => { const l = live.get(id); if (l?.item && !l.item.isPaused()) { l.item.pause(); l.entry.state = 'paused'; l.entry.canResume = l.item.canResume(); changed() } })
handle('download.resume', ({ id }) => {
  const l = live.get(id)
  if (!l?.item || !l.item.canResume()) return
  l.entry.state = 'resuming'
  l.entry.error = undefined
  // Counted from now: a download paused a while isn't Stalled the moment it resumes.
  l.moved = Date.now()
  l.entry.stalled = false
  l.item.resume()
  watchStalls()
  changed()
})
handle('download.retry', ({ id }) => {
  // From the beginning, numbered afresh from the name asked for (Browser.swift:9838).
  const l = live.get(id)
  if (!l?.entry.url && !l?.item) return
  // From the address the download started at: the last one of a redirect is often
  // a link that only lasts a while (a store's, a cloud drive's).
  const url = l.item?.getURLChain()[0] ?? l.item?.getURL() ?? l.entry.url!
  live.delete(id)
  // What was left of the broken one goes, and its name with it.
  if (unfinished(l.item)) l.item!.cancel()
  if (l.entry.path) { taken.delete(l.entry.path); try { if (l.entry.state !== 'completed') unlinkSync(l.entry.path) } catch {} }
  retrying.set(url, l.retryName)
  l.session.downloadURL(url)
  changed()
})
handle('download.cancel', ({ id }) => {
  const l = live.get(id)
  if (!l) return
  if (unfinished(l.item)) l.item!.cancel()
  live.delete(id)
  changed()
})
handle('download.remove', ({ id }) => {
  const { live: l, keep } = find(id)
  if (l) { if (unfinished(l.item)) l.item!.cancel(); live.delete(id) }
  if (keep) { kept = keptList().filter(k => k !== keep); saveKept() }
  changed()
})
handle('download.clear', () => { kept = []; saveKept(); changed() })
handle('download.open', ({ id }) => { const { live: l, keep } = find(id); const p = keep?.path ?? (l?.entry.state === 'completed' ? l.entry.path : undefined); if (p && existsSync(p)) openPath(p, 'open') })
handle('download.reveal', ({ id }) => { const { live: l, keep } = find(id); const p = keep?.path ?? l?.entry.path; if (p) openPath(p, 'reveal') })
handle('download.copy', ({ id }) => { const { live: l, keep } = find(id); const a = keep?.address ?? l?.entry.url; if (a) clipboard.writeText(a) })
handle('download.folder', () => openPath(downloadsFolder(), 'open'))

/** Dragged out of the list as its file, with the file's icon under the
 * pointer: onto a page to upload it, or into File Explorer or another app
 * (Search 1.0.20, DownloadDragOut). Only a finished download whose file is
 * still there; the drag starts from the page the row is in. */
const dragged: string[] = []
handle('download.drag', async ({ id, from }, ctx) => {
  const { keep } = find(id)
  const file = keep?.path
  if (!file || !existsSync(file)) return { dragged: false }
  const c = need(ctx)
  const tab = c.record.active[c.record.space]
  const wc = from === 'card' ? c.overlay.webContents : (tab && model.tabs.get(tab)?.internal === 'downloads' ? runtimes.get(tab)?.contents : null)
  if (!wc || wc.isDestroyed()) return { dragged: false }
  // A test world never starts a drag the system would hold the pointer for.
  if (probe) { dragged.push(file); return { dragged: true } }
  let icon = await app.getFileIcon(file, { size: 'normal' }).catch(() => null)
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromDataURL(BLANK_ICON)
  wc.startDrag({ file, icon })
  return { dragged: true }
})
/** A plain square, should Windows have no icon for the file. */
const BLANK_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGklEQVR42mP8z8DwnxGIwYBRdAWjBgwPAwAiNQ8BHNUIrwAAAABJRU5ErkJggg=='

/** History › Clear History takes the addresses the list kept (Shared.forgetDownloadAddresses). */
export function forgetDownloadAddresses(): void {
  let touched = false
  for (const k of keptList()) if (k.address) { delete k.address; touched = true }
  for (const l of live.values()) if (l.entry.url) { l.entry.url = undefined }
  if (touched) saveKept()
  changed()
}

/** Downloads, wherever Settings › Downloads › Open Downloads says; the
 * button toggles what it opened, Ctrl+J only ever shows (Browser.showDownloads). */
handle('downloads.show', async ({ toggle, anchor, peek }, ctx) => {
  const c = need(ctx)
  const where = model.pref<string>('downloads.open')
  // A download starting (peek) floats the card by the button whichever way
  // Downloads opens, and never over anything else floating there.
  if (peek) {
    if (open.has(c.record.id)) return { open: true }
    if (c.overlayLayer.kind !== 'none') return { open: false }
  } else if (where !== 'popover' && where !== 'panel') {
    // The side panel isn't there yet: "In the side panel" floats by the button.
    return { tab: await openInternal(c, `${scheme}://downloads`) }
  }
  const on = peek ? true : toggle ? !open.has(c.record.id) : true
  if (on) {
    open.add(c.record.id)
    watchCards()
    const b = c.base.getContentBounds()
    // Bigger with Oriel's text size (Settings › Appearance).
    const width = Math.round(372 * textScale()), height = Math.round(440 * textScale())
    const x = Math.max(8, Math.min(b.width - width - 8, Math.round((anchor?.x ?? 120) - 26)))
    const top = (anchor?.y ?? b.height) < b.height / 2
    const y = top ? Math.round((anchor?.y ?? 0) + 26 + 6) : Math.max(8, Math.round((anchor?.y ?? b.height - 40) - height - 6))
    // Its edge by the button stays put as the card fits what it holds (downloads.fit).
    cards.set(c.record.id, { x, width, top, edge: top ? y : y + height, most: height })
    showPanel(c, 'settings.downloads', { x, y, width, height }, { peek: !!peek })
  } else {
    open.delete(c.record.id)
    hidePanel(c, 'settings.downloads')
  }
  markSettings(c)
  return { open: on }
})

/** Where each window's card is: its edge by the button, and the most room it has. */
const cards = new Map<ID, { x: number; width: number; top: boolean; edge: number; most: number }>()

/** The card as tall as what it holds, between a little and the room it was given. */
handle('downloads.fit', ({ height }, ctx) => {
  const c = need(ctx)
  const at = cards.get(c.record.id)
  const l = c.overlayLayer
  if (!at || !open.has(c.record.id) || !(l.kind === 'panel' && l.name === 'settings.downloads')) return
  const h = Math.round(Math.min(at.most, Math.max(Math.round(120 * textScale()), Number(height) || 0)))
  c.setOverlayRegion({ x: at.x, y: at.top ? at.edge : at.edge - h, width: at.width, height: h }, false)
})

/** The card put away (a peek's time up, or its close button). */
handle('downloads.hide', (_args, ctx) => {
  const c = need(ctx)
  if (!open.has(c.record.id)) return
  open.delete(c.record.id)
  hidePanel(c, 'settings.downloads')
  markSettings(c)
})

/** Downloads in a tab, from the card (whichever way Settings opens them). */
handle('downloads.page', async (_args, ctx) => {
  const c = need(ctx)
  if (open.has(c.record.id)) { open.delete(c.record.id); hidePanel(c, 'settings.downloads'); markSettings(c) }
  return { tab: await openInternal(c, `${scheme}://downloads`) }
})

// The card goes when anything else takes the overlay's place: looked at
// while a card is open, and not otherwise.
let cardTimer: NodeJS.Timeout | null = null
function watchCards(): void {
  if (cardTimer) return
  cardTimer = setInterval(() => {
    for (const c of allControllers()) {
      if (!open.has(c.record.id)) continue
      const l = c.overlayLayer
      if (!(l.kind === 'panel' && l.name === 'settings.downloads')) { open.delete(c.record.id); markSettings(c) }
    }
    if (!open.size && cardTimer) { clearInterval(cardTimer); cardTimer = null }
  }, 500)
  cardTimer.unref?.()
}

/** For the bench: the save dialog's answer in a test world. */
export function downloadsState() { return { ...listed(), progress: progressSaid.slice(-1)[0] ?? null, live: live.size, dragged: dragged.slice(-10) } }
void dialog
