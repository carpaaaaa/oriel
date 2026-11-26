// What the page tells about its links (studio/08 B):
//  - Show where links go (`links.show`, StatusLine.swift): a small card at
//    the page's bottom edge with the address under the pointer, in the other
//    corner when the pointer is there; a view of its own over the page, as
//    the Mac's bubble is over its page, sized to the card;
//  - a swipe back or forward on the page (§7.36), and Swipe back closes a
//    tab a link opened (`tabs.swipeBackCloses`, §3.15);
//  - Email links open in (`mail.webmail`, Webmail.swift): a mailto: clicked
//    in a page opens the webmail's compose page in a tab beside it.

import { ipcMain, nativeTheme, WebContentsView } from 'electron'
import { model, type TabRecord } from '../model/model'
import { runtimes, runtimeFor } from '../views/tabs'
import { controllerFor, type WindowController } from '../views/window'
import { benchRequest } from '../bench/server'
import { keepOnPage } from '../views/guard'

const tabOf = (sender: Electron.WebContents): TabRecord | undefined => {
  for (const [id, r] of runtimes) if (r.contents === sender) return model.tabs.get(id)
  return undefined
}

// Show where links go

interface Bubble { view: WebContentsView; url: string; right: boolean; timer: NodeJS.Timeout | null; serial: number; release: NodeJS.Timeout | null }
const bubbles = new Map<string, Bubble>()
const watchedWindows = new WeakSet<WindowController>()
/** The card's page is a process of its own: let go after this long unseen, made again on the next link. */
const RELEASE = 30_000

const page = (dark: boolean) => `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;background:transparent;overflow:hidden;font:12px system-ui,"Segoe UI",sans-serif}
#c{position:absolute;bottom:6px;display:inline-block;max-width:calc(100% - 24px);height:26px;line-height:26px;padding:0 11px;box-sizing:border-box;
border-radius:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:ltr;
background:${dark ? '#1c1c1c' : '#ffffff'};color:${dark ? '#ededed' : '#171717'};border:1px solid ${dark ? '#333333' : '#e8e8e8'};box-shadow:0 3px 12px rgba(0,0,0,.08)}
#c.l{left:12px}#c.r{right:12px}
</style><span id=c class=l></span><script>
window.set=(t,r)=>{const c=document.getElementById('c');c.textContent=t;c.className=r?'r':'l';return Math.ceil(c.getBoundingClientRect().width)}
</script>`

function bubbleFor(c: WindowController): Bubble {
  let b = bubbles.get(c.record.id)
  if (b && !b.view.webContents.isDestroyed()) return b
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, javascript: true } })
  view.setBackgroundColor('#00000000')
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  keepOnPage(view.webContents)
  void view.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page(nativeTheme.shouldUseDarkColors)))
  b = { view, url: '', right: false, timer: null, serial: 0, release: null }
  bubbles.set(c.record.id, b)
  if (!watchedWindows.has(c)) {
    watchedWindows.add(c)
    const id = c.record.id
    c.base.on('closed', () => {
      const gone = bubbles.get(id)
      bubbles.delete(id)
      if (gone?.release) clearTimeout(gone.release)
      if (gone && !gone.view.webContents.isDestroyed()) gone.view.webContents.close()
    })
  }
  return b
}

function letGo(c: WindowController, b: Bubble): void {
  b.release = null
  if (bubbles.get(c.record.id) !== b || b.url) return
  bubbles.delete(c.record.id)
  try { if (!c.base.isDestroyed()) c.base.contentView.removeChildView(b.view) } catch {}
  if (!b.view.webContents.isDestroyed()) b.view.webContents.close()
}

function hide(c: WindowController): void {
  const b = bubbles.get(c.record.id)
  if (!b) return
  if (b.timer) { clearTimeout(b.timer); b.timer = null }
  b.url = ''
  b.serial++
  if (!b.view.webContents.isDestroyed()) b.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  if (b.release) clearTimeout(b.release)
  b.release = setTimeout(() => letGo(c, b), RELEASE)
  b.release.unref?.()
}

