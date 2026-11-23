// The settings module's part of each window's state (shared/modules/settings.ts)
// and its panels over the page.

import type { Rect } from '../../shared/state'
import type { SettingsState } from '../../shared/modules/settings'
import { allControllers, registerSlice, type WindowController } from '../views/window'

const parts: ((c: WindowController) => Partial<SettingsState>)[] = []

/** Permissions and downloads each add their fields. */
export function settingsPart(f: (c: WindowController) => Partial<SettingsState>): void { parts.push(f) }

registerSlice('settings', (c): SettingsState => Object.assign(
  { asking: null, downloadsOpen: false, downloadsButton: false, downloadsProgress: -1, downloadsStarted: 0 },
  ...parts.map(f => f(c)),
))

export function markSettings(c: WindowController | null | undefined): void { c?.mark('settings') }
export function markAllSettings(): void { for (const c of allControllers()) c.mark('settings') }

/** A panel of ours over the page, in `region` (window coordinates). The
 * overlay's page may still be loading just after a window opens: it is told
 * again once it has loaded, if the panel is still the one wanted. */
export function showPanel(c: WindowController, name: string, region: Rect, data?: unknown): void {
  c.sendOverlay({ kind: 'panel', name, data })
  c.setOverlayRegion(region, false)
  const wc = c.overlay.webContents
  if (wc.isLoading()) wc.once('did-finish-load', () => {
    if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === name) { c.sendOverlay({ kind: 'panel', name, data }); c.setOverlayRegion(region, false) }
  })
}

export function hidePanel(c: WindowController, name: string): void {
  if (c.overlayLayer.kind === 'panel' && c.overlayLayer.name === name) c.sendOverlay({ kind: 'none' })
}
