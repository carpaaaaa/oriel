// A private tab says so (studio/01 §2.35, §3.7: "A tab that keeps nothing"):
// over the blank page, above the field, on a plate that reads on any wall.
// Gone once the tab has a page, or something typed in the field.

import { Show } from 'solid-js'
import { state } from '../lib/store'
import { G } from '../sidebar/glyphs'

export function PrivateNote() {
  const tab = () => state.tabs.find(t => t.id === state.activeID)
  return (
    <Show when={tab()?.shy && tab()?.empty}>
      <div class="private-note" data-window-ui="private-note" role="note">
        <span class="private-mark"><G.eyeSlash pt={15} /></span>
        <span class="private-words">
          <span class="private-title">A tab that keeps nothing</span>
          <span class="private-detail">Its history, cookies and sign-ins are gone when you close it.</span>
        </span>
      </div>
    </Show>
  )
}
