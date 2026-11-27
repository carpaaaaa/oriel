// Downloads: in a tab (oriel://downloads), as the card floating by the
// button, and the button itself at the column's foot (Recall.swift:272,
// DownloadsFloat.swift, Fetching.swift:658; studio/06 §3.2). Each file
// coming in says, at a glance, how far it is (a bar the row's width and the
// percent), how fast it comes and how long is left; the card's head and the
// button's tooltip say the same for everything at once. A download starting
// shows the card for a few seconds (downloads.peek), unless the pointer
// stays on it.

import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import type { DownloadEntry } from '../../shared/modules/settings'
import type { OverlayLayer } from '../../shared/state'
import { state, cmd } from '../lib/store'
import { call, onUpdate } from './bridge'
import { Caption, Card, Pill, PlatePage } from './controls'
import { Symbol } from './symbols'

export interface Listed { current: DownloadEntry[]; completed: DownloadEntry[]; folder: string; folderName: string }

/** ByteCountFormatter's file style, as the Mac writes sizes. */
export function bytes(n: number): string {
  if (n < 1000) return `${n} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1000, u = 0
  // The unit from the number as written: 999,600 bytes is 1 MB, never 1000 KB.
  const shown = (x: number, unit: number) => (x >= 100 || unit === 0 ? Math.round(x) : Number(x.toFixed(1)))
  while (u < units.length - 1 && (v >= 1000 || shown(v, u) >= 1000)) { v /= 1000; u++ }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`
}

/** A speed: "850 KB/s", "2.4 MB/s". */
export function rate(n: number): string {
  if (n < 1000) return `${Math.round(n)} B/s`
  return `${bytes(n)}/s`
}

/** Time left: "a few seconds left", "14 s left", "3 min left", "1 h 20 min left". */
export function timeLeft(s: number): string {
  const secs = Math.round(s)
  if (secs < 5) return 'a few seconds left'
  if (secs < 60) return `${secs} s left`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min left`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h} h ${m} min left` : `${h} h left`
}

/** When.said: "just now", "5 minutes ago", "Yesterday", or the date. */
export function when(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) { const m = Math.round(s / 60); return m === 1 ? '1 minute ago' : `${m} minutes ago` }
  if (s < 86400) { const h = Math.round(s / 3600); return h === 1 ? '1 hour ago' : `${h} hours ago` }
  if (s < 172800) return 'Yesterday'
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** The kind of file, from its name: its tile's label and colour. */
const KINDS: [RegExp, string][] = [
  [/^(zip|rar|7z|tar|gz|tgz|bz2|xz|zst|cab|iso|img|dmg)$/, 'archive'],
  [/^(exe|msi|msix|appx|msixbundle|bat|cmd|ps1|apk)$/, 'app'],
  [/^(png|jpe?g|gif|webp|avif|heic|bmp|svg|ico|tiff?)$/, 'picture'],
  [/^(mp4|mkv|mov|avi|webm|m4v|wmv)$/, 'video'],
  [/^(mp3|wav|flac|m4a|aac|ogg|opus|wma)$/, 'sound'],
  [/^(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|md|csv|epub)$/, 'document'],
]
function fileKind(name: string): { label: string; kind: string } {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : ''
  const kind = KINDS.find(([re]) => re.test(ext))?.[1] ?? 'other'
  return { label: ext && ext.length <= 4 ? ext.toUpperCase() : 'FILE', kind }
}

function Tile(p: { name: string; gone?: boolean }) {
  const k = () => fileKind(p.name)
  return <span class="dl-tile" data-kind={k().kind} classList={{ gone: p.gone }} aria-hidden="true">{k().label}</span>
}

/** One of a row's round buttons, with what it does in its tooltip. */
function Act(p: { name: string; icon: string; label: string; act: () => void; red?: boolean }) {
  return (
    <button class="dl-act" classList={{ red: p.red }} data-act={p.name} title={p.label} aria-label={p.label}
      onClick={e => { e.stopPropagation(); p.act() }}>
      <Symbol name={p.icon} size={11} weight="medium" />
    </button>
  )
}

const fractionOf = (e: DownloadEntry) => (e.total > 0 ? Math.min(1, Math.max(0, e.received / e.total)) : null)

