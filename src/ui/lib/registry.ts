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

/** Panels are one layer kind told apart by name ({ kind: 'panel', name });
 * each module registers its own names: registerPanel('data.import', C). */
const panels = new Map<string, Component<{ layer: OverlayLayer }>>()
export function registerPanel(name: string, component: Component<{ layer: OverlayLayer }>): void { panels.set(name, component) }
export function panelFor(name: string): Component<{ layer: OverlayLayer }> | undefined { return panels.get(name) }

export type OutletName =
  | 'sidebar.top' | 'sidebar.helm' | 'sidebar.afterPins' | 'sidebar.foot'
  | 'strip.end' | 'card.over' | 'chrome.end'
  // the empty tab: behind its field (the themes' wall) and over it
  | 'blank.under' | 'blank.over'

const [outlets, setOutlets] = createSignal<Record<string, Component[]>>({})
export function registerOutlet(name: OutletName, component: Component): void {
  setOutlets(o => ({ ...o, [name]: [...(o[name] ?? []), component] }))
}
export function outlet(name: OutletName): Component[] { return outlets()[name] ?? [] }

/** Oriel's pages in a tab (oriel://<name>), drawn by src/ui/page.tsx. */
const pages = new Map<string, Component>()
export function registerPage(name: string, component: Component): void { pages.set(name, component) }
export function pageFor(name: string): Component | undefined { return pages.get(name) }
