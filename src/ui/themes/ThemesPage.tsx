// Settings › Themes (ThemesPage.swift; studio/02 §8.3): the window in small
// with the chosen theme behind its field, the families, the family's
// presets, then its knobs. Every preview is the blank tab's own renderer.
// It runs in oriel://settings, under the Home background row.

import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch as Choose, type JSX } from 'solid-js'
import { call, onUpdate } from '../settings/bridge'
import { Pill, Segmented } from '../settings/controls'
import {
  families, familyOf, firstOf, gradients, hexOf, channels, packs, swatches, themePrefs, titles, tuningText, walls,
  type Family, type HomeTheme, type HomeTuning,
} from './model'
import { HomeBackground } from './Background'
import { picture } from './live'

type Prefs = Record<string, unknown>

export function ThemesPage() {
  const [prefs, setPrefs] = createSignal<Prefs>({})
  const [ready, setReady] = createSignal(false)
  const [accent, setAccent] = createSignal('#007AFF')
  const tp = () => themePrefs(prefs())
  /** The family on show: one with nothing chosen yet (no picture) can be on
   * show without being on the wall. */
  const [family, setFamily] = createSignal<Family>('off')
  const pic = picture(() => tp().image)

  onMount(async () => {
    const v = await call<{ prefs: Prefs } | null>({ do: 'settings.values' })
    if (v) { setPrefs(v.prefs); setFamily(familyOf(themePrefs(v.prefs).theme)) }
    setReady(true)
    onCleanup(onUpdate('prefs', p => setPrefs(p as Prefs)))
    const f = await call<{ accent: string } | null>({ do: 'themes.facts' }).catch(() => null)
    if (f?.accent) setAccent(f.accent)
  })

  const set = async (id: string, value: unknown) => {
    const v = await call<{ prefs: Prefs } | null>({ do: 'settings.set', id, value })
    if (v?.prefs) setPrefs(v.prefs)
  }
  const tune = (patch: Partial<HomeTuning>) => set('home.tuning', tuningText({ ...tp().tuning, ...patch }))
  const setTheme = (t: HomeTheme) => set('home.theme', t)

  const choose = (next: Family) => {
    setFamily(next)
    if (next === 'off') void setTheme('off')
    // On the wall only once there is a picture to put there.
    else if (next === 'image') { if (pic()) void setTheme('custom') }
    else if (familyOf(tp().theme) !== next) void setTheme(firstOf[next])
  }

  const grid = (cards: JSX.Element[]) => <div class="th-grid">{cards}</div>

  return (
    <Show when={ready()}>
      <div class="th" style={{ '--th-accent': accent() }}>
        <Mock prefs={prefs()} />

        <Segmented value={family()} set={choose} options={families} />

        <Choose>
          <Match when={family() === 'off'}>
            <div class="th-note">The blank tab stays plain.</div>
          </Match>
          <Match when={family() === 'wall'}>
            {grid(walls.map(theme => (
              <Card title={titles[theme]} on={tp().theme === theme} pick={() => void setTheme(theme)}>
                <HomeBackground theme={theme} tuning={tp().tuning} image={tp().image} thumbnail />
              </Card>
            )))}
          </Match>
          <Match when={family() === 'stickers'}>
            {grid(packs.map(([pack, title]) => (
              <Card title={title} on={tp().theme === 'stickers' && tp().tuning.pack === pack}
                pick={async () => { await tune({ pack }); await setTheme('stickers') }}>
                <HomeBackground theme="stickers" tuning={{ ...tp().tuning, pack }} thumbnail />
              </Card>
            )))}
          </Match>
          <Match when={family() === 'solid'}>
            <div class="th-solid">
              <For each={swatches}>{hex => (
                <button class="th-swatch" classList={{ on: tp().tuning.solid === hex && tp().theme === 'solid' }}
                  style={{ background: hex }} aria-label={`Colour ${hex}`}
                  onClick={async () => { await tune({ solid: hex }); await setTheme('solid') }} />
              )}</For>
              <Well title="Colour" value={tp().tuning.solid} set={async hex => { await tune({ solid: hex }); await setTheme('solid') }} />
            </div>
          </Match>
          <Match when={family() === 'gradient'}>
            <div class="th-gradient">
              {grid(gradients.map(g => (
                <Card title={g.title} on={tp().theme === 'gradient' && tp().tuning.gradientA === g.a && tp().tuning.gradientB === g.b}
                  pick={async () => { await tune({ gradientA: g.a, gradientB: g.b, angle: g.angle }); await setTheme('gradient') }}>
                  <HomeBackground theme="gradient" tuning={{ ...tp().tuning, gradientA: g.a, gradientB: g.b, angle: g.angle }} thumbnail />
                </Card>
              )))}
              <div class="th-wells">
                <Well title="From" value={tp().tuning.gradientA} set={async hex => { await tune({ gradientA: hex }); await setTheme('gradient') }} />
                <Well title="To" value={tp().tuning.gradientB} set={async hex => { await tune({ gradientB: hex }); await setTheme('gradient') }} />
              </div>
              <Slider title="Angle" value={tp().tuning.angle} max={360} unit="°" commit={async v => { await tune({ angle: v }); await setTheme('gradient') }} />
            </div>
          </Match>
          <Match when={family() === 'image'}>
            <div class="th-image">
              <div class="th-image-frame">
                <Show when={pic()} fallback={<div class="th-image-none"><Photo /></div>}>
                  <HomeBackground theme="custom" tuning={tp().tuning} image={tp().image} thumbnail />
                </Show>
              </div>
              <div class="th-image-side">
                <Pill title="Choose Image…" act={() => void call({ do: 'themes.choose' })} />
                <Show when={tp().image}>
                  <Pill title="Remove" act={() => void call({ do: 'themes.forget' })} />
                </Show>
                <div class="th-small">A copy is kept inside Oriel.</div>
              </div>
            </div>
          </Match>
        </Choose>

        <Show when={family() === 'wall' || family() === 'stickers'}>
          <label class="th-check">
            <input type="checkbox" checked={tp().shuffle} onChange={e => void set('home.shuffle', e.currentTarget.checked)} />
            Shuffle: a different one each day
          </label>
        </Show>

        <Show when={family() !== 'off' && (family() !== 'image' || !!pic())}>
          <div class="th-sliders">
            <Slider title="Intensity" value={tp().tuning.intensity * 100} max={100} unit="%" commit={v => void tune({ intensity: v / 100 })} />
            <Show when={tp().theme === 'stickers'}>
              <Slider title="Density" value={tp().tuning.density * 100} max={100} unit="%" commit={v => void tune({ density: v / 100 })} />
              <Slider title="Scale" value={tp().tuning.scale * 100} max={100} unit="%" commit={v => void tune({ scale: v / 100 })} />
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  )
}

