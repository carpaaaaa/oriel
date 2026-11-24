// Settings › Tabs › Memory (studio/01 §9.24, §9.32-§9.36; Closing.swift,
// Archive.swift):
//  - Close tabs you leave alone (`tabs.close.after`, hours; 0 never): a tab
//    not looked at for its time closes as ⌘W would close it, and goes into
//    the archive (archive.json, thirty days, five hundred at most), which
//    History › Archived Tabs… (oriel://archive) lists. What stays is what
//    you said to keep: pinned, named, grouped, a site kept awake, the page on
//    screen, a private tab, and one busy (sound, a call, a download, typing).
//    The time counts from when you last left it, or let go of it, and goes on
//    while Oriel is quit (touched and letGo are in the session).
//  - Keep selected sites awake (`tabs.awakeSites`): in a tab's menu, since
//    Oriel has no site card yet.

import { randomUUID } from 'node:crypto'
import { handle } from '../router'
import { model, type TabRecord, type WindowRecord } from '../model/model'
import { readJSON, writeJSON } from '../model/persist'
import { need } from '../context'
import { runtimes } from '../views/tabs'
import { benchRequest } from '../bench/server'
import { allowPage, openInternal, scheme, tellPages } from '../settings/internal'
import { holdsTyping, keptAwake, shyAwake, siteOf } from './sleep'

/** How long a tab is left before it closes, in ms; null when never.
 * `close.after` (seconds) stands in for the chosen time, for the tests. */
export function closeAfter(): number | null {
  const hours = Number(model.pref('tabs.close.after') ?? 0)
  if (![12, 24, 168, 720].includes(hours)) return null
  const forced = Number(model.pref('close.after') ?? 0)
  return (forced > 0 ? forced : hours * 3600) * 1000
}

const lastLeft = (t: TabRecord) => Math.max(t.touched ?? 0, t.letGo ?? 0)

/** Why a tab stays open however long it is left (Browser.stays(because:)). */
export function stays(t: TabRecord): string | null {
  if (model.onScreen(t.id)) return 'on screen'
  if (t.pinID) return 'pinned'
  if (t.name) return 'named'
  if (t.groupID) return 'in a group'
  if (t.shy) return 'private'
  if (t.bench) return 'a bench tab'
  if (t.empty) return 'blank'
  if (keptAwake(t)) return 'kept awake for this site'
  if (t.audible) return 'playing sound'
  if (t.capturing) return 'on a call'
  if ((t.downloads ?? 0) > 0) return 'downloading'
  for (const w of model.windows.values()) {
    const front = w.active[w.space]
    if (front && model.tabs.get(front)?.opener === t.id) return 'the page on screen came from it'
  }
  return null
}

// the archive (Archive.swift): archive.json, newest first, dates in ISO 8601

interface Archived { id: string; url: string; title: string; closed: string }
const lasts = 30 * 86_400_000
const cap = 500

function trimmed(list: Archived[], now = Date.now()): Archived[] {
  return list.filter(a => Date.parse(a.closed) >= now - lasts).sort((a, b) => Date.parse(b.closed) - Date.parse(a.closed)).slice(0, cap)
}

let archive: Archived[] = []
let loaded = false
function archived(): Archived[] {
  if (!loaded) {
    loaded = true
    const raw = readJSON<unknown>('archive.json', [])
    archive = trimmed((Array.isArray(raw) ? raw : []).filter((a): a is Archived =>
      !!a && typeof a.url === 'string' && typeof a.title === 'string' && typeof a.closed === 'string' && !Number.isNaN(Date.parse(a.closed)))
      .map(a => ({ id: typeof a.id === 'string' ? a.id.toUpperCase() : randomUUID().toUpperCase(), url: a.url, title: a.title, closed: a.closed })))
  }
  return archive
}

function saveArchive(): void {
  writeJSON('archive.json', () => archive, 200)
  tellPages('archive', listArchive(''), 'archive')
}

/** Foundation's .iso8601: seconds, no fraction, Z. */
const iso = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z')

/** A tab Oriel closed by itself; a page already there moves to the top. */
export function archiveTab(t: TabRecord): void {
  if (t.shy || t.internal || !/^(https?|file):/i.test(t.url)) return
  const list = archived().filter(a => a.url !== t.url)
  list.unshift({ id: randomUUID().toUpperCase(), url: t.url, title: t.title, closed: iso(Date.now()) })
  archive = trimmed(list)
  saveArchive()
}

