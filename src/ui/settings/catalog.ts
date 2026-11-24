// Every row of Settings: index.json is SettingsIndex.swift read as it is
// (tools/extract-index.py); here it becomes Oriel's on Windows (studio/06
// §1.14): the app says Oriel where Search names itself, the Mac's keys
// become Windows' (keys.ts's table), Mac, macOS, Touch ID and the keychain
// become the PC, Windows and Windows Hello, no long or middle dash stays, and
// the rows with nothing behind them on Windows are left out.

import raw from './index.json'

export type PageID = 'general' | 'appearance' | 'themes' | 'tabs' | 'browsing' | 'spaces' | 'passwords' | 'privacy' | 'ai' | 'extensions' | 'keyboard' | 'about'

export interface Group { id: string; page: PageID; title: string; icon: string }
export interface Item {
  id: string
  group: string
  icon: string
  title: string
  detail: string
  more?: string
  keys?: string[]
  words?: string[]
  kind?: 'control' | 'wide' | 'note'
  parent?: string
  findOnly?: boolean
}

/** Settings.swift Page: title and icon, in the rail's order. */
export const pages: { id: PageID; title: string; icon: string }[] = [
  { id: 'general', title: 'General', icon: 'gearshape' },
  { id: 'appearance', title: 'Appearance', icon: 'paintbrush' },
  { id: 'themes', title: 'Themes', icon: 'photo.artframe' },
  { id: 'tabs', title: 'Tabs', icon: 'square.on.square' },
  { id: 'browsing', title: 'Browsing', icon: 'globe' },
  { id: 'spaces', title: 'Spaces & Pins', icon: 'square.stack' },
  { id: 'passwords', title: 'Passwords', icon: 'key' },
  { id: 'privacy', title: 'Privacy', icon: 'hand.raised' },
  { id: 'extensions', title: 'Extensions', icon: 'puzzlepiece.extension' },
  { id: 'keyboard', title: 'Keyboard & Mouse', icon: 'keyboard' },
  { id: 'about', title: 'About', icon: 'info.circle' },
]
/** The rail's three blocks (AI.shipped is false in 1.0.19: no AI). */
export const blocks: PageID[][] = [
  ['general', 'appearance', 'themes', 'tabs', 'browsing', 'spaces'],
  ['passwords', 'privacy', 'extensions', 'keyboard'],
  ['about'],
]
export const pageOf = (id: string) => pages.find(p => p.id === id)

/** A section by its name in an address, the old names too (Settings.swift Page.named). */
export function pageNamed(name: string): PageID | null {
  const n = name.toLowerCase()
  if (n === 'downloads') return 'general'
  if (n === 'shortcuts' || n === 'mouse') return 'keyboard'
  return pages.some(p => p.id === n) ? (n as PageID) : null
}

/** Rows with nothing behind them on Windows (studio/06 §1.14), left out of
 * the sections and of the find field. */
export const removed: Record<string, string> = {
  'handoff': 'Handoff is Apple\'s alone',
  'icloud': 'no iCloud sync on Windows',
  'icloud.erase': 'no iCloud sync on Windows',
  'window.glass.style': 'Liquid Glass is macOS 26\'s',
  'tabs.liquid': 'Liquid Glass is macOS 26\'s',
  // Windows' Mica and Acrylic fill the whole window, the clear margin round the
  // window drawn by Oriel too: no glass until the frame can be Windows' own.
  'window.glass': 'Mica and Acrylic would fill the margin round the drawn window',
  'window.glass.clear': 'Mica and Acrylic would fill the margin round the drawn window',
  'window.glass.grain': 'Mica and Acrylic would fill the margin round the drawn window',
  'inspector.chrome': 'the inspector already is Chrome\'s DevTools',
  'fullscreen.keepsWindow': 'Windows has no desktop of its own for a full-screen app',
  'pages.120': 'Chromium already draws at the screen\'s rate',
  'passwords.apple': 'Apple Passwords is the Mac\'s',
  'contacts.fill': 'no card of yours in Contacts on Windows',
  'news.updates': 'Office Commun\'s list, for the Mac',
  'news.iphone': 'Search for iPhone\'s beta',
  'about.feedback': 'it writes to Office Commun',
  'extensions.safariApps': 'Safari apps are the Mac\'s',
  'extensions.sites': 'Chromium in Electron runs content scripts as the manifest says, with no site access to change at runtime yet',
  'inlinePredictions': 'Chromium has no inline predictions',
  // The pages module (studio/08 area C):
  'swipe.history': 'Windows tells an app no start or end of a touchpad swipe',
  'agents': 'no bridge for coding agents yet (studio/03 §8.2): back with it',
  // The tabs module (studio/08 area B):
  'profiles.oneWindow': 'no profiles in Oriel yet (Personal alone): back with them',
}

