// Settings: every key as Prefs.swift names it, with Search's defaults for a
// new install (studio/06 §1.1-1.17; on Windows every install is new, §1.17).
// The rows that show them are in src/ui/settings/index.json, read from
// SettingsIndex.swift. Owned by the settings module; other modules add the
// defaults of keys of their own with addDefaults.
//
// A key that only differs from its default is worth writing (studio/06
// §1.17): the settings module writes a default back as "no key".

export const defaults = {
  // Search 1.0.22 turned a run of switches on by default, for everyone who
  // never touched them as well as for new installs; Oriel follows it.
  // General › Your browser
  'mail.webmail': 'none', // none | gmail | outlook | fastmail | proton
  'sync.folder': '',
  'quit.confirm': false,
  // General › Downloads
  /** The folder; empty is Windows' own Downloads. */
  'downloads': '',
  'downloads.ask': false,
  'downloads.button': false,
  /** The card by the button by default: it says what is coming in, how fast and for how long. */
  'downloads.open': 'popover', // tab | popover | panel
  /** A download starting shows the card by the button for a few seconds. */
  'downloads.peek': true,
  // Themes
  'home.theme': 'off',
  'home.theme.image': '',
  'home.tuning': '',
  'home.shuffle': false,
  // Appearance › Light and dark
  'look': 'system', // light | dark | system
  /** Text size of Oriel's own interface and pages, 1 to 1.4 (Settings › Appearance › Text size). */
  'text.scale': 1,
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
  'layout.cards': true,
  'layout.cardsFullScreen': false,
  'toolbar.left': true,
  'tabs.compact': false,
  // A tab carried onto another splits with it with Shift held; on, with no key (middle of the tab).
  'tabs.splitDrop': false,
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
  'sidebar.player': true,
  'glyph': 'icons', // letters | icons
  'tabs.highContrast': false,
  'tabs.reading': false,
  'tabs.pinCounts': true,
  'tabs.give': false,
  'bookmarks.bar': false,
  'bookmarks.side': false,
  'bookmarks.iconsOnly': false,
  // Appearance › Motion
  'motion.light': true,
  'motion.instant': false,
  // Tabs › New tabs
  'tabs.newPlace': 'next', // next | top | end
  'tabs.frontBeside': true,
  'tabs.newAfterLast': true,
  'tabs.closeGoesBack': false,
  'tabs.swipeBackCloses': true,
  'home.grid': true,
  // Oriel's own: the Settings button up beside the bookmark button (ui/settings/SettingsDoor.tsx).
  'settings.door': false,
  'tabs.undoReopens': true,
  'tabs.switcherBehindFirst': false,
  'tabs.switcherLeavesOutPins': false,
  'tabs.lazy': false,
  // Off, unlike Search 1.0.22: Oriel's small pop-up window is a bare window
  // that shows no address, and sign-ins (Google's) are proven in a tab.
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
  'reader.follows': true,
  // The floating video, on or off (studio/06 §1.5 #78). The Mac's
  // float.style (Search's window or macOS's picture in picture) is gone: both
  // values meant "on", and Oriel's window is the only one now.
  'float.enabled': true,
  'float.leave': true,
  'float.away': false,
  'float.minimize': true,
  'float.flicks': true,
  // Away from the pointer the floating video lets what is behind show
  // through: 0 not at all, 1 the most (Oriel's own, pages/float.ts).
  'float.fade': 0,
  // YouTube without Shorts; copying set free everywhere, or on the sites
  // listed (Oriel's own, preload/page/sites.ts).
  'youtube.hideShorts': false,
  'pages.allowCopy': false,
  // Scroll bars on websites: Oriel's thin ones on every site, or Windows' own.
  'pages.scrollbars': 'oriel',
  // Clear all data when Oriel quits (settings/wipe.ts); asks first when turned on.
  'privacy.clearOnQuit': false,
  // Backspace goes back a page and Shift+Backspace forward, when not typing (Search 1.0.21).
  'keys.backspaceBack': false,
  // Return takes the place on top of the address field's list as you type (Search 1.0.21).
  'search.returnTop': false,
  'copy.sites': [],
  'media.click': false,
  'fullscreen.escapeTwice': false,
  'pageZoom': 1,
  'pages.capture': true,
  'sites.styles': true,
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
  'pins.folders': true,
  'pins.commandNewTab': false,
  'start.fresh': false,
  // Passwords: save, fill and prove are the data module's (data/passwords.ts)
  'passkeys': true,
  // Privacy
  'shield': true,
  /** Hide the blocker from sites: refused loads look loaded, bait boxes stay (pages/stealth.ts). */
  'shield.stealth': true,
  /** True turns cross-site tracking prevention off (the switch is inverted). */
  'sites.keep': false,
  'privacy.clickIDs': true,
  'privacy.gpc': true,
  'privacy.httpsFirst': true,
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
  /** Starred on GitHub, or Don't ask again: the star card after updates never comes back (settings/star.ts). */
  'star.done': false,
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