/** The line under a file coming in: how much, how fast, how long. */
function liveStatus(e: DownloadEntry): string {
  const amount = e.total > 0 ? `${bytes(e.received)} of ${bytes(e.total)}` : `${bytes(e.received)} so far`
  switch (e.state) {
    case 'downloading': {
      if (e.stalled) return `Stalled, waiting for the server · ${amount}`
      if (e.speed === undefined) return `Starting… · ${amount}`
      return [amount, e.speed > 0 ? rate(e.speed) : null, e.left !== undefined ? timeLeft(e.left) : null].filter(Boolean).join(' · ')
    }
    case 'resuming': return `Resuming… · ${amount}`
    case 'pausing': return `Pausing… · ${amount}`
    case 'paused': return `Paused · ${amount}`
    case 'failed': return `Failed · ${amount}`
    default: return amount
  }
}

function FetchRow(p: { e: DownloadEntry; run: (c: string) => void }) {
  const fraction = () => fractionOf(p.e)
  const moving = () => ['downloading', 'resuming', 'pausing'].includes(p.e.state)
  // The buttons sit by the name, so the bar and the line under it have the row's whole width.
  return (
    <div class="dl-row live" data-download={p.e.id} data-state={p.e.state} classList={{ stalled: !!p.e.stalled && p.e.state === 'downloading' }}>
      <Tile name={p.e.name} />
      <div class="dl-words">
        <div class="dl-top">
          <span class="dl-name" title={p.e.name}>{p.e.name}</span>
          <Show when={fraction() !== null && p.e.state !== 'failed'}><span class="dl-pct">{`${Math.floor(fraction()! * 100)}%`}</span></Show>
          <div class="dl-actions">
            <Show when={p.e.state === 'downloading'}><Act name="pause" icon="pause.fill" label="Pause" act={() => p.run('download.pause')} /></Show>
            <Show when={p.e.state === 'paused' || p.e.state === 'failed'}>
              <Show when={p.e.canResume} fallback={<Show when={p.e.canRetry}><Act name="retry" icon="arrow.clockwise" label="Try again from the beginning" act={() => p.run('download.retry')} /></Show>}>
                <Act name="resume" icon="play.fill" label="Resume" act={() => p.run('download.resume')} />
              </Show>
            </Show>
            <Show when={p.e.state === 'failed'} fallback={<Act name="cancel" icon="xmark" label="Cancel download" act={() => p.run('download.cancel')} />}>
              <Act name="remove" icon="xmark" label="Remove from list" act={() => p.run('download.remove')} />
            </Show>
          </div>
        </div>
        <div class="dl-track" classList={{ unknown: fraction() === null && moving(), paused: p.e.state === 'paused', failed: p.e.state === 'failed' }}
          role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction() === null ? undefined : Math.floor(fraction()! * 100)}>
          <i style={{ width: fraction() === null ? undefined : `${fraction()! * 100}%` }} />
        </div>
        <div class="dl-state"><span>{liveStatus(p.e)}</span></div>
        <Show when={p.e.state === 'failed'}><div class="dl-error">{p.e.error ?? 'The download failed.'}</div></Show>
      </div>
    </div>
  )
}

function KeptRow(p: { e: DownloadEntry; run: (c: string) => void }) {
  // Dragged out as its file, onto a page or into File Explorer (Search 1.0.20):
  // the system's drag, started by the main process; a file gone has nothing to drag.
  return (
    <div class="dl-row kept" classList={{ gone: !p.e.there }} data-download={p.e.id} onClick={e => { if (!(e.target as HTMLElement).closest('button') && p.e.there) p.run('download.open') }}
      draggable={!!p.e.there} onDragStart={e => { e.preventDefault(); if (p.e.there) p.run('download.drag') }}
      onContextMenu={e => { if (p.e.url) { e.preventDefault(); p.run('download.copy') } }}
      title={p.e.there ? `Open ${p.e.name}${p.e.url ? '. Right-click: Copy Address' : ''}` : 'The file was moved or deleted'}>
      <Tile name={p.e.name} gone={!p.e.there} />
      <div class="dl-words">
        <div class="dl-name">{p.e.name}</div>
        {/* "<size> · <site> · <when>": the site's name is cut with an ellipsis when short of room; the size and the time stay. */}
        <div class="dl-state">
          <Show when={!p.e.there} fallback={<Show when={p.e.size}><span class="dl-size">{`${bytes(p.e.size!)} · `}</span></Show>}><span class="dl-size dl-missing">{'Moved or deleted · '}</span></Show>
          <Show when={p.e.from}><span class="dl-host">{p.e.from}</span></Show>
          <span class="dl-when">{`${p.e.from ? ' · ' : ''}${when(p.e.date)}`}</span>
        </div>
      </div>
      <div class="dl-actions">
        <Show when={p.e.there}><Act name="reveal" icon="folder" label="Show in File Explorer" act={() => p.run('download.reveal')} /></Show>
        <Act name="remove" icon="xmark" label="Remove from list (the file stays)" act={() => p.run('download.remove')} />
      </div>
    </div>
  )
}

