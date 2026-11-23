// Reading another browser's files carefully (Import.swift ImportRead and
// Snapshot, ImportFile.swift scratch folders; studio/05 §1.1 points 2-3):
// only regular files inside the browser's folder, JSON at most 64 MB, and
// every SQLite file copied with its -wal and -shm before it is read, since
// the browser is usually running and its last writes sit in the WAL.

import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const maxJSON = 64 * 1024 * 1024

/** `p` (links resolved) is `root` or inside it. */
export function inside(p: string, root: string): boolean {
  try {
    const a = realpathSync(p), r = realpathSync(root)
    return a === r || a.startsWith(r + path.sep)
  } catch { return false }
}

/** A regular file inside `root`, or null. */
function safeFile(file: string, root: string): string | null {
  try {
    if (!inside(file, root)) return null
    const real = realpathSync(file)
    return statSync(real).isFile() ? real : null
  } catch { return null }
}

export function readJSONIn<T>(file: string, root: string): T | null {
  const real = safeFile(file, root)
  if (!real) return null
  try {
    if (statSync(real).size > maxJSON) return null
    return JSON.parse(readFileSync(real, 'utf8')) as T
  } catch { return null }
}

/** The file is there but couldn't be read (JSON that won't parse). */
export function unreadableJSON(file: string, root: string): boolean {
  if (!existsSync(file)) return false
  return readJSONIn(file, root) == null
}

export function readTextIn(file: string, root: string): string | null {
  const real = safeFile(file, root)
  if (!real) return null
  try { return statSync(real).size > maxJSON ? null : readFileSync(real, 'utf8') } catch { return null }
}

/** The browser holds the file so that it can't be copied: on Windows,
 * Chromium's SQLite files while it runs (05 §1.13 point 7). */
export class Locked extends Error {}

const scratchPrefix = `office-import-${process.pid}-`

/** Leftover scratch folders of processes that are gone (sweepScratch). */
export function sweepScratch(): void {
  const tmp = os.tmpdir()
  let names: string[] = []
  try { names = readdirSync(tmp) } catch { return }
  for (const n of names) {
    const m = /^office-import-(\d+)-/.exec(n)
    if (!m) continue
    const pid = Number(m[1])
    let alive = pid === process.pid
    if (!alive) { try { process.kill(pid, 0); alive = true } catch {} }
    if (!alive) { try { rmSync(path.join(tmp, n), { recursive: true, force: true }) } catch {} }
  }
}

/** A SQLite file opened from a private copy of it and its -wal and -shm. The
 * copy goes when `close` is called. */
export function snapshot(file: string, root: string): { db: DatabaseSync; close(): void } | null {
  const real = safeFile(file, root)
  if (!real) return null
  const dir = path.join(os.tmpdir(), scratchPrefix + randomUUID())
  mkdirSync(dir, { recursive: true })
  const copy = path.join(dir, path.basename(real))
  const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }) } catch {} }
  try {
    copyFileSync(real, copy)
    for (const extra of ['-wal', '-shm']) {
      const side = real + extra
      try { if (lstatSync(side).isFile()) copyFileSync(side, copy + extra) } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      }
    }
  } catch (e) {
    cleanup()
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') throw new Locked(String(code))
    return null
  }
  try {
    const db = new DatabaseSync(copy)
    return { db, close() { try { db.close() } catch {} cleanup() } }
  } catch {
    cleanup()
    return null
  }
}

/** Rows of a query on a copy of the file; null when it can't be read. */
export function query<T = Record<string, unknown>>(file: string, root: string, sql: string, ...params: (string | number)[]): T[] | null {
  const snap = snapshot(file, root)
  if (!snap) return null
  try { return snap.db.prepare(sql).all(...params) as T[] } catch { return null } finally { snap.close() }
}

/** One number from a copy of a SQLite file; 0 for one that isn't there. */
export function count(file: string, root: string, sql: string): number {
  if (!existsSync(file)) return 0
  const rows = query<{ n: number }>(file, root, sql)
  return rows?.[0] ? Number(Object.values(rows[0])[0]) || 0 : 0
}

/** Bytes of a BLOB column, whatever form the driver hands them in. */
export function bytes(value: unknown): Buffer {
  if (value == null) return Buffer.alloc(0)
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  return Buffer.alloc(0)
}