/** The Mac's keys as Windows has them (src/main/keys.ts's table). */
const chords: [string, string][] = [
  ['⌃⌥⌘.', 'Ctrl+Shift+.'], ['⌥⇧⌘D', 'Alt+Shift+D'], ['⇧⌘J', 'Ctrl+J'], ['⇧⌘D', 'Ctrl+Shift+D'], ['⇧⌘R', 'Ctrl+Shift+R'],
  ['⇧⌘P', 'Ctrl+Shift+P'], ['⇧⌘T', 'Ctrl+Shift+T'], ['⌥⌘N', 'Alt+Shift+N'], ['⇧⌘-click', 'Ctrl+Shift-click'],
  ['⌘-clicking', 'Ctrl-clicking'], ['⌘-click', 'Ctrl-click'], ['⌥-click', 'Alt-click'],
  ['⌘1–⌘9', 'Ctrl+1 to Ctrl+9'], ['⌘1–9', 'Ctrl+1 to 9'], ['⌃1–⌃9', 'Alt+1 to Alt+9'],
  ['⌘[, ⌘] and ⌘R', 'Alt+Left, Alt+Right and Ctrl+R'], ['⌘+ and ⌘−', 'Ctrl+Plus and Ctrl+Minus'],
  ['⌘Q', 'Ctrl+Shift+Q'], ['⌘S', 'Ctrl+S'], ['⌘T', 'Ctrl+T'], ['⌘L', 'Ctrl+L'], ['⌘K', 'Ctrl+K'], ['⌘W', 'Ctrl+W'],
  ['⌘Z', 'Ctrl+Z'], ['⌘O', 'Ctrl+O'], ['⌘R', 'Ctrl+R'], ['⌃Tab', 'Ctrl+Tab'], ['⌃W', 'Ctrl+W'], ['⌃R', 'Ctrl+R'],
  ['⌃M', 'Ctrl+M'], ['⌃O', 'Ctrl+O'], ["⌘T's", "Ctrl+T's"], ["⌘L's", "Ctrl+L's"], ['⌘ number', 'Ctrl number'], ['⌘ is held', 'Ctrl is held'],
]