/** Everything coming in, in one line: "2 files coming in · 3.1 MB/s · 1 min left". */
export function summaryOf(data: Listed | null): string {
  const current = data?.current ?? []
  const going = current.filter(e => ['downloading', 'resuming', 'pausing'].includes(e.state))
  if (going.length) {
    const speed = going.reduce((n, e) => n + (e.speed ?? 0), 0)
    const known = going.every(e => e.total > 0)
    const rest = going.reduce((n, e) => n + Math.max(0, e.total - e.received), 0)
    const left = known && speed > 0 ? timeLeft(rest / speed) : null
    return [going.length === 1 ? '1 file coming in' : `${going.length} files coming in`, speed > 0 ? rate(speed) : null, left].filter(Boolean).join(' · ')
  }
  const paused = current.filter(e => e.state === 'paused').length
  const failed = current.filter(e => e.state === 'failed').length
  if (paused || failed) return [paused ? `${paused} paused` : '', failed ? `${failed} failed` : ''].filter(Boolean).join(', ')
  return data ? `Files go to ${data.folderName || 'Downloads'}` : ''
}

/** The list, asked for one request at a time: news while one is on its way
 * asks once more after it. A download sends news many times a second, and
 * answers overtaking each other had the bar going back and forth. */
function lister(ask: () => Promise<Listed>, set: (l: Listed) => void): () => Promise<void> {
  let busy = false, again = false
  return async () => {
    if (busy) { again = true; return }
    busy = true
    try {
      do { again = false; set(await ask()) } while (again)
    } catch {} finally { busy = false }
  }
}

export function DownloadsList(p: { data: Listed | null; run: (command: string, id?: string) => void }) {
  return (
    <Show when={p.data && (p.data.current.length || p.data.completed.length)} fallback={
      <Card><div class="dl-empty"><Symbol name="arrow.down.circle" size={18} weight="regular" /><div class="dl-empty-title">Nothing downloaded yet.</div><div class="dl-empty-note">Files you download show here, with how fast they come and how long is left.</div></div></Card>
    }>
      <div class="dl-list">
        <Show when={p.data!.current.length}>
          <div class="dl-section">
            <Caption text="In progress" />
            <Card>
              <For each={p.data!.current}>{(e, i) => <><Show when={i() > 0}><div class="st-rule" /></Show><FetchRow e={e} run={c => p.run(c, e.id)} /></>}</For>
            </Card>
          </div>
        </Show>
        <Show when={p.data!.completed.length}>
          <div class="dl-section">
            <Caption text="Completed" />
            <Card>
              <For each={p.data!.completed}>{(e, i) => <><Show when={i() > 0}><div class="st-rule" /></Show><KeptRow e={e} run={c => p.run(c, e.id)} /></>}</For>
            </Card>
          </div>
        </Show>
      </div>
    </Show>
  )
}

