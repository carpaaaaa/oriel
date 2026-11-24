// The page's right-click menu in the overlay (studio/01 §2.48, §3.38; studio/02
// §4.6). Drawn with the tabs' Menu (ui/menus/Menu.tsx), so its rows, grey
// highlight, ticks, separators, keys and placing are theirs: 24 high, corners
// of 12, the highlight 5 in with corners of 7, flipped and pulled back inside
// the window. The rows come from the main process (main/contextmenu), each
// one a command; this side only blinks the pick, closes, and runs it.

import { onCleanup, onMount, Show } from 'solid-js'
import { registerPanel } from '../lib/registry'
import { cmd } from '../lib/store'
import type { OverlayLayer } from '../../shared/state'
import { CTX_MENU, type PageMenuData } from '../../shared/modules/contextmenu'
import { Menu } from '../menus/Menu'
import type { Entry } from '../menus/bridge'

function PageMenu(p: { layer: OverlayLayer }) {
  const data = () => (p.layer.kind === 'panel' && p.layer.name === CTX_MENU ? (p.layer.data as PageMenuData) : null)
  let picking = false
  const close = (refocus: boolean) => { const d = data(); if (d) void cmd({ do: 'ctx.close', refocus, seq: d.seq }) }

  const pick = (e: Entry) => {
    const d = data()
    if (picking || !d || !e.act || !('cmd' in e.act)) return
    picking = true
    const command = e.act.cmd
    // The pick blinks once, then the menu goes and the command runs, as the
    // tabs' menus do (menus/host.tsx).
    setTimeout(() => {
      void cmd({ do: 'ctx.close', refocus: true, seq: d.seq })
        .then(() => cmd(command))
        .catch(error => console.warn('[ctxmenu]', error))
        .finally(() => { picking = false })
    }, 70)
  }

  onMount(() => {
    const blur = () => close(false)
    // → on a row with a submenu opens it with its first row lit, as
    // Windows' menus do (Menu opens it with none).
    const keys = (k: KeyboardEvent) => {
      if (k.key !== 'ArrowRight') return
      const before = document.querySelectorAll('.ctx-host .menu').length
      requestAnimationFrame(() => {
        if (document.querySelectorAll('.ctx-host .menu').length > before) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
      })
    }
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', keys, true)
    onCleanup(() => { window.removeEventListener('blur', blur); window.removeEventListener('keydown', keys, true) })
  })

  return (
    <Show when={data()} keyed>{d => (
      <div class="menu-host ctx-host" data-ctx={d.context.join(' ')} onContextMenu={e => e.preventDefault()}>
        {/* A press outside puts it away; a right press outside opens the
            page's menu there instead (the main process finds the page). */}
        <div class="menu-scrim"
          onPointerDown={e => { if (e.button !== 2) close(false) }}
          onContextMenu={e => { e.preventDefault(); void cmd({ do: 'ctx.close', at: { x: e.clientX, y: e.clientY }, seq: d.seq }) }} />
        <Menu entries={d.entries as Entry[]} at={d.at} room={d.room} pick={pick} close={() => close(true)} />
      </div>
    )}</Show>
  )
}

registerPanel(CTX_MENU, PageMenu)
