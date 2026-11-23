// chrome.offscreen (studio/04 §5.4): one document per extension, its own
// page, in a view that is never on screen; createDocument answers once the
// page has loaded. Closed when the extension goes.

import { WebContentsView, type Session } from 'electron'

const docs = new Map<string, WebContentsView>()
let profile: Session | null = null
export function setupOffscreen(p: Session): void { profile = p }

export function offscreenOf(id: string): Electron.WebContents | null {
  const v = docs.get(id)
  return v && !v.webContents.isDestroyed() ? v.webContents : null
}

export function closeOffscreen(id: string): boolean {
  const v = docs.get(id)
  if (!v) return false
  docs.delete(id)
  if (!v.webContents.isDestroyed()) v.webContents.close()
  return true
}

export const offscreenApi: Record<string, (id: string, ...args: any[]) => unknown> = {
  createDocument: async (id, p: { url?: string; reasons?: string[]; justification?: string } = {}) => {
    if (!profile) throw new Error('No profile.')
    if (docs.has(id)) throw new Error('Only a single offscreen document may be created.')
    let url: URL
    try { url = new URL(String(p.url ?? ''), `chrome-extension://${id}/`) } catch { throw new Error('The offscreen document must belong to this extension.') }
    if (url.protocol !== 'chrome-extension:' || url.host !== id) throw new Error('The offscreen document must belong to this extension.')
    if (!Array.isArray(p.reasons) || !p.reasons.length) throw new Error('At least one reason must be specified.')
    const view = new WebContentsView({ webPreferences: { session: profile, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
    docs.set(id, view)
    view.webContents.on('destroyed', () => { if (docs.get(id) === view) docs.delete(id) })
    try {
      await view.webContents.loadURL(url.href)
    } catch {
      closeOffscreen(id)
      throw new Error('The offscreen document did not finish loading.')
    }
  },
  closeDocument: id => { if (!closeOffscreen(id)) throw new Error('No current offscreen document.') },
  hasDocument: id => docs.has(id),
}
