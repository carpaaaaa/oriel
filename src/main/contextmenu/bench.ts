// The page menu as the tests see it (test/ctxmenu_*.py): the last menu,
// what Windows' own windows were asked, the clipboard of whoever works beside
// the test kept and given back, search engines kept off the network.

import { clipboard, ClipboardItem } from 'electron'
import { benchRequest } from '../bench/server'
import { net } from '../net'
import { probe } from '../paths'
import { allControllers, controllerFor, focusedController } from '../views/window'
import { runtimes } from '../views/tabs'
import { lastMenu } from './menu'
import { fakes, log } from './probe'

const flat = (entries: { label?: string; separator?: boolean; enabled?: boolean; checked?: boolean; accel?: string; submenu?: unknown[] }[]): unknown[] =>
  entries.map(e => (e.separator ? '—' : { label: e.label, enabled: e.enabled !== false, checked: e.checked, accel: e.accel, submenu: e.submenu ? flat(e.submenu as never) : undefined }))

benchRequest('ctxmenu.last', req => {
  const c = req.window ? controllerFor(String(req.window)) : null
  const m = lastMenu
  return {
    menu: m ? { tab: m.tab, window: m.window, at: m.at, room: m.room, context: m.context, seq: m.seq, entries: flat(m.entries) } : null,
    open: allControllers().filter(w => w.overlayLayer.kind === 'panel' && w.overlayLayer.name === 'ctx.menu').map(w => w.record.id),
    ...(c ? { overlay: c.overlayLayer.kind } : {}),
  }
})

benchRequest('ctxmenu.log', req => {
  if ('saveAs' in req) log.saveAs = (req.saveAs as string | null) ?? null
  if (req.reset) { log.dialogs = []; log.printed = []; log.inspected = []; log.emoji = 0; log.translated = [] }
  return { log: { ...log } }
})

/** The translation module's stand-in, as a test wants it. */
benchRequest('ctxmenu.translate', req => {
  if (Array.isArray(req.languages)) fakes.languages = req.languages as string[]
  if (req.reset) fakes.translated.clear()
  return { languages: fakes.languages, translated: Object.fromEntries(fakes.translated) }
})

/** Where a page is in its window (the active tab's, or the one named). */
benchRequest('ctxmenu.page', req => {
  const c = req.window ? controllerFor(String(req.window)) : focusedController()
  if (!c) return { rect: null }
  const id = (req.id as string | undefined) ?? c.record.active[c.record.space]
  // Every view in its stacking order, for a test to see what is on top.
  const views = c.base.contentView.children.map(v => ({ bounds: v.getBounds(), url: (v as Electron.WebContentsView).webContents?.getURL?.() ?? null }))
  return { rect: c.pageBounds().find(p => p.id === id)?.rect ?? null, views }
})

/** A real key to the overlay, the view the menu gives the keys to: a test
 * window is never the key window on a Mac, so bench `key` can't find it by
 * focus. It goes through before-input-event as a typed key does. */
benchRequest('ctxmenu.key', req => {
  const c = req.window ? controllerFor(String(req.window)) : focusedController()
  if (!c) return { sent: false }
  const wc = c.overlay.webContents
  const keyCode = String(req.key)
  wc.sendInputEvent({ type: 'keyDown', keyCode })
  if (keyCode.length === 1) wc.sendInputEvent({ type: 'char', keyCode })
  wc.sendInputEvent({ type: 'keyUp', keyCode })
  return { sent: true }
})

/** The spelling checker of a page's session, and a word a test added to the
 * dictionary taken out again (the Mac's is the person's own). */
benchRequest('ctxmenu.spell', req => {
  const wc = runtimes.get(String(req.id))?.contents
  if (!wc) return { enabled: false }
  if (typeof req.unlearn === 'string') wc.session.removeWordFromSpellCheckerDictionary(req.unlearn)
  return { enabled: wc.session.isSpellCheckerEnabled(), languages: wc.session.getSpellCheckerLanguages() }
})

// The clipboard: saved before a test writes to it, given back after.

let saved: Record<string, Blob>[] | null = null

benchRequest('ctxmenu.clipboard', async req => {
  switch (req.op) {
    case 'save': {
      const items = await clipboard.read().catch(() => [] as Electron.ClipboardItem[])
      saved = await Promise.all(items.map(async i => Object.fromEntries(await Promise.all(i.types.map(async t => [t, await i.getType(t)])))))
      return { saved: saved.map(o => Object.keys(o)) }
    }
    case 'restore': {
      if (!saved) return { restored: false }
      const kept = saved.filter(o => Object.keys(o).length)
      saved = null
      if (!kept.length) { clipboard.clear(); return { restored: true } }
      try { await clipboard.write(kept.map(o => new ClipboardItem(o))) } catch { clipboard.clear() }
      return { restored: true }
    }
    case 'clear':
      clipboard.clear()
      return {}
    default: {
      const items = await clipboard.read().catch(() => [] as Electron.ClipboardItem[])
      const types = items.flatMap(i => i.types)
      const image = types.find(t => t.startsWith('image/'))
      let size = 0
      if (image) { const it = items.find(i => i.types.includes(image)); size = it ? (await it.getType(image) as Blob).size : 0 }
      return { text: await clipboard.readText(), types, image: image ?? null, imageBytes: size }
    }
  }
})

// Hosts a test opens without going there (search engines): the address is
// what is checked, the request never leaves.

const offline = new Set<string>()
benchRequest('ctxmenu.offline', req => {
  offline.clear()
  for (const h of (req.hosts as string[] | undefined) ?? []) offline.add(h)
  return { hosts: [...offline] }
})
if (probe) {
  net.onBeforeRequest('ctxmenu-offline', 1, d => {
    if (!offline.size) return
    try { if (offline.has(new URL(d.url).hostname)) return { cancel: true } } catch {}
  })
}
