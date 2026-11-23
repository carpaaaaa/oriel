// Native messaging (studio/04 §5.3): runtime.connectNative and
// sendNativeMessage toward apps on this PC (1Password, Bitwarden's desktop
// app...). electron-chrome-extensions has it, but reads a message only when
// one arrives whole in one chunk, counts characters for bytes and swallows
// every error; this replaces its handlers on the same channels.
//   - Hosts: on Windows the registry, HKCU then HKLM (64- and 32-bit views),
//     under Chrome, Chromium, Edge and Brave; on a Mac the folders Chrome and
//     the others use. First, in a test world or not, Oriel's own
//     NativeMessagingHosts folder.
//   - Name ^[a-z0-9_]+(\.[a-z0-9_]+)*$; the manifest's allowed_origins must
//     hold chrome-extension://<id>/; a relative path is from the manifest.
//   - 4-byte little-endian length + JSON; at most 1 MB from the host and
//     64 MB to it. On Windows through cmd.exe with --parent-window, as Chrome.
//   - Errors in Chrome's words.

import { app } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const NAME = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/
const FROM_HOST_MAX = 1024 * 1024
const TO_HOST_MAX = 64 * 1024 * 1024

export const NOT_FOUND = 'Specified native messaging host not found.'
export const FORBIDDEN = 'Access to the specified native messaging host is forbidden.'
export const EXITED = 'Native host has exited.'
export const BAD_NAME = 'Invalid native messaging host name specified.'
export const NO_PERMISSION = 'Access to native messaging requires nativeMessaging permission.'
export const IO_ERROR = 'Error when communicating with the native messaging host.'

const browsers = ['Google\\Chrome', 'Chromium', 'Microsoft\\Edge', 'BraveSoftware\\Brave-Browser']

function regQuery(key: string, view: '64' | '32'): Promise<string | null> {
  return new Promise(resolve => {
    execFile('reg', ['query', key, '/ve', `/reg:${view}`], { windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const line = out.split(/\r?\n/).find(l => /REG_(EXPAND_)?SZ/.test(l))
      resolve(line ? line.split(/REG_(?:EXPAND_)?SZ/)[1].trim() || null : null)
    })
  })
}

async function manifestPaths(name: string): Promise<string[]> {
  const own = path.join(app.getPath('userData'), 'NativeMessagingHosts', `${name}.json`)
  if (process.platform === 'win32') {
    const out = [own]
    for (const hive of ['HKCU', 'HKLM']) for (const b of browsers) for (const view of ['64', '32'] as const) {
      const p = await regQuery(`${hive}\\Software\\${b}\\NativeMessagingHosts\\${name}`, view)
      if (p) out.push(p)
    }
    return out
  }
  const home = os.homedir()
  const support = path.join(home, 'Library', 'Application Support')
  const dirs = process.platform === 'darwin'
    ? [
        path.join(support, 'Google/Chrome/NativeMessagingHosts'), path.join(support, 'Chromium/NativeMessagingHosts'),
        path.join(support, 'Microsoft Edge/NativeMessagingHosts'), path.join(support, 'BraveSoftware/Brave-Browser/NativeMessagingHosts'),
        path.join(support, 'Arc/User Data/NativeMessagingHosts'), '/Library/Google/Chrome/NativeMessagingHosts',
        '/Library/Application Support/Chromium/NativeMessagingHosts', '/Library/Microsoft/Edge/NativeMessagingHosts',
        path.join(support, 'Vivaldi/NativeMessagingHosts'), path.join(support, 'com.operasoftware.Opera/NativeMessagingHosts'),
      ]
    : [path.join(home, '.config/google-chrome/NativeMessagingHosts'), path.join(home, '.config/chromium/NativeMessagingHosts'), '/etc/opt/chrome/native-messaging-hosts']
  return [own, ...dirs.map(d => path.join(d, `${name}.json`))]
}

interface Host { path: string; allowed: string[] }

/** The first manifest found decides, a refusal included. */
async function findHost(name: string, extensionId: string): Promise<Host> {
  if (!NAME.test(name)) throw new Error(BAD_NAME)
  for (const file of await manifestPaths(name)) {
    let raw: { name?: string; path?: string; type?: string; allowed_origins?: string[] }
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
    if (raw.name !== name || raw.type !== 'stdio' || typeof raw.path !== 'string') throw new Error(NOT_FOUND)
    if (!raw.allowed_origins?.includes(`chrome-extension://${extensionId}/`)) throw new Error(FORBIDDEN)
    const exe = path.isAbsolute(raw.path) ? raw.path : path.join(path.dirname(file), raw.path)
    if (!fs.existsSync(exe)) throw new Error(NOT_FOUND)
    return { path: exe, allowed: raw.allowed_origins }
  }
  throw new Error(NOT_FOUND)
}

/** One running host and its framed stdout. */
class Pipe {
  private proc: ChildProcess
  private buffer = Buffer.alloc(0)
  closed = false

