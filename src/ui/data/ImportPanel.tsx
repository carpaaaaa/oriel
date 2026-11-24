// Bring Things Over (ImportPanel.swift, studio/05 §1.12): the browsers on
// this PC, what each holds, what to bring, and what came. Texts are the
// Mac's, with this PC, Windows and the app's name where the Mac says this
// Mac, macOS or the keychain.

import { For, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { Dropdown } from '../lib/Dropdown'
import { appName, type ImportPanelState, type ImportPreview, type ImportSourceView } from '../../shared/modules/data'

const n = (x: number) => x.toLocaleString('en-US')
const plural = (x: number, one: string) => x === 1 ? `1 ${one}` : `${n(x)} ${one}s`
const dayMonth = (ms: number) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(ms))
const listed = (parts: string[]) => parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]

function profileOf(s: ImportPanelState, v: ImportSourceView): string | null {
  const id = s.chosen[v.id] ?? v.usual ?? ''
  return id || null
}
function previewOf(s: ImportPanelState, v: ImportSourceView): ImportPreview | undefined {
  return s.previews[`${v.id}/${profileOf(s, v) ?? ''}`]
}

function detail(s: ImportPanelState, v: ImportSourceView): string {
  const p = previewOf(s, v)
  if (!p) return 'Counting…'
  const parts: string[] = []
  if (v.profiles.length > 1) parts.push(`${v.profiles.length} profiles`)
  for (const [x, one] of [[p.bookmarks, 'bookmark'], [p.places, 'place'], [p.passwords, 'password']] as [number, string][]) if (x > 0) parts.push(plural(x, one))
  if (v.record) parts.push(`brought ${dayMonth(v.record.date)}`)
  return parts.length ? parts.join(' · ') : 'Nothing to bring in'
}

function broughtBefore(r: NonNullable<ImportSourceView['record']>): string {
  const parts = ([[r.bookmarks, 'bookmark'], [r.places, 'place'], [r.passwords, 'password']] as [number, string][])
    .filter(([x]) => x > 0).map(([x, one]) => plural(x, one))
  return `${parts.length ? listed(parts) : 'Nothing new'}, ${dayMonth(r.date)}`
}

/** How its passwords come, in a line under "Passwords". */
function passwordsDetail(v: ImportSourceView, p: ImportPreview | undefined): string {
  const name = v.name
  if (v.passwords === 'none') return `Not supported for ${name}`
  if (p && p.passwords === 0) return `None in ${name}`
  if (v.passwords === 'read') return `Read from ${name}'s own files, unless it has a primary password`
  if (v.passwords === 'csv') return `Export them from ${name} and bring in the CSV file`
  const readable = p?.passwordsReadable ?? 0, locked = p?.passwordsLocked ?? 0
  if (locked && !readable) return `${name} locks its passwords to itself: export them from it and bring in the CSV file`
  if (locked) return `${n(readable)} can be read here; ${n(locked)} are locked to ${name}: bring those in from its CSV file`
  return `Read from ${name}'s own files on this PC, once you allow it`
}

function Switch(props: { on: boolean; none?: boolean; label: string; set: (on: boolean) => void }) {
  return (
    <button
      class="bt-switch"
      classList={{ 'bt-on': props.on && !props.none, 'bt-none': !!props.none }}
      role="switch"
      aria-checked={props.on && !props.none}
      aria-label={props.label}
      disabled={props.none}
      onClick={() => props.set(!props.on)}
    ><span class="bt-knob" /></button>
  )
}

function Line(props: { title: string; detail?: string; children?: any }) {
  return (
    <div class="bt-line">
      <div class="bt-line-text">
        <div class="bt-line-title">{props.title}</div>
        <Show when={props.detail}><div class="bt-line-detail">{props.detail}</div></Show>
      </div>
      <div class="bt-line-control">{props.children}</div>
    </div>
  )
}

