// Settings › Extensions (ExtensionsUI.swift ExtensionsPage.Installer, studio/04
// §2.6): what is installed, and the ways in. Cards 18 apart: Add from the
// Chrome Web Store, From another browser, the installed ones (each with its
// icon, name, version and where it came from, "Runs on" when it asks for
// websites, its "…" menu and its switch, and under it the sites it is held
// to), Load an unpacked extension. The Mac's Safari apps and screen
// recorders have nothing behind them on Windows. Live: the module tells the
// page whenever an extension comes, goes or changes.

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { announce, call, onUpdate } from '../settings/bridge'
import { Card, Line, Nothing, Pill, Switch } from '../settings/controls'
import { PopMenu, type PopItem } from '../settings/PopMenu'
import { Symbol } from '../settings/symbols'
import { Ellipsis } from './parts'
import { brand } from '../../shared/brand'
import { needsEverySite, siteChoices, siteHost, siteTitles, type ExtSettings, type ExtView } from '../../shared/modules/extensions'

type Row = ExtSettings['list'][number]

const hasId = (t: string) => /[a-p]{32}/.test(t.toLowerCase())

export function ExtensionsSettings() {
  // Kept by id: a row, and a menu open in it, stays through every update.
  const [data, setData] = createStore<ExtSettings & { ready: boolean }>({ list: [], busy: [], said: null, ready: false })
  const [link, setLink] = createSignal('')
  let heard = -1
  const take = (v: ExtSettings | null) => {
    if (!v) return
    // What the module just said (installed, couldn't...) at the page's foot, once.
    const n = v.said?.n ?? 0
    if (heard >= 0 && n > heard && v.said) announce(v.said.text)
    heard = Math.max(heard, n)
    setData(reconcile({ ...v, ready: true }, { key: 'id' }))
  }
  onMount(async () => {
    const off = onUpdate('ext', v => take(v as ExtSettings))
    onCleanup(off)
    take(await call<ExtSettings>({ do: 'ext.settings' }))
  })
  const add = () => {
    if (!hasId(link())) return
    void call({ do: 'ext.install', text: link() })
    setLink('')
  }
  return (
    <div class="extset">
      <Card>
        <div class="extset-add">
          <div class="extset-add-head">
            <span>Add from the Chrome Web Store</span>
            <Pill title="Open the Store" act={() => void call({ do: 'ext.store' })} />
          </div>
          <div class="extset-add-row">
            <input class="extset-field" placeholder="Paste a link to an extension, or its id" value={link()} spellcheck={false}
              aria-label="Paste a link to an extension, or its id"
              onInput={e => setLink(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
            <Show when={!data.busy.length} fallback={<span class="st-ring" aria-label="Adding" />}>
              <Pill title="Add" filled disabled={!hasId(link())} act={add} />
            </Show>
          </div>
          <div class="extset-note">Or find it in the store and press Add to {brand.name} on its page.</div>
        </div>
      </Card>

      <Card>
        <Line title="From another browser" detail="What Chrome, Arc, Brave and the others added from the Chrome Web Store: installed fresh from the store, you say yes to each one">
          <Pill title="Bring them over…" act={() => void call({ do: 'import.open', extensions: true } as never)} />
        </Line>
      </Card>

      <Show when={data.ready}>
        <Show when={data.list.length} fallback={<Card><Nothing text="No extensions yet." /></Card>}>
          <Card class="extset-list">
            <For each={data.list}>{(e, k) => (
              <>
                <Show when={k() > 0}><div class="st-rule" /></Show>
                <ExtensionRow ext={e} />
              </>
            )}</For>
          </Card>
          <div class="extset-note">Extensions stay out of private tabs, and out of spaces with cookies of their own.</div>
        </Show>
      </Show>

      <Card>
        <Line title="Load an unpacked extension" detail="A folder with a manifest.json: your own, or one exported from another browser. Reload picks up what you've changed in it since.">
          <Pill title="Choose…" act={() => void call({ do: 'ext.loadUnpacked' })} />
        </Line>
      </Card>
    </div>
  )
}

/** "Version 1.2 · Chrome Web Store", or "· From “folder”" (ExtensionsUI.swift Row.detail). */
function detail(e: ExtView): string {
  const where = e.fromStore ? 'Chrome Web Store' : e.folder ? `From “${e.folder.split(/[\\/]/).filter(Boolean).pop()}”` : 'From a folder'
  return [`Version ${e.version}`, where].join(' · ')
}

function ExtensionRow(q: { ext: Row }) {
  let openAt: ((at: { x: number; y: number }) => void) | undefined
  const e = () => q.ext
  const restricted = () => !!e().asksSites && (e().sites?.mode ?? 'all') !== 'all'
  // Five pills don't fit beside the name: one menu holds them (Row.actions).
  const actions = (): (PopItem | null)[] => [
    { label: e().pinned ? 'Unpin' : 'Pin to Toolbar', act: () => void call({ do: 'ext.pin', id: e().id, pinned: !e().pinned }) },
    ...(e().enabled && e().options ? [{ label: 'Options', act: () => void call({ do: 'ext.options', id: e().id }) }] : []),
    ...(!e().fromStore ? [{ label: 'Reload', act: () => void call({ do: 'ext.reload', id: e().id }) }] : []),
    null,
    // Asked first, as everywhere else in Oriel (studio/04 §2.6).
    { label: 'Remove', red: true, act: () => void call({ do: 'ext.remove', id: e().id }) },
  ]
  return (
    <div class="extset-row" data-ext={e().id} onContextMenu={ev => { ev.preventDefault(); openAt?.({ x: ev.clientX, y: ev.clientY }) }}>
      <div class="extset-row-main">
        <span class="extset-icon">
          <Show when={e().enabled && e().image} fallback={<Symbol name="puzzlepiece.extension" size={14} weight="medium" />}>
            <img src={e().image!} width={22} height={22} alt="" draggable={false} />
          </Show>
        </span>
        <div class="extset-words">
          <span class="extset-name">{e().name}</span>
          <span class="extset-detail" title={e().folder ?? ''}>{detail(e())}</span>
          <Show when={e().problem}><span class="extset-problem">{e().problem}</span></Show>
        </div>
        <Show when={e().asksSites}><RunsOn ext={e()} /></Show>
        <PopMenu class="extset-more" label={`More for ${e().name}`} title={`More for ${e().name}`} face={<Ellipsis size={14} />}
          items={actions} opener={o => (openAt = o)} />
        <Switch on={e().enabled} set={v => void call({ do: 'ext.enable', id: e().id, on: v })} label={`${e().name} on`} />
      </div>
      <Show when={restricted()}><SiteList ext={e()} /></Show>
    </div>
  )
}

/** "Runs on": every site it asked for, the ones you name, or only where you
 * click its button (ExtensionsUI.swift RunsOn). */
function RunsOn(q: { ext: Row }) {
  const mode = () => q.ext.sites?.mode ?? 'all'
  return (
    <PopMenu class={`extset-runs${mode() !== 'all' ? ' restricted' : ''}`} label={`${q.ext.name} runs on`} title={`Where ${q.ext.name} runs. Fewer sites, less memory on the rest`}
      face={<>
        <span class="extset-runs-mode">{siteTitles[mode()]}</span>
        <svg width="7" height="10" viewBox="0 0 8 12" aria-hidden="true">
          <path d="M1.6 4.6 4 2.2l2.4 2.4M1.6 7.4 4 9.8l2.4-2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </>}
      items={() => siteChoices.map(([m, label]) => ({ label, checked: mode() === m, act: () => void call({ do: 'ext.sites', id: q.ext.id, mode: m }) }))} />
  )
}

/** Under an extension held to fewer sites: the sites you named, one to add,
 * and a word on what that means (ExtensionsUI.swift SiteList). */
function SiteList(q: { ext: Row }) {
  const [typed, setTyped] = createSignal('')
  const access = () => q.ext.sites ?? { mode: 'all' as const, hosts: [] }
  const add = () => {
    const host = siteHost(typed())
    if (!host) return
    void call({ do: 'ext.sites', id: q.ext.id, add: host })
    setTyped('')
  }
  const note = () => (access().mode === 'some'
    ? 'Subdomains included. Elsewhere it runs once you click its button, on that tab until it leaves the site.'
    : 'It runs on a page once you click its button there, on that tab until it leaves the site.')
    + (needsEverySite(q.ext.name) ? ` ${q.ext.name} may need every site to fill in sign-ins.` : '')
  return (
    <div class="extset-sites">
      <Show when={access().mode === 'some'}>
        <For each={access().hosts}>{host => (
          <div class="extset-host" data-host={host}>
            <span>{host}</span>
            <button class="extset-host-x" title={`Remove ${host}`} aria-label={`Remove ${host}`}
              onClick={() => void call({ do: 'ext.sites', id: q.ext.id, remove: host })}><Symbol name="xmark" size={9} weight="semibold" /></button>
          </div>
        )}</For>
        <div class="extset-site-add">
          <input class="extset-site-field" placeholder="Add a site, like example.com" value={typed()} spellcheck={false}
            aria-label={`Add a site for ${q.ext.name}`} onInput={ev => setTyped(ev.currentTarget.value)} onKeyDown={ev => { if (ev.key === 'Enter') add() }} />
          <Pill title="Add" disabled={!siteHost(typed())} act={add} />
        </div>
      </Show>
      <div class="extset-site-note">{note()}</div>
    </div>
  )
}
