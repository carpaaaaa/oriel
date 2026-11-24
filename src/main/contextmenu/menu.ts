// The page's right-click menu (studio/01 §2.48, §3.38; studio/06 §2.3, §5.2,
// §5.3). A page's context-menu event (views/tabs.ts hooks.contextMenu) builds
// the rows here, from what Chromium says is under the click; the overlay
// draws them where the click was (ui/contextmenu/register.tsx, with the tabs'
// Menu), raised over the whole window with the keys, as the tabs' menus are.
// Every row is a command: the existing ones where they exist (tab.back,
// tab.reload...), the ctx.* ones of shared/modules/contextmenu.ts otherwise.

import { app, clipboard, dialog, type WebContents } from 'electron'
import path from 'node:path'
import type { ID } from '../../shared/state'
import { CTX_MENU, type PageMenuData, type PageMenuEntry } from '../../shared/modules/contextmenu'
import type { TranslateLanguage, TranslateTab } from '../../shared/modules/translate'
import { model } from '../model/model'
import { handle, handled, run } from '../router'
import { need, openWindow } from '../context'
import { probe } from '../paths'
import { hooks, runtimeFor, runtimes, type TabRuntime } from '../views/tabs'
import { controllerFor, type WindowController } from '../views/window'
import { bindings, keysOf, live, shortcut } from '../keys'
import { engineID, engineName, engineTable, engineTemplate, engineURL, searchURL, written, bareHost, type EngineID } from '../field/engines'
import { closeField } from '../field/commands'
import { getExtensions } from '../extensions'
import { downloadsFolder } from '../settings/prefs'
import { fileName, placeFor } from '../settings/downloads'
import { openBeside } from '../pages/links'
import { MENU as TABS_MENU } from '../tabs/menus'
import { buildMenu, contextOf, type Facts } from './build'
import { cleanLink } from './clean'
import { log } from './probe'

/** Other modules' say in the rows: Hide Element only where something can be
 * taken off (main/hide), asked of the page while the menu is made. */
export const pageMenuHooks: { hideable?: (wc: WebContents, params: Electron.ContextMenuParams) => Promise<boolean> } = {}

/** The menu up in each window: the page it is for and what was clicked. */
const current = new Map<ID, { tab: ID; params: Electron.ContextMenuParams; data: PageMenuData }>()
/** The last menu shown anywhere (the bench reads it). */
export let lastMenu: (PageMenuData & { window: ID; tab: ID }) | null = null
let seq = 0

const ours = (c: WindowController) => c.overlayLayer.kind === 'panel' && c.overlayLayer.name === CTX_MENU

// facts the rows depend on

/** The key a command has now, if its command exists (keys.ts). */
function accel(id: string): string | undefined {
  const b = bindings.find(x => x.id === id)
  return b && live(b) ? keysOf(b)[0] : undefined
}

function engines(): { id: string; name: string }[] {
  const list: { id: string; name: string }[] = (Object.keys(engineTable) as Exclude<EngineID, 'custom'>[]).map(id => ({ id, name: engineName(id) }))
  const custom = model.pref<string>('search.custom') ?? ''
  if (custom && bareHost(written(custom))) list.push({ id: 'custom', name: engineName('custom') })
  return list
}

/** The translation module's languages (Settings › Translation languages)
 * and what the tab's translation is doing: shown, or being made, is "Show
 * Original"; one that failed offers to translate again. */
async function translateFacts(c: WindowController, id: ID): Promise<Facts['translate']> {
  if (!handled().includes('translate.menuLanguages')) return null
  try {
    const r = await run({ do: 'translate.menuLanguages', id }, { window: c }) as { languages: TranslateLanguage[]; tab: TranslateTab | null }
    return { languages: r.languages ?? [], translated: r.tab && r.tab.phase !== 'failed' ? r.tab.to : null }
  } catch (e) {
    console.warn('[ctxmenu] translate', e)
    return null
  }
}

