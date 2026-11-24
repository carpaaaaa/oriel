// The window's three buttons, drawn by Oriel (Settings › Themes › Window
// buttons, window.buttons; tavole/pulsanti-finestra.html, chosen 24 Nov):
//  - Inline (the default): three doors like the column's (26 × 26, radius 8,
//    symbols of 11 drawn as the column's), 4 apart, 10 from the window's
//    right edge as the column's are from its left, on the same middle as
//    back, forward and reload (26 down a band of 52);
//  - Classic: Windows' places (46 × 40 in the corner), its symbols cleaned
//    up (round ends, the doors' grey), a rounded ground under the pointer
//    (radius 8, the window's 17.5 less 4 in the corner), close in full red.
// Each symbol sits on whole pixels in the middle of its box, so none looks
// half a pixel off (test/window_buttons.py measures it).

import { Show } from 'solid-js'
import { state, cmd } from '../lib/store'

export type ButtonStyle = 'inline' | 'classic'
export const buttonStyle = (): ButtonStyle => (state.prefs?.['window.buttons'] === 'classic' ? 'classic' : 'inline')

/** Inline: drawn in 16 like the column's symbols, shown at 12 (a whole-pixel box). */
const inline = {
  minimize: () => <svg width="12" height="12" viewBox="0 0 16 16"><path d="M2.6 8h10.8" /></svg>,
  maximize: () => <svg width="12" height="12" viewBox="0 0 16 16"><rect x="2.8" y="2.8" width="10.4" height="10.4" rx="2.6" /></svg>,
  restore: () => <svg width="12" height="12" viewBox="0 0 16 16"><rect x="2.4" y="5.2" width="8.4" height="8.4" rx="2.2" /><path d="M5.2 5.2v-.4c0-1.2 1-2.2 2.2-2.2h4c1.2 0 2.2 1 2.2 2.2v4c0 1.2-1 2.2-2.2 2.2h-.6" /></svg>,
  close: () => <svg width="12" height="12" viewBox="0 0 16 16"><path d="m3.6 3.6 8.8 8.8m0-8.8-8.8 8.8" /></svg>,
}
/** Classic: Windows' 10, cleaned up. */
const classic = {
  minimize: () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="M.8 5h8.4" /></svg>,
  maximize: () => <svg width="10" height="10" viewBox="0 0 10 10"><rect x=".8" y=".8" width="8.4" height="8.4" rx="2" /></svg>,
  restore: () => <svg width="10" height="10" viewBox="0 0 10 10"><rect x=".8" y="2.6" width="6.6" height="6.6" rx="1.6" /><path d="M2.6 2.6v-.2c0-.9.7-1.6 1.6-1.6h3.4c.9 0 1.6.7 1.6 1.6v3.4c0 .9-.7 1.6-1.6 1.6h-.2" /></svg>,
  close: () => <svg width="10" height="10" viewBox="0 0 10 10"><path d="m1 1 8 8m0-8-8 8" /></svg>,
}

/** The three buttons; `full` in the strip that comes down in full screen. */
export function CaptionButtons(p: { full?: boolean }) {
  const g = () => (buttonStyle() === 'classic' ? classic : inline)
  const maximized = () => state.maximized || state.frame?.state === 'maximized'
  return (
    <div class="caption-buttons" classList={{ [buttonStyle()]: true }} data-style={buttonStyle()}>
      <button class="minimize" title="Minimize" onClick={() => cmd({ do: 'window.minimize' })}><span class="hl" />{g().minimize()}</button>
      <Show when={!p.full} fallback={
        <button class="maximize" title="Exit Full Screen" onClick={() => cmd({ do: 'window.fullScreen', on: false })}><span class="hl" />{g().restore()}</button>
      }>
        <button class="maximize" title={maximized() ? 'Restore Down' : 'Maximize'} onClick={() => cmd({ do: 'window.maximize' })}>
          <span class="hl" />{maximized() ? g().restore() : g().maximize()}
        </button>
      </Show>
      <button class="close" title="Close" onClick={() => cmd({ do: 'window.close' })}><span class="hl" />{g().close()}</button>
    </div>
  )
}
