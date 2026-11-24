// The peek over the page (Peek.swift PeekLayer, PeekPanel): the page dimmed
// around it, a click there puts it away, and beside the panel its knobs:
// Close, Open as a tab, and with Split View, Keep beside this page. The
// panel's page itself is a view above this layer (src/main/pages/peek.ts);
// here is its shadow. Owned by the pages module.

import { Show } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'
import type { PeekState } from '../../shared/modules/pages'
import { cmd } from '../lib/store'
import { Close } from '../lib/icons'

const Grow = (p: { size?: number }) => (
  <svg width={p.size ?? 11} height={p.size ?? 11} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
  </svg>
)
const Beside = (p: { size?: number }) => (
  <svg width={p.size ?? 11} height={p.size ?? 11} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="12" height="10" rx="2" /><path d="M8 3v10" />
  </svg>
)

export function PeekLayer(props: { layer: OverlayLayer }) {
  const peek = () => (props.layer.kind === 'panel' ? (props.layer.data as PeekState | undefined) ?? null : null)
  return (
    <Show when={peek()}>{p => (
      <div class="peek" onClick={e => { if (e.target === e.currentTarget) void cmd({ do: 'pages.peek.close' }) }}>
        <div class="peek-shadow" style={{ left: `${p().panel.x}px`, top: `${p().panel.y}px`, width: `${p().panel.width}px`, height: `${p().panel.height}px` }} />
        <div class="peek-knobs" style={{ left: `${p().panel.x + p().panel.width + 10}px`, top: `${p().panel.y}px` }}>
          <button class="peek-knob peek-close" title="Close (esc)" aria-label="Close" onClick={() => void cmd({ do: 'pages.peek.close' })}><Close size={11} /></button>
          <button class="peek-knob peek-keep" title="Open as a tab (Ctrl+O or Ctrl+Enter)" aria-label="Open as a tab"
            onClick={e => void cmd({ do: 'pages.peek.keep', beside: e.altKey })}><Grow /></button>
          <Show when={p().beside}>
            <button class="peek-knob peek-beside" title="Keep beside this page (Ctrl+Alt+Enter)" aria-label="Keep beside this page"
              onClick={() => void cmd({ do: 'pages.peek.keep', beside: true })}><Beside /></button>
          </Show>
        </div>
      </div>
    )}</Show>
  )
}
