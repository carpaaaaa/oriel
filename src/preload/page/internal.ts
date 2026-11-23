// The bridge Oriel's own pages (oriel://...) get: only on those pages, never
// on a website (studio/02 §8.8). The main process checks again that every
// command comes from an Oriel page's main frame. Owned by the settings module.

import { contextBridge, ipcRenderer } from 'electron'

if (location.protocol === 'oriel:' && window === window.top) {
  contextBridge.exposeInMainWorld('oriel', {
    cmd: (command: unknown) => ipcRenderer.invoke('oriel:command', command),
    on: (listener: (update: { kind: string; value: unknown }) => void) => {
      const wrapped = (_e: unknown, update: { kind: string; value: unknown }) => listener(update)
      ipcRenderer.on('oriel:update', wrapped)
      return () => { ipcRenderer.off('oriel:update', wrapped) }
    },
    platform: process.platform,
  })
}

export {}
