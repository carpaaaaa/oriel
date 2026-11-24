// The page menu's rows for what is under the click, in the order Search and
// Chrome give them (studio/01 §2.48, §3.38; studio/06 §2.3, §5.2, §5.3;
// Tab.swift:2494-2626, ImageMenu.swift:148-180). Groups are joined by
// separators; a group with nothing in it leaves none.

import type { ID } from '../../shared/state'
import type { PageMenuEntry } from '../../shared/modules/contextmenu'
import { cleanLink, highlightLink } from './clean'
import { refusesInternal } from '../settings/openers'

export interface Facts {
  tab: ID
  /** A private tab: its links open privately already (no Private Window). */
  shy: boolean
  /** One of Oriel's own pages (oriel://). */
  internal: boolean
  /** Split View on (Settings, `splitView`): its rows only then (§3.38). */
  split: boolean
  canBack: boolean
  canForward: boolean
  /** The engine searches go to, and the others for Search With. */
  engine: { id: string; name: string }
  engines: { id: string; name: string }[]
  /** Languages from Settings, and the one the page is shown in (or null). */
  translate: { languages: { code: string; name: string }[]; translated: string | null } | null
  /** The key a command has now, when it is live ("Alt+Left"). */
  accel: (binding: string) => string | undefined
  /** Extensions' items, ready (chrome.contextMenus). */
  extensions: PageMenuEntry[]
}

const sep: PageMenuEntry = { separator: true }

function join(groups: PageMenuEntry[][]): PageMenuEntry[] {
  const out: PageMenuEntry[] = []
  for (const g of groups) {
    if (!g.length) continue
    if (out.length) out.push(sep)
    out.push(...g)
  }
  return out
}

/** "Search “a long sentence…”": the words, cut to fit a menu. */
export function shortened(text: string, most = 32): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > most ? t.slice(0, most - 1).trimEnd() + '…' : t
}

const web = (url: string) => /^https?:/i.test(url)
const openable = (url: string) => /^(https?|file|ftp|chrome-extension|oriel):/i.test(url)

/** What the menu is about, for the bench and the overlay. */
export function contextOf(p: Electron.ContextMenuParams): string[] {
  const c: string[] = []
  if (p.isEditable) c.push('editable')
  if (p.linkURL) c.push('link')
  if (p.mediaType === 'image' && p.srcURL) c.push('image')
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL) c.push(p.mediaType)
  if (p.selectionText.trim()) c.push('selection')
  if (!c.length) c.push('page')
  return c
}

