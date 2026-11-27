// The Settings button (settings.door, Oriel's own: carpa, 27 Nov 2026, "the
// settings button up at the top right, so you always have it"). A door of
// 26 with the gear, up where the bookmark button is (data/where.ts), just
// before it: the strip's end with the tabs across the top, else the band
// beside the window's buttons. A click opens Settings, or goes to its tab.
// Settings › Appearance › Show the Settings button. Owned by the settings module.

import { Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { bookmarkPlace, type DoorPlace } from '../data/where'
import { Symbol } from './symbols'

export const settingsDoorOn = () => !!state.prefs?.['settings.door']

export function SettingsDoor(p: { where: DoorPlace }) {
  return (
    <Show when={settingsDoorOn() && bookmarkPlace() === p.where}>
      <button class="door settings-door" title="Settings   Ctrl+," aria-label="Settings" data-where={p.where}
        onClick={() => void cmd({ do: 'settings.open' })}>
        <Symbol name="gearshape" size={13} />
      </button>
    </Show>
  )
}
