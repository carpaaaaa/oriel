// History › Archived Tabs… (oriel://archive, Archive.swift ArchivePanel,
// studio/01 §9.36): the tabs Oriel closed by itself, newest first, by day,
// with a search; a click opens one again in the space on screen.

import { createResource, createSignal, For, Show, onCleanup } from 'solid-js'
import type { Command } from '../../shared/commands'

interface Archived { id: string; url: string; title: string; closed: string }

type Bridge = { cmd(c: Command): Promise<unknown>; on(f: (u: { kind: string; value: unknown }) => void): () => void }
const bridge = () => (window as unknown as { oriel?: Bridge }).oriel
const cmd = (c: Command) => bridge()?.cmd(c) ?? Promise.resolve(null)

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const plain = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
function dayOf(ms: number, now = new Date()): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ms >= start) return 'Today'
  if (ms >= start - 86_400_000) return 'Yesterday'
  return plain.format(new Date(ms))
}
const bare = (url: string) => { try { const u = new URL(url); return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) } catch { return url } }

export function ArchivePage() {
  const [hunt, setHunt] = createSignal('')
  const [list, { refetch }] = createResource(hunt, async q => ((await cmd({ do: 'archive.list', query: q })) as { tabs: Archived[] } | null)?.tabs ?? [])
  const off = bridge()?.on(u => { if (u.kind === 'archive') void refetch() })
  onCleanup(() => off?.())
  const days = () => {
    const out: { day: string; tabs: Archived[] }[] = []
    for (const a of list() ?? []) {
      const day = dayOf(Date.parse(a.closed))
      if (out[out.length - 1]?.day !== day) out.push({ day, tabs: [] })
      out[out.length - 1].tabs.push(a)
    }
    return out
  }
  return (
    <div class="hp">
      <h1 class="hp-title">Archived Tabs</h1>
      <input class="hp-hunt" type="search" placeholder="Search the tabs Oriel closed" autofocus value={hunt()} onInput={e => setHunt(e.currentTarget.value)} />
      <Show when={days().length} fallback={<div class="bt-card bt-nothing">{hunt() ? 'Nothing matches.' : 'Tabs Oriel closes because you left them alone come here for a month.'}</div>}>
        <For each={days()}>
          {group => (
            <section class="hp-day">
              <div class="bt-caption">{group.day}</div>
              <div class="bt-card">
                <For each={group.tabs}>
                  {(a, i) => (
                    <>
                      <Show when={i() > 0}><div class="bt-rule" /></Show>
                      <div class="hp-row" data-archived={a.id}>
                        <a class="hp-go" href={a.url} onClick={e => { e.preventDefault(); void cmd({ do: 'archive.reopen', id: a.id }) }}>
                          <span class="hp-letter">{(a.title || bare(a.url)).slice(0, 1).toUpperCase()}</span>
                          <span class="hp-text">
                            <span class="hp-name">{a.title || bare(a.url)}</span>
                            <Show when={a.title}><span class="hp-address">{bare(a.url)}</span></Show>
                          </span>
                          <span class="hp-time">{time.format(new Date(Date.parse(a.closed)))}</span>
                        </a>
                        <button class="hp-remove" onClick={() => void cmd({ do: 'archive.remove', id: a.id })}>Remove</button>
                      </div>
                    </>
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
      </Show>
      <div class="hp-foot">
        <span class="bt-muted">{(list() ?? []).length === 1 ? '1 tab' : `${(list() ?? []).length} tabs`}</span>
        <span class="bt-spacer" />
        <button class="bt-pill" disabled={!(list() ?? []).length} onClick={() => void cmd({ do: 'archive.clear' })}>Clear</button>
      </div>
    </div>
  )
}
