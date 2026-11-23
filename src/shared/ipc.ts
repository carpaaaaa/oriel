// IPC channel names and the bridge the interface sees as `window.search`.
// Owned by the orchestrator.

import type { Command } from './commands'
import type { OverlayLayer, WindowPatch } from './state'

export const IPC = {
  /** interface → main, invoke: run a command, get its reply. */
  command: 'search:command',
  /** main → interface: a patch of the window's state. */
  state: 'search:state',
  /** interface → main, invoke: the whole state, at start. */
  hello: 'search:hello',
  /** main → overlay: what to float now. */
  overlay: 'search:overlay',
  /** overlay → main, invoke: what floats now (asked once at load). */
  overlayNow: 'search:overlay-now',
  /** main → interface: a key the page left alone, for the interface to act on. */
  key: 'search:key',
  /** main → interface: reading progress of the tab on screen, apart from state
   * because it changes on every scroll (Tab.swift keeps it apart too). */
  reading: 'search:reading',
} as const

export interface KeyEvent {
  key: string
  code: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  altGraph: boolean
}

/** What the interface's preload exposes. */
export interface Bridge {
  /** "chrome" for the window's interface, "overlay" for the layer above pages. */
  root: 'chrome' | 'overlay'
  platform: string
  cmd(command: Command): Promise<unknown>
  hello(): Promise<WindowPatch>
  onState(listener: (patch: WindowPatch) => void): () => void
  onOverlay(listener: (layer: OverlayLayer) => void): () => void
  overlayNow(): Promise<OverlayLayer | null>
  onKey(listener: (key: KeyEvent) => void): () => void
  onReading(listener: (value: { id: string; fraction: number }) => void): () => void
}

declare global {
  interface Window { search: Bridge }
}
