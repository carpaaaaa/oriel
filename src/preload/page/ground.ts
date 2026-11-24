// The page's first paint, told to the main process: until then a dark
// Oriel gives the view a dark ground instead of white (main/pages/ground.ts,
// studio/01 §2.6). Owned by the pages module.

import { ipcRenderer } from 'electron'

let told = false
try {
  const watch = new PerformanceObserver(list => {
    if (told || !list.getEntries().some(e => e.name === 'first-paint' || e.name === 'first-contentful-paint')) return
    told = true
    watch.disconnect()
    ipcRenderer.send('ground:painted')
  })
  watch.observe({ type: 'paint', buffered: true })
} catch {}
