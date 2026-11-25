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
  'toolbar.left': true,
  'tabs.compact': false,
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
  // Browsing › Searching: the field module's (field/engines.ts)
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
  // Away from the pointer the floating video lets what is behind show
  // through: 0 not at all, 1 the most (Oriel's own, pages/float.ts).
  'float.fade': 0,
  // Full screen (F11, a page's): 'full' the page edge to edge, the window's
  // buttons coming down at the top; 'borderless' the whole screen with the
  // window as when maximized (Oriel's own, window/frame.ts).
  'window.fullScreenStyle': 'full',
  // YouTube without Shorts; copying set free everywhere, or on the sites
  // listed (Oriel's own, preload/page/sites.ts).
  'youtube.hideShorts': false,
  'pages.allowCopy': false,
  'copy.sites': [],
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
  'start.fresh': false,
  // Passwords: save, fill and prove are the data module's (data/passwords.ts)
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
  /** On in Oriel, the user's choice (Search's default is off): Chrome glides on Windows. */
  'wheel.smooth': true,
  'swipe.history': true,
  'launcher.on': false,
  /** JSON { key, modifiers } or empty for none. */
  'launcher.key': '',
  'launcher.little': false,
  // About
  'update.install': true,
  /** ms of the last check for updates (Updater.swift lastChecked). */
  'update.checked': 0,
  /** The version whose update popup was put away with its X. */
  'updates.dismissed': '',
  /** The version whose What's New was shown (WhatsNew.swift seenKey). */
  'whatsnew.seen': '',
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