async function show(c: WindowController, t: TabRecord, url: string, at: { x: number; y: number; w: number; h: number }): Promise<void> {
  const area = runtimes.get(t.id)?.view?.getBounds()
  if (!area || !area.width) return
  const b = bubbleFor(c)
  if (b.timer) { clearTimeout(b.timer); b.timer = null }
  if (b.release) { clearTimeout(b.release); b.release = null }
  // A link under the card's corner gets the card in the other one.
  const right = at.h - at.y < 50 && at.x < Math.min(at.w * 0.6, 640) + 22
  b.url = url
  b.right = right
  const serial = ++b.serial
  const children = c.base.contentView.children
  if (!children.includes(b.view)) c.base.contentView.addChildView(b.view, Math.max(0, children.indexOf(c.overlay)))
  const room = Math.round(Math.min(area.width * 0.6, 640)) + 24
  const wc = b.view.webContents
  if (wc.isLoading()) await new Promise<void>(r => wc.once('did-finish-load', () => r()))
  const width: number = await wc.executeJavaScript(`set(${JSON.stringify(url)}, false)`).catch(() => 0)
  if (serial !== b.serial || !width) return
  const w = Math.min(room, width + 24), h = 26 + 16
  b.view.setBounds({ x: right ? area.x + area.width - w : area.x, y: area.y + area.height - h + 4, width: w, height: h })
}

ipcMain.on('search:tab-link', (e, info: { url: string; x: number; y: number; w: number; h: number }) => {
  const t = tabOf(e.sender)
  const win = t && model.windows.get(t.win)
  const c = win && controllerFor(win.id)
  if (!t || !c) return
  if (!info.url || model.pref<boolean>('links.show') === false || !model.onScreen(t.id)) {
    // Gone a moment after the pointer leaves, so moving between links doesn't flicker.
    const b = bubbles.get(c.record.id)
    if (b && !b.timer) b.timer = setTimeout(() => hide(c), 120)
    return
  }
  void show(c, t, info.url, info)
})

// A tab change or a new page clears the card at once.
model.on('selected', (win: { id: string }) => { const c = controllerFor(win.id); if (c) hide(c) })
model.on('tab-changed', (t: TabRecord, patch: Partial<TabRecord>) => {
  if (!('url' in patch)) return
  const c = controllerFor(t.win)
  if (c && bubbles.get(c.record.id)?.url) hide(c)
})

benchRequest('settingsb.linkCard', req => {
  const c = controllerFor(String(req.window ?? model.front ?? [...model.windows.keys()][0]))
  const b = c && bubbles.get(c.record.id)
  const front = c && c.record.active[c.record.space]
  const pageArea = front ? runtimes.get(front)?.view?.getBounds() ?? null : null
  return { url: b?.url ?? '', bounds: b && !b.view.webContents.isDestroyed() ? b.view.getBounds() : null, page: pageArea }
})

// A swipe on the page (§7.36), closing a link's tab (§3.15)

ipcMain.on('search:tab-swipe', (e, direction: 'back' | 'forward') => {
  const t = tabOf(e.sender)
  const win = t && model.windows.get(t.win)
  const wc = t && runtimes.get(t.id)?.contents
  if (!t || !win || !wc) return
  const nav = wc.navigationHistory
  if (direction === 'forward') { if (nav.canGoForward()) nav.goForward(); return }
  if (nav.canGoBack()) { nav.goBack(); return }
  // Back from the first page of a tab a page opened: the tab goes, and you
  // land on the tab viewed before (Browser.armSwipeClose).
  if (model.pref<boolean>('tabs.swipeBackCloses') && t.opener && !t.pinID && !t.popup && !t.bench) model.close(win, t.id, true)
})

/** The bench's two fingers: horizontal wheel events the page itself gets. */
benchRequest('settingsb.swipe', async req => {
  const wc = runtimes.get(String(req.id))?.contents
  if (!wc) throw new Error('no page')
  const dx = Number(req.deltaX ?? -40)
  // A page Chromium counts as hidden (the screen locked or asleep on a night
  // run) gets no wheel events at all: shown for the swipe, as on screen.
  wc.setBackgroundThrottling(false)
  setTimeout(() => { if (!wc.isDestroyed()) wc.setBackgroundThrottling(true) }, 1500)
  for (let i = 0; i < Number(req.count ?? 8); i++) {
    wc.sendInputEvent({ type: 'mouseWheel', x: 200, y: 200, deltaX: -dx, deltaY: 0, canScroll: true } as Electron.MouseWheelInputEvent)
    await new Promise(r => setTimeout(r, 16))
  }
  return {}
})

/** The bench's pointer moved over the page on screen, without a click. */
benchRequest('settingsb.hover', req => {
  const c = controllerFor(String(req.window ?? model.front ?? [...model.windows.keys()][0]))
  const front = c && c.record.active[c.record.space]
  const view = front ? runtimes.get(front)?.view : null
  if (!view) throw new Error('no page')
  const at = view.getBounds()
  view.webContents.sendInputEvent({ type: 'mouseMove', x: Number(req.x) - at.x, y: Number(req.y) - at.y })
  return {}
})

// Email links open in (Webmail.swift)