const words: [RegExp, string][] = [
  [/\bSearch\b(?! with| a site| Tabs)/g, 'Oriel'],
  [/\bthis Mac\b/g, 'this PC'], [/\byour Mac\b/g, 'your PC'], [/\bthe Mac\b/g, 'Windows'], [/\bMac's\b/g, "PC's"],
]

export function windowsText(s: string): string {
  let t = s
  for (const [mac, win] of chords) t = t.split(mac).join(win)
  for (const [re, to] of words) t = t.replace(re, to)
  // No long or middle dash (AGENTI.md rule 5).
  return t.replace(/\s?—\s?/g, ': ').replace(/–/g, ' to ')
}

/** Rows rewritten for Windows where a word swap isn't enough. */
const overrides: Record<string, Partial<Item>> = {
  'general.default': { detail: 'Make Oriel the browser Outlook, Slack and the rest send links to' },
  // Alt+F4 is how Windows quits a program (settings/quit.ts).
  'quit.confirm': { detail: 'Ask before Alt+F4 or Quit Oriel closes the browser', words: ['quit', 'alt f4', 'ctrl shift q', 'close'] },
  'mail.default': { more: 'Windows asks you to choose it in Settings › Apps › Default apps. Pick another app there to undo it.' },
  'sync': {
    title: 'Sync with your other computers',
    more: 'Choose a folder your computers share, in OneDrive or Dropbox for example, and turn this on with the same folder in Oriel, or in Search on a Mac, on each one. Each profile syncs on its own. Never your history, passwords, cookies, sign-ins or open tabs. No account and no server: only small files in that folder.',
  },
  'sidebar.slides': { more: 'With Animation effects off in Windows Settings › Accessibility › Visual effects, the column fades in and out instead. With Reduce animations on, it comes and goes at once.' },
  'sidebar.narrowIcons': { detail: 'Pulled narrower than 200 pixels, the sidebar becomes a strip of site icons and its buttons' },
  'tabs.compact': { detail: 'Only a few pixels above and below the tabs, for more of the page' },
  'motion.light': {
    title: 'Save power with Energy Saver',
    detail: 'Simpler motion on battery; idle tabs sleep sooner with Energy Saver on',
    more: 'With Energy Saver on, or on battery. Pages are left as they are.',
  },
  'motion.instant': { more: 'For Oriel alone, whatever Animation effects in Windows Settings says. The tab Ctrl+1 to Ctrl+9 picks is lit at once, and the page shows at once.' },
  'float.style': {
    detail: "Oriel's own window, or Chromium's picture in picture",
    more: "Oriel's window floats a video without a click and keeps its page alive in it. Picture in picture is the one Chrome uses, with its own controls.",
  },
  'spaces': { more: 'Each space can be signed in where the others are or start afresh.' },
  'spaces.commandNumbers': { more: "The two sets of keys swap places. A space's key you changed in Keyboard & Mouse › Shortcuts stays as you set it." },
  'field.window': { more: 'As Arc and Zen place it: the column is dimmed with the page. Off, the field is centred on the page beside the column.' },
  // Searching a site with Tab: each site off until turned on here (the
  // user's choice for Oriel; on the Mac it is always on). Field module.
  'search.keywords': {
    detail: 'Turn a site on, then type its name and press Tab to search it. Or a word of your own: "yt cats"',
    more: 'Until a site is on, typing its name offers nothing more than any other words. Hover the site in the field to take it out, or press Backspace there.',
  },
  'note.sitesearch': { detail: 'One site at a time, as you turn them on in Site shortcuts: type red, then Tab, and search Reddit' },
  // Translate Page on Windows: Bergamot and Mozilla's models, on the PC
  // (translate module). Several languages for the right-click menu where
  // the Mac has one.
  'translate.target': {
    title: 'Translation languages',
    detail: 'Pages are translated on this PC. Right-click a page to translate it into one of these',
    more: 'Each language is downloaded from Mozilla once, the first time a page is translated into or out of it, and kept on this PC. Nothing of the page is sent anywhere.',
    keys: ['translate.languages'],
  },
  'passwords.open': { detail: 'Kept by Windows, shown with Windows Hello' },
  'passwords.fill.prove': {
    title: 'Ask for Windows Hello before filling',
    detail: 'Or your PIN, before a saved password goes into a page',
    more: "Once you've said yes, Oriel doesn't ask again for a minute, until your PC sleeps or locks. Extensions ask in their own way.",
  },
  'passkeys': { detail: 'Windows Hello or a passkey on your phone, on sites that offer one' },
  'notifications.ask': { detail: "Only a site you allow reaches Windows' notifications" },
  'links.optionSplit': { more: 'Off, Alt-click follows the link as a click does. In Chrome it downloads the link instead.' },
  'autoscroll': { detail: 'Click the wheel, then move the mouse to scroll, as in Chrome' },
  'wheel.smooth': { more: 'A touchpad, and a mouse that scrolls smoothly on its own, are left as they are. With Ctrl or Alt held a notch goes to the page as it comes, for zooming.' },
  // The tabs module (studio/08 area B): Oriel has no View menu, and no site card yet.
  'note.panel': { detail: 'Always there: right-click a tab › Open in Side Panel' },
  'note.awake': { detail: 'Always there: right-click a tab › Keep This Site Awake' },
  'mail.webmail': { more: "Email (mailto:) links clicked in a page open the webmail's new message in a tab beside it, with the address, subject and text filled in. From a private tab too, in an ordinary tab, where you're signed in. Links from other apps go there once Oriel opens email links." },
  'launcher.on': { detail: "A key of your own raises it over the app you're in, as the Start menu's search does" },
  'bench': { detail: 'A local pipe for testing; its tabs never take over' },
  'autocorrect': { detail: 'Now in Edit › Spelling and Grammar' },
  'agents': {
    more: "Each time one connects, the window asks you first, unless you ticked “Always allow” for it: offered only for Claude Code's own claude, signed by Anthropic; kept 30 days at most and 7 after its last use, never with your tabs, and asked again after you press Stop; forget it here. Nothing is drawn over the page: the tab it works in wears a small dot, and Stop is on the column's foot (or the tab strip) and in File › Stop Agent (Ctrl+Shift+.) until it goes. It works in tabs of its own; your tabs it can read only if you tick “Let it see my open tabs”, and never uses. It never sees passwords, card numbers, one-time codes, private tabs, cookies or Settings, and can't download or choose files. It connects through a file on this PC only, never the network.",
  },
}

const keep = (title: string) => title // titles keep their words when an override leaves them

export const groups: Group[] = (raw.groups as Group[])
  .filter(g => (raw.items as Item[]).some(i => i.group === g.id && !removed[i.id]))

export const items: Item[] = (raw.items as Item[])
  .filter(i => !removed[i.id])
  .map(i => {
    const o = overrides[i.id] ?? {}
    const adapted: Item = {
      ...i,
      title: o.title ?? (i.id === 'search.engine' || i.id === 'note.sitesearch' ? keep(i.title) : windowsText(i.title)),
      detail: o.detail ?? windowsText(i.detail),
      ...(i.more || o.more ? { more: o.more ?? windowsText(i.more!) } : {}),
      ...(o.keys ? { keys: o.keys } : {}),
      ...(o.kind ? { kind: o.kind } : {}),
    }
    return adapted
  })

export const groupOf = (id: string) => groups.find(g => g.id === id)
export const itemOf = (id: string) => items.find(i => i.id === id)
export const pageOfItem = (i: Item): PageID => groupOf(i.group)?.page ?? 'general'
export const itemsIn = (group: string) => items.filter(i => i.group === group && !i.findOnly)
export const groupsOf = (page: PageID) => groups.filter(g => g.page === page && itemsIn(g.id).length)

/** Every word typed found somewhere in the row (SettingsIndex.find), in the
 * order of the sections and their groups. */
export function find(typed: string): Item[] {
  const ws = typed.toLowerCase().split(/\s+/).filter(Boolean)
  if (!ws.length) return []
  const order = (i: Item) => [pages.findIndex(p => p.id === pageOfItem(i)), groups.findIndex(g => g.id === i.group)]
  return items
    .filter(i => {
      const g = groupOf(i.group)
      const hay = [i.title, i.detail, i.more ?? '', g?.title ?? '', pageOf(pageOfItem(i))?.title ?? '', ...(i.words ?? []), ...(i.keys ?? [])].join(' ').toLowerCase()
      return ws.every(w => hay.includes(w))
    })
    .map(i => ({ i, o: order(i) }))
    .sort((a, b) => a.o[0] - b.o[0] || a.o[1] - b.o[1])
    .map(x => x.i)
}