  constructor(host: Host, extensionId: string, private onMessage: (m: unknown) => void, private onClose: (error: string | null) => void) {
    const origin = `chrome-extension://${extensionId}/`
    this.proc = process.platform === 'win32'
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${host.path}" ${origin} --parent-window=0"`], { windowsHide: true, windowsVerbatimArguments: true, stdio: ['pipe', 'pipe', 'ignore'] })
      : spawn(host.path, [origin], { stdio: ['pipe', 'pipe', 'ignore'] })
    this.proc.stdout!.on('data', (chunk: Buffer) => this.read(chunk))
    this.proc.stdin!.on('error', () => this.close(IO_ERROR))
    this.proc.on('error', () => this.close(IO_ERROR))
    this.proc.on('exit', () => setTimeout(() => this.close(EXITED), 50))
  }

  private read(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0)
      if (length > FROM_HOST_MAX) return this.close(IO_ERROR)
      if (this.buffer.length < 4 + length) return
      const body = this.buffer.subarray(4, 4 + length).toString('utf8')
      this.buffer = this.buffer.subarray(4 + length)
      let message: unknown
      try { message = JSON.parse(body) } catch { return this.close(IO_ERROR) }
      this.onMessage(message)
    }
  }

  send(message: unknown): void {
    if (this.closed) return
    const body = Buffer.from(JSON.stringify(message), 'utf8')
    if (body.length > TO_HOST_MAX) return this.close(IO_ERROR)
    const head = Buffer.alloc(4)
    head.writeUInt32LE(body.length, 0)
    this.proc.stdin!.write(Buffer.concat([head, body]))
  }

  /** As Chrome: stdin closed, then the process asked to stop, then made to. */
  close(error: string | null = null): void {
    if (this.closed) return
    this.closed = true
    try { this.proc.stdin!.end() } catch { /* gone */ }
    if (this.proc.exitCode === null) {
      this.proc.kill('SIGTERM')
      const p = this.proc
      setTimeout(() => { if (p.exitCode === null) p.kill('SIGKILL') }, 2000).unref()
    }
    this.onClose(error)
  }
}

type Sender = { ipc: { on(ch: string, f: (...a: any[]) => void): void; off?(ch: string, f: (...a: any[]) => void): void; removeListener?(ch: string, f: (...a: any[]) => void): void }; send(channel: string, ...a: unknown[]): void }

const ports = new Map<string, { extensionId: string; pipe: Pipe }>()

function asks(ext: Electron.Extension): boolean {
  const m = ext.manifest as { permissions?: string[]; optional_permissions?: string[] }
  return !!(m.permissions?.includes('nativeMessaging') || m.optional_permissions?.includes('nativeMessaging'))
}

/** runtime.connectNative: the port the library's preload opened as `connectionId`. */
export async function connectNative(ext: Electron.Extension, sender: Sender, connectionId: string, application: string): Promise<void> {
  const channel = `crx-native-msg-${connectionId}`
  // The port is usable at once in the extension: what it posts before the
  // host runs waits here.
  const waiting: unknown[] = []
  let pipe: Pipe | null = null
  const fromExtension = (_e: unknown, message: unknown) => { if (pipe) pipe.send(message); else waiting.push(message) }
  sender.ipc.on(channel, fromExtension)
  const disconnect = () => {
    ;(sender.ipc.off ?? sender.ipc.removeListener)?.call(sender.ipc, channel, fromExtension)
    try { sender.send(`${channel}-disconnect`) } catch { /* gone */ }
  }
  if (!asks(ext)) { disconnect(); throw new Error(NO_PERMISSION) }
  let host: Host
  try { host = await findHost(String(application), ext.id) } catch (e) { disconnect(); throw e }
  const p: Pipe = new Pipe(host, ext.id, m => { try { sender.send(channel, m) } catch { p.close() } }, () => {
    ports.delete(connectionId)
    disconnect()
  })
  pipe = p
  ports.set(connectionId, { extensionId: ext.id, pipe: p })
  for (const m of waiting.splice(0)) p.send(m)
}

export function disconnectNative(_ext: Electron.Extension, connectionId: string): void {
  ports.get(connectionId)?.pipe.close()
}

/** runtime.sendNativeMessage: start, send one, read one answer, stop. */
export async function sendNativeMessage(ext: Electron.Extension, application: string, message: unknown): Promise<unknown> {
  if (!asks(ext)) throw new Error(NO_PERMISSION)
  const host = await findHost(String(application), ext.id)
  return new Promise((resolve, reject) => {
    let done = false
    const pipe: Pipe = new Pipe(host, ext.id, m => { if (!done) { done = true; resolve(m); pipe.close() } }, error => { if (!done) { done = true; reject(new Error(error ?? EXITED)) } })
    pipe.send(message)
  })
}

/** The extension went away: its hosts stop. */
export function stopHosts(extensionId: string): void {
  for (const { extensionId: id, pipe } of [...ports.values()]) if (id === extensionId) pipe.close()
}