/** oriel://downloads: the plate in a tab, 560 wide. */
export function DownloadsPage() {
  const [data, setData] = createSignal<Listed | null>(null)
  const load = lister(() => call<Listed>({ do: 'download.list' }), setData)
  onMount(() => {
    document.title = 'Downloads'
    void load()
    onCleanup(onUpdate('downloads', () => void load()))
  })
  const run = (command: string, id?: string) => void call({ do: command, ...(id ? { id } : {}) } as never).then(load)
  return (
    <PlatePage title="Downloads" foot={
      <>
        <span>{data()?.completed.length ? 'Clearing the list leaves the files where they are' : `Files land in ${data()?.folderName ?? 'Downloads'}`}</span>
        <span class="dl-foot-pills">
          <Pill title="Open Folder" act={() => run('download.folder')} />
          <Show when={data()?.completed.length}><Pill title="Clear list" act={() => run('download.clear')} /></Show>
        </span>
      </>
    }>
      <div class="dl-summary" classList={{ busy: !!data()?.current.some(e => e.state === 'downloading') }}>{summaryOf(data())}</div>
      <DownloadsList data={data()} run={run} />
    </PlatePage>
  )
}

/** The card by the button (overlay), the same list in a narrower place.
 * Shown by a download starting (a peek), it goes by itself after a few
 * seconds, unless the pointer is on it or it was clicked. */
export function DownloadsFloat(p: { layer?: OverlayLayer }) {
  const [data, setData] = createSignal<Listed | null>(null)
  const load = lister(async () => await cmd({ do: 'download.list' }) as Listed, setData)
  // The store reconciles each download in place: read what moves in each,
  // not the list itself, or the card would stay as it first was.
  createEffect(on(() => [state.downloads.map(d => `${d.id}:${d.state}:${d.received}:${d.total}`).join('|'),
    state.settings?.downloadsNow?.speed, state.settings?.downloadsNow?.active, state.settings?.downloadsDone], () => void load()))
  // Stalled, the speed falling and the time left: asked again each second while something is listed as current.
  const tick = setInterval(() => { if (data()?.current.length) void load() }, 1000)
  onCleanup(() => clearInterval(tick))
  const run = (command: string, id?: string) => void cmd({ do: command, ...(id ? { id } : {}), ...(command === 'download.drag' ? { from: 'card' } : {}) } as never).then(load)
  // The card is as tall as what it holds (up to the room it was given): main is told, and places it by the button.
  let head!: HTMLDivElement, inner!: HTMLDivElement, foot: HTMLDivElement | undefined
  const fit = () => {
    if (!head || !inner) return
    const h = head.offsetHeight + 1 + inner.offsetHeight + 20 + (foot?.offsetHeight ?? 0)
    if (h > 40) void cmd({ do: 'downloads.fit', height: Math.ceil(h) })
  }
  onMount(() => {
    const ro = new ResizeObserver(() => requestAnimationFrame(fit))
    ro.observe(inner)
    ro.observe(head)
    onCleanup(() => ro.disconnect())
    void document.fonts.ready.then(() => requestAnimationFrame(fit))
  })
  createEffect(on(() => !!data()?.completed.length, () => requestAnimationFrame(fit), { defer: true }))
  const peek = () => !!((p.layer as { data?: { peek?: boolean } } | undefined)?.data?.peek)
  let timer: ReturnType<typeof setTimeout> | undefined
  let held = false
  const arm = (ms: number) => { clearTimeout(timer); if (peek() && !held) timer = setTimeout(() => void cmd({ do: 'downloads.hide' }), ms) }
  onMount(() => arm(6000))
  // Another download starting while it shows by itself: it stays for it too.
  createEffect(on(() => state.settings?.downloadsPeek ?? 0, () => arm(6000), { defer: true }))
  onCleanup(() => clearTimeout(timer))
  return (
    <div class="dlf" role="dialog" aria-label="Downloads"
      onPointerEnter={() => clearTimeout(timer)} onPointerLeave={() => arm(2500)} onPointerDown={() => { held = true; clearTimeout(timer) }}>
      <div class="dlf-head" ref={head}>
        <div class="dlf-titles">
          <h2>Downloads</h2>
          <div class="dlf-sub" classList={{ busy: !!data()?.current.some(e => e.state === 'downloading') }}>{summaryOf(data())}</div>
        </div>
        <button class="dlf-door" title="Open the Downloads Folder" aria-label="Open the Downloads Folder" onClick={() => run('download.folder')}><Symbol name="folder" size={12} weight="medium" /></button>
        <button class="dlf-door" title="Open Downloads in a tab" aria-label="Open Downloads in a tab" onClick={() => void cmd({ do: 'downloads.page' })}><Symbol name="arrow.up.left.and.arrow.down.right" size={11} weight="medium" /></button>
        <button class="dlf-door" title="Close" aria-label="Close" onClick={() => void cmd({ do: 'downloads.hide' })}><Symbol name="xmark" size={11} weight="medium" /></button>
      </div>
      <div class="st-rule" />
      <div class="dlf-body"><div class="dlf-inner" ref={inner}><DownloadsList data={data()} run={run} /></div></div>
      <Show when={data()?.completed.length}><div class="dlf-foot" ref={foot}><span class="dlf-note">Clearing the list leaves the files where they are</span><Pill title="Clear list" act={() => run('download.clear')} /></div></Show>
    </div>
  )
}

