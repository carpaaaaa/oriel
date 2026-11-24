// Translate Page, on this PC (studio/03 §6.3, Translate.swift). The Mac uses
// Apple's Translation framework; Oriel uses Bergamot, the engine of Firefox
// Translations, with Mozilla's open models, downloaded once per language
// and kept in Oriel's folder. Nothing of the page leaves the PC.
// Owned by the translate module.

import type { ID } from '../state'

/** What a tab's translation is doing (TranslationMark): the sign beside the
 * page and its menu say it. */
export interface TranslateTab {
  /** working: reading and translating; downloading: a language comes first;
   * done: translated, and what the page adds follows; failed: why, for 8 s. */
  phase: 'working' | 'downloading' | 'done' | 'failed'
  /** The page's language once known ("it"), null before. */
  from: string | null
  to: string
  /** Downloading: 0 to 1 of the language's files. */
  progress?: number
  /** Failed: the sentence the menu shows. */
  error?: string
}

export interface TranslateLanguage { code: string; name: string }

export interface TranslateState {
  /** The window's tabs with a translation going, done, or just failed. */
  tabs: Record<ID, TranslateTab>
  /** The languages the page's right-click menu offers (Settings › Browsing ›
   * Pages › Translation languages), in the order of `translateLanguages`. */
  menu: TranslateLanguage[]
}

declare module '../commands' {
  interface Commands {
    /** Translate the tab (the window's tab in front without id) into `to`
     * ("en"), from the language its words are in. Returns at once; the slice
     * follows. Translating again into another language starts afresh. */
    'page.translate': { id?: ID; to: string }
    /** Show Original: every word back as it was. */
    'page.untranslate': { id?: ID }
    /** For the right-click menu: the languages to offer, and what the tab's
     * translation is doing (null when the page is as it came). */
    'translate.menuLanguages': { id?: ID }
    /** The sign's menu, hanging from the sign (anchor in the window's DIP);
     * toggles. */
    'translate.menu': { anchor?: { x: number; y: number } }
    'translate.menuClose': {}
  }
}

declare module '../state' {
  interface WindowState { translate?: TranslateState }
}

/** Every language Mozilla has models for into and out of English (Firefox's
 * translations-models, release channel, November 2026). Any two of them go
 * through English when there is no direct pair, as in Firefox. */
export const translateCodes = [
  'en', 'af', 'ar', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'da', 'de', 'el', 'es', 'et', 'eu', 'fa', 'fi', 'fr',
  'gl', 'gu', 'he', 'hi', 'hr', 'hu', 'id', 'is', 'it', 'ja', 'kn', 'ko', 'lt', 'lv', 'ml', 'mr', 'ms', 'nb', 'nl',
  'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sq', 'sr', 'sv', 'ta', 'te', 'th', 'tl', 'tr', 'ug', 'uk', 'ur', 'vi',
  'zh-Hans', 'zh-Hant',
] as const

let names: Intl.DisplayNames | null = null
/** A language as the menus name it ("French"): in English, as the rest of
 * the interface is (PageTranslator.name). */
export function languageName(code: string): string {
  try {
    names ??= new Intl.DisplayNames(['en'], { type: 'language' })
    return names.of(code) ?? code
  } catch {
    return code
  }
}

/** English first, then the rest by name. */
export const translateLanguages: TranslateLanguage[] = [
  { code: 'en', name: languageName('en') },
  ...translateCodes.filter(c => c !== 'en').map(code => ({ code, name: languageName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en')),
]

/** Settings key: the codes the right-click menu offers. */
export const MENU_KEY = 'translate.languages'
export const MENU_DEFAULT = ['en']

export {}
