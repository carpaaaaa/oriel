// Where modules plug into the interface without editing each other's files.
//  - registerLayer('menu', Component): what the overlay draws for a layer kind;
//  - registerOutlet('sidebar.foot', Component): extra pieces in named places;
//  - registerKey('Ctrl+F', handler): keys the interface handles itself.
// Each module does it in its own src/ui/<module>/register.ts(x), which
// main.tsx loads. Owned by the orchestrator.

import type { Component } from 'solid-js'
import { createSignal } from 'solid-js'
import type { OverlayLayer } from '../../shared/state'

type LayerComponent = Component<{ layer: OverlayLayer }>

const layers = new Map<string, LayerComponent>()
export function registerLayer(kind: string, component: LayerComponent): void { layers.set(kind, component) }
export function layerFor(kind: string): LayerComponent | undefined { return layers.get(kind) }

export type OutletName =
  | 'sidebar.top' | 'sidebar.afterPins' | 'sidebar.foot'
  | 'strip.end' | 'card.over' | 'chrome.end'

const [outlets, setOutlets] = createSignal<Record<string, Component[]>>({})
export function registerOutlet(name: OutletName, component: Component): void {
  setOutlets(o => ({ ...o, [name]: [...(o[name] ?? []), component] }))
}
export function outlet(name: OutletName): Component[] { return outlets()[name] ?? [] }
