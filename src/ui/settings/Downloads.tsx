// Downloads: in a tab (oriel://downloads), as the card floating by the
// button, and the button itself at the column's foot (Recall.swift:272,
// DownloadsFloat.swift, Fetching.swift:658; studio/06 §3.2).

import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import type { DownloadEntry } from '../../shared/modules/settings'
import { state, cmd } from '../lib/store'
import { call, onUpdate } from './bridge'
import { Caption, Card, Nothing, Pill, PlatePage, Quick } from './controls'
import { Symbol } from './symbols'

export interface Listed { current: DownloadEntry[]; completed: DownloadEntry[]; folder: string; folderName: string }

/** ByteCountFormatter's file style, as the Mac writes sizes. */
export function bytes(n: number): string {
  if (n < 1000) return `${n} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1000, u = 0
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++ }
  return `${v >= 100 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`
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

const stateLabel: Record<string, string> = { downloading: 'Downloading', pausing: 'Pausing…', paused: 'Paused', resuming: 'Resuming…', failed: 'Failed' }
const stateIcon: Record<string, string> = { downloading: 'arrow.down.circle', pausing: 'arrow.down.circle', resuming: 'arrow.down.circle', paused: 'pause.circle', failed: 'exclamationmark.circle' }

function FetchRow(p: { e: DownloadEntry; run: (c: string) => void }) {
  const amount = () => (p.e.total > 0 ? `${bytes(p.e.received)} of ${bytes(p.e.total)}` : `${bytes(p.e.received)} downloaded`)
  const fraction = () => (p.e.total > 0 ? Math.min(1, Math.max(0, p.e.received / p.e.total)) : null)
  return (
    <div class="dl-row" data-download={p.e.id} data-state={p.e.state}>
      <span class="dl-icon"><Symbol name={stateIcon[p.e.state] ?? 'arrow.down.circle'} size={14} weight="regular" /></span>
      <div class="dl-words">
        <div class="dl-name" title={p.e.name}>{p.e.name}</div>
        <div class="dl-state">
          <Show when={fraction() !== null}><span class="dl-bar"><i style={{ width: `${(fraction() ?? 0) * 100}%` }} /></span></Show>
          <span>{`${p.e.stalled && p.e.state === 'downloading' ? 'Stalled' : stateLabel[p.e.state] ?? ''} · ${amount()}`}</span>
        </div>
        <Show when={p.e.state === 'failed'}><div class="dl-error">{p.e.error ?? 'The download failed.'}</div></Show>
      </div>
      <div class="dl-actions">
        <Show when={p.e.state === 'downloading'}><Quick title="Pause" act={() => p.run('download.pause')} /><Quick title="Cancel" act={() => p.run('download.cancel')} /></Show>
        <Show when={p.e.state === 'resuming' || p.e.state === 'pausing'}><Quick title={stateLabel[p.e.state]} disabled act={() => {}} /><Quick title="Cancel" act={() => p.run('download.cancel')} /></Show>
        <Show when={p.e.state === 'paused'}>
          <Show when={p.e.canResume} fallback={<Show when={p.e.canRetry}><Quick title="Retry" help="Start the download again from the beginning" act={() => p.run('download.retry')} /></Show>}>
            <Quick title="Resume" act={() => p.run('download.resume')} />
          </Show>
          <Quick title="Remove" act={() => p.run('download.cancel')} />
        </Show>
        <Show when={p.e.state === 'failed'}>
          <Show when={p.e.canResume}><Quick title="Resume" act={() => p.run('download.resume')} /></Show>
          <Show when={p.e.canRetry}><Quick title="Retry" help="Start the download again from the beginning" act={() => p.run('download.retry')} /></Show>
          <Quick title="Remove" act={() => p.run('download.remove')} />
        </Show>
      </div>
    </div>
  )
}

function KeptRow(p: { e: DownloadEntry; run: (c: string) => void }) {
  return (
    <div class="dl-row kept" classList={{ gone: !p.e.there }} data-download={p.e.id} onClick={e => { if (!(e.target as HTMLElement).closest('button') && p.e.there) p.run('download.open') }}
      onContextMenu={e => { if (p.e.url) { e.preventDefault(); p.run('download.copy') } }} title={p.e.url ? 'Right-click: Copy Address' : undefined}>
      <span class="dl-icon"><Symbol name={p.e.there ? 'doc' : 'doc.badge.ellipsis'} size={13} weight="regular" /></span>
      <div class="dl-words">
        <div class="dl-name" title={p.e.name}>{p.e.name}</div>
        <div class="dl-state">{p.e.from ? `${p.e.from} · ${when(p.e.date)}` : when(p.e.date)}</div>
      </div>
      <div class="dl-actions">
        <Show when={p.e.there}><Quick title="Show in File Explorer" act={() => p.run('download.reveal')} /></Show>
        <Quick title="Remove" red act={() => p.run('download.remove')} />
      </div>
    </div>
  )
}

export function DownloadsList(p: { data: Listed | null; run: (command: string, id?: string) => void }) {
  return (
    <Show when={p.data && (p.data.current.length || p.data.completed.length)} fallback={<Card><Nothing text="Nothing downloaded yet." /></Card>}>
      <div class="dl-list">
        <Show when={p.data!.current.length}>
          <div class="dl-section">
            <Caption text="Current downloads" />
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
  const load = async () => setData(await call<Listed>({ do: 'download.list' }))
  onMount(() => {
    document.title = 'Downloads'
    void load()
    onCleanup(onUpdate('downloads', v => setData(v as Listed)))
  })
  const run = (command: string, id?: string) => void call({ do: command, ...(id ? { id } : {}) } as never).then(load)
  return (
    <PlatePage title="Downloads" foot={
      <>
        <span>{data()?.completed.length ? 'Clearing the list leaves the files where they are' : `Files land in ${data()?.folderName ?? 'Downloads'}`}</span>
        <Show when={data()?.completed.length}><Pill title="Clear list" act={() => run('download.clear')} /></Show>
      </>
    }>
      <DownloadsList data={data()} run={run} />
    </PlatePage>
  )
}

/** The card by the button (overlay), the same list in a narrower place. */
export function DownloadsFloat() {
  const [data, setData] = createSignal<Listed | null>(null)
  const load = async () => setData(await cmd({ do: 'download.list' }) as Listed)
  createEffect(on(() => state.downloads, () => void load()))
  const run = (command: string, id?: string) => void cmd({ do: command, ...(id ? { id } : {}) } as never).then(load)
  return (
    <div class="dlf" role="dialog" aria-label="Downloads">
      <div class="dlf-head">
        <h2>Downloads</h2>
        <button class="dlf-door" title="Open the Downloads Folder" onClick={() => run('download.folder')}><Symbol name="folder" size={12} weight="medium" /></button>
        <button class="dlf-door" title="Close" onClick={() => void cmd({ do: 'downloads.show', toggle: true })}><Symbol name="xmark" size={11} weight="medium" /></button>
      </div>
      <div class="st-rule" />
      <div class="dlf-body"><DownloadsList data={data()} run={run} /></div>
      <Show when={data()?.completed.length}><div class="dlf-foot"><Pill title="Clear list" act={() => run('download.clear')} /></div></Show>
    </div>
  )
}

/** The downloads button (Fetching.swift:658-773 FetchDoor): at the column's
 * foot, or at the end of the tab strip before the extensions. There while a
 * file comes in and 5 s after the last is in, while one stopped or failed is
 * listed, with Always show the downloads button, or while its list hangs.
 * At rest arrow.down.circle (12 medium); coming in, a ring of 12 (1.5, the
 * track at 30%) that fills, or turns while no size is known; everything in,
 * arrow.down (10 semibold) until it goes. It swells as a download starts. */
export function DownloadsDoor(p: { where?: 'foot' | 'strip' }) {
  const s = () => state.settings
  const [swell, setSwell] = createSignal(false)
  createEffect(on(() => s()?.downloadsStarted ?? 0, (n, prior) => {
    if (prior === undefined || !n) return
    setSwell(false); requestAnimationFrame(() => setSwell(true)); setTimeout(() => setSwell(false), 450)
  }))
  const progress = () => s()?.downloadsProgress ?? -1
  const done = () => !!s()?.downloadsDone
  const R = 5.25, C = 2 * Math.PI * R
  return (
    <Show when={s()?.downloadsButton}>
      <button class="door fetch-door" classList={{ swell: swell(), done: done(), coming: progress() !== -1 }} title="Downloads   Ctrl+J" aria-label="Downloads" data-where={p.where}
        onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); void cmd({ do: 'downloads.show', toggle: true, anchor: { x: r.left + r.width / 2, y: r.top } }) }}>
        <Show when={!done()} fallback={<span class="fetch-done"><Symbol name="arrow.down" size={10} weight="semibold" /></span>}>
          <Show when={progress() !== -1} fallback={<Symbol name="arrow.down.circle" size={12} weight="medium" />}>
            <svg class="fetch-ring" classList={{ spin: progress() === null }} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="6" r={R} fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5" />
              <circle class="fetch-fill" cx="6" cy="6" r={R} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" transform="rotate(-90 6 6)"
                stroke-dasharray={`${(progress() === null ? 0.78 : Math.max(0.02, progress()!)) * C} ${C}`} />
            </svg>
          </Show>
        </Show>
      </button>
    </Show>
  )
}
