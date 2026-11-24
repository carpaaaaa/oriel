// The window module's pieces in the overlay. In full screen the window's
// buttons come down with the pointer at the top of the screen (studio/01
// §1.19-§1.22, as macOS brings the lights back; main/window/edges.ts raises
// the layer): a strip of 40 over the page with Minimize, Exit Full Screen and
// Close, so a window is never left without a way out.

import { registerPanel } from '../lib/registry'
import { cmd } from '../lib/store'
import { WinClose, WinMinimize, WinRestore } from '../lib/icons'

function Reveal() {
  return (
    <div class="reveal-strip" data-window-ui="reveal">
      <div class="caption-buttons">
        <button class="minimize" title="Minimize" onClick={() => cmd({ do: 'window.minimize' })}><WinMinimize /></button>
        <button class="maximize" title="Exit Full Screen" onClick={() => cmd({ do: 'window.fullScreen', on: false })}><WinRestore /></button>
        <button class="close" title="Close" onClick={() => cmd({ do: 'window.close' })}><WinClose /></button>
      </div>
    </div>
  )
}

registerPanel('window.reveal', Reveal)
