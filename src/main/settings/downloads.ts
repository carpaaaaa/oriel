// Downloads (studio/06 §3.1-3.2; Browser.swift:9806-10033, Fetching.swift,
// Recall.swift, Loot.swift): where a file goes ("name 2.ext", never "(1)"),
// asking where if Settings says so, the list (downloads.json, 50 at most,
// the Mac's format), pause, resume, retry, cancel, open, show in the folder,
// the button's progress, and the taskbar's (setProgressBar), which stands in
// for the Mac's progress on the file in the Dock.

import { clipboard, dialog, shell, type DownloadItem, type Session, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DownloadEntry } from '../../shared/modules/settings'
import type { DownloadView, ID } from '../../shared/state'
import { model } from '../model/model'
import { readJSON, writeJSON, toAppleDate, fromAppleDate } from '../model/persist'
import { handle } from '../router'
import { need } from '../context'
import { probe } from '../paths'
import { onPageSession, runtimes } from '../views/tabs'
import { allControllers, registerSlice, type WindowController } from '../views/window'
import { openInternal, scheme, tellPages } from './internal'
import { downloadsFolder, probeAnswers, said } from './prefs'
import { markAllSettings, settingsPart, showPanel, hidePanel, markSettings } from './slice'

/** downloads.json, as Loot.swift writes it: date in seconds since 2001. */
interface Keep { name: string; from: string; path: string; date: number; address?: string }

interface Live {
  entry: DownloadEntry
  item: DownloadItem | null
  session: Session
  /** A private tab's: never listed, never kept. */
  shy: boolean
  /** The name a retry is numbered afresh from. */
  retryName: string
}

const live = new Map<ID, Live>()
let kept: Keep[] = []
let loaded = false
let started = 0
const open = new Set<ID>()
/** Paths being written now, so two files of one name don't take the same one. */
const taken = new Set<string>()

function keptList(): Keep[] {
  if (!loaded) { loaded = true; kept = readJSON<Keep[]>('downloads.json', []).filter(k => k && typeof k.path === 'string') }
  return kept
}
function saveKept(): void { writeJSON('downloads.json', () => kept) }

const say = (text: string) => { said.push(text) }

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

