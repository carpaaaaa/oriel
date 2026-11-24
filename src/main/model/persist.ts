// Small JSON files, written atomically, as Store.swift's Disk does on the Mac
// (studio/01 §9.2): each into a file beside it, then renamed over it, so a
// file is never half written. A file that is there but won't read is moved
// aside (quarantined, §9.3) and never overwritten in place.

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs'
import path from 'node:path'
import { dataFile } from '../paths'

const pending = new Map<string, { timer: NodeJS.Timeout; write: () => void }>()
const flushers: ((final: boolean) => void)[] = []

/** Whatever else must reach the disk before quitting (the model's rows).
 * `final` is false when the app may go on (Windows only asked whether it
 * may end the session): nothing is closed for good then. */
export function onFlush(f: (final: boolean) => void): void { flushers.push(f) }

export function fileExists(name: string): boolean {
  return existsSync(dataFile(name))
}

/** X.json becomes X.unreadable-<seconds>.json, as Store.quarantine names it.
 * True when it was moved (or wasn't there). */
export function quarantine(name: string): boolean {
  const file = dataFile(name)
  if (!existsSync(file)) return true
  const aside = file.replace(/\.json$/, '') + `.unreadable-${Math.floor(Date.now() / 1000)}.json`
  try {
    renameSync(file, aside)
    console.warn(`[persist] ${name} unreadable, kept as ${path.basename(aside)}`)
    return true
  } catch {
    return false
  }
}

/** Names whose quarantine failed: never written over until it works. */
const stuck = new Set<string>()

/** The file's JSON, `fallback` if it isn't there. `check` turns what was read
 * into the value (null: it doesn't make sense), so a file that parses but
 * means nothing is quarantined too. */
export function readJSON<T>(name: string, fallback: T, check?: (raw: unknown) => T | null): T {
  const file = dataFile(name)
  if (!existsSync(file)) return fallback
  let raw: unknown
  try {
    const text = readFileSync(file, 'utf8')
    if (!text.trim()) return fallback
    raw = JSON.parse(text)
  } catch {
    if (!quarantine(name)) stuck.add(name)
    return fallback
  }
  if (!check) return raw as T
  const value = check(raw)
  if (value === null) {
    if (!quarantine(name)) stuck.add(name)
    return fallback
  }
  return value
}

const nap = new Int32Array(new SharedArrayBuffer(4))
/** Waits `ms` with the processor free (studio/09 §3): the thread still
 * waits, as its callers are synchronous (quitting among them). */
export function pause(ms: number): void {
  Atomics.wait(nap, 0, 0, ms)
}

/** `text` into `file` atomically: a file beside it, flushed, then renamed
 * over it, so a reader never finds it half written. Any file, inside
 * Oriel's folder or not (an extension's manifest). */
export function writeFileAtomic(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, text)
  try { const fd = openSync(temp, 'r+'); fsyncSync(fd); closeSync(fd) } catch {}
  // Windows: an indexer or antivirus can hold the file a moment.
  for (let attempt = 0; ; attempt++) {
    try { renameSync(temp, file); return } catch (error) {
      if (attempt >= 9) { try { unlinkSync(temp) } catch {} ; throw error }
      pause(50)
    }
  }
}

export function writeJSONNow(name: string, value: unknown): void {
  const prior = pending.get(name)
  if (prior) { clearTimeout(prior.timer); pending.delete(name) }
  if (stuck.has(name)) {
    if (!quarantine(name)) return
    stuck.delete(name)
  }
  writeFileAtomic(dataFile(name), JSON.stringify(value))
}

/** Write after `delay` ms of quiet; later calls replace the value. */
export function writeJSON(name: string, value: () => unknown, delay = 400): void {
  const prior = pending.get(name)
  if (prior) clearTimeout(prior.timer)
  const write = () => { pending.delete(name); writeJSONNow(name, value()) }
  pending.set(name, { timer: setTimeout(write, delay), write })
}

export function removeFile(name: string): void {
  const prior = pending.get(name)
  if (prior) { clearTimeout(prior.timer); pending.delete(name) }
  try { unlinkSync(dataFile(name)) } catch {}
}

/** Everything still waiting, now: quitting, ended from outside, or Windows
 * logging off or shutting down (studio/01 §1.10, §9.7). */
export function flushJSON(final = true): void {
  for (const f of flushers) { try { f(final) } catch (e) { console.warn('[persist] flush', e) } }
  for (const { timer, write } of [...pending.values()]) { clearTimeout(timer); write() }
}

/** Dates as the Mac writes them: seconds since 1 January 2001. */
export const appleEpoch = Date.UTC(2001, 0, 1)
export const toAppleDate = (ms: number) => (ms - appleEpoch) / 1000
export const fromAppleDate = (s: number) => s * 1000 + appleEpoch
