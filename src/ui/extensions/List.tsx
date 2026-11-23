// The puzzle's list (ExtensionMenu, studio/04 §2.3, §2.9): one row for each
// extension that is on and has a button, its icon and name; on hover Reload
// (folders only) and the pin, which stays when pinned. A click closes the
// list and presses the extension after 0.15 s, so its popup hangs from the
// puzzle. Below: Chrome Web Store…, Load Unpacked…, Manage Extensions….

import { For, Show } from 'solid-js'
import { state, cmd } from '../lib/store'
import { CARD_ROOM } from '../../shared/modules/extensions'
import { ExtIcon, Arrow, PinIcon, PinFill, ReloadIcon, Store, Folder, Gear } from './parts'

export function List() {
  const menu = () => state.ext?.menu ?? null
  const rows = () => (state.ext?.list ?? []).filter(e => e.enabled && e.action)
  const later = (f: () => void) => { void cmd({ do: 'ext.menuClose' }); setTimeout(f, 150) }
  return (
    <Show when={menu()}>
      {m => (
        <div class="ext-region" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'ext.menuClose' }) }}
          onKeyDown={e => { if (e.key === 'Escape') void cmd({ do: 'ext.menuClose' }) }} tabindex={-1}>
          <Arrow side={m().arrow.side} at={m().arrow.at} card={m().rect} room={CARD_ROOM} />
          <div class="ext-card ext-list" style={{ left: `${CARD_ROOM}px`, top: `${CARD_ROOM}px`, width: `${m().rect.width}px`, height: `${m().rect.height}px` }}>
            <div class="ext-rows">
              <Show when={rows().length} fallback={<p class="ext-empty">None of your extensions is on</p>}>
                <For each={rows()}>{e => (
                  <div class="ext-row" classList={{ pinned: e.pinned }} data-ext={e.id}
                    onClick={ev => { if (!(ev.target as HTMLElement).closest('.ext-tool')) later(() => void cmd({ do: 'ext.press', id: e.id })) }}
                    onContextMenu={ev => { ev.preventDefault(); void cmd({ do: 'ext.context', id: e.id, x: ev.clientX, y: ev.clientY, overlay: true }) }}>
                    <ExtIcon ext={e} size={16} />
                    <span class="ext-name">{e.name}</span>
                    <Show when={!e.fromStore}>
                      <button class="ext-tool" title="Reload from its folder" onClick={() => void cmd({ do: 'ext.reload', id: e.id })}><ReloadIcon size={10.5} /></button>
                    </Show>
                    <button class="ext-tool ext-pin" title={e.pinned ? 'Unpin' : 'Pin to toolbar'} onClick={() => void cmd({ do: 'ext.pin', id: e.id, pinned: !e.pinned })}>
                      {e.pinned ? <PinFill size={10.5} /> : <PinIcon size={10.5} />}
                    </button>
                  </div>
                )}</For>
              </Show>
            </div>
            <div class="ext-foot">
              <button class="ext-foot-item" onClick={() => later(() => void cmd({ do: 'ext.store' }))}><Store size={11} /><span>Chrome Web Store…</span></button>
              <button class="ext-foot-item" onClick={() => later(() => void cmd({ do: 'ext.loadUnpacked' }))}><Folder size={11} /><span>Load Unpacked…</span></button>
              <button class="ext-foot-item" onClick={() => later(() => void cmd({ do: 'ext.manage', open: true }))}><Gear size={11} /><span>Manage Extensions…</span></button>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}

/** The card and arrow behind a popup's page (studio/04 §2.4); the page itself
 * is a view of its own on top. A click beside it closes it. */
export function PopupFrame() {
  const pop = () => state.ext?.popup ?? null
  return (
    <Show when={pop()}>
      {p => (
        <div class="ext-region" onPointerDown={e => { if (e.target === e.currentTarget) void cmd({ do: 'ext.popupClose' }) }}>
          <Arrow side={p().arrow.side} at={p().arrow.at} card={p().rect} room={CARD_ROOM} />
          <div class="ext-card ext-pop" style={{ left: `${CARD_ROOM}px`, top: `${CARD_ROOM}px`, width: `${p().rect.width}px`, height: `${p().rect.height}px` }} />
        </div>
      )}
    </Show>
  )
}