/** Extensions' items (electron-chrome-extensions' chrome.contextMenus),
 * kept by key until the next menu: picking one calls its own click. */
const extensionItems = new Map<string, Electron.MenuItem>()

function extensionEntries(wc: WebContents, params: Electron.ContextMenuParams): PageMenuEntry[] {
  extensionItems.clear()
  const e = getExtensions()
  if (!e) return []
  let items: Electron.MenuItem[] = []
  try { items = e.getContextMenuItems(wc, params) } catch (error) { console.warn('[ctxmenu] extensions', error); return [] }
  const convert = (list: Electron.MenuItem[]): PageMenuEntry[] => list.map(item => {
    if (item.type === 'separator') return { separator: true }
    const sub = item.submenu?.items ?? []
    const key = `x${extensionItems.size + 1}`
    if (!sub.length) extensionItems.set(key, item)
    return {
      label: item.label,
      enabled: item.enabled,
      checked: item.type === 'checkbox' || item.type === 'radio' ? item.checked : undefined,
      submenu: sub.length ? convert(sub) : undefined,
      act: sub.length ? undefined : { cmd: { do: 'ctx.extension', key } },
    }
  })
  return convert(items)
}

// showing

async function show(tab: TabRuntime, params: Electron.ContextMenuParams): Promise<void> {
  const id = tab.id
  const t = tab.record
  const win = model.windowOf(id)
  const c = win ? controllerFor(win.id) : undefined
  const wc = tab.contents
  if (!t || !c || !wc) return
  const internal = !!t.internal || /^oriel:/i.test(params.pageURL)
  const [translate, hideable] = await Promise.all([
    internal ? null : translateFacts(c, id),
    internal || !pageMenuHooks.hideable ? false : pageMenuHooks.hideable(wc, params).catch(() => false),
  ])
  const facts: Facts = {
    tab: id,
    shy: !!t.shy,
    internal,
    split: model.pref<boolean>('splitView') !== false,
    canBack: wc.navigationHistory.canGoBack(),
    canForward: wc.navigationHistory.canGoForward(),
    engine: { id: engineID(), name: engineName() },
    engines: engines(),
    translate,
    hideable,
    accel,
    extensions: internal ? [] : extensionEntries(wc, params),
  }
  // The page can be gone while the translation module answered.
  const view = tab.view
  if (!view || wc.isDestroyed() || !model.tabs.has(id)) return
  const entries = buildMenu(params, facts)
  if (!entries.length) return
  const b = view.getBounds()
  const { width, height } = c.base.getContentBounds()
  const m = c.frame.margin()
  const data: PageMenuData = {
    entries,
    at: { x: Math.round(b.x + params.x), y: Math.round(b.y + params.y) },
    room: { w: width - m.right, h: height - m.bottom },
    context: contextOf(params),
    seq: ++seq,
  }
  current.set(c.record.id, { tab: id, params, data })
  lastMenu = { ...data, window: c.record.id, tab: id }
  c.sendOverlay({ kind: 'panel', name: CTX_MENU, data })
  c.setOverlayRegion({ x: 0, y: 0, width, height }, true)
}

const before = hooks.contextMenu
hooks.contextMenu = (tab, params) => {
  before?.(tab, params)
  void show(tab, params).catch(error => console.warn('[ctxmenu]', error))
}

/** The menu goes; the keys back to its page. */
function close(c: WindowController, refocus: boolean): void {
  const was = current.get(c.record.id)
  current.delete(c.record.id)
  if (ours(c)) c.sendOverlay({ kind: 'none' })
  if (!refocus) return
  const wc = was ? runtimes.get(was.tab)?.contents : null
  if (wc && model.onScreen(was!.tab)) wc.focus()
  else c.focusPage()
}

/** Escape with a drawn menu up (this one, or the tabs' menus and popovers):
 * the keys table took it before the overlay heard it (escape, then stop),
 * so no drawn menu ever closed with a real Escape. Now, from the overlay, the
 * key goes on to the menu itself (a submenu closes first, as Menu does); from
 * a page, this menu closes here. Otherwise the table's Escape, as always. */
