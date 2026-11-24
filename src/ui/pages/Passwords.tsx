// oriel://passwords: the kept passwords, by site (Passwords.swift
// PasswordsPanel, studio/05 §2), over the data module's commands. Show and
// Copy ask Windows Hello first (the data module's proof).

import { createMemo, createSignal, For, onMount, Show } from 'solid-js'
import type { KeptLogin } from '../../shared/modules/data'
import { announce, call, said } from '../settings/bridge'
import { Card, Hunt, Nothing, Pill, PlatePage, Quick } from '../settings/controls'
import { Symbol } from '../settings/symbols'

export function PasswordsPage() {
  const [logins, setLogins] = createSignal<KeptLogin[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [adding, setAdding] = createSignal(false)
  const [open, setOpen] = createSignal<string | null>(null)
  let hunt: HTMLInputElement | undefined
  const load = async () => {
    const r = await call<{ logins: KeptLogin[] }>({ do: 'passwords.list' } as never)
    setLogins(r?.logins ?? [])
    setLoaded(true)
  }
  onMount(() => { document.title = 'Passwords'; void load(); hunt?.focus() })

  const sites = createMemo(() => {
    const q = query().trim().toLowerCase()
    const shown = logins().filter(k => !q || k.host.includes(q) || k.user.toLowerCase().includes(q))
    const by = new Map<string, KeptLogin[]>()
    for (const k of shown) by.set(k.host, [...(by.get(k.host) ?? []), k])
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([host, list]) => ({ host, logins: list }))
  })
  const shownCount = () => sites().reduce((n, s) => n + s.logins.length, 0)

  const removeShown = async () => {
    const r = await call<{ said: string }>({ do: 'passwords.removeAll', query: query() } as never)
    announce(r?.said)
    void load()
  }

  return (
    <PlatePage title="Passwords" width={620} foot={
      <div class="pw-foot">
        <div class="pw-foot-row">
          <span>Bring in from</span>
          <Pill title="Bring in…" act={() => void call({ do: 'import.open' } as never)} />
          <Pill title="File…" act={() => void call({ do: 'import.file' } as never).then(load)} />
          <span style={{ flex: 1 }} />
          <Show when={shownCount() > 0}>
            <Pill title={query().trim() ? `Remove ${shownCount()}…` : 'Remove All…'} act={() => void removeShown()} />
          </Show>
          <span>{logins().length === 1 ? '1 password' : `${logins().length} passwords`}</span>
        </div>
        <div class="pw-note">Windows asks before a browser's passwords are read. Nothing is changed there; everything lands in Oriel's own vault, kept by Windows.</div>
      </div>
    }>
      <div class="pw">
        <div class="pw-tools">
          <Hunt value={query()} set={setQuery} prompt="Search sites and accounts" ref={el => (hunt = el)} />
          <Pill title={adding() ? 'Cancel' : 'Add'} filled={!adding()} act={() => setAdding(!adding())} />
        </div>
        <Show when={adding()}><Card><AddForm done={() => { setAdding(false); void load() }} /></Card></Show>
        <Show when={sites().length} fallback={
          <Show when={loaded()}><Card><Nothing text={logins().length ? 'Nothing matches.' : 'Nothing kept yet. Sign in somewhere and say yes, or bring yours in below.'} /></Card></Show>
        }>
          <Card>
            <For each={sites()}>{(s, i) => (
              <>
                <Show when={i() > 0}><div class="st-rule" /></Show>
                <Site host={s.host} logins={s.logins} open={open() === s.host} toggle={() => setOpen(open() === s.host ? null : s.host)} changed={load} />
              </>
            )}</For>
          </Card>
        </Show>
      </div>
      <Show when={said()}>{s => <div class="st-said">{s().text}</div>}</Show>
    </PlatePage>
  )
}

function Site(p: { host: string; logins: KeptLogin[]; open: boolean; toggle: () => void; changed: () => void }) {
  return (
    <div class="pw-site" data-site={p.host}>
      <button class="pw-site-row" classList={{ open: p.open }} onClick={p.toggle} aria-expanded={p.open}>
        <span class="pw-mark">{p.host.slice(0, 1).toUpperCase() || '•'}</span>
        <span class="pw-host">{p.host}</span>
        <Show when={p.logins.length > 1} fallback={<Show when={!p.open && p.logins[0]?.user}><span class="pw-sub">{p.logins[0].user}</span></Show>}>
          <span class="pw-sub">{p.logins.length} accounts</span>
        </Show>
        <span style={{ flex: 1 }} />
        <Symbol name="chevron.right" size={9} weight="semibold" class="pw-chevron" />
      </button>
      <Show when={p.open}>
        <div class="pw-accounts">
          <For each={p.logins}>{k => <Account login={k} changed={p.changed} />}</For>
        </div>
      </Show>
    </div>
  )
}

/** Ten dots whatever its length; Show and Copy ask first. */
function Account(p: { login: KeptLogin; changed: () => void }) {
  const [secret, setSecret] = createSignal<string | null>(null)
  let hide: ReturnType<typeof setTimeout> | undefined
  const reveal = async () => {
    const r = await call<{ password: string | null; seconds: number } | null>({ do: 'passwords.reveal', host: p.login.host, user: p.login.user } as never)
    if (r?.password == null) return
    setSecret(r.password)
    clearTimeout(hide)
    hide = setTimeout(() => setSecret(null), (r.seconds ?? 15) * 1000)
  }
  const copy = async () => { const r = await call<{ ok: boolean; said?: string }>({ do: 'passwords.copy', host: p.login.host, user: p.login.user } as never); announce(r?.said) }
  const forget = async () => { await call({ do: 'passwords.remove', host: p.login.host, user: p.login.user } as never); p.changed() }
  return (
    <div class="pw-account" classList={{ shown: secret() !== null }}>
      <span class="pw-user" classList={{ none: !p.login.user }}>{p.login.user || 'No username'}</span>
      <span class="pw-secret" classList={{ shown: secret() !== null }}>{secret() ?? '••••••••••'}</span>
      <span style={{ flex: 1 }} />
      <span class="pw-actions">
        <Quick title={secret() !== null ? 'Hide' : 'Show'} act={() => (secret() !== null ? setSecret(null) : void reveal())} />
        <Quick title="Copy" act={() => void copy()} />
        <Quick title="Remove" red act={() => void forget()} />
      </span>
    </div>
  )
}

function AddForm(p: { done: () => void }) {
  const [site, setSite] = createSignal('')
  const [user, setUser] = createSignal('')
  const [password, setPassword] = createSignal('')
  const keep = async () => {
    if (!site().trim() || !password()) return
    const r = await call<{ ok: boolean; said: string }>({ do: 'passwords.add', host: site().trim(), user: user().trim(), password: password() } as never)
    announce(r?.said)
    if (r?.ok) p.done()
  }
  return (
    <div class="pw-add">
      <div class="pw-add-row">
        <input class="pw-field" placeholder="Site" value={site()} onInput={e => setSite(e.currentTarget.value)} ref={el => setTimeout(() => el.focus())} />
        <input class="pw-field" placeholder="Username" value={user()} onInput={e => setUser(e.currentTarget.value)} />
      </div>
      <div class="pw-add-row">
        <input class="pw-field mono" type="password" placeholder="Password" value={password()} onInput={e => setPassword(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') void keep() }} />
        <Pill title="Save" filled disabled={!site().trim() || !password()} act={() => void keep()} />
      </div>
    </div>
  )
}
