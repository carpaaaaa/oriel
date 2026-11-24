// The window module's pieces in the overlay. In full screen the window's
// buttons come down with the pointer at the top of the screen (studio/01
// §1.19-§1.22, as macOS brings the lights back; main/window/edges.ts raises
// the layer): a strip of 40 over the page with Minimize, Exit Full Screen and
// Close, so a window is never left without a way out.

import { createEffect, createRoot } from 'solid-js'
import { registerPanel } from '../lib/registry'
import { cmd, state } from '../lib/store'
import { CaptionButtons, buttonStyle } from './Buttons'

function Reveal() {
  return (
    <div class="reveal-strip" classList={{ inline: buttonStyle() === 'inline' }} data-window-ui="reveal">
      <CaptionButtons full />
    </div>
  )
}

registerPanel('window.reveal', Reveal)

// Motion for both roots (Design.swift Motion): Reduce animations makes every
// transition immediate (motion.instant); Save power in Low Power Mode makes
// glide and settle a short ease-out while Windows saves power (motion.light).
createRoot(() => createEffect(() => {
  const p = state.prefs ?? {}
  const root = document.documentElement.dataset
  root.motion = p['motion.instant'] ? 'instant' : p['motion.light'] && state.power?.saving ? 'light' : ''
  // Tabs give when pressed (tabs.give, Design.swift Motion.give)
  if (p['tabs.give']) root.give = '1'; else delete root.give
}))
