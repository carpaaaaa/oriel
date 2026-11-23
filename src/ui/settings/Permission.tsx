// A site's question, rising from the page's foot (PageQuestions.swift
// CaptureQuestion; studio/06 §2.6): "<site> wants to use your camera",
// Allow (or Allow once and Always allow for location) and Don't allow.

import { Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Symbol } from './symbols'

const icon = (wants: string) => (wants === 'location' ? 'location' : wants === 'microphone' ? 'mic' : wants === 'notifications' ? 'bell' : 'video')
const words = (host: string, wants: string) =>
  wants === 'location' ? `${host} wants to know your location`
    : wants === 'notifications' ? `${host} wants to send you notifications`
      : `${host} wants to use your ${wants}`

export function PermissionQuestion() {
  const ask = () => state.settings?.asking ?? null
  const answer = (a: 'allow' | 'once' | 'always' | 'deny') => void cmd({ do: 'permission.answer', answer: a })
  return (
    <Show when={ask()}>{q => (
      <div class="pq">
        <div class="pq-card" role="alertdialog" aria-label={words(q().host, q().wants)} data-ask={q().id}>
          <div class="pq-ask">
            <Symbol name={icon(q().wants)} size={11} weight="medium" />
            <span class="pq-text">{words(q().host, q().wants)}</span>
          </div>
          <div class="pq-actions">
            <button class="pq-allow" onClick={() => answer(q().once ? 'once' : 'allow')}>{q().once ? 'Allow once' : 'Allow'}</button>
            <Show when={q().once && q().keeps}><button class="pq-always" onClick={() => answer('always')}>Always allow</button></Show>
            <button class="pq-deny" onClick={() => answer('deny')}>Don't allow</button>
          </div>
        </div>
      </div>
    )}</Show>
  )
}
