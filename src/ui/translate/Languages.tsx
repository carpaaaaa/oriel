// Settings › Browsing › Pages › Translation languages (studio/06 row 84,
// translate.target on the Mac, one language there in a pop-up menu): on
// Windows several, for the page's right-click menu. Drawn as Search draws
// its own lists (Always translate, pop-up sites): the row's pop-up button
// adds a language, and each chosen one is a line under the row with Remove.
// English alone to begin with; the last one can't be removed. Kept in the
// list's order (English first, then by name). Owned by the translate module.
// (The user's wish, 24 Nov 2026: a grid of 58 ticks was not clean.)

import { For } from 'solid-js'
import { translateLanguages } from '../../shared/modules/translate'
import { Dropdown } from '../lib/Dropdown'
import { Line, Pill } from '../settings/controls'

const nameOf = (code: string) => translateLanguages.find(l => l.code === code)?.name ?? code
const ordered = (codes: string[]) => translateLanguages.map(l => l.code).filter(c => codes.includes(c))

/** The row's control: a pop-up button with the languages not chosen yet. */
export function TranslateAdd(p: { value: string[]; set: (codes: string[]) => void }) {
  const rest = () => translateLanguages.filter(l => !p.value.includes(l.code)).map(l => [l.code, l.name] as [string, string])
  return (
    <Dropdown class="tr-add" label="Add a translation language" value="" disabled={!rest().length}
      options={[['', 'Add Language…'], null, ...rest()]} set={v => { if (v) p.set(ordered([...p.value, v])) }} />
  )
}

/** Under the row: each chosen language, with Remove. */
export function TranslateChosen(p: { value: string[]; set: (codes: string[]) => void }) {
  return (
    <div class="st-under tr-chosen" role="list" aria-label="Translation languages">
      <For each={ordered(p.value)}>{code => (
        <div role="listitem" data-lang={code}>
          <div class="st-rule" />
          <Line title={nameOf(code)}>
            <Pill title="Remove" disabled={p.value.length <= 1} help={p.value.length <= 1 ? 'One language stays' : undefined}
              act={() => { const next = p.value.filter(c => c !== code); if (next.length) p.set(next) }} />
          </Line>
        </div>
      )}</For>
    </div>
  )
}
