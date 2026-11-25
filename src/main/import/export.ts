// The guided export (Oriel's own): Chrome, Edge and Brave lock their passwords
// to themselves on Windows (App-Bound Encryption, v20), so the only way in is
// the file their own Export button writes, behind Windows Hello. This makes
// it one press instead of a hunt: the browser is opened at its Export page,
// and the CSV it writes is picked up the moment it lands in Downloads,
// Desktop or Documents, brought into the vault and sent to the Recycle Bin.
// Nothing here opens the browser's protected store; the person asks the
// browser for the file and says yes to Windows (studio/05 §1.8, §1.13).

import { app, shell } from 'electron'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ImportSaid } from '../../shared/modules/data'
import { benchRequest } from '../bench/server'
import { mark, windowData } from '../data/store'
import { probe } from '../paths'
import { downloadsFolder } from '../settings/prefs'
import { testEnv } from '../testhooks'
import type { WindowController } from '../views/window'
import { bringFile } from './file'
import type { Source } from './sources'

/** Where each browser lives on this PC (Windows' usual places). */
const executables: Record<string, string[]> = {
  Chrome: ['%PROGRAMFILES%/Google/Chrome/Application/chrome.exe', '%PROGRAMFILES(X86)%/Google/Chrome/Application/chrome.exe', '%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe'],
  Edge: ['%PROGRAMFILES(X86)%/Microsoft/Edge/Application/msedge.exe', '%PROGRAMFILES%/Microsoft/Edge/Application/msedge.exe'],
  Brave: ['%PROGRAMFILES%/BraveSoftware/Brave-Browser/Application/brave.exe', '%PROGRAMFILES(X86)%/BraveSoftware/Brave-Browser/Application/brave.exe', '%LOCALAPPDATA%/BraveSoftware/Brave-Browser/Application/brave.exe'],
}

/** The browser's program, when its passwords are locked to it and it can be
 * opened here. A test world has a stand-in that is never started, and only
 * when the test names its own folders to look in (ORIEL_EXPORT_DIRS). */
export function browserExe(source: Source): string | null {
  if (source.family !== 'chromium' || !source.appBound) return null
  if (probe) return testEnv('ORIEL_EXPORT_DIRS') ? 'test-browser.exe' : null
  if (process.platform !== 'win32') return null
  for (const template of executables[source.name] ?? []) {
    const file = template.replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] ?? '')
    if (file && path.isAbsolute(file) && existsSync(file)) return file
  }
  return null
}

/** The folders a person saves an export in. */
export function exportFolders(): string[] {
  const given = testEnv('ORIEL_EXPORT_DIRS')
  if (given) return given.split(path.delimiter).filter(Boolean)
  if (probe) return [path.join(app.getPath('userData'), 'Downloads')]
  const out = [downloadsFolder()]
  for (const name of ['desktop', 'documents'] as const) { try { out.push(app.getPath(name)) } catch {} }
  return [...new Set(out)]
}

const biggest = 64 * 1024 * 1024
const patience = 10 * 60 * 1000

/** Chrome, Edge and Brave write "name,url,username,password,note". */
function holdsPasswords(file: string): boolean {
  let fd = -1
  try {
    fd = openSync(file, 'r')
    const buffer = Buffer.alloc(512)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    const first = buffer.subarray(0, read).toString('utf8').replace(/^﻿/, '').split(/\r?\n/, 1)[0].toLowerCase()
    const cells = first.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    return ['url', 'username', 'password'].every(c => cells.includes(c))
  } catch { return false } finally { if (fd >= 0) try { closeSync(fd) } catch {} }
}

interface Watch { source: string; since: number; ends: number; timer: NodeJS.Timeout; seen: Map<string, string> }
const watches = new Map<WindowController, Watch>()

/** What the bench reads: the last program started and what it was asked. */
export let launched: { exe: string; args: string[] } | null = null

/** The export file in the Recycle Bin, from where it can still come back. A
 * test world never touches the real one: its own folder stands in. */
export async function trashFile(file: string): Promise<void> {
  if (probe) {
    const bin = path.join(app.getPath('userData'), 'Recycle Bin')
    mkdirSync(bin, { recursive: true })
    renameSync(file, path.join(bin, path.basename(file)))
  } else await shell.trashItem(file)
}

export function stopExport(c: WindowController): void {
  const w = watches.get(c)
  if (!w) return
  clearInterval(w.timer)
  watches.delete(c)
  const s = windowData(c).import
  if (s?.waiting) { s.waiting = null; mark(c) }
}

/** Open the browser at its Export page and wait for the file. `done` is told
 * what came, to say it in the panel. */
export function startExport(c: WindowController, source: Source, profile: string | null, done: (said: ImportSaid[]) => void): boolean {
  const s = windowData(c).import
  const exe = browserExe(source)
  if (!s || !exe || source.family !== 'chromium' || watches.has(c)) return false
  const args = [...(profile && profile !== '.' ? [`--profile-directory=${profile}`] : []), source.exportAt]
  launched = { exe, args }
  const since = Date.now()
  const fail = () => {
    stopExport(c)
    done([{ ok: false, text: `${source.name} didn't open: start it yourself and bring in its CSV file with File…` }])
  }
  if (!probe) {
    try {
      const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
      child.on('error', fail)
      child.unref()
    } catch { fail(); return false }
  }
  s.waiting = { source: source.name, since }
  s.brought = null
  const w: Watch = {
    source: source.name, since, ends: since + patience, seen: new Map(),
    timer: setInterval(() => look(c, w, done), 1000),
  }
  w.timer.unref?.()
  watches.set(c, w)
  mark(c)
  return true
}

function look(c: WindowController, w: Watch, done: (said: ImportSaid[]) => void): void {
  if (Date.now() > w.ends) {
    stopExport(c)
    done([{ ok: false, text: `No file came from ${w.source}. Press Start to try again, or bring in its CSV with File…` }])
    return
  }
  for (const dir of exportFolders()) {
    let names: string[]
    try { names = readdirSync(dir) } catch { continue }
    for (const name of names) {
      if (!/\.csv$/i.test(name)) continue
      const file = path.join(dir, name)
      let st
      try { st = statSync(file) } catch { continue }
      // Only a file written since the button was pressed, and only one that is
      // a password export; one more look first, so a file still being written is left alone.
      if (!st.isFile() || st.size === 0 || st.size > biggest || st.mtimeMs < w.since - 1000) continue
      const signature = `${st.size}:${st.mtimeMs}`
      if (w.seen.get(file) !== signature) {
        w.seen.set(file, signature)
        continue
      }
      if (!holdsPasswords(file)) continue
      void take(c, w, file, done)
      return
    }
  }
}

async function take(c: WindowController, w: Watch, file: string, done: (said: ImportSaid[]) => void): Promise<void> {
  stopExport(c)
  const result = bringFile(file, w.source)
  const said: ImportSaid[] = [result.said[0] ?? { ok: false, text: "That file couldn't be read" }]
  try {
    await trashFile(file)
    said.push({ ok: true, text: 'The file went to the Recycle Bin' })
  } catch {
    said.push({ ok: false, text: `The file holds your passwords in the clear: delete ${path.basename(file)} now` })
  }
  done(said)
}

benchRequest('data.exportLaunched', () => ({ value: launched }))
benchRequest('data.exportFolders', () => ({ value: exportFolders() }))
