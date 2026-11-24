// Keyboard & Mouse › Shortcuts (ShortcutsPage.swift; studio/03 §4.2): every
// command with its key, a card to a menu, narrowed by name or key. Click a
// key and press the new one; Escape stops, Backspace takes it off; a key
// another command has says so, and pressed again moves here. Right-click a
// line to clear it or put the default back. The keys are Windows' (keys.ts).

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { announce, call, onUpdate } from './bridge'
import { Caption, Card, Hunt, Line, Nothing, Pill } from './controls'
import { PopMenu } from './PopMenu'
import type { ShortcutLine, ShortcutsView } from '../../shared/modules/settings'

// Kept by id: a command's box, listening for a key, stays through updates.
type View = Omit<ShortcutsView, 'sections'> & { sections: (ShortcutsView['sections'][number] & { id: string })[]; ready: boolean }
const [view, setView] = createStore<View>({ sections: [], numbers: { keys: '', note: '' }, extensions: [], fixed: [], changed: false, ready: false })
async function load(): Promise<void> {
  const v = await call<ShortcutsView>({ do: 'settings.shortcuts' })
  if (v) setView(reconcile({ ...v, sections: v.sections.map(s => ({ ...s, id: s.name })), ready: true }, { key: 'id' }))
}

/** The menu Oriel's app menu is: Search's own on the Mac. */
const caption = (section: string) => (section === 'Search' ? 'Oriel' : section)
const squash = (s: string) => s.toLowerCase().replace(/[\s+]/g, '')

export function ShortcutsEditor() {
  const [hunt, setHunt] = createSignal('')
  onMount(() => {
    void load()
    const a = onUpdate('prefs', () => void load())
    const b = onUpdate('ext', () => void load())
    onCleanup(() => { a(); b() })
  })
  const words = () => hunt().trim()
  /** By name, or by key as Windows writes it: "tab" and "Ctrl+T" both find New Tab. */
  const fits = (l: ShortcutLine) => {
    const w = words()
    if (!w) return true
    return l.title.toLowerCase().includes(w.toLowerCase()) || (l.detail ?? '').toLowerCase().includes(w.toLowerCase())
      || [l.key, ...l.also].some(k => !!k && squash(k).includes(squash(w)))
  }
  const numbersFit = () => {
    const w = words().toLowerCase()
    if (!w) return true
    const mod = view.numbers.keys.split('+')[0]
    return 'tab 1 to 9'.includes(w) || 'numbers'.includes(w) || squash(view.numbers.keys).includes(squash(w))
      || [1, 2, 3, 4, 5, 6, 7, 8, 9].some(n => squash(`${mod}+${n}`).includes(squash(w)))
  }
  const extensions = () => view.extensions.filter(fits)
  const fixed = () => view.fixed.filter(fits)
  const nothing = () => !view.sections.some(s => s.lines.some(fits)) && !numbersFit() && !extensions().length && !fixed().length
  return (
    <div class="kbset">
      <Hunt value={hunt()} set={setHunt} prompt="Search commands or keys" />
      <Show when={view.ready}>
        <>
          <Show when={nothing()}><Nothing text="No command called that, or on that key" /></Show>
          <For each={view.sections}>{s => {
            const lines = () => s.lines.filter(fits)
            const numbered = () => s.name === 'Tabs' && numbersFit()
            return (
              <Show when={lines().length || numbered()}>
                <div class="kbset-section" data-section={s.name}>
                  <Caption text={caption(s.name)} />
                  <Card>
                    <Lines lines={lines()} />
                    <Show when={numbered()}>
                      <Show when={lines().length}><div class="st-rule" /></Show>
                      <Line title="Tab 1 to 9" detail={view.numbers.note} class="kbset-line" >
                        <span class="kbset-key fixed" title="Set in Settings › Spaces & Pins">{view.numbers.keys}</span>
                      </Line>
                    </Show>
                  </Card>
                </div>
              </Show>
            )
          }}</For>
          <Show when={extensions().length}>
            <div class="kbset-section" data-section="Extensions">
              <Caption text="Extensions" />
              <Card><Lines lines={extensions()} /></Card>
            </div>
          </Show>
          <Show when={fixed().length}>
            <div class="kbset-section" data-section="Fixed">
              <Caption text="Always these keys" />
              <Card><Lines lines={fixed()} /></Card>
            </div>
          </Show>
          <Show when={view.changed && !words()}>
            <div class="kbset-reset"><Pill title="Reset All to Defaults" act={() => void call({ do: 'settings.shortcutResetAll' })} /></div>
          </Show>
        </>
      </Show>
    </div>
  )
}

