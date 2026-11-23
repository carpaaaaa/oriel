// Settings: every key as Prefs.swift names it, with Search's defaults for a
// new install (studio/06 §1.1-1.17; on Windows every install is new, §1.17).
// The rows that show them are in src/ui/settings/index.json, read from
// SettingsIndex.swift. Owned by the settings module; other modules add the
// defaults of keys of their own with addDefaults.
//
// A key that only differs from its default is worth writing (studio/06
// §1.17): the settings module writes a default back as "no key".

export const defaults = {
  // General › Your browser
  'mail.webmail': 'none', // none | gmail | outlook | fastmail | proton
  'sync.folder': '',
  'quit.confirm': false,
  // General › Downloads
  /** The folder; empty is Windows' own Downloads. */
  'downloads': '',
  'downloads.ask': false,
  'downloads.button': false,
  'downloads.open': 'tab', // tab | popover | panel
  // Themes
  'home.theme': 'off',
  'home.theme.image': '',
  'home.tuning': '',
  'home.shuffle': false,
  // Appearance › Light and dark
  'look': 'system', // light | dark | system
  'pages.dusk': false,
  'inspector.dark': false,
  // Appearance › Window
  /** Tabs down a side (the column) or across the top. */
  'sidebar': true,
  'sidebar.position': 'left',
  'sidebar.icons': false,
  'sidebar.hides': false,
  'sidebar.slides': false,
  'sidebar.foldIcons': false,
  'fold.loadingLine': false,
  'layout.cards': true,
  'layout.cardsFullScreen': false,
  'toolbar.left': false,
  'tabs.compact': false,
  'address.shown': false,
  'address.width': 'small', // small | medium
  'window.glass': false,
  'window.glass.clear': 0.5,
  'window.glass.grain': 0.2,
  // Appearance › Tabs
  'tabs.liquid': false,
  'sidebar.roomy': false,
  'sidebar.doorsUp': false,
  'helm.back.hidden': false,
  'helm.forward.hidden': false,
  'helm.reload.hidden': false,
  'foot.extensions.hidden': false,
  'foot.bookmarks.hidden': false,
  'foot.profile.hidden': false,
  'sidebar.foldButton': false,
  'sidebar.narrowIcons': false,
  'sidebar.narrowed': false,
  'sidebar.player': false,
  'glyph': 'letters', // letters | icons
  'tabs.highContrast': false,
  'tabs.reading': false,
  'tabs.pinCounts': false,
  'tabs.give': false,
  'bookmarks.bar': false,
  'bookmarks.side': false,
  'bookmarks.iconsOnly': false,
  // Appearance › Motion
  'motion.light': false,
  'motion.instant': false,
  // Tabs › New tabs
  'tabs.newPlace': 'next', // next | top | end
  'tabs.frontBeside': false,
  'tabs.newAfterLast': false,
  'tabs.closeGoesBack': false,
  'tabs.swipeBackCloses': false,
  'home.grid': false,
  'tabs.undoReopens': false,
  'tabs.switcherBehindFirst': false,
  'tabs.switcherLeavesOutPins': false,
  'tabs.lazy': false,
  'tabs.popupWindows': false,
  // Tabs › Memory
  'tabs.sleep': true,
  'tabs.sleep.pace': 'normal', // later (2 h) | normal (30 min) | sooner (10 min)
  'tabs.sleep.dim': false,
  /** Hours: 0 never, 12, 24, 168, 720. */
  'tabs.close.after': 0,
  // Tabs › In the tab bar, Windows
  'tabs.shortcuts': false,
  'tabs.address': true,
  'tabs.clickAddressOnly': false,
  'tabs.mirror': false,
  // Browsing › Searching
  'search.engine': 'google', // google | duckduckgo | bing | ecosia | startpage | kagi | brave | qwant | custom
  'search.custom': '',
  /** Shift-Return's engine; empty is Off. */
  'search.shift': '',
  'search.shiftCustom': '',
  'search.suggest': false,
  /** JSON [{ id, keyword, template }] (Keyword.swift). */
  'search.keywords': [] as { id: string; keyword: string; template: string }[],
  // Browsing › Links, Reading mode, Video, Pages
  'links.little': true,
  'links.little.tabs': false,
  'reader.twins': false,
  'reader.follows': false,
  'float.style': 'search', // search (Oriel's window) | system
  'float.leave': true,
  'float.away': false,
  'float.minimize': false,
  'float.flicks': true,
  'media.click': false,
  'fullscreen.escapeTwice': false,
  'pageZoom': 1,
  'pages.capture': false,
  'sites.styles': false,
  'links.show': true,
  // Spaces & Pins
  'spaces': false,
  'spaces.commandNumbers': false,
  'spaces.buttons': false,
  'profiles.oneWindow': false,
  'spaces.links': false,
  'spaces.links.rules': [] as unknown[],
  'links.ask': false,
  'pins.home': true,
  'pins.peek': true,
  'pins.list': false,
  'pins.folders': false,
  'pins.commandNewTab': false,
  'newtab.floating': false,
  'field.window': false,
  'newtab.recent': false,
  'newtab.arc': false,
  'commandbar': false,
  'start.fresh': false,
  // Passwords
  'passwords.save': true,
  'passwords.fill': true,
  /** Windows Hello before a saved password goes into a page. */
  'passwords.fill.prove': false,
  'passkeys': true,
  // Privacy
  'shield': true,
  /** True turns cross-site tracking prevention off (the switch is inverted). */
  'sites.keep': false,
  'privacy.clickIDs': true,
  'privacy.gpc': true,
  'privacy.httpsFirst': false,
  'notifications.ask': true,
  'privacy.popupSites': [] as string[],
  'network.proxy': '',
  // Keyboard & Mouse
  'links.peek': true,
  'links.peekClick': 'shift', // shift | optionShift (Alt-Shift) | optionCommand (Ctrl-Alt)
  'links.peek.stays': false,
  'links.optionSplit': false,
  'autoscroll': false,
  'wheel.smooth': false,
  'pages.bounce': false,
  'swipe.history': true,
  'launcher.on': false,
  /** JSON { key, modifiers } or empty for none. */
  'launcher.key': '',
  'launcher.little': false,
  'shortcuts': '',
  // About
  'update.install': true,
  'bench': false,
  'agents': false,
  // hidden (studio/06 §1.15)
  'settings.page': 'general',
  'sidebar.width': 232,
  'sidepanel.width': 380,
  'autocorrect': true,
} as const

