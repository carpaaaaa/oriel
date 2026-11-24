// The engine's threads, seen from the main process: the first starts with
// the first translation, a second only while the first is busy (a long
// page's slices go two at a time), each with its own copy of the models it
// was asked for. They are given back after a while with nothing to do (the
// models take memory) and started again when a translated page adds words.
// Owned by the translate module.

import { Worker } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import source from './engine-worker.js' with { type: 'text' }

const requireHere = createRequire(import.meta.url)

/** Where a model's files are on disk, and how its numbers are kept. */
export interface ModelFiles { key: string; model: string; lex: string; vocabs: string[]; precision: string }

const IDLE_MS = 5 * 60_000
/** Two threads where the PC has the cores for it. */
const POOL = Math.max(1, Math.min(2, (os.availableParallelism?.() ?? os.cpus().length) - 1))
/** Models kept in one thread at once: the oldest goes. */
const KEEP = 3

interface Slot {
  worker: Worker
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  /** Loaded (or loading) models, oldest first. */
  models: Map<string, Promise<void>>
  busy: number
}

let files: { glue: string; wasm: Uint8Array; detector: string } | null = null
const slots: Slot[] = []
let seq = 0
let idle: NodeJS.Timeout | null = null

function engineFiles() {
  if (files) return files
  const pkg = path.dirname(requireHere.resolve('@browsermt/bergamot-translator/package.json'))
  files = {
    glue: readFileSync(path.join(pkg, 'worker/bergamot-translator-worker.js'), 'utf8'),
    wasm: readFileSync(path.join(pkg, 'worker/bergamot-translator-worker.wasm')),
    // The detector's entry, as a file URL the thread imports itself (its
    // 1.6 MB of letter statistics never touch the main process).
    detector: import.meta.resolve('eld/small'),
  }
  return files
}

function spawn(): Slot {
  const w = new Worker(source, { eval: true, workerData: engineFiles() })
  w.unref()
  const slot: Slot = { worker: w, pending: new Map(), models: new Map(), busy: 0 }
  w.on('message', ({ id, result, error }: { id: number; result?: unknown; error?: string }) => {
    const p = slot.pending.get(id)
    if (!p) return
    slot.pending.delete(id)
    if (error) p.reject(new Error(error)); else p.resolve(result)
  })
  const gone = (why: string) => {
    const at = slots.indexOf(slot)
    if (at < 0) return
    slots.splice(at, 1)
    for (const p of slot.pending.values()) p.reject(new Error(why))
    slot.pending.clear()
  }
  w.on('error', (e: Error) => gone(`engine: ${e.message}`))
  w.on('exit', code => gone(`engine exited (${code})`))
  slots.push(slot)
  return slot
}

/** The thread to give work to: one free, or a new one while there's room,
 * or the least busy (preferring one that has the models already). */
function pick(keys: string[] = []): Slot {
  const has = (s: Slot) => keys.every(k => s.models.has(k))
  const free = slots.filter(s => !s.busy)
  const ready = free.find(has) ?? free[0]
  if (ready) return ready
  if (slots.length < POOL) return spawn()
  return [...slots].sort((a, b) => a.busy - b.busy || Number(has(b)) - Number(has(a)))[0] ?? spawn()
}

function call<T>(slot: Slot, op: string, args: unknown): Promise<T> {
  const id = ++seq
  slot.busy++
  if (idle) { clearTimeout(idle); idle = null }
  return new Promise<T>((resolve, reject) => {
    slot.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    slot.worker.postMessage({ id, op, args })
  }).finally(() => {
    slot.busy--
    if (slots.every(s => !s.busy)) idle = setTimeout(stop, IDLE_MS)
  })
}

/** The threads go, and their memory with them. */
export function stop(): void {
  if (idle) { clearTimeout(idle); idle = null }
  for (const slot of slots.splice(0)) {
    for (const p of slot.pending.values()) p.reject(new Error('engine stopped'))
    void slot.worker.terminate()
  }
}

function load(slot: Slot, m: ModelFiles): Promise<void> {
  let p = slot.models.get(m.key)
  if (p) return p
  p = call<boolean>(slot, 'load', m).then(() => {})
  p.catch(() => slot.models.delete(m.key))
  slot.models.set(m.key, p)
  while (slot.models.size > KEEP) {
    const oldest = slot.models.keys().next().value as string
    slot.models.delete(oldest)
    void call(slot, 'free', { key: oldest }).catch(() => {})
  }
  return p
}

/** Loads the pair's model where the work will go (the first thread). */
export async function ensureModel(m: ModelFiles): Promise<void> {
  await load(slots[0] ?? spawn(), m)
}

/** models: one, or [into English, out of English]. */
export async function translateTexts(models: ModelFiles[], texts: string[], html: boolean): Promise<string[]> {
  const slot = pick(models.map(m => m.key))
  for (const m of models) await load(slot, m)
  return call<string[]>(slot, 'translate', { keys: models.map(m => m.key), texts, html })
}

/** Each text's language: [code, reliable, score]. */
export function detectTexts(texts: string[]): Promise<[string, boolean, number][]> {
  return call<[string, boolean, number][]>(pick(), 'detect', { texts })
}

export const engineThreads = () => slots.length