function Lines(q: { lines: ShortcutLine[] }) {
  return (
    <For each={q.lines}>{(l, k) => (
      <>
        <Show when={k() > 0}><div class="st-rule" /></Show>
        <CommandLine line={l} />
      </>
    )}</For>
  )
}

function CommandLine(q: { line: ShortcutLine }) {
  let openAt: ((at: { x: number; y: number }) => void) | undefined
  const detail = () => [q.line.detail, q.line.also.length ? `Also ${q.line.also.join(', ')}` : ''].filter(Boolean).join(' · ')
  return (
    <div class="kbset-row" data-command={q.line.id} onContextMenu={e => { if (q.line.fixed) return; e.preventDefault(); openAt?.({ x: e.clientX, y: e.clientY }) }}>
      <Line title={q.line.title} detail={detail() || undefined} class="kbset-line">
        <Show when={!q.line.fixed} fallback={<span class="kbset-key fixed" title="Can't be changed">{q.line.key ?? 'None'}</span>}>
          <KeyBox line={q.line} />
        </Show>
      </Line>
      <PopMenu label={`Shortcut for ${q.line.title}`} opener={o => (openAt = o)} items={() => [
        { label: 'Clear Shortcut', disabled: !q.line.key, act: () => void call({ do: 'settings.shortcutClear', id: q.line.id }) },
        { label: 'Reset to Default', disabled: !q.line.changed, act: () => void call({ do: 'settings.shortcutReset', id: q.line.id }) },
      ]} />
    </div>
  )
}

interface KeyAnswer { problem?: string | null; owner?: string; name?: string; again?: string; done?: boolean; said?: string | null }

/** The key a command is on. Click it and press another: that key moves here,
 * from whichever command had it. Escape stops without changing it,
 * Backspace takes it off (ShortcutsPage.swift KeyBox). */
function KeyBox(q: { line: ShortcutLine }) {
  const [listening, setListening] = createSignal(false)
  const [note, setNote] = createSignal<string | null>(null)
  /** A key another command has, pressed once: pressed again, it moves here. */
  const [taking, setTaking] = createSignal<{ owner: string; again: string } | null>(null)
  const label = () => {
    const t = taking()
    if (t) return `Used by ${t.owner}, press again`
    return note() ?? (listening() ? 'Type a shortcut' : q.line.key ?? 'None')
  }
  const say = (text: string) => { setNote(text); setTimeout(() => { if (note() === text) setNote(null) }, 1200) }

  const keys = (e: KeyboardEvent) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    void take(e)
  }
  const stop = () => {
    if (!listening()) return
    window.removeEventListener('keydown', keys, true)
    setListening(false)
    setNote(null)
    setTaking(null)
    void call({ do: 'settings.recordKeys', on: false })
  }
  const listen = () => {
    if (listening()) return stop()
    setListening(true)
    setNote(null)
    setTaking(null)
    window.addEventListener('keydown', keys, true)
    void call({ do: 'settings.recordKeys', on: true })
  }
  async function take(e: KeyboardEvent): Promise<void> {
    const held = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey
    if (e.key === 'Escape' && !held) return stop()
    if ((e.key === 'Backspace' || e.key === 'Delete') && !held) {
      await call({ do: 'settings.shortcutClear', id: q.line.id })
      return stop()
    }
    if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Process', 'Dead'].includes(e.key) || e.isComposing) return
    const chord = { key: e.key, code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, altGraph: e.getModifierState('AltGraph') }
    const r = await call<KeyAnswer>({ do: 'settings.shortcutKey', id: q.line.id, chord, again: taking()?.again }).catch(() => null)
    if (!r || !listening()) return
    if (r.problem) { setTaking(null); say(r.problem); return }
    if (r.owner && r.again) { setTaking({ owner: r.owner, again: r.again }); return }
    if (r.done) { stop(); announce(r.said) }
  }
  onCleanup(stop)
  return (
    <button class="kbset-key" classList={{ listening: listening(), changed: q.line.changed, none: !q.line.key && !listening() }}
      title="Click, then press the new shortcut" onClick={listen} onBlur={stop}>
      {label()}
    </button>
  )
}