export function buildMenu(p: Electron.ContextMenuParams, f: Facts): PageMenuEntry[] {
  const id = f.tab
  const context = contextOf(p)
  const selection = p.selectionText.trim()
  const groups: PageMenuEntry[][] = []

  // Search "words" and Search With ▸, the chosen engine ticked (§2.48).
  const searchGroup = (): PageMenuEntry[] => selection ? [
    { label: `Search “${shortened(selection)}”`, act: { cmd: { do: 'ctx.search', text: selection, from: id } } },
    {
      label: 'Search With',
      submenu: f.engines.map(e => ({ label: e.name, checked: e.id === f.engine.id, act: { cmd: { do: 'ctx.search', text: selection, engine: e.id, from: id } } })),
    },
  ] : []

  if (p.isEditable) {
    // A misspelled word: its guesses, then Add to Dictionary.
    if (p.misspelledWord) {
      const guesses = p.dictionarySuggestions.slice(0, 5)
      groups.push([
        ...(guesses.length
          ? guesses.map(word => ({ label: word, act: { cmd: { do: 'ctx.spell', id, replace: word } } }) as PageMenuEntry)
          : [{ label: 'No Guesses Found', enabled: false }]),
        { label: 'Add to Dictionary', act: { cmd: { do: 'ctx.spell', id, learn: p.misspelledWord } } },
      ])
    }
    groups.push([{ label: 'Emoji', accel: 'Win+.', act: { cmd: { do: 'ctx.emoji', id } } }])
    const e = p.editFlags
    groups.push([
      { label: 'Undo', accel: 'Ctrl+Z', enabled: e.canUndo, act: { cmd: { do: 'ctx.edit', id, action: 'undo' } } },
      { label: 'Redo', accel: 'Ctrl+Y', enabled: e.canRedo, act: { cmd: { do: 'ctx.edit', id, action: 'redo' } } },
    ])
    groups.push([
      { label: 'Cut', accel: 'Ctrl+X', enabled: e.canCut, act: { cmd: { do: 'ctx.edit', id, action: 'cut' } } },
      { label: 'Copy', accel: 'Ctrl+C', enabled: e.canCopy, act: { cmd: { do: 'ctx.edit', id, action: 'copy' } } },
      { label: 'Paste', accel: 'Ctrl+V', enabled: e.canPaste, act: { cmd: { do: 'ctx.edit', id, action: 'paste' } } },
      { label: 'Paste as Plain Text', accel: 'Ctrl+Shift+V', enabled: e.canPaste, act: { cmd: { do: 'ctx.edit', id, action: 'pasteAndMatchStyle' } } },
      { label: 'Select All', accel: 'Ctrl+A', enabled: e.canSelectAll, act: { cmd: { do: 'ctx.edit', id, action: 'selectAll' } } },
    ])
    groups.push(searchGroup())
  } else {
    const link = p.linkURL
    if (link && /^mailto:/i.test(link)) {
      const address = decodeURIComponent(link.slice(7).split('?')[0])
      groups.push([{ label: 'Copy Email Address', act: { cmd: { do: 'ctx.copy', text: address } } }])
    // A website's link to an Oriel page or a file isn't opened for it either
    // (studio/09 §1.4; Chrome blocks chrome:// links the same way): Copy Link only.
    } else if (link && openable(link) && !refusesInternal(p.frameURL || p.pageURL, link)) {
      // Open Link (a click's doing) is left out, as on the Mac (§3.38).
      groups.push([
        { label: 'Open Link in New Tab', act: { cmd: { do: 'ctx.open', url: link, where: 'tab', from: id } } },
        { label: 'Open Link in New Window', act: { cmd: { do: 'ctx.open', url: link, where: 'window', from: id } } },
        ...(f.shy ? [] : [{ label: 'Open Link in Private Window', act: { cmd: { do: 'ctx.open', url: link, where: 'private', from: id } } } as PageMenuEntry]),
        ...(f.internal || !f.split ? [] : [{ label: 'Open Link in Split View', act: { cmd: { do: 'ctx.open', url: link, where: 'split', from: id } } } as PageMenuEntry]),
      ])
      if (/^(https?|ftp|data|blob):/i.test(link)) groups.push([{ label: 'Download Linked File', act: { cmd: { do: 'ctx.save', id, url: link } } }])
      groups.push([
        { label: 'Copy Link', act: { cmd: { do: 'ctx.copy', text: link } } },
        ...(web(link) ? [{ label: 'Copy Clean Link', act: { cmd: { do: 'ctx.copy', text: link, clean: true } } } as PageMenuEntry] : []),
      ])
    } else if (link) {
      groups.push([{ label: 'Copy Link', act: { cmd: { do: 'ctx.copy', text: link } } }])
    }

    if (context.includes('image')) {
      const src = p.srcURL
      const lens = f.engine.id === 'bing' ? 'Bing' : 'Google'
      groups.push([
        { label: 'Open Image in New Tab', act: { cmd: { do: 'ctx.open', url: src, where: 'tab', from: id } } },
        ...(f.internal || !f.split || !web(src) ? [] : [{ label: 'Open Image in Split View', act: { cmd: { do: 'ctx.open', url: src, where: 'split', from: id } } } as PageMenuEntry]),
      ])
      groups.push([
        { label: 'Save Image As…', act: { cmd: { do: 'ctx.save', id, url: src, ask: true } } },
        { label: 'Copy Image', act: { cmd: { do: 'ctx.copyImage', id, x: p.x, y: p.y } } },
        { label: 'Copy Image Address', act: { cmd: { do: 'ctx.copy', text: src } } },
      ])
      if (web(src)) groups.push([{ label: `Search Image with ${lens}`, act: { cmd: { do: 'ctx.search', text: src, image: true, from: id } } }])
    }

    if (context.includes('video') || context.includes('audio')) {
      const src = p.srcURL
      const what = context.includes('video') ? 'Video' : 'Audio'
      if (web(src)) {
        groups.push([{ label: `Open ${what} in New Tab`, act: { cmd: { do: 'ctx.open', url: src, where: 'tab', from: id } } }])
        groups.push([
          { label: `Save ${what} As…`, act: { cmd: { do: 'ctx.save', id, url: src, ask: true } } },
          { label: `Copy ${what} Address`, act: { cmd: { do: 'ctx.copy', text: src } } },
        ])
      }
    }

    if (selection) {
      const highlight = !f.internal && (!p.frameURL || p.frameURL === p.pageURL) ? highlightLink(p.pageURL, selection) : null
      groups.push([
        { label: 'Copy', accel: 'Ctrl+C', act: { cmd: { do: 'ctx.edit', id, action: 'copy' } } },
        ...(highlight ? [{ label: 'Copy Link to Highlight', act: { cmd: { do: 'ctx.copy', text: highlight } } } as PageMenuEntry] : []),
      ])
      groups.push(searchGroup())
    }

    const onPage = context.length === 1 && (context[0] === 'page' || context[0] === 'selection')
    if (context[0] === 'page' && !f.internal) {
      const page = p.pageURL
      groups.push([
        { label: 'Back', accel: f.accel('tabs.back'), enabled: f.canBack, act: { cmd: { do: 'tab.back', id } } },
        { label: 'Forward', accel: f.accel('tabs.forward'), enabled: f.canForward, act: { cmd: { do: 'tab.forward', id } } },
        { label: 'Reload', accel: f.accel('view.reload'), act: { cmd: { do: 'tab.reload', id } } },
        // Under Reload, only when the page's own address has some (Safari's way, §2.48).
        ...(web(page) && cleanLink(page) !== page ? [{ label: 'Copy Clean Link', accel: f.accel('edit.copyCleanLink'), act: { cmd: { do: 'ctx.copy', text: page, clean: true } } } as PageMenuEntry] : []),
      ])
      groups.push([
        { label: 'Save Page As…', accel: f.accel('file.savePage'), act: { cmd: { do: 'ctx.page', id, action: 'save' } } },
        { label: 'Print…', accel: f.accel('file.print'), act: { cmd: { do: 'ctx.page', id, action: 'print' } } },
      ])
    }
    // Translate, after Print as Chrome has it, its own group: a page's whole
    // text (the Mac adds it at the end of every menu, WebKit's own being fixed).
    if (onPage && !f.internal && f.translate && web(p.pageURL)) groups.push(translateGroup(id, f.translate))
  }

  // Inspect closes every menu but Oriel's own pages', as Chrome's does, with
  // View Page Source above it on the page itself.
  if (!f.internal) {
    groups.push([
      ...(context[0] === 'page' && !p.isEditable ? [{ label: 'View Page Source', act: { cmd: { do: 'ctx.page', id, action: 'source' } } } as PageMenuEntry] : []),
      { label: 'Inspect', act: { cmd: { do: 'ctx.page', id, action: 'inspect', x: p.x, y: p.y } } },
    ])
  }
  // At the end, apart: the extensions' items.
  groups.push(f.extensions)
  return join(groups)
}

function translateGroup(id: ID, t: NonNullable<Facts['translate']>): PageMenuEntry[] {
  if (t.translated) return [{ label: 'Show Original', act: { cmd: { do: 'page.untranslate', id } } }]
  if (!t.languages.length) return []
  if (t.languages.length === 1) {
    const l = t.languages[0]
    return [{ label: `Translate to ${l.name}`, act: { cmd: { do: 'page.translate', id, to: l.code } } }]
  }
  return [{ label: 'Translate Page', submenu: t.languages.map(l => ({ label: l.name, act: { cmd: { do: 'page.translate', id, to: l.code } } })) }]
}
