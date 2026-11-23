// Settings: keys as Prefs.swift names them, with Search's defaults
// (studio/06 §1 holds all 158). Only the keys the code reads so far are here;
// the settings module fills in the rest from the inventory. Owned by the
// orchestrator.

export const defaults = {
  // look
  'look.appearance': 'system', // system | light | dark
  'tabs.layout': 'side', // side | top
  'sidebar.width': 232,
  'sidebar.side': 'left',
  'sidebar.cards': true, // the page as a card
  'tabs.roomier': false,
  // tabs
  'tabs.newAfterLast': false,
  'tabs.closeGoesBack': false,
  // search
  'search.engine': 'google',
  'search.suggestions': true,
  // startup
  'start.fresh': false,
} as const

export type PrefKey = keyof typeof defaults | (string & {})

/** Each module adds the defaults of its own keys (in its shared/modules file
 * or at start in the main process). Keys keep Prefs.swift's names. */
export const moduleDefaults: Record<string, unknown> = {}
export function addDefaults(values: Record<string, unknown>): void { Object.assign(moduleDefaults, values) }
export function defaultOf(key: string): unknown { return key in moduleDefaults ? moduleDefaults[key] : (defaults as Record<string, unknown>)[key] }

export const engines: Record<string, { name: string; search: string; suggest?: string }> = {
  google: { name: 'Google', search: 'https://www.google.com/search?q=%s', suggest: 'https://suggestqueries.google.com/complete/search?client=chrome&q=%s' },
  duckduckgo: { name: 'DuckDuckGo', search: 'https://duckduckgo.com/?q=%s', suggest: 'https://duckduckgo.com/ac/?q=%s&type=list' },
  bing: { name: 'Bing', search: 'https://www.bing.com/search?q=%s' },
  ecosia: { name: 'Ecosia', search: 'https://www.ecosia.org/search?q=%s' },
  kagi: { name: 'Kagi', search: 'https://kagi.com/search?q=%s' },
}