export type PrefKey = keyof typeof defaults | (string & {})

/** Each module adds the defaults of its own keys (in its shared/modules file
 * or at start in the main process). Keys keep Prefs.swift's names. */
export const moduleDefaults: Record<string, unknown> = {}
export function addDefaults(values: Record<string, unknown>): void { Object.assign(moduleDefaults, values) }
export function defaultOf(key: string): unknown { return key in moduleDefaults ? moduleDefaults[key] : (defaults as Record<string, unknown>)[key] }

/** Per-site keys (studio/06 §1.16): never in `defaults`, removed when reset. */
export const perSite = ['capture.', 'autoplay.', 'zoom.', 'nofloat.'] as const

/** The search engines of Engine.swift, in its order. */
export const engines: Record<string, { name: string; search: string; suggest?: string }> = {
  google: { name: 'Google', search: 'https://www.google.com/search?q=%s', suggest: 'https://suggestqueries.google.com/complete/search?client=chrome&q=%s' },
  duckduckgo: { name: 'DuckDuckGo', search: 'https://duckduckgo.com/?q=%s', suggest: 'https://duckduckgo.com/ac/?q=%s&type=list' },
  bing: { name: 'Bing', search: 'https://www.bing.com/search?q=%s' },
  ecosia: { name: 'Ecosia', search: 'https://www.ecosia.org/search?q=%s' },
  startpage: { name: 'Startpage', search: 'https://www.startpage.com/sp/search?query=%s' },
  kagi: { name: 'Kagi', search: 'https://kagi.com/search?q=%s' },
  brave: { name: 'Brave Search', search: 'https://search.brave.com/search?q=%s' },
  qwant: { name: 'Qwant', search: 'https://www.qwant.com/?q=%s' },
}

/** An http or https address with %s once (Engine.accepts). */
export function acceptsTemplate(written: string): boolean {
  const t = writtenTemplate(written)
  if ((t.match(/%s/g) ?? []).length !== 1) return false
  try { const u = new URL(t.replace('%s', 'x')); return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname } catch { return false }
}

/** What was typed, with https:// put in front when it has no scheme (Engine.written). */
export function writtenTemplate(text: string): string {
  const t = text.trim()
  if (!t) return ''
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
}

/** The search address for an engine key, Custom included (until it's a
 * good address, Custom searches Google, as on the Mac). */
export function engineTemplate(engine: string, custom = ''): string {
  if (engine === 'custom') return acceptsTemplate(custom) ? writtenTemplate(custom) : engines.google.search
  return (engines[engine] ?? engines.google).search
}
