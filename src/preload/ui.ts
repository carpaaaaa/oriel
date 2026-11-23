// The interface's bridge (window.search). Sandboxed: only ipcRenderer.

import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge } from '../shared/ipc'

const IPC = {
  command: 'search:command',
  state: 'search:state',
  hello: 'search:hello',
  overlay: 'search:overlay',
  key: 'search:key',
  reading: 'search:reading',
}

const rootArg = process.argv.find(a => a.startsWith('--search-root='))
const root = (rootArg?.split('=')[1] === 'overlay' ? 'overlay' : 'chrome') as Bridge['root']

function on<T>(channel: string, listener: (value: T) => void): () => void {
  const wrapped = (_e: unknown, value: T) => listener(value)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

const bridge: Bridge = {
  root,
  platform: process.platform,
  cmd: command => ipcRenderer.invoke(IPC.command, command),
  hello: () => ipcRenderer.invoke(IPC.hello),
  onState: listener => on(IPC.state, listener),
  onOverlay: listener => on(IPC.overlay, listener),
  onKey: listener => on(IPC.key, listener),
  onReading: listener => on(IPC.reading, listener),
}

contextBridge.exposeInMainWorld('search', bridge)
