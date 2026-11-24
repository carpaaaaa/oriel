// The extensions module's commands and its part of the window's state: the
// puzzle button and the pinned buttons, their list, the popup, the side
// panel and the page that manages extensions (studio/04 §2).
// Owned by the extensions module.

import type { ID, Rect } from '../state'

/** One installed extension as the interface draws it. */
export interface ExtView {
  id: string
  name: string
  version: string
  /** crx://extension-icon/... for the tab in front; none for a disabled one. */
  icon: string | null
  enabled: boolean
  pinned: boolean
  /** It has a button (action or browser_action). */
  action: boolean
  title: string
  badge: { text: string; colour?: string } | null
  /** From the Chrome Web Store, or a folder (Load Unpacked). */
  fromStore: boolean
  folder?: string
  options: boolean
  /** Couldn't start, or can't do what it's for. */
  problem?: string
  /** It asks for websites: "Runs on" has something to choose (studio/04 §2.5). */
  asksSites?: boolean
  /** Its "Runs on". */
  sites?: SiteAccess
}

/** What Settings › Extensions draws (ExtensionsUI.swift Installer). */
export interface ExtSettings {
  list: (ExtView & { image: string | null })[]
  busy: string[]
  said: ExtState['said']
}

// "Runs on": Chrome's Site access, per extension (ExtensionSiteAccess.swift,
// studio/04 §2.5). Every site it asks for (the default), only the sites you
// name (each with its subdomains), or only where you click its button.

export type SiteMode = 'all' | 'some' | 'click'
export interface SiteAccess { mode: SiteMode; hosts: string[] }
export const SITE_ALL: SiteAccess = { mode: 'all', hosts: [] }
/** The capsule's words (SiteAccess.Mode.title). */
export const siteTitles: Record<SiteMode, string> = { all: 'All sites', some: 'Some sites', click: 'On click' }
/** The menu's words in Settings (ExtensionsUI.swift RunsOn). */
export const siteChoices: [SiteMode, string][] = [['all', 'All Sites It Asks For'], ['some', 'Only Sites I Name'], ['click', 'Only When I Click It']]

/** The host in what was typed: a site, an address, "*.site"; lower case,
 * without "www." or a port. Null for what names no site (SiteAccess.host). */
export function siteHost(text: string): string | null {
  let t = String(text ?? '').trim().toLowerCase()
  if (!t) return null
  if (!t.includes('://')) t = `http://${t}`
  let host: string
  try { host = new URL(t.replace(/^(\w+:\/\/)\*\./, '$1')).hostname } catch { return null }
  host = host.replace(/\.+$/, '')
  if (host.startsWith('www.') && host.slice(4).includes('.')) host = host.slice(4)
  if (!host || !/^[a-z0-9._-]+$/.test(host) || host.startsWith('.') || host.includes('..')) return null
  return host
}

/** `host` is one of `hosts` or under one: example.com covers news.example.com,
 * never notexample.com. */
export const coversHost = (hosts: string[], host: string) => { const h = host.toLowerCase(); return hosts.some(x => h === x || h.endsWith(`.${x}`)) }

export function siteCovers(a: SiteAccess, host: string): boolean {
  return a.mode === 'all' ? true : a.mode === 'some' ? coversHost(a.hosts, host) : false
}

/** The site added: "Some sites" with it among them. */
export function siteAdding(a: SiteAccess, host: string): SiteAccess {
  return { mode: 'some', hosts: [...new Set([...a.hosts, host])] }
}

/** The site taken away, and anything named under or over it: taking
 * example.com away doesn't leave news.example.com quietly allowed. */
export function siteRemoving(a: SiteAccess, host: string): SiteAccess {
  return { ...a, hosts: a.hosts.filter(x => x !== host && !x.endsWith(`.${host}`) && !host.endsWith(`.${x}`)) }
}

/** Extensions that only do their job everywhere, told, never stopped. */
export const needsEverySite = (name: string) =>
  ['password', 'passkey', '1password', 'bitwarden', 'lastpass', 'dashlane', 'keeper', 'proton pass', 'nordpass', 'enpass', 'roboform'].some(w => name.toLowerCase().includes(w))

/** Room around a card (the puzzle's list, a popup) for its shadow and arrow:
 * the overlay's region starts this far before the card on every side. */
export const CARD_ROOM = 22

export interface StoreOffer {
  id: string
  /** As the store's page names it, or as the extension does once installed. */
  name: string
  /** The store's picture of it (https), or its own icon once installed. */
  icon: string | null
  installed: boolean
}

/** A card's arrow: on which side, at which window coordinate along it. */
export interface Arrow { side: 'top' | 'bottom' | 'left' | 'right'; at: number }

export interface ExtState {
  /** Installed, in the order they were added. */
  list: ExtView[]
  /** The puzzle's list is open: where its card sits and where its arrow points. */
  menu: { rect: Rect; arrow: Arrow } | null
  /** A popup is open in this window: where its page sits. */
  popup: { id: string; rect: Rect; arrow: Arrow } | null
  /** Being installed (ids). */
  busy: string[]
  /** The last thing said about installing or removing; `n` counts them. */
  said: { text: string; bad?: boolean; n?: number } | null
  /** The page that manages extensions is open. */
  manage: boolean
  /** The side panel of an extension, beside the page. */
  panel: { id: string; side: 'left' | 'right'; width: number } | null
  /** On an extension's page in the Chrome Web Store: Oriel's own offer to
   * add it (StoreOffer), whatever the store's page shows. */
  store: StoreOffer | null
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

declare module '../commands' {
  interface Commands {
    /** The puzzle: open or close its list (studio/04 §2.3). */
    'ext.menu': { anchor: Rect }
    'ext.menuClose': None
    /** An extension's button: its popup, its side panel or action.onClicked. */
    'ext.press': { id: string; anchor?: Rect }
    'ext.popupClose': None
    'ext.pin': { id: string; pinned: boolean }
    /** Right click on a button or a row of the list. */
    'ext.context': { id: string; x: number; y: number; overlay?: boolean }
    'ext.options': { id: string }
    'ext.remove': { id: string; ask?: boolean }
    'ext.enable': { id: string; on: boolean }
    /** A link to the Chrome Web Store or an id (studio/04 §2.2, 3). */
    'ext.install': { text: string }
    'ext.store': None
    'ext.loadUnpacked': { path?: string }
    'ext.reload': { id: string }
    'ext.manage': { open: boolean }
    'ext.panelClose': None
    'ext.panelWidth': { width: number }
    /** The store bar measured itself: its region follows. */
    'ext.storeFit': { width: number }
    /** Settings › Extensions: the installed ones and what is under way. */
    'ext.settings': None
    /** "Runs on": a mode, a site added or taken away, or "Run on This Site"
     * (the click's grant on the tab in front, without the click). */
    'ext.sites': { id: string; mode?: SiteMode; add?: string; remove?: string; here?: boolean }
  }
}

declare module '../state' {
  interface WindowState { ext?: ExtState }
}

export type { ID }
export {}
