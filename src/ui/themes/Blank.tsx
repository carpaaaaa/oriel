// The blank tab's own pieces: the wall behind the field (Stage.swift
// BlankWall, studio/02 §8.1-8.2) and a door to Settings in the card's
// bottom right corner (asked for on Windows; drawn as the column's doors,
// studio/02 §4.2).

import { Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { themePrefs } from './model'
import { HomeBackground } from './Background'

const prefs = () => themePrefs(state.prefs)

/** The wall: drawn only while a theme is chosen; the field's breath stops
 * over it, as on the Mac (Omnibox.swift UnlessThemed; themes.css). */
export function BlankWall() {
  return (
    <Show when={prefs().theme !== 'off'}>
      <HomeBackground class="blank-wall" theme={prefs().theme} tuning={prefs().tuning} image={prefs().image} shuffle={prefs().shuffle} />
    </Show>
  )
}

/** A gear of six teeth in the 16 box, 1.5 strokes with round ends, as
 * lib/icons.tsx draws: the body an arc between teeth, a hole in the middle. */
const gear = (() => {
  const c = 8, body = 4.6, tip = 6.5, n = 6
  const at = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`
  }
  let d = ''
  for (let i = 0; i < n; i++) {
    const t = i * (360 / n) - 90
    d += `${i ? 'L' : 'M'}${at(body, t - 15)}L${at(tip, t - 9)}L${at(tip, t + 9)}L${at(body, t + 15)}`
    d += `A${body} ${body} 0 0 1 ${at(body, t + 360 / n - 15)}`
  }
  return d + 'Z'
})()

export function Gear(p: { pt?: number }) {
  const box = () => +((p.pt ?? 11) * 1.1).toFixed(2)
  return (
    <svg width={box()} height={box()} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={gear} />
      <circle cx="8" cy="8" r="1.9" />
    </svg>
  )
}

/** The door: 26 × 26, radius 8, the symbol at 11 medium in muted, ink 70%
 * on the hover grey under the pointer; 14 in from the card's edges, as far
 * as the field keeps from its sides (min(560, width − 28)) and Find on Page
 * from the right. Over a theme it stands on the ground with a hairline, as
 * the field does there, so it reads on any wall. */
export function SettingsDoor() {
  return (
    <button class="blank-door" classList={{ themed: prefs().theme !== 'off' }} title="Settings" aria-label="Settings"
      onClick={() => void cmd({ do: 'app.settings' })}>
      <Gear pt={11} />
    </button>
  )
}
