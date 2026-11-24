// What a page's frames get (studio/06 §2.1, §2.3, §2.4): the preload runs
// in frames too (nodeIntegrationInSubFrames) for this part alone, asked of
// the main process as the frame starts (src/main/pages/page.ts, the frame's
// address and its page's site are the main process's to know):
//  - Block ads and trackers: the lists' hiding rules, procedural filters
//    and scriptlets for the frame's site, before its own scripts;
//  - Tell sites not to sell or share your data: navigator.globalPrivacyControl;
//  - Prevent cross-site tracking: a frame of another site than its page
//    reads no cookies and writes none from script (its requests already go
//    without them, src/main/pages/privacy.ts). Its storage is Chromium's,
//    kept apart per site of the page.

import { contextBridge, ipcRenderer, webFrame } from 'electron'
import { runScriptlets, watchPage } from './blocker'

interface FramePrefs { css: string; scripts: string[]; extended: unknown[]; dom: boolean; gpc: boolean; noCookies: boolean }

let p: FramePrefs | null = null
try { p = ipcRenderer.sendSync('pages:frame') as FramePrefs | null } catch {}

if (p) {
  if (p.noCookies) {
    try {
      contextBridge.executeInMainWorld({
        func: () => {
          try {
            const d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
            if (d) {
              Object.defineProperty(Document.prototype, 'cookie', {
                get: Object.getOwnPropertyDescriptor({ get cookie() { return '' } }, 'cookie')!.get,
                set: Object.getOwnPropertyDescriptor({ set cookie(_v: string) {} }, 'cookie')!.set,
                enumerable: d.enumerable, configurable: true,
              })
            }
          } catch {}
          try {
            const store = (globalThis as unknown as { CookieStore?: { prototype: Record<string, unknown> } }).CookieStore
            if (store) {
              const refuse = () => Promise.reject(new DOMException('Cookies are blocked in this frame.', 'SecurityError'))
              for (const name of ['get', 'getAll', 'set', 'delete']) {
                Object.defineProperty(store.prototype, name, { value: name === 'getAll' ? () => Promise.resolve([]) : name === 'get' ? () => Promise.resolve(null) : refuse, writable: true, configurable: true })
              }
            }
          } catch {}
        },
      })
    } catch {}
  }
  try {
    contextBridge.executeInMainWorld({
      func: (on: boolean) => {
        try {
          Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
            get: Object.getOwnPropertyDescriptor({ get globalPrivacyControl() { return on } }, 'globalPrivacyControl')!.get,
            enumerable: true, configurable: true,
          })
        } catch {}
      },
      args: [p.gpc],
    })
  } catch {}
  if (p.scripts.length) runScriptlets(p.scripts)
  if (p.css) { try { webFrame.insertCSS(p.css, { cssOrigin: 'user' }) } catch {} }
  if (p.css && (p.dom || p.extended.length)) watchPage(p.dom, p.extended, css => { try { webFrame.insertCSS(css, { cssOrigin: 'user' }) } catch {} })
}