const drawn = (c: WindowController) => c.overlayLayer.kind === 'panel' && (c.overlayLayer.name === CTX_MENU || c.overlayLayer.name === TABS_MENU)
const table = (id: string) => bindings.find(b => b.id === id)?.action
shortcut('Escape', 'first', (c, k) => {
  if (drawn(c) && !k.fromPage) return false
  if (ours(c)) { close(c, true); return true }
  return table('escape')?.(c, k) ?? false
})
shortcut('Escape', 'later', (c, k) => (drawn(c) && !k.fromPage ? false : table('stop')?.(c, k) ?? false))

handle('ctx.close', ({ refocus, at, seq }, ctx) => {
  const c = need(ctx)
  const up = current.get(c.record.id)
  if (seq !== undefined && up && up.data.seq !== seq) return
  if (seq !== undefined && !up && !at) return
  close(c, !!refocus && !at)
  if (!at) return
  // A right click outside the menu: the page's menu there, as Windows does.
  const hit = c.pageBounds().find(p => at.x >= p.rect.x && at.y >= p.rect.y && at.x < p.rect.x + p.rect.width && at.y < p.rect.y + p.rect.height)
  const wc = hit && runtimes.get(hit.id)?.contents
  if (!hit || !wc) { c.focusPage(); return }
  const x = at.x - hit.rect.x, y = at.y - hit.rect.y
  wc.focus()
  wc.sendInputEvent({ type: 'mouseMove', x, y })
  wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'right', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'right', clickCount: 1 })
})

// the rows' commands

const contentsOf = (id: ID) => {
  const wc = runtimes.get(id)?.contents
  if (!wc) throw new Error('that page is gone')
  return wc
}

handle('ctx.open', ({ url, where, from }, ctx) => {
  const c = need(ctx)
  const w = c.record
  // Behind, after its page and the links it opened already (§3.31, §3.38).
  if (where === 'tab') return model.open(w, url, { foreground: false, from, link: true }).id
  // Split View: the pages module's pairing, the one Alt-click uses (§3.37,
  // §3.38, §8): beside its page with the keys, in its split up to 4 pages.
  if (where === 'split') return from && model.tabs.has(from) ? openBeside(w, from, url) : model.open(w, url, { foreground: true }).id
  // A window of its own: private for Private Window, or from a private page.
  const source = from ? model.tabs.get(from) : undefined
  const other = openWindow({ shy: where === 'private' || !!source?.shy || w.shy })
  const blank = model.activeTab(other.record)
  if (!blank) return null
  runtimeFor(blank.id, other.pageSession).load(url)
  closeField(other)
  other.base.focus()
  return blank.id
})

handle('ctx.copy', async ({ text, clean }) => {
  await clipboard.writeText(clean ? cleanLink(text) : text)
})

/** A picture's address to an engine that searches by picture (06 §5.3). */
function imageSearchURL(src: string): string {
  const q = encodeURIComponent(src)
  return engineID() === 'bing'
    ? `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${q}`
    : `https://lens.google.com/uploadbyurl?url=${q}`
}

handle('ctx.search', ({ text, engine, image, from }, ctx) => {
  const c = need(ctx)
  const url = image ? imageSearchURL(text) : engine ? engineURL(text, engineTemplate(engine as EngineID)) : searchURL(text)
  if (!url) return null
  // In front, private from a private page (Browser's onSearch: open(url, foreground: true, from: tab)).
  const tab = model.open(c.record, url, { foreground: true, from })
  c.focusPage()
  return tab.id
})

handle('ctx.edit', ({ id, action }) => {
  const wc = contentsOf(id)
  wc.focus()
  wc[action]()
})

handle('ctx.spell', ({ id, replace, learn }) => {
  const wc = contentsOf(id)
  wc.focus()
  if (replace) wc.replaceMisspelling(replace)
  if (learn) wc.session.addWordToSpellCheckerDictionary(learn)
})

