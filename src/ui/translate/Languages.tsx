// Settings › Browsing › Pages › Translation languages (studio/06 row 84,
// translate.target on the Mac, one language there): on Windows a tick for
// each language Mozilla's models can translate into; the ticked ones are
// what the page's right-click menu offers. English alone to begin with; one
// stays ticked. Owned by the translate module.

import { For } from 'solid-js'
import { translateLanguages } from '../../shared/modules/translate'

export function TranslateLanguages(p: { value: string[]; set: (codes: string[]) => void }) {
  const on = (code: string) => p.value.includes(code)
  const flip = (code: string, ticked: boolean) => {
    const next = translateLanguages.map(l => l.code).filter(c => (c === code ? ticked : on(c)))
    if (next.length) p.set(next)
  }
  return (
    <div class="tr-langs" role="group" aria-label="Translation languages">
      <For each={translateLanguages}>{l => (
        <label class="tr-lang" data-lang={l.code}>
          <input type="checkbox" checked={on(l.code)} disabled={on(l.code) && p.value.length === 1}
            onChange={e => flip(l.code, e.currentTarget.checked)} />
          <span>{l.name}</span>
        </label>
      )}</For>
    </div>
  )
}