/** A mailto: as RFC 6068 reads it: addresses, then to, cc, bcc, subject and body. */
export function draft(mailto: string): { to: string[]; cc: string[]; bcc: string[]; subject: string; body: string } | null {
  if (!/^mailto:/i.test(mailto)) return null
  const dec = (s: string) => { try { return decodeURIComponent(s) } catch { return s } }
  const list = (s: string) => dec(s).split(',').map(x => x.trim()).filter(x => x && !/[\u0000-\u001f]/.test(x))
  let rest = mailto.slice(7)
  const hash = rest.indexOf('#')
  if (hash >= 0) rest = rest.slice(0, hash)
  const q = rest.indexOf('?')
  const out = { to: list(q >= 0 ? rest.slice(0, q) : rest), cc: [] as string[], bcc: [] as string[], subject: '', body: '' }
  let subject: string | null = null, body: string | null = null
  if (q >= 0) for (const field of rest.slice(q + 1).split('&')) {
    const eq = field.indexOf('=')
    const name = dec(eq >= 0 ? field.slice(0, eq) : field).toLowerCase()
    const value = eq >= 0 ? field.slice(eq + 1) : ''
    if (name === 'to') out.to.push(...list(value))
    else if (name === 'cc') out.cc.push(...list(value))
    else if (name === 'bcc') out.bcc.push(...list(value))
    else if (name === 'subject' && subject === null) subject = dec(value)
    else if (name === 'body' && body === null) body = dec(value)
  }
  out.to = out.to.slice(0, 50); out.cc = out.cc.slice(0, 50); out.bcc = out.bcc.slice(0, 50)
  out.subject = (subject ?? '').replace(/\r\n|\r|\n/g, ' ').slice(0, 500)
  out.body = (body ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return out
}

/** Every character but the unreserved ones percent-encoded. */
const enc = (s: string, keep = '') => Array.from(new TextEncoder().encode(s)).map(byte => {
  const ch = String.fromCharCode(byte)
  return /[A-Za-z0-9\-._~]/.test(ch) || (byte < 128 && keep.includes(ch)) ? ch : '%' + byte.toString(16).toUpperCase().padStart(2, '0')
}).join('')

/** The webmail's compose page for a mailto:, or null for "Your mail app". */
export function compose(mailto: string, webmail = model.pref<string>('mail.webmail')): string | null {
  const d = draft(mailto)
  if (!d || !webmail || webmail === 'none') return null
  const to = d.to.join(','), cc = d.cc.join(','), bcc = d.bcc.join(',')
  const query = (pairs: [string, string][]) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v)}`).join('&')
  switch (webmail) {
    case 'gmail': { const r = query([['to', to], ['cc', cc], ['bcc', bcc], ['su', d.subject], ['body', d.body]]); return 'https://mail.google.com/mail/?view=cm&fs=1' + (r ? '&' + r : '') }
    case 'outlook': { const r = query([['to', to], ['cc', cc], ['bcc', bcc], ['subject', d.subject], ['body', d.body]]); return 'https://outlook.live.com/mail/0/deeplink/compose' + (r ? '?' + r : '') }
    case 'fastmail': { const r = query([['to', to], ['cc', cc], ['bcc', bcc], ['subject', d.subject], ['body', d.body]]); return 'https://app.fastmail.com/mail/compose' + (r ? '?' + r : '') }
    case 'proton': {
      const fields: string[] = []
      if (cc) fields.push('cc=' + enc(cc, '@,+'))
      if (bcc) fields.push('bcc=' + enc(bcc, '@,+'))
      if (d.subject) fields.push('subject=' + enc(d.subject))
      if (d.body) fields.push('body=' + enc(d.body.replace(/\n/g, '\r\n')))
      const clean = 'mailto:' + enc(to, '@,+') + (fields.length ? '?' + fields.join('&') : '')
      return 'https://mail.proton.me/inbox#mailto=' + enc(clean)
    }
    default: return null
  }
}

/** What was opened, on a test run (the Mac's Mail.seen). */
export const mailSeen: string[] = []

/** A mailto: clicked in one of this window's pages, with a webmail chosen:
 * its compose page beside the page, in front; never a private tab, since a
 * webmail you write in is the one you're signed in to. True when taken. */
export function openCompose(tabID: string, mailto: string): boolean {
  const url = compose(mailto)
  const t = model.tabs.get(tabID)
  const win = t && model.windows.get(t.win)
  if (!url || !t || !win) return false
  mailSeen.push('page: ' + url)
  setImmediate(() => {
    const tab = model.open(win, url, { foreground: true, from: t.shy ? undefined : t.id, link: true })
    void runtimeFor(tab.id)
  })
  return true
}

benchRequest('settingsb.mailSeen', () => ({ seen: mailSeen }))
benchRequest('settingsb.compose', req => ({ url: compose(String(req.mailto), req.webmail === undefined ? undefined : String(req.webmail)) }))
