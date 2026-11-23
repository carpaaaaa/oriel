// Camera, microphone or screen in use by the page (studio/01 §2.21, §9.23):
// Electron says nothing of it, and a tab on a call must never sleep. The
// page's getUserMedia and getDisplayMedia are wrapped before its scripts run;
// live tracks are counted, and the count's turning on or off is told to the
// main process. Owned by the tabs module (wired in page.ts by the
// orchestrator).

import { contextBridge, ipcRenderer } from 'electron'

try {
  contextBridge.executeInMainWorld({
    func: () => {
      const media = navigator.mediaDevices as MediaDevices | undefined
      if (!media) return
      const live = new Set<MediaStreamTrack>()
      let was = false
      const tell = () => {
        const on = live.size > 0
        if (on === was) return
        was = on
        document.dispatchEvent(new Event(on ? '__tabs_capture_on' : '__tabs_capture_off'))
      }
      for (const name of ['getUserMedia', 'getDisplayMedia'] as const) {
        const original = media[name]?.bind(media) as ((...a: unknown[]) => Promise<MediaStream>) | undefined
        if (!original) continue
        const wrapped = async (...args: unknown[]) => {
          const stream = await original(...args)
          for (const track of stream.getTracks()) {
            live.add(track)
            track.addEventListener('ended', () => { live.delete(track); tell() })
            const stop = track.stop.bind(track)
            track.stop = () => { stop(); live.delete(track); tell() }
          }
          tell()
          return stream
        }
        Object.defineProperty(media, name, { value: wrapped, configurable: true, writable: true })
      }
    },
  })
  document.addEventListener('__tabs_capture_on', () => ipcRenderer.send('search:tab-capture', true))
  document.addEventListener('__tabs_capture_off', () => ipcRenderer.send('search:tab-capture', false))
} catch {
  // An older Electron, or a page that won't take it: nothing said, as before.
}