/** The window in small: the tabs where yours are, the field in the middle,
 * the chosen theme behind it (live: the blank tab's own renderer). */
function Mock(p: { prefs: Prefs }) {
  const tp = () => themePrefs(p.prefs)
  const side = () => p.prefs['sidebar'] !== false
  const right = () => p.prefs['sidebar.position'] === 'right'
  return (
    <div class="th-mock" aria-hidden="true">
      <Show when={tp().theme !== 'off'}>
        <HomeBackground theme={tp().theme} tuning={tp().tuning} image={tp().image} shuffle={tp().shuffle} />
      </Show>
      <div class="th-mock-field">Search or enter address</div>
      <Show when={side()} fallback={
        <div class="th-mock-strip"><For each={[0, 1, 2, 3]}>{() => <span class="th-bar" />}</For></div>
      }>
        <div class="th-mock-column" classList={{ right: right() }}><For each={[0, 1, 2, 3]}>{() => <span class="th-bar" />}</For></div>
      </Show>
    </div>
  )
}

/** A preset: its picture 160 × 100 with a ring of the accent when chosen,
 * its name under it. */
function Card(p: { title: string; on: boolean; pick: () => void; children: JSX.Element }) {
  return (
    <button class="th-card" classList={{ on: p.on }} aria-label={p.title} aria-pressed={p.on} onClick={() => p.pick()}>
      <span class="th-ring"><span class="th-thumb">{p.children}</span></span>
      <span class="th-name">{p.title}</span>
    </button>
  )
}

/** ColorPicker: its label, then a well with the colour. */
function Well(p: { title: string; value: string; set: (hex: string) => void }) {
  return (
    <label class="th-well-row">
      <span>{p.title}</span>
      <span class="th-well" style={{ background: hexOf(channels(p.value)) }}>
        <input type="color" value={hexOf(channels(p.value)).toLowerCase()} aria-label={p.title}
          onInput={e => p.set(e.currentTarget.value.toUpperCase())} />
      </span>
    </label>
  )
}

/** A slider that is let go before it is applied: one painting is enough. */
function Slider(p: { title: string; value: number; max: number; unit: string; commit: (v: number) => void }) {
  const [held, setHeld] = createSignal<number | null>(null)
  let input!: HTMLInputElement
  createEffect(() => { if (held() === null && input) input.value = String(p.value) })
  return (
    <div class="th-slider">
      <span class="th-slider-title">{p.title}</span>
      <input ref={input} type="range" min="0" max={p.max} step="any" value={p.value} aria-label={p.title}
        onInput={e => setHeld(Number(e.currentTarget.value))}
        onChange={e => { const v = Number(e.currentTarget.value); setHeld(null); p.commit(v) }} />
      <span class="th-slider-value">{Math.round(held() ?? p.value)}{p.unit}</span>
    </div>
  )
}

/** SF's photo, in the settings symbols' manner. */
function Photo() {
  return (
    <svg width="17.6" height="17.6" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="1.8" y="3" width="12.4" height="10" rx="2" />
      <path d="m2.4 11.6 3.4-3.4 2.6 2.6 1.8-1.8 3.4 3.2" />
      <circle cx="10.6" cy="6.2" r="1.1" />
    </svg>
  )
}