function listArchive(hunt: string): Archived[] {
  const words = hunt.toLowerCase().split(/\s+/).filter(Boolean)
  return trimmed(archived()).filter(a => words.every(w => `${a.title} ${a.url}`.toLowerCase().includes(w)))
}

// closing what was left alone

let closing = false

/** Every tab left past its time, in every row of every window: at launch,
 * going to a space, and with each look for tabs to sleep. */
export async function closeLeftAlone(): Promise<string[]> {
  const wait = closeAfter()
  if (wait === null || closing) return []
  closing = true
  const closed: string[] = []
  try {
    const since = Date.now() - wait
    for (const win of [...model.windows.values()]) {
      if (win.shy) continue
      const due = Object.values(win.tabs).flat().map(id => model.tabs.get(id)!).filter(t => t && lastLeft(t) <= since && !stays(t))
      const going = new Set(due.map(t => t.id))
      const taken = new Set<string>()
      for (const t of due) {
        if (taken.has(t.id)) continue
        // A Split View pair is one: both halves due, or neither goes.
        const pair = (win.splitsBy[t.space] ?? []).find(s => s.tabs.includes(t.id))
        if (pair && !pair.tabs.every(id => going.has(id))) continue
        const together = pair ? due.filter(x => pair.tabs.includes(x.id)) : [t]
        together.forEach(x => taken.add(x.id))
        if (await retire(win, together, since)) closed.push(...together.map(x => x.id))
      }
    }
  } finally {
    closing = false
  }
  return closed
}

/** Each page asked whether it holds something typed, then all looked at
 * again, since you may have gone back to one meanwhile. */
async function retire(win: WindowRecord, together: TabRecord[], since: number): Promise<boolean> {
  for (const t of together) if (runtimes.get(t.id)?.awake && (await holdsTyping(t.id))) return false
  if (closeAfter() === null) return false
  const now = together.map(t => model.tabs.get(t.id))
  if (now.some(t => !t || lastLeft(t) > since || stays(t))) return false
  for (const t of now as TabRecord[]) {
    archiveTab(t)
    if (t.space === win.space) model.close(win, t.id)
    else model.closeParked(win, t.id)
  }
  return true
}

// With each look for tabs to sleep: once a minute (Sleep.swift's timer).
setInterval(() => void closeLeftAlone(), 60_000).unref?.()

// At launch, before anyone looks: last night's due tabs go (Browser.init).
let first = true
model.on('window-opened', () => { if (first) { first = false; setImmediate(() => void closeLeftAlone()) } })
model.on('space-changed', () => setImmediate(() => void closeLeftAlone()))

// commands: the archive's page, and keeping a site awake

handle('history.archive', async (_a, ctx) => { await openInternal(need(ctx), `${scheme}://archive`) })

allowPage('archive', { commands: ['archive.list', 'archive.reopen', 'archive.remove', 'archive.clear'] })

handle('archive.list', ({ query }) => ({ tabs: listArchive(query ?? '') }))
handle('archive.reopen', ({ id }, ctx) => {
  const a = archived().find(x => x.id === id)
  if (!a) return null
  archive = archive.filter(x => x.id !== id)
  saveArchive()
  const c = need(ctx)
  return model.open(c.record, a.url, { foreground: true }).id
})
handle('archive.remove', ({ id }) => { archive = archived().filter(x => x.id !== id); saveArchive() })
handle('archive.clear', () => { archived(); archive = []; saveArchive() })

/** Keep This Site Awake: never asleep, never closed by Oriel (§9.24). */
handle('tab.keepAwake', ({ id, on }) => {
  const t = model.tabs.get(id)
  const site = t && siteOf(t.url)
  if (!t || !site) return
  if (t.shy) {
    const set = shyAwake.get(t.id) ?? new Set<string>()
    if (on) set.add(site); else set.delete(site)
    shyAwake.set(t.id, set)
  } else {
    const sites = new Set(model.pref<string[]>('tabs.awakeSites') ?? [])
    if (on) sites.add(site); else sites.delete(site)
    model.setPref('tabs.awakeSites', sites.size ? [...sites].sort() : undefined)
  }
  model.updateTab(id, { awake: on || undefined })
})
model.on('tab-closed', (id: string) => shyAwake.delete(id))

benchRequest('settingsb.closeLeftAlone', async () => ({ closed: await closeLeftAlone() }))
benchRequest('settingsb.stays', req => { const t = model.tabs.get(String(req.id)); return { reason: t ? stays(t) : 'gone' } })
benchRequest('settingsb.archive', () => ({ archive: archived() }))
