// The accounts hanging under a sign-in box (Accounts.swift AccountList,
// Browser.hang; studio/05 §2.4): up to five, the letter, the name and the
// site; the site's other hosts under their own line; lit by the arrow keys.

import { For, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { appName } from '../../shared/modules/data'

export function FillList() {
  const list = () => state.data?.fill ?? null
  return (
    <Show when={list()}>
      {l => (
        <div class="accounts" role="listbox">
          <For each={l().accounts}>
            {(a, i) => (
              <>
                <Show when={l().othersFrom === i()}>
                  <div class="accounts-rule">Other accounts on {l().domain}</div>
                </Show>
                <button
                  class="account"
                  classList={{ lit: l().lit === i() }}
                  role="option"
                  onPointerDown={e => e.preventDefault()}
                  onClick={() => void cmd({ do: 'fill.pick', index: i() })}
                >
                  <span class="account-letter">{(a.user || a.host).slice(0, 1).toUpperCase()}</span>
                  <span class="account-text">
                    <span class="account-name">{a.user || 'No name'}</span>
                    <span class="account-host">{a.host}</span>
                  </span>
                </button>
              </>
            )}
          </For>
          <div class="accounts-foot">Saved in {appName}</div>
        </div>
      )}
    </Show>
  )
}
