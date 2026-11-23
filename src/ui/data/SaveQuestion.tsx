// The question after a sign-in that took (PageQuestions.PasswordOffer,
// studio/05 §2.3): Save or Update, Not now, Never here.

import { Show } from 'solid-js'
import { state, cmd } from '../lib/store'

export function SaveQuestion() {
  const q = () => state.data?.save ?? null
  return (
    <Show when={q()}>
      {s => (
        <div class="offer">
          <span class="offer-text">
            {s().changed
              ? `Update the password for ${s().user} on ${s().host}?`
              : s().user ? `Save the password for ${s().user} on ${s().host}?` : `Save this password for ${s().host}?`}
          </span>
          <span class="offer-actions">
            <button class="offer-keep" onClick={() => void cmd({ do: 'save.answer', answer: 'save' })}>{s().changed ? 'Update' : 'Save'}</button>
            <button class="offer-quiet" onClick={() => void cmd({ do: 'save.answer', answer: 'notNow' })}>Not now</button>
            <Show when={!s().changed}>
              <button class="offer-quiet" onClick={() => void cmd({ do: 'save.answer', answer: 'never' })}>Never here</button>
            </Show>
          </span>
        </div>
      )}
    </Show>
  )
}
