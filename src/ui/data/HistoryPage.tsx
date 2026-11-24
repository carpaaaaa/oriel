// oriel://history: everywhere you have been (Recall.swift HistoryPanel,
// studio/05 §3.5): a search, the pages by day (Today, Yesterday, 27 September),
// each with its time and a Remove, the count, and Clear… for the history.
// Cookies and the cache are cleared from Settings (the privacy module's).
//
// Talks to the main process through the bridge Oriel's own pages get
// (src/preload/page/internal.ts, the settings module's): `window.oriel.cmd`.

import { createResource, createSignal, For, Show } from 'solid-js'
import type { Command } from '../../shared/commands'

interface Page { url: string; title: string; address: string; count: number; last: number; favicon?: string }

const bridge = () => (window as unknown as { oriel?: { cmd(c: Command): Promise<unknown> } }).oriel
const cmd = (c: Command) => bridge()?.cmd(c) ?? Promise.resolve(null)

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const plain = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })

export function dayOf(ms: number, now = new Date()): string {
  const d = new Date(ms)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ms >= start) return 'Today'
  if (ms >= start - 86_400_000) return 'Yesterday'
  return plain.format(d)
}

export function HistoryPage() {
  const [hunt, setHunt] = createSignal('')
  const [clearing, setClearing] = createSignal(false)
  const [list, { refetch }] = createResource(hunt, async q => (await cmd({ do: 'history.list', query: q } as Command)) as { total: number; pages: Page[] } | null)
  const days = () => {
    const out: { day: string; pages: Page[] }[] = []
    for (const p of list()?.pages ?? []) {
      const day = dayOf(p.last)
      if (out[out.length - 1]?.day !== day) out.push({ day, pages: [] })
      out[out.length - 1].pages.push(p)
    }
    return out
  }
  const total = () => list()?.total ?? 0
  return (
    <div class="hp">
      <h1 class="hp-title">History</h1>
      <input class="hp-hunt" type="search" placeholder="Search everywhere you have been" autofocus value={hunt()} onInput={e => setHunt(e.currentTarget.value)} />
      <Show when={!clearing()} fallback={
        <div class="bt-card">
          <div class="bt-line">
            <div class="bt-line-text">
              <div class="bt-line-title">History</div>
              <div class="bt-line-detail">Every page you have been to, from the field and from here</div>
            </div>
            <button class="bt-pill" onClick={async () => { await cmd({ do: 'history.clear' } as Command); setClearing(false); void refetch() }}>Clear</button>
          </div>
        </div>
      }>
        <Show when={days().length} fallback={<div class="bt-card bt-nothing">{hunt() ? 'Nothing matches.' : 'Nothing yet.'}</div>}>
          <For each={days()}>
            {group => (
              <section class="hp-day">
                <div class="bt-caption">{group.day}</div>
                <div class="bt-card">
                  <For each={group.pages}>
                    {(p, i) => (
                      <>
                        <Show when={i() > 0}><div class="bt-rule" /></Show>
                        <div class="hp-row">
                          <a class="hp-go" href={p.url}>
                            <Show when={p.favicon} fallback={<span class="hp-letter">{(p.title || p.address).slice(0, 1).toUpperCase()}</span>}>
                              <img class="hp-icon" src={p.favicon} alt="" />
                            </Show>
                            <span class="hp-text">
                              <span class="hp-name">{p.title || p.address}</span>
                              <Show when={p.title}><span class="hp-address">{p.address}</span></Show>
                            </span>
                            <span class="hp-time">{time.format(new Date(p.last))}</span>
                          </a>
                          <button class="hp-remove" onClick={async () => { await cmd({ do: 'history.forget', url: p.url } as Command); void refetch() }}>Remove</button>
                        </div>
                      </>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </Show>
      </Show>
      <div class="hp-foot">
        <span class="bt-muted">{total() === 1 ? '1 page' : `${total().toLocaleString('en-US')} pages`}</span>
        <span class="bt-spacer" />
        <button class="bt-pill" onClick={() => setClearing(!clearing())}>{clearing() ? 'Back' : 'Clear…'}</button>
      </div>
    </div>
  )
}
