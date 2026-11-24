// oriel://release-notes, "What's New": every version's notes, newest first
// (WhatsNew.swift:860-919, studio/02 §8.6), read from the repository's
// GitHub Releases. Opened once after an update, and from Settings › About.

import { createResource, For, Show } from 'solid-js'
import { call } from '../settings/bridge'
import { Card, Nothing, PlatePage } from '../settings/controls'

interface Release { version: string; name: string; date: string; body: string }
type Line = { kind: 'section' | 'item' | 'text'; text: string }

/** Markdown as the notes are written: headings, bullets, lines. */
export function lines(body: string): Line[] {
  const clean = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim()
  return body.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim()).map((l): Line => {
    if (/^\s*#{1,6}\s/.test(l)) return { kind: 'section', text: clean(l.replace(/^\s*#+\s*/, '')) }
    if (/^\s*[-*+]\s/.test(l)) return { kind: 'item', text: clean(l.replace(/^\s*[-*+]\s+/, '')) }
    return { kind: 'text', text: clean(l) }
  })
}

const day = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) } catch { return '' } }

export function ReleaseNotesPage() {
  document.title = "What's New"
  const [data] = createResource(() => call<{ list: Release[]; error: string | null }>({ do: 'update.notes' }))
  return (
    <PlatePage title="What's New">
      <Show when={data()}>{d => (
        <Show when={d().list.length} fallback={<Card><Nothing text={d().error ?? 'No notes yet.'} /></Card>}>
          <div class="rn">
            <For each={d().list}>{r => (
              <section class="rn-version" data-version={r.version}>
                <div class="rn-head"><span class="rn-name">Oriel {r.version}</span><span class="rn-date">{day(r.date)}</span></div>
                <Show when={r.name && r.name.replace(/^v/, '') !== r.version}><div class="rn-title">{r.name}</div></Show>
                <For each={lines(r.body)}>{l => (
                  l.kind === 'section' ? <div class="rn-section">{l.text}</div>
                    : l.kind === 'item' ? <div class="rn-item"><span class="rn-dot">•</span><span>{l.text}</span></div>
                      : <div class="rn-text">{l.text}</div>
                )}</For>
              </section>
            )}</For>
          </div>
        </Show>
      )}</Show>
    </PlatePage>
  )
}