handle('ctx.emoji', ({ id }) => {
  contentsOf(id).focus()
  if (probe) { log.emoji++; return }
  app.showEmojiPanel()
})

handle('ctx.copyImage', ({ id, x, y }) => contentsOf(id).copyImageAt(x, y))

/** Windows' Save dialog, or the test's answer in its place. */
async function askWhere(c: WindowController, title: string, defaultPath: string, filters?: Electron.FileFilter[]): Promise<string | null> {
  if (probe) { log.dialogs.push({ title, defaultPath }); return log.saveAs }
  const r = await dialog.showSaveDialog(c.base as never, { title, defaultPath, filters, properties: ['createDirectory', 'showOverwriteConfirmation'] })
  return r.canceled || !r.filePath ? null : r.filePath
}

/** A name Windows takes, from an address. */
function nameFor(url: string, fallback: string): string {
  const safe = (s: string) => fileName(s).replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim()
  const data = /^data:(?:image|video|audio)\/([\w+.-]+)/i.exec(url)
  if (data) return `${fallback}.${data[1].toLowerCase() === 'jpeg' ? 'jpg' : data[1].toLowerCase().replace('svg+xml', 'svg')}`
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
    const name = safe(last)
    return name && name !== 'download' ? name : fallback
  } catch { return fallback }
}

handle('ctx.save', async ({ id, url, ask }, ctx) => {
  const wc = contentsOf(id)
  if (!ask) { wc.downloadURL(url); return }
  const c = need(ctx)
  const kind = /^(data:)?video|\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? 'Video' : /^(data:)?audio|\.(mp3|m4a|ogg|wav|flac)(\?|$)/i.test(url) ? 'Audio' : 'Image'
  const file = await askWhere(c, `Save ${kind} As`, path.join(downloadsFolder(), nameFor(url, kind.toLowerCase())))
  if (!file || wc.isDestroyed()) return
  // The downloads module puts it there, listed as any download (06 §3.1).
  let key = url
  try { key = new URL(url).href } catch {}
  placeFor.set(key, file)
  wc.downloadURL(url)
})

handle('ctx.page', async ({ id, action, x, y }, ctx) => {
  const c = need(ctx)
  const wc = contentsOf(id)
  const t = model.tabs.get(id)
  const url = wc.getURL()
  switch (action) {
    case 'save': {
      if (handled().includes('page.save' as never)) { await run({ do: 'page.save' } as never, { window: c }); return }
      const title = (t?.title || new URL(url).hostname || 'page').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').trim().slice(0, 120)
      const file = await askWhere(c, 'Save Page As', path.join(downloadsFolder(), `${title}.html`),
        [{ name: 'Webpage, Complete', extensions: ['html', 'htm'] }, { name: 'Webpage, Single File', extensions: ['mhtml'] }])
      if (!file || wc.isDestroyed()) return
      await wc.savePage(file, /\.mhtml$/i.test(file) ? 'MHTML' : 'HTMLComplete')
      return
    }
    case 'print':
      if (handled().includes('page.print' as never)) { await run({ do: 'page.print' } as never, { window: c }); return }
      if (probe) { log.printed.push(id); return }
      wc.print({}, () => {})
      return
    case 'source': {
      // In a tab of its own after the page, in front, as Chrome's Ctrl+U.
      const tab = model.open(c.record, `view-source:${url}`, { foreground: true, from: id, link: true })
      c.focusPage()
      return tab.id
    }
    case 'inspect':
      if (probe) { log.inspected.push({ id, x: x ?? 0, y: y ?? 0 }); return }
      wc.inspectElement(x ?? 0, y ?? 0)
      return
  }
})

handle('ctx.extension', ({ key }) => {
  const item = extensionItems.get(key)
  if (!item) return
  ;(item.click as (...a: unknown[]) => void)()
})