function Options(props: { s: ImportPanelState; v: ImportSourceView }) {
  const p = () => previewOf(props.s, props.v)
  const name = () => props.v.name
  const wants = () => props.s.wants
  const set = (key: keyof ImportPanelState['wants']) => (on: boolean) => void cmd({ do: 'import.option', key, on })
  const passwordsNone = () => props.v.passwords === 'none' || props.v.passwords === 'csv' || p()?.passwords === 0
    || (props.v.passwords === 'consent' && (p()?.passwordsReadable ?? 0) === 0)
  const locked = () => props.v.passwords === 'csv' || (p()?.passwordsLocked ?? 0) > 0
  return (
    <div class="bt-card bt-options">
      <Show when={props.v.record}>
        {r => <><Line title="Brought before" detail={broughtBefore(r())} /><div class="bt-rule" /></>}
      </Show>
      <Show when={props.v.profiles.length > 1}>
        <Line title="Profile">
          <Dropdown
            class="bt-profile"
            size="small"
            label="Profile"
            value={props.s.chosen[props.v.id] ?? props.v.usual ?? ''}
            set={profile => void cmd({ do: 'import.profile', source: props.v.id, profile })}
            options={[
              ...props.v.profiles.map((pr): [string, string] => [pr.id, pr.id === props.v.usual ? `Most recent: ${pr.name}` : pr.name]),
              null,
              ['', 'All profiles'],
            ]}
          />
        </Line>
        <div class="bt-rule" />
      </Show>
      <Line title="Passwords" detail={passwordsDetail(props.v, p())}>
        <Show when={locked()}>
          <button class="bt-pill bt-quiet" onClick={() => void cmd({ do: 'import.how', source: props.s.how === props.v.id ? null : props.v.id })}>
            {props.s.how === props.v.id ? 'Hide' : 'How'}
          </button>
        </Show>
        <Switch label="Passwords" on={wants().passwords} none={passwordsNone()} set={set('passwords')} />
      </Line>
      <Show when={props.s.how === props.v.id}>
        <div class="bt-steps">
          In {name()}, open {props.v.exportAt}, choose Export passwords, and save the file. Then press File… below and choose it.
          Delete the file afterwards: it holds your passwords in the clear.
        </div>
      </Show>
      <Show when={props.v.passwords === 'consent' && wants().passwords && !passwordsNone()}>
        <div class="bt-rule" />
        <Line title={`Allow ${appName} to read them`} detail={`Windows opens ${name()}'s passwords for ${appName} this once, on this PC. Nothing in ${name()} changes.`}>
          <Switch label="Allow" on={!!props.s.consent[props.v.id]} set={on => void cmd({ do: 'import.consent', source: props.v.id, on })} />
        </Line>
      </Show>
      <div class="bt-rule" />
      <Line title="Bookmarks" detail={p()?.bookmarks === 0 ? `None in ${name()}` : `In a “${name()}” folder, or at the top if you have none yet`}>
        <Switch label="Bookmarks" on={wants().bookmarks} none={p()?.bookmarks === 0} set={set('bookmarks')} />
      </Line>
      <Show when={wants().bookmarks && p()?.bookmarks !== 0 && props.v.record}>
        {r => (
          <>
            <div class="bt-rule" />
            <Line
              title={`Replace what came from ${name()} before`}
              detail={r().recorded
                ? `Its bookmarks from ${dayMonth(r().date)} go, and these come fresh; passwords only ever add`
                : `Nothing recorded from ${name()} yet: only what is new comes`}
            >
              <Switch label="Replace" on={wants().replace} none={!r().recorded} set={set('replace')} />
            </Line>
          </>
        )}
      </Show>
      <div class="bt-rule" />
      <Line title="History" detail={p()?.places === 0 ? `None in ${name()}` : `The last ${n(p()?.places ?? 3000)} places`}>
        <Switch label="History" on={wants().history} none={p()?.places === 0} set={set('history')} />
      </Line>
      <Show when={(p()?.extensions.length ?? 0) > 0}>
        <div class="bt-rule" />
        <Line title="Extensions" detail={`${p()!.extensions.length} found: installed fresh from the Chrome Web Store, you say yes to each one`}>
          <Switch label="Extensions" on={wants().extensions} set={set('extensions')} />
        </Line>
      </Show>
    </div>
  )
}

export function ImportPanel() {
  const s = () => state.data?.import ?? null
  const picked = () => s()?.sources.find(v => v.id === s()?.pick) ?? null
  const canBring = () => {
    const panel = s(), v = picked()
    if (!panel || !v) return false
    const p = previewOf(panel, v)
    const w = panel.wants
    return !panel.bringing && !!p && ((w.passwords && p.passwords > 0 && v.passwords !== 'none' && v.passwords !== 'csv')
      || (w.bookmarks && p.bookmarks > 0) || (w.history && p.places > 0) || (w.extensions && p.extensions.length > 0))
  }
  return (
    <Show when={s()}>
      {panel => (
        <div class="bt-veil bt-import-veil" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'import.close' }) }}>
          <div class="bt-plate bt-import" role="dialog" aria-label="Bring things over">
            <div class="bt-plate-head">
              <div class="bt-plate-title">Bring things over</div>
              <button class="bt-plate-close" aria-label="Close" onClick={() => void cmd({ do: 'import.close' })}>×</button>
            </div>
            <div class="bt-plate-body">
              <p class="bt-muted">Nothing in the other browser changes. Passwords go into {appName}, sealed by Windows.</p>
              <Show when={!panel().looking} fallback={<p class="bt-muted bt-looking"><span class="bt-ring" />Looking on this PC…</p>}>
                <Show when={panel().sources.length} fallback={<div class="bt-card bt-nothing">No other browser found on this PC.</div>}>
                  <div class="bt-caption">On this PC</div>
                  <div class="bt-card">
                    <For each={panel().sources}>
                      {(v, i) => (
                        <>
                          <Show when={i() > 0}><div class="bt-rule" /></Show>
                          <button class="bt-source" classList={{ 'bt-chosen': panel().pick === v.id }} onClick={() => void cmd({ do: 'import.pick', source: v.id })}>
                            <span class="bt-dot" />
                            <span class="bt-source-text">
                              <span class="bt-source-name">{v.name}</span>
                              <span class="bt-source-detail">{detail(panel(), v)}</span>
                              <span class="bt-source-can">{v.canBring}</span>
                            </span>
                          </button>
                        </>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
              <Show when={picked()}>{v => <Options s={panel()} v={v()} />}</Show>
            </div>
            <div class="bt-plate-foot">
              <Show when={panel().brought}>
                {said => (
                  <div class="bt-said">
                    <For each={said()}>
                      {line => <div class="bt-said-line" classList={{ 'bt-bad': !line.ok }}><span class="bt-said-mark">{line.ok ? '✓' : '!'}</span>{line.text}</div>}
                    </For>
                  </div>
                )}
              </Show>
              <div class="bt-foot-row">
                <Show when={picked() && !panel().brought}>
                  <button class="bt-pill bt-filled" disabled={!canBring()} onClick={() => void cmd({ do: 'import.run' })}>
                    {panel().bringing ? 'Bringing…' : 'Bring them in'}
                  </button>
                </Show>
                <Show when={panel().clearFile}>
                  {file => <button class="bt-pill" onClick={() => void cmd({ do: 'import.trashFile', path: file() })}>Move it to the Recycle Bin</button>}
                </Show>
                <span class="bt-spacer" />
                <button class="bt-pill" disabled={panel().bringing} onClick={() => void cmd({ do: 'import.file' })}>File…</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
