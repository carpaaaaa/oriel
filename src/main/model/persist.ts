// Small JSON files, written atomically and a moment after the last change,
// as Store.swift does on the Mac. A file that can't be read is moved aside
// (quarantined) and never overwritten in place.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dataFile } from '../paths'

const pending = new Map<string, { timer: NodeJS.Timeout; write: () => void }>()

export function readJSON<T>(name: string, fallback: T): T {
  const file = dataFile(name)
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (error) {
    const aside = `${file}.broken-${Date.now()}`
    try { renameSync(file, aside) } catch {}
    console.warn(`[persist] ${name} unreadable, kept as ${path.basename(aside)}:`, error)
    return fallback
  }
}

export function writeJSONNow(name: string, value: unknown): void {
  const file = dataFile(name)
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value, null, 1))
  renameSync(temp, file)
}

/** Write after `delay` ms of quiet; later calls replace the value. */
export function writeJSON(name: string, value: () => unknown, delay = 400): void {
  const prior = pending.get(name)
  if (prior) clearTimeout(prior.timer)
  const write = () => { pending.delete(name); writeJSONNow(name, value()) }
  pending.set(name, { timer: setTimeout(write, delay), write })
}

/** Everything still waiting, now (quitting). */
export function flushJSON(): void {
  for (const { timer, write } of [...pending.values()]) { clearTimeout(timer); write() }
}

/** Dates as the Mac writes them: seconds since 1 January 2001. */
export const appleEpoch = Date.UTC(2001, 0, 1)
export const toAppleDate = (ms: number) => (ms - appleEpoch) / 1000
export const fromAppleDate = (s: number) => s * 1000 + appleEpoch