/** What the button's tooltip says: everything at once, or that it's done. */
function doorSays(): string {
  const s = state.settings
  const now = s?.downloadsNow
  const p = s?.downloadsProgress
  if (now && now.active) {
    const parts = [now.active === 1 ? '1 file' : `${now.active} files`]
    if (typeof p === 'number' && p >= 0) parts.push(`${Math.floor(p * 100)}%`)
    if (now.speed > 0) parts.push(rate(now.speed))
    if (now.left !== null) parts.push(timeLeft(now.left))
    return `Downloading: ${parts.join(' · ')}`
  }
  if (s?.downloadsDone) return 'Downloads: all done'
  return 'Downloads'
}

/** The downloads button (Fetching.swift:658-773 FetchDoor): at the column's
 * foot, or at the end of the tab strip before the extensions. There while a
 * file comes in and 5 s after the last is in, while one stopped or failed is
 * listed, with Always show the downloads button, or while its list hangs.
 * At rest arrow.down.circle; coming in, a ring that fills (or turns while no
 * size is known), with how many files when more than one; everything in, a
 * check until it goes. It swells as a download starts, and the card shows
 * by it for a few seconds (downloads.peek). */
export function DownloadsDoor(p: { where?: 'foot' | 'strip' }) {
  const s = () => state.settings
  const [swell, setSwell] = createSignal(false)
  let button: HTMLButtonElement | undefined
  createEffect(on(() => s()?.downloadsStarted ?? 0, (n, prior) => {
    if (prior === undefined || !n) return
    setSwell(false); requestAnimationFrame(() => setSwell(true)); setTimeout(() => setSwell(false), 450)
  }))
  // A download started from this window: the card shows by this button,
  // once it is drawn (it may come with the same news).
  createEffect(on(() => s()?.downloadsPeek ?? 0, (n, prior) => {
    if (prior === undefined || !n || n === prior) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = button?.getBoundingClientRect()
      if (!r || !r.width || !r.height) return
      void cmd({ do: 'downloads.show', peek: true, anchor: { x: r.left + r.width / 2, y: r.top } })
    }))
  }))
  const progress = () => s()?.downloadsProgress ?? -1
  const done = () => !!s()?.downloadsDone
  const active = () => s()?.downloadsNow?.active ?? 0
  const R = 5.6, C = 2 * Math.PI * R
  return (
    <Show when={s()?.downloadsButton}>
      <button ref={button} class="door fetch-door" classList={{ swell: swell(), done: done(), coming: progress() !== -1 }} title={`${doorSays()}   Ctrl+J`} aria-label={doorSays()} data-where={p.where}
        onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); void cmd({ do: 'downloads.show', toggle: true, anchor: { x: r.left + r.width / 2, y: r.top } }) }}>
        <Show when={!done()} fallback={<span class="fetch-done"><Symbol name="checkmark" size={11} weight="semibold" /></span>}>
          <Show when={progress() !== -1} fallback={<Symbol name="arrow.down.circle" size={12} weight="medium" />}>
            <svg class="fetch-ring" classList={{ spin: progress() === null }} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r={R} fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.8" />
              <circle class="fetch-fill" cx="7" cy="7" r={R} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" transform="rotate(-90 7 7)"
                stroke-dasharray={`${(progress() === null ? 0.3 : Math.max(0.03, progress()!)) * C} ${C}`} />
              <path d="M7 4.4v4.4M5.2 7.2 7 9l1.8-1.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <Show when={active() > 1}><span class="fetch-count">{active()}</span></Show>
          </Show>
        </Show>
      </button>
    </Show>
  )
}
