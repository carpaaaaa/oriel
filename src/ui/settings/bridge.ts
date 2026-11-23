// What an Oriel page (oriel://settings, oriel://downloads...) has of the main
// process: window.oriel, given by preload/page/internal.ts on those pages
// only. The overlay panels use the window's own bridge (window.search).

import { createSignal } from 'solid-js'
import type { Command } from '../../shared/commands'

export interface OrielBridge {
  cmd(command: Command): Promise<unknown>
  on(listener: (update: { kind: string; value: unknown }) => void): () => void
  platform: string
}

declare global { interface Window { oriel?: OrielBridge } }

export const bridge = (): OrielBridge | undefined => window.oriel

export function call<T = unknown>(command: Command): Promise<T> {
  const b = window.oriel
  return (b ? b.cmd(command) : window.search?.cmd(command)) as Promise<T>
}

const listeners = new Map<string, Set<(value: unknown) => void>>()
let wired = false
export function onUpdate(kind: string, f: (value: unknown) => void): () => void {
  if (!wired && window.oriel) {
    wired = true
    window.oriel.on(u => listeners.get(u.kind)?.forEach(l => l(u.value)))
  }
  const set = listeners.get(kind) ?? new Set()
  set.add(f)
  listeners.set(kind, set)
  return () => set.delete(f)
}

/** What Oriel just said (the Mac's announcement line), shown at the page's foot. */
const [said, setSaid] = createSignal<{ text: string; n: number } | null>(null)
let n = 0
let timer: ReturnType<typeof setTimeout> | undefined
export function announce(text: string | undefined | null): void {
  if (!text) return
  setSaid({ text, n: ++n })
  clearTimeout(timer)
  timer = setTimeout(() => setSaid(null), 2600)
}
export { said }

/** Ctrl on Windows, ⌘ on a Mac where Oriel is developed. */
export const isMac = () => (window.oriel?.platform ?? window.search?.platform) === 'darwin'