async function arrive(s: Session, item: DownloadItem, wc: WebContents | null): Promise<void> {
  const tab = tabOf(wc)
  const shy = !s.isPersistent() || !!(tab && model.tabs.get(tab)?.shy)
  const url = item.getURLChain()[0] ?? item.getURL()
  const retried = retrying.get(url)
  retrying.delete(url)
  const name = fileName(retried ?? item.getFilename())
  const folder = downloadsFolder()
  const asks = !!model.pref<boolean>('downloads.ask') || !canWrite(folder)
  let file: string | null
  if (asks) {
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
  live.set(id, { entry, item, session: s, shy, retryName: retried ?? name })
  started++
  say(`Downloading ${entry.name}`)
  item.on('updated', (_e, state) => {
    entry.received = item.getReceivedBytes()
    entry.total = item.getTotalBytes()
    if (!entry.path && item.getSavePath()) { entry.path = item.getSavePath(); entry.name = path.basename(entry.path) }
    entry.state = state === 'interrupted' ? (item.canResume() ? 'paused' : 'failed') : item.isPaused() ? 'paused' : 'downloading'
    entry.canResume = item.canResume()
    changed()
  })
  item.once('done', (_e, state) => {
    if (entry.path) taken.delete(entry.path)
    entry.received = item.getReceivedBytes()
    if (!entry.path && item.getSavePath()) { entry.path = item.getSavePath(); entry.name = path.basename(entry.path) }
    const l = live.get(id)
    if (l) l.item = null
    if (state === 'completed') {
      live.delete(id)
      if (entry.path && process.platform === 'win32') markDownloaded(entry.path, url)
      if (shy) say(`Saved ${entry.name}`)
      else {
        const list = keptList().filter(k => k.path !== entry.path)
        list.unshift({ name: entry.name, from: entry.from, path: entry.path ?? '', date: toAppleDate(Date.now()), ...(entry.url ? { address: entry.url } : {}) })
        kept = list.slice(0, 50)
        saveKept()
        say(`Saved ${entry.name}`)
      }
      flash()
    } else if (state === 'cancelled') {
      live.delete(id)
    } else {
      entry.state = 'failed'
      entry.canResume = false
      entry.error = 'The download failed.'
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

const retrying = new Map<string, string>()

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
  progressSaid.push({ value, mode })
  for (const c of allControllers()) {
    try { c.base.setProgressBar(value, { mode: mode as 'none' | 'normal' | 'indeterminate' | 'paused' }) } catch {}
  }
}

/** A file in: the taskbar button flashes, as the Mac's Downloads stack bounces. */
function flash(): void {
  if (probe || process.platform !== 'win32') return
  for (const c of allControllers()) if (!c.base.isFocused()) c.base.flashFrame(true)
}

function listed(): { current: DownloadEntry[]; completed: DownloadEntry[]; folder: string; folderName: string } {
  const current = [...live.values()].filter(l => !l.shy).map(l => ({ ...l.entry }))
  const completed = keptList().map((k): DownloadEntry => ({
    id: `kept:${k.path}`, name: k.name, from: k.from, path: k.path, url: k.address, received: 0, total: 0, state: 'completed',
    canResume: false, canRetry: false, date: fromAppleDate(k.date), there: existsSync(k.path),
  }))
  return { current, completed, folder: downloadsFolder(), folderName: path.basename(downloadsFolder()) }
}

/** The skeleton's DownloadView, for any module drawing a list of its own. */
registerSlice('downloads', (): DownloadView[] => {
  const l = listed()
  return [
    ...l.current.map((e): DownloadView => ({ id: e.id, name: e.name, url: e.url ?? '', received: e.received, total: e.total, state: e.state === 'failed' ? 'interrupted' : 'progressing', path: e.path })),
    ...l.completed.map((e): DownloadView => ({ id: e.id, name: e.name, url: e.url ?? '', received: e.received, total: e.total, state: 'completed', path: e.path })),
  ]
})

settingsPart(c => ({
  downloadsOpen: open.has(c.record.id),
  downloadsButton: live.size > 0 || keptList().length > 0 || !!model.pref<boolean>('downloads.button') || open.has(c.record.id),
  downloadsProgress: progress(),
  downloadsStarted: started,
}))

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
  l.item.resume()
  changed()
})
handle('download.retry', ({ id }) => {
  // From the beginning, numbered afresh from the name asked for (Browser.swift:9838).
  const l = live.get(id)
  if (!l?.entry.url && !l?.item) return
  const url = l.item?.getURL() ?? l.entry.url!
  live.delete(id)
  // What was left of the broken one goes, and its name with it.
  if (l.item && l.item.getState() !== 'completed') l.item.cancel()
  if (l.entry.path) { taken.delete(l.entry.path); try { if (l.entry.state !== 'completed') unlinkSync(l.entry.path) } catch {} }
  retrying.set(url, l.retryName)
  l.session.downloadURL(url)
  changed()
})
handle('download.cancel', ({ id }) => {
  const l = live.get(id)
  if (!l) return
  if (l.item && l.item.getState() === 'progressing') l.item.cancel()
  live.delete(id)
  changed()
})
handle('download.remove', ({ id }) => {
  const { live: l, keep } = find(id)
  if (l) { if (l.item && l.item.getState() === 'progressing') l.item.cancel(); live.delete(id) }
  if (keep) { kept = keptList().filter(k => k !== keep); saveKept() }
  changed()
})
handle('download.clear', () => { kept = []; saveKept(); changed() })
handle('download.open', ({ id }) => { const { live: l, keep } = find(id); const p = keep?.path ?? (l?.entry.state === 'completed' ? l.entry.path : undefined); if (p && existsSync(p)) openPath(p, 'open') })
handle('download.reveal', ({ id }) => { const { live: l, keep } = find(id); const p = keep?.path ?? l?.entry.path; if (p) openPath(p, 'reveal') })
handle('download.copy', ({ id }) => { const { live: l, keep } = find(id); const a = keep?.address ?? l?.entry.url; if (a) clipboard.writeText(a) })
handle('download.folder', () => openPath(downloadsFolder(), 'open'))

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
handle('downloads.show', async ({ toggle, anchor }, ctx) => {
  const c = need(ctx)
  const where = model.pref<string>('downloads.open')
  if (where !== 'popover' && where !== 'panel') {
    // The side panel isn't there yet: "In the side panel" floats by the button.
    return { tab: await openInternal(c, `${scheme}://downloads`) }
  }
  const on = toggle ? !open.has(c.record.id) : true
  if (on) {
    open.add(c.record.id)
    const b = c.base.getContentBounds()
    const width = 340, height = 420
    const x = Math.max(8, Math.min(b.width - width - 8, Math.round((anchor?.x ?? 120) - 26)))
    const y = Math.max(8, Math.round((anchor?.y ?? b.height - 40) - height - 6))
    showPanel(c, 'settings.downloads', { x, y, width, height })
  } else {
    open.delete(c.record.id)
    hidePanel(c, 'settings.downloads')
  }
  markSettings(c)
  return { open: on }
})

// The card goes when anything else takes the overlay's place.
setInterval(() => {
  for (const c of allControllers()) {
    if (!open.has(c.record.id)) continue
    const l = c.overlayLayer
    if (!(l.kind === 'panel' && l.name === 'settings.downloads')) { open.delete(c.record.id); markSettings(c) }
  }
}, 500).unref?.()

/** For the bench: the save dialog's answer in a test world. */
export function downloadsState() { return { ...listed(), progress: progressSaid.slice(-1)[0] ?? null, live: live.size } }
void dialog
