// Settings › Privacy: saved site permissions, reset one at a time
// (Settings.swift:1709 PermissionSites, PermissionSiteRow), and the sites
// allowed to open pop-ups (BlockedPopups.swift:239).

import { createEffect, createSignal, For, Show } from 'solid-js'
import type { SavedPermission, PermissionKind } from '../../shared/modules/settings'
import { call } from './bridge'
import { Hunt, Line, Menu, Nothing, Pill } from './controls'
import { Symbol } from './symbols'

const titles: Record<PermissionKind, string> = { camera: 'Camera', microphone: 'Microphone', cameraAndMicrophone: 'Camera and microphone together', location: 'Location', notifications: 'Notifications' }
const choiceTitle = { allow: 'Allow', refuse: 'Refuse', different: 'Different' } as const

export function PermissionSites(p: { seen: number; notificationsOn: boolean }) {
  const [saved, setSaved] = createSignal<SavedPermission[]>([])
  const [query, setQuery] = createSignal('')
  const [kind, setKind] = createSignal<string>('all')
  const load = async () => setSaved((await call<{ saved: SavedPermission[] }>({ do: 'permission.list' }))?.saved ?? [])
  createEffect(() => { void p.seen; void load() })
  const shown = () => saved().filter(s => (kind() === 'all' || s.kind === kind()) && (!query().trim() || s.origin.toLowerCase().includes(query().trim().toLowerCase())))
  const origins = () => [...new Set(shown().map(s => s.origin))].sort()
  return (
    <Show when={saved().length}>
      <div class="st-rule" />
      <div class="perm-head">
        <div class="perm-note">Reset asks again next time. Devices already in use keep running.</div>
        <div class="perm-tools">
          <Hunt value={query()} set={setQuery} prompt="Find a site" />
          <Menu label="Filter by permission" value={kind()} set={setKind}
            options={[['all', 'All permissions'], ['camera', 'Camera'], ['microphone', 'Microphone'], ['location', 'Location'], ['notifications', 'Notifications']]} />
        </div>
      </div>
      <Show when={!origins().length}><Nothing text="No matching sites" /></Show>
      <For each={origins()}>{origin => (
        <SiteRow origin={origin} entries={shown().filter(s => s.origin === origin)} notificationsOn={p.notificationsOn}
          reset={async e => { const r = await call<{ saved: SavedPermission[] }>({ do: 'permission.set', origin: e.origin, kind: e.kind, value: null }); setSaved(r?.saved ?? []) }} />
      )}</For>
    </Show>
  )
}

function SiteRow(p: { origin: string; entries: SavedPermission[]; notificationsOn: boolean; reset: (e: SavedPermission) => void }) {
  const [open, setOpen] = createSignal(false)
  const count = () => (p.entries.length === 1 ? '1 permission' : `${p.entries.length} permissions`)
  const status = (e: SavedPermission) => {
    const s = e.alternativeSpelling ? `Saved ${choiceTitle[e.choice]} · May differ from current permission`
      : e.choice === 'different' ? 'Different answers; refusal applies' : choiceTitle[e.choice]
    return e.kind === 'notifications' && !p.notificationsOn ? `${s} · Notifications are off` : s
  }
  return (
    <>
      <div class="st-rule" />
      <button class="perm-site" aria-label={`${p.origin}, ${count()}`} aria-expanded={open()} onClick={() => setOpen(!open())}>
        <span class="perm-origin">{p.origin}</span>
        <span class="perm-count">{count()}</span>
        <Symbol name={open() ? 'chevron.down' : 'chevron.right'} size={10} weight="semibold" />
      </button>
      <Show when={open()}>
        <For each={p.entries}>{e => {
          const action = e.alternativeSpelling ? 'Remove record' : 'Reset'
          return <Line title={titles[e.kind]} detail={status(e)}><Pill title={action} act={() => p.reset(e)} help={`${action}: ${titles[e.kind]} for ${e.origin}`} /></Line>
        }}</For>
      </Show>
    </>
  )
}

export function PopupSites(p: { sites: string[]; remove: (site: string) => void }) {
  return (
    <For each={p.sites}>{site => (
      <>
        <div class="st-rule" />
        <Line title={site} detail="Can open pop-ups without a click"><Pill title="Remove" act={() => p.remove(site)} /></Line>
      </>
    )}</For>
  )
}
