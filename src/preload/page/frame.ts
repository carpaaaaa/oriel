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
// The frames it makes by script (about:blank, document.write) get the same,
// from it (blank.ts): Chromium runs no preload in them.

import { ipcRenderer, webFrame } from 'electron'
import { runScriptlets, watchPage } from './blocker'
import { handOn } from './blank'

interface FramePrefs { css: string; scripts: string[]; extended: unknown[]; dom: boolean; gpc: boolean; noCookies: boolean }

let p: FramePrefs | null = null
try { p = ipcRenderer.sendSync('pages:frame') as FramePrefs | null } catch {}

if (p) {
  const share = p
  // Its cookies and navigator, and the frames it makes, before its scripts.
  handOn({ cosmetics: () => ({ css: share.css, scripts: share.scripts }), noCookies: p.noCookies, gpc: p.gpc })
  if (p.scripts.length) runScriptlets(p.scripts)
  if (p.css) { try { webFrame.insertCSS(p.css, { cssOrigin: 'user' }) } catch {} }
  if (p.css && (p.dom || p.extended.length)) watchPage(p.dom, p.extended, css => { try { webFrame.insertCSS(css, { cssOrigin: 'user' }) } catch {} })
}
