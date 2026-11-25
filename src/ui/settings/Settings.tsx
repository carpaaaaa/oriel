// Settings in a tab (oriel://settings/<section>): the sections down the left,
// under a field that finds any setting by its words (Ctrl+F); one section at
// a time on the right, in titled groups, each a card of rows. Every row comes
// from the catalog, so what the find field finds is exactly what the
// sections hold (Settings.swift, SettingsIndex.swift; studio/06 §1,
// studio/02 §4.6).

import { createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch as Choose, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { pageFor } from '../lib/registry'
import { announce, call, onUpdate, said } from './bridge'
import { blocks, find, groupOf, groups, groupsOf, itemOf, items, itemsIn, pageNamed, pageOf, pageOfItem, pages, type Item, type PageID } from './catalog'
import { Always, Card, GroupBlock, Hunt, Line, Menu, Nothing, Pictures, Pill, Segmented, SettingRow, Steps, Switch, Ticks } from './controls'
import { Symbol } from './symbols'
import { ButtonsPicture, CardPicture, LayoutPicture, LookPicture } from './pictures'
import { PermissionSites, PopupSites } from './PermissionSites'
import { MENU_DEFAULT, MENU_KEY } from '../../shared/modules/translate'
import { TranslateAdd, TranslateChosen } from '../translate/Languages'
import './settings.css'

type Prefs = Record<string, unknown>
type Stage = { kind: 'none' } | { kind: 'fetching' | 'ready' | 'waiting'; version: string; notes?: string }
interface Pending { version: string; notes?: string; ready: boolean; fetching: boolean }
interface UpdateFacts { stage: Stage; checking: boolean; checked: number | null; active: boolean; portable?: boolean; store?: boolean; pending: Pending | null }
/** How Oriel can become the default (settings/browser.ts): through Windows Settings, not as the portable copy, not until installed. */
type DefaultHow = 'settings' | 'portable' | 'unregistered'
interface DefaultFacts { isDefault: boolean; mailDefault: boolean; defaultHow?: DefaultHow; defaultAsked?: boolean; mailAsked?: boolean }
interface Facts extends DefaultFacts { downloadsFolder: string; downloadsFolderName: string; arcHere: boolean; arcUndoable: boolean; version: string; name: string; platform: string; update?: UpdateFacts; sync?: string }
interface Values { prefs: Prefs; merged: Record<string, unknown>; facts: Facts }

const [values, setValues] = createSignal<Values | null>(null)
const p = <T = unknown>(key: string): T => (values()?.prefs[key] as T)
const facts = () => values()?.facts
const merged = <T = unknown>(id: string): T => values()?.merged[id] as T

async function set(id: string, value: unknown): Promise<void> {
  const v = await call<Values>({ do: 'settings.set', id, value })
  if (v) setValues(v)
}
async function act(id: string, arg?: unknown): Promise<void> {
  const r = await call<Values | { said?: string } | null>({ do: 'settings.do', id, arg } as never)
  if (r && 'prefs' in r) setValues(r as Values)
  else if (r && 'said' in r) { announce(r.said); void refresh() }
}
async function refresh(): Promise<void> { setValues(await call<Values>({ do: 'settings.values' })) }

// what a dependent row needs (SettingsIndex.applies / needs)

function applies(id: string): boolean {
  const side = !!p('sidebar'), icons = !!p('sidebar.icons')
  switch (id) {
    case 'pages.dusk': return p('look') !== 'light'
    case 'inspector.dark': return p('look') !== 'dark'
    case 'sidebar.roomy': case 'sidebar.player': case 'sidebar.doorsUp': case 'sidebar.foldButton': case 'sidebar.narrowIcons': return side && !icons
    case 'sidebar.hides': case 'sidebar.slides': case 'layout.cards': case 'pins.list': return side
    case 'layout.cardsFullScreen': return side && !!p('layout.cards')
    case 'address.width': return !!p('address.shown') && !side
    case 'tabs.liquid': return !(side && icons)
    case 'window.glass.clear': case 'window.glass.grain': return !!p('window.glass') && !p('spaces')
    case 'pins.folders': return side && !!p('pins.list')
    case 'sidebar.foldIcons': return side && !p('sidebar.hides')
    case 'bookmarks.side': return side && !!p('bookmarks.bar')
    case 'bookmarks.iconsOnly': return !!p('bookmarks.bar') && !p('bookmarks.side')
    case 'passwords.fill.prove': return !!p('passwords.fill')
    case 'toolbar.left': case 'tabs.compact': return !side
    case 'profiles.oneWindow': return false
    case 'spaces.links': case 'links.ask': case 'spaces.buttons': return !!p('spaces')
    case 'tabs.frontBeside': return (p<string>('tabs.newPlace') ?? 'next') === 'next'
    case 'newtab.recent': case 'newtab.arc': return !!p('newtab.floating')
    case 'links.little.tabs': return !!p('links.little')
    case 'mail.default': return (p<string>('mail.webmail') ?? 'none') !== 'none'
    case 'links.peek.stays': return !!p('links.peek') || !!p('pins.peek')
    case 'launcher.key': return !!p('launcher.on')
    case 'float.own': case 'float.minimize': case 'float.fade': return p('float.enabled') !== false
    default: return true
  }
}

function needs(id: string): string {
  switch (id) {
    case 'pages.dusk': return "Only while Oriel isn't set to Light"
    case 'inspector.dark': return "Only while Oriel isn't set to Dark"
    case 'toolbar.left': case 'tabs.compact': case 'address.width': return 'Only with the tabs across the top'
    case 'sidebar.roomy': case 'sidebar.doorsUp': case 'sidebar.foldButton': case 'sidebar.narrowIcons': return 'Only with titles in the column'
    case 'tabs.liquid': return 'Only with titles in the column, or the tabs across the top'
    case 'window.glass.clear': case 'window.glass.grain': return "With spaces on, in the space's menu › Colour…"
    case 'sidebar.foldIcons': return 'Only with the column down a side and not hidden until the edge'
    case 'profiles.oneWindow': return 'Only with more than one profile'
    case 'spaces.links': case 'links.ask': case 'spaces.buttons': return 'Only with Spaces on'
    case 'sidebar.player': return 'Only with titles in the sidebar'
    case 'tabs.frontBeside': return 'Only with New tab position on After current'
    case 'newtab.recent': case 'newtab.arc': return 'Only with the new tab in a floating field'
    case 'links.little.tabs': return 'Only with links from other apps in a small window'
    case 'mail.default': return 'Only with a webmail chosen for email links'
    case 'links.peek.stays': return 'Only when links or pins open peeks'
    case 'launcher.key': return 'Only with the address field from any app on'
    case 'float.own': case 'float.minimize': case 'float.fade': return 'Only with the floating video on'
    case 'bookmarks.side': return 'Only with the bookmarks bar shown and the tabs down a side'
    case 'passwords.fill.prove': return 'Only with Fill in sign-ins on'
    default: return 'Only with the tabs down a side'
  }
}

// words that change (Settings.swift:464-506)

const engineTitles: [string, string][] = [['google', 'Google'], ['duckduckgo', 'DuckDuckGo'], ['bing', 'Bing'], ['ecosia', 'Ecosia'], ['startpage', 'Startpage'], ['kagi', 'Kagi'], ['brave', 'Brave Search'], ['qwant', 'Qwant'], ['custom', 'Custom']]
const written = (t: string) => { const s = (t ?? '').trim().replace('{searchTerms}', '%s'); return s && !s.includes('://') ? `https://${s}` : s }
function bareHost(template: string): string | null {
  try { const u = new URL(written(template).replace('%s', 'x')); if (u.protocol !== 'https:' && u.protocol !== 'http:') return null; return u.hostname.replace(/^www\./, '') || null } catch { return null }
}
const engineName = (engine: string, custom: string) => (engine === 'custom' ? bareHost(custom) ?? 'Google' : engineTitles.find(([k]) => k === engine)?.[1] ?? 'Google')
const hasSuggestions = (engine: string) => engine !== 'custom'

// Site shortcuts (Keyword.swift; studio/03 §1.10, studio/06 row 73). The
// address is taken as typed: no https:// is put in front of it, as the Mac
// does for a custom engine but never for a shortcut (Keyword.accepts).

interface Keyword { id: string; keyword: string; template: string }
/** A shortcut being written, kept out of the prefs until it's saved. */
const [draft, setDraft] = createSignal<Keyword | null>(null)
const keywords = () => (p<Keyword[]>('search.keywords') ?? [])
/** Engine.host: http or https, and the same host whatever the words. */
function templateHost(template: string): string | null {
  const t = template.trim()
  if (!t.includes('%s')) return null
  try {
    const a = new URL(t.replaceAll('%s', 'a')), b = new URL(t.replaceAll('%s', 'b'))
    if ((a.protocol !== 'http:' && a.protocol !== 'https:') || !a.hostname || a.hostname !== b.hostname) return null
    return a.hostname.toLowerCase()
  } catch { return null }
}
/** Keyword.name: the site's host without www., or the address itself. */
const keywordName = (template: string) => templateHost(template)?.replace(/^www\./, '') ?? template
/** Keyword.accepts: one site, %s once, in the path, query or fragment. */
function keywordAccepts(template: string): boolean {
  const t = template.trim()
  if (!templateHost(t) || t.split('%s').length !== 2) return false
  try { const u = new URL(t.replace('%s', 'SEARCHWORDSGOHERE')); return (u.pathname + u.search + u.hash).includes('SEARCHWORDSGOHERE') } catch { return false }
}
/** Keyword.problem, among the others (the one being changed left out). */
function keywordProblem(d: Keyword): string | null {
  const word = d.keyword.trim()
  if (!word) return 'A word to type first, like yt'
  if (/\s/.test(word)) return 'One word, with no spaces in it'
  const taken = keywords().find(k => k.id !== d.id && k.keyword.toLowerCase() === word.toLowerCase())
  if (taken) return `${taken.keyword} already goes to ${keywordName(taken.template)}`
  if (!keywordAccepts(d.template)) return 'An http or https address with %s once, where the words go'
  return null
}

function title(i: Item): string {
  if (i.id === 'tabs.shortcuts' && p('spaces') && p('spaces.commandNumbers')) return 'Show tab numbers while Alt is held'
  if (i.id === 'updates.version') {
    // The version line follows the newer build from found to fetched (Settings.swift versionTitle).
    const s = facts()?.update?.stage
    if (!s || s.kind === 'none') return 'Updates'
    return s.kind === 'fetching' ? `Oriel ${s.version} is downloading…` : s.kind === 'ready' ? `Oriel ${s.version} is ready` : `Oriel ${s.version} is out`
  }
  return i.title
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
function ago(ms: number): string {
  const s = Math.round((ms - Date.now()) / 1000)
  if (Math.abs(s) < 60) return relative.format(0, 'second')
  if (Math.abs(s) < 3600) return relative.format(Math.round(s / 60), 'minute')
  if (Math.abs(s) < 86400) return relative.format(Math.round(s / 3600), 'hour')
  return relative.format(Math.round(s / 86400), 'day')
}

function detail(i: Item): string {
  const f = facts()
  switch (i.id) {
    // Windows lets no app make itself the default: the row opens Oriel's
    // page in Settings and says what to click there (settings/browser.ts).
    case 'general.default':
      if (f?.isDefault) return 'Oriel is the default browser on this PC'
      if (f?.defaultHow === 'portable') return "Portable Oriel can't be the default browser. Install Oriel to make it one"
      if (f?.defaultHow === 'unregistered') return "Windows doesn't list Oriel as a browser. Installing Oriel again puts it there"
      return f?.defaultAsked ? 'In Windows Settings, click Set default at the top' : i.detail
    case 'mail.default':
      if (f?.mailDefault) return 'Email links from other apps open here'
      if (f?.defaultHow === 'portable') return "Portable Oriel can't open email links from other apps. Install Oriel for that"
      if (f?.defaultHow === 'unregistered') return "Windows doesn't list Oriel as a browser. Installing Oriel again puts it there"
      return f?.mailAsked ? 'In Windows Settings, find MAILTO and choose Oriel' : i.detail
    case 'downloads.folder': return f?.downloadsFolder ?? ''
    case 'sync': return p<string>('sync.folder') ? f?.sync || p<string>('sync.folder') : i.detail
    case 'search.engine': {
      if (p('search.engine') !== 'custom') return "Where words that aren't an address go"
      if (!bareHost(p<string>('search.custom') ?? '')) return 'An http or https address with %s where the words go. Until then, Google'
      return `Words go to ${engineName('custom', p<string>('search.custom'))}`
    }
    case 'search.shift': {
      const e = p<string>('search.shift')
      if (!e) return i.detail
      if (e !== 'custom') return `Shift-Return sends what you typed to ${engineName(e, '')}`
      if (!bareHost(p<string>('search.shiftCustom') ?? '')) return 'An http or https address with %s where the words go. Until then, Google'
      return `Shift-Return sends what you typed to ${engineName('custom', p<string>('search.shiftCustom'))}`
    }
    case 'search.suggest': {
      const e = p<string>('search.engine') ?? 'google'
      return hasSuggestions(e) ? `What you type is sent to ${engineName(e, p<string>('search.custom'))} as you type` : 'A custom engine has no suggestions to give, so nothing is sent'
    }
    case 'search.keywords': {
      const d = draft()
      if (!d) return i.detail
      if (!d.keyword && !d.template) return 'Type a word, like yt, then the site\'s search address with %s where the words you type go'
      return keywordProblem(d) ?? `${d.keyword.trim()} will search ${keywordName(d.template)}`
    }
    case 'passwords.save': return 'Asked once per site, never again for a site you refuse'
    case 'arc.import': return f?.arcHere ? i.detail : "Arc isn't on this PC. Bring Things Over can read an export"
    case 'updates.version': {
      const u = f?.update
      const s = u?.stage
      // The portable build doesn't update itself (settings/updater.ts).
      if (u?.portable) return "Portable Oriel doesn't update on its own. To update, download the new version"
      // Installed from the Microsoft Store: the Store keeps it up to date.
      if (u?.store) return 'The Microsoft Store keeps Oriel up to date'
      if (!s || s.kind === 'none') return u?.checked ? `Checked ${ago(u.checked)}, every hour on its own` : 'Checked every hour on its own'
      if (s.kind === 'fetching') return s.notes ?? 'Quietly, in the background. Nothing you have set is touched'
      if (s.kind === 'ready') return s.notes ?? "It's there the next time you open Oriel"
      return s.notes ?? 'Checked and put in place when you press Install'
    }
    default: return i.detail
  }
}

const sleepDetail: Record<string, string> = {
  never: 'Every tab keeps its page, however long you leave it.',
  later: 'After two hours away, a tab rests and wakes when you go back to it.',
  normal: 'After half an hour away, a tab rests and wakes when you go back to it.',
  sooner: 'After ten minutes away, a tab rests and wakes when you go back to it.',
}
const zooms = Array.from({ length: 51 }, (_, k) => (50 + k * 5) / 100)
const sw = (key: string, invert = false) => <Switch on={invert ? !p(key) : !!p(key)} set={v => void set(key, invert ? !v : v)} />
const check = () => <span class="st-done"><Symbol name="checkmark" size={12} weight="medium" /></span>

function control(i: Item): JSX.Element {
  switch (i.id) {
    // General
    case 'general.default': return facts()?.isDefault ? check() : facts()?.defaultHow === 'settings' ? <Pill title="Make default" filled act={() => void act('general.default')} /> : null
    case 'mail.webmail': return <Menu label="Email links open in" value={p<string>('mail.webmail') ?? 'none'} set={v => void set('mail.webmail', v)}
      options={[['none', 'Your mail app'], null, ['gmail', 'Gmail'], ['outlook', 'Outlook.com'], ['fastmail', 'Fastmail'], ['proton', 'Proton Mail']]} />
    case 'mail.default': return facts()?.mailDefault ? check() : facts()?.defaultHow === 'settings' ? <Pill title="Make default" filled act={() => void act('mail.default')} /> : null
    case 'general.import': return <Pill title="Bring Things Over…" act={() => void act('general.import')} />
    case 'sync': return <Switch on={!!p('sync.folder')} set={v => void set('sync', v)} />
    case 'quit.confirm': return sw('quit.confirm')
    case 'downloads.folder': return <Pill title="Change…" act={() => void act('downloads.folder')} />
    case 'downloads.ask': return sw('downloads.ask')
    case 'downloads.button': return sw('downloads.button')
    case 'downloads.open': return <Menu label="Open Downloads" value={p<string>('downloads.open') ?? 'tab'} set={v => void set('downloads.open', v)}
      options={[['tab', 'In a tab'], ['popover', 'Floating by the button'], ['panel', 'In the side panel']]} />
    // Themes
    case 'home.theme': return (
      // The themes module's page (src/ui/themes/ThemesPage.tsx) when it is there.
      <Show when={pageFor('settings.themes')} fallback={<div class="theme-control">
        <Segmented value={p<string>('home.theme') ?? 'off'} set={v => void set('home.theme', v)}
          options={[['off', 'Off'], ['wall', 'Wall painting'], ['stickers', 'Stickers'], ['solid', 'Solid colour'], ['gradient', 'Gradient'], ['image', 'Image']]} />
        <Show when={(p<string>('home.theme') ?? 'off') === 'off'}><div class="st-under-note">The blank tab stays plain.</div></Show>
      </div>}>{c => <Dynamic component={c()} />}</Show>
    )
    case 'window.buttons': return <Pictures value={p<string>('window.buttons') === 'classic' ? 'classic' : 'inline'} set={v => void set('window.buttons', v)}
      options={[['inline', 'Inline', () => <ButtonsPicture style="inline" />], ['classic', 'Classic', () => <ButtonsPicture style="classic" />]]} />
    // Appearance
    case 'look': return <Pictures value={p<string>('look') ?? 'system'} set={v => void set('look', v)}
      options={[['light', 'Light', () => <LookPicture look="light" />], ['dark', 'Dark', () => <LookPicture look="dark" />], ['system', 'Auto', () => <LookPicture look="system" />]]} />
    case 'tabs.layout': return <Pictures value={merged<string>('tabs.layout')} set={v => void set('tabs.layout', v)}
      options={(['top', 'left', 'right', 'icons'] as const).map(l => [l, { top: 'Top', left: 'Left', right: 'Right', icons: 'Icons only' }[l], () => <LayoutPicture layout={l} />])} />
    case 'layout.cards': return <Pictures value={p<boolean>('layout.cards') !== false} set={v => void set('layout.cards', v)}
      options={[[true, 'As a card', () => <CardPicture card />], [false, 'Edge to edge', () => <CardPicture card={false} />]]} />
    case 'pages.scrollbars': return <Segmented value={p<string>('pages.scrollbars') ?? 'oriel'} set={v => void set('pages.scrollbars', v)} options={[['oriel', "Oriel's"], ['windows', "Windows' own"]]} />
    case 'address.width': return <Segmented value={p<string>('address.width') ?? 'small'} set={v => void set('address.width', v)} options={[['small', 'Small'], ['medium', 'Medium']]} />
    case 'window.glass.clear': case 'window.glass.grain': case 'float.fade':
      return <input class="st-slider" type="range" min="0" max="1" step="0.01" value={p<number>(i.id)} onChange={e => void set(i.id, Number(e.currentTarget.value))} aria-label={i.title} />
    case 'helm.shown': return <Ticks items={[
      ['Back', !p('helm.back.hidden'), v => void set('helm.back.hidden', !v)],
      ['Forward', !p('helm.forward.hidden'), v => void set('helm.forward.hidden', !v)],
      ['Reload', !p('helm.reload.hidden'), v => void set('helm.reload.hidden', !v)]]} />
    case 'foot.shown': return <Ticks items={[
      ['Extensions', !p('foot.extensions.hidden'), v => void set('foot.extensions.hidden', !v)],
      ['Bookmarks', !p('foot.bookmarks.hidden'), v => void set('foot.bookmarks.hidden', !v)],
      ['Profile', !p('foot.profile.hidden'), v => void set('foot.profile.hidden', !v)]]} />
    case 'glyph': return <Segmented value={p<string>('glyph') ?? 'letters'} set={v => void set('glyph', v)} options={[['letters', 'Letters'], ['icons', 'Site icons']]} />
    case 'sidebar.narrowIcons': return <Switch on={!!p('sidebar.narrowIcons')} set={v => void set('sidebar.narrowIcons', v)} />
    // Tabs
    case 'tabs.newPlace': return <Menu label="New tab position" value={p<string>('tabs.newPlace') ?? 'next'} set={v => void set('tabs.newPlace', v)}
      options={[['next', 'After current'], ['top', p('sidebar') ? 'Top' : 'Leftmost'], ['end', p('sidebar') ? 'Bottom' : 'Rightmost']]} />
    case 'tabs.sleep': return (
      <div class="st-sleep">
        <Segmented wide max={340} value={merged<string>('tabs.sleep')} set={v => void set('tabs.sleep', v)}
          options={[['never', 'Never'], ['later', 'Later'], ['normal', 'Normal'], ['sooner', 'Sooner']]} />
        <div class="st-sleep-detail">{sleepDetail[merged<string>('tabs.sleep')] ?? ''}</div>
      </div>
    )
    case 'tabs.close.after': return <Menu label="Close tabs you leave alone" value={Number(p('tabs.close.after') ?? 0)} set={v => void set('tabs.close.after', v)}
      options={[[0, 'Never'], [12, 'After 12 hours'], [24, 'After a day'], [168, 'After a week'], [720, 'After a month']]} />
    // Browsing
    case 'search.engine': return <Menu label="Search with" value={p<string>('search.engine') ?? 'google'} set={v => void set('search.engine', v)} options={engineTitles} />
    case 'search.shift': return <Menu label="Shift-Return searches with" value={p<string>('search.shift') ?? ''} set={v => void set('search.shift', v)}
      options={[['', 'Off'], null, ...engineTitles]} />
    case 'search.keywords': return (
      <Show when={draft()} fallback={<Pill title="Add" act={() => setDraft({ id: crypto.randomUUID(), keyword: '', template: '' })} />}>
        <div class="st-pills"><Pill title="Cancel" act={() => setDraft(null)} /><Pill title="Save" filled disabled={!!keywordProblem(draft()!)} act={saveDraft} /></div>
      </Show>
    )
    case 'window.fullScreenStyle': return <Segmented value={p<string>('window.fullScreenStyle') ?? 'full'} set={v => void set('window.fullScreenStyle', v)} options={[['full', 'Full screen'], ['borderless', 'Borderless window']]} />
    case 'float.style': return <Switch on={p('float.enabled') !== false} set={v => void set('float.enabled', v)} />
    case 'float.own': return <Segmented wide max={340} value={merged<string>('float.own')} set={v => void set('float.own', v)} options={[['never', 'Never'], ['tabs', 'Switching tabs'], ['tabsOrApps', 'Tabs or apps']]} />
    case 'translate.target': return <TranslateAdd value={p<string[]>(MENU_KEY) ?? MENU_DEFAULT} set={v => void set(MENU_KEY, v)} />
    case 'pageZoom': return <Steps stops={zooms} value={Number(p('pageZoom') ?? 1)} home={1} label={v => `${Math.round(v * 100)}%`} set={v => void set('pageZoom', v)} />
    // Spaces & Pins
    case 'arc.setup': return facts()?.arcUndoable ? <Pill title="Undo" act={() => void act('arc.undo')} />
      : merged<boolean>('arc') ? <Always text="Set up" /> : <Pill title="Set Up" filled act={() => void act('arc.setup')} />
    case 'arc.import': return <Pill title="Bring Over…" disabled={!facts()?.arcHere} act={() => void act('arc.import')} />
    case 'profiles': return <Pill title="New Profile…" act={() => void act('profiles')} />
    case 'pins.keep': return <Switch on={!!merged('pins.keep')} set={v => void set('pins.keep', v)} />
    // Passwords, Privacy
    case 'passwords.open': return <Pill title="Open…" act={() => void act('passwords.open')} />
    case 'sites.keep': return sw('sites.keep', true)
    case 'privacy.forget': return <Pill title="Forget choices" act={() => void act('privacy.forget').then(() => setPermissionsSeen(n => n + 1))} />
    case 'clear.history': return <Pill title="Clear" act={() => void act('clear.history')} />
    case 'clear.cookies': return <Pill title="Sign out of everything" act={() => void act('clear.cookies')} />
    case 'clear.cache': return <Pill title="Clear" act={() => void act('clear.cache')} />
    // Keyboard & Mouse
    case 'links.peek': return <Menu label="Peek at a link" value={merged<string>('links.peek')} set={v => void set('links.peek', v)}
      options={[['off', 'Off'], ['shift', 'Shift-click'], ['optionShift', 'Alt-Shift-click'], ['optionCommand', 'Ctrl-Alt-click']]} />
    case 'launcher.key': return <LauncherKey />
    // About
    case 'updates.version': {
      const u = facts()?.update
      const s = u?.stage
      if (u?.portable) return <Pill title="Download…" act={() => void call({ do: 'tab.new', url: 'https://github.com/carpaaaaa/oriel/releases/latest' })} />
      if (u?.store) return null
      if (!s || s.kind === 'none') return <Pill title={u?.checking ? 'Checking…' : 'Check now'} disabled={u?.checking} act={() => void act('updates.check')} />
      if (s.kind === 'fetching') return <span class="st-ring" aria-label="Downloading" />
      if (s.kind === 'ready') return <Pill title="Relaunch now" filled act={() => void act('updates.relaunch')} />
      return <Pill title="Install" filled act={() => void act('updates.install')} />
    }
    case 'about.notes': return <Pill title="What's New…" act={() => void call({ do: 'internal.open', url: 'oriel://release-notes' })} />
    case 'updates.auto': return sw('update.install')
    default:
      if (i.kind === 'note') return <Always />
      // A plain switch over the row's one key.
      if (i.keys?.length === 1) return sw(i.keys[0])
      return null
  }
}

function saveDraft(): void {
  const d = draft()
  if (!d || keywordProblem(d)) return
  const saved = { id: d.id, keyword: d.keyword.trim(), template: d.template.trim() }
  const list = [...keywords()]
  const at = list.findIndex(k => k.id === saved.id)
  if (at >= 0) list[at] = saved; else list.push(saved)
  void set('search.keywords', list)
  setDraft(null)
}

/** The key that raises the field from any app (LauncherKeyBox): click, then press it. */
function LauncherKey() {
  const [listening, setListening] = createSignal(false)
  const [problem, setProblem] = createSignal('')
  const key = () => { try { const k = JSON.parse(p<string>('launcher.key') || 'null'); return k?.name as string | undefined } catch { return undefined } }
  const down = (e: KeyboardEvent) => {
    if (!listening()) return
    e.preventDefault()
    if (e.key === 'Escape') { setListening(false); return }
    if (e.key === 'Backspace') { void set('launcher.key', ''); setListening(false); return }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    if (!e.ctrlKey && !e.altKey && !e.metaKey) { setProblem('Add Ctrl, Alt or Shift with Ctrl'); return }
    const name = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.key.length === 1 ? e.key.toUpperCase() : e.code === 'Space' ? 'Space' : e.key].filter(Boolean).join('+')
    if (name === 'Alt+Space' || name === 'Ctrl+Escape') { setProblem('Used by Windows'); return }
    setProblem('')
    void set('launcher.key', JSON.stringify({ name }))
    setListening(false)
  }
  return (
    <div class="keybox-wrap">
      <button class="keybox" classList={{ listening: listening() }} onClick={() => { setListening(true); setProblem('') }} onKeyDown={down} onBlur={() => setListening(false)}>
        {listening() ? 'Type a shortcut' : key() ?? 'None'}
      </button>
      <Show when={!key() && !listening()}><Pill title="Use Ctrl+Shift+Space" act={() => void set('launcher.key', JSON.stringify({ name: 'Ctrl+Shift+Space' }))} /></Show>
      <Show when={problem() || listening()}><span class="keybox-help">{problem() || 'Click, then press the key. Backspace takes it away'}</span></Show>
    </div>
  )
}

const [permissionsSeen, setPermissionsSeen] = createSignal(0)

/** What goes under a row (Settings.swift:928). */
function after(i: Item, searched: boolean): JSX.Element {
  switch (i.id) {
    case 'search.engine': return <Show when={p('search.engine') === 'custom'}><TemplateField id="search.custom" /></Show>
    case 'search.shift': return <Show when={p('search.shift') === 'custom'}><TemplateField id="search.shiftCustom" /></Show>
    case 'search.keywords': return <KeywordEditor />
    case 'privacy.forget': return <Show when={!searched}><div class="st-under"><PermissionSites seen={permissionsSeen()} notificationsOn={p('notifications.ask') !== false} /><PopupSites sites={p<string[]>('privacy.popupSites') ?? []} remove={s => void set('privacy.popupSites', (p<string[]>('privacy.popupSites') ?? []).filter(x => x !== s))} /></div></Show>
    case 'passkeys': return <Show when={!searched}><NeverAsked /></Show>
    case 'translate.target': return <TranslateChosen value={p<string[]>(MENU_KEY) ?? MENU_DEFAULT} set={v => void set(MENU_KEY, v)} />
    default: return null
  }
}

function TemplateField(q: { id: string }) {
  return (
    <div class="st-template">
      <input placeholder="https://example.com/search?q=%s" value={p<string>(q.id) ?? ''} onChange={e => void set(q.id, e.currentTarget.value)} aria-label="Search address" />
    </div>
  )
}

/** Under Site shortcuts (Settings.swift keywordEditor): the one being
 * written, then the saved ones; a saved one clicked opens up here to be
 * changed, its X deletes it. Nothing at all while there are none. */
function KeywordEditor() {
  return (
    <>
      <Show when={draft()}>{d => (
        <div class="kw editing">
          {/* Plainly examples, not an entry already there: in italics, with "e.g.". */}
          <input class="kw-word" placeholder="word" value={d().keyword} onInput={e => setDraft({ ...d(), keyword: e.currentTarget.value })} />
          <span class="kw-arrow">→</span>
          <input class="kw-template" placeholder="address with %s for the words, e.g. https://youtube.com/results?search_query=%s" value={d().template}
            onInput={e => setDraft({ ...d(), template: e.currentTarget.value })} onKeyDown={e => { if (e.key === 'Enter') saveDraft() }} />
        </div>
      )}</Show>
      {/* Said before it's refused: the address isn't completed with https://. */}
      <Show when={draft()}><div class="kw-hint">The address starts with https:// or http://, with %s where the words go.</div></Show>
      {/* The one being changed is up in the editor, not here as well. */}
      <For each={keywords().filter(k => k.id !== draft()?.id)}>{k => (
        <div class="kw">
          <span class="kw-change" title="Click to change" onClick={() => setDraft({ ...k })}>
            <span class="kw-word">{k.keyword}</span><span class="kw-arrow">→</span><MiddleCut text={k.template} />
          </span>
          <button class="kw-remove" aria-label={`Remove ${k.keyword}`} onClick={() => void set('search.keywords', keywords().filter(x => x.id !== k.id))}><Symbol name="xmark.circle.fill" size={11} /></button>
        </div>
      )}</For>
    </>
  )
}

/** One line cut in its middle when it doesn't fit, start and end kept. */
function MiddleCut(q: { text: string }) {
  const half = () => Math.ceil(q.text.length / 2)
  return (
    <span class="kw-template cut">
      <span class="kw-head">{q.text.slice(0, half())}</span><span class="kw-tail"><bdi dir="ltr">{q.text.slice(half())}</bdi></span>
    </span>
  )
}

/** "Sites never asked" under Offer passkeys, when there are some. */
function NeverAsked() {
  const [count, setCount] = createSignal(0)
  onMount(async () => { const r = await call<{ never: number }>({ do: 'passwords.list' } as never).catch(() => null); setCount(r?.never ?? 0) })
  return (
    <Show when={count() > 0}>
      <div class="st-rule" />
      <SettingRow icon="hand.raised.slash" title="Sites never asked" detail={`${count()} sites told to stop offering`}
        control={<Pill title="Forget" act={async () => { await call({ do: 'passwords.forgetNever' } as never); setCount(0); announce('Every site can ask again') }} />} />
    </Show>
  )
}

// the page

export function SettingsPage() {
  const fromAddress = (): PageID | 'update' | null => { const n = location.pathname.replace(/^\//, '').split('/')[0] ?? ''; return n === 'update' ? 'update' : pageNamed(n) }
  const [page, setPage] = createSignal<PageID | 'update'>('general')
  const [query, setQuery] = createSignal(new URLSearchParams(location.search).get('find') ?? '')
  const [lit, setLit] = createSignal<string | null>(null)
  let findInput: HTMLInputElement | undefined
  let scroller: HTMLDivElement | undefined
  const searching = () => query().trim().length > 0
  const hits = createMemo(() => find(query()))

  onMount(async () => {
    document.title = 'Settings'
    await refresh()
    setPage(fromAddress() ?? pageNamed(p<string>('settings.page') ?? '') ?? 'general')
    const off1 = onUpdate('prefs', v => setValues(old => (old ? { ...old, prefs: v as Prefs, merged: mergedFrom(v as Prefs) } : old)))
    const off3 = onUpdate('update', v => setValues(old => (old ? { ...old, facts: { ...old.facts, update: v as UpdateFacts } } : old)))
    onCleanup(off3)
    const off4 = onUpdate('sync', v => setValues(old => (old ? { ...old, facts: { ...old.facts, sync: String(v) } } : old)))
    onCleanup(off4)
    // What Windows chose, read again when Oriel comes back to the front.
    const off5 = onUpdate('default', v => {
      const { said: now, ...got } = v as DefaultFacts & { said?: string }
      setValues(old => (old ? { ...old, facts: { ...old.facts, ...got } } : old))
      announce(now)
    })
    onCleanup(off5)
    const off2 = onUpdate('go', v => {
      const url = new URL(String(v))
      const n = url.pathname.replace(/^\//, '').split('/')[0] ?? ''
      const named = n === 'update' ? 'update' as const : pageNamed(n)
      if (named) { setQuery(''); setPage(named) }
      const f = url.searchParams.get('find'); if (f) setQuery(f)
    })
    onCleanup(() => { off1(); off2() })
    const keys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); findInput?.focus(); findInput?.select() }
    }
    window.addEventListener('keydown', keys)
    onCleanup(() => window.removeEventListener('keydown', keys))
  })

  // Each section opens at its top; the address and settings.page follow it.
  createEffect(on(page, pg => {
    scroller?.scrollTo(0, 0)
    if (!values()) return
    const want = `/${pg}`
    if (location.pathname !== want) history.replaceState(null, '', want)
    if (p('settings.page') !== pg) void call({ do: 'settings.set', id: 'settings.page', value: pg }).then(v => v && setValues(v as Values))
  }, { defer: true }))

  createEffect(() => { if (page() === 'update' && values() && !facts()?.update?.pending) setPage('general') })

  const counts = createMemo(() => {
    const c: Record<string, number> = {}
    for (const i of hits()) c[pageOfItem(i)] = (c[pageOfItem(i)] ?? 0) + 1
    return c
  })

  const go = (pg: PageID | 'update', row?: string) => {
    setQuery('')
    setPage(pg)
    if (row) {
      setLit(row)
      requestAnimationFrame(() => scroller?.querySelector(`[data-row="${row}"]`)?.scrollIntoView({ block: 'center' }))
      setTimeout(() => setLit(null), 1400)
    }
  }

  return (
    <div class="st" classList={{ instant: !!p('motion.instant'), light: !!p('motion.light') }}>
      <Rail page={page()} searching={searching()} counts={counts()} go={go} query={query()} setQuery={setQuery} findRef={el => (findInput = el)} />
      <div class="st-hairline" />
      <main class="st-content">
        <header class="st-head">
          <Show when={!searching()}><Symbol name={page() === 'update' ? 'arrow.down.circle' : pageOf(page())?.icon ?? 'gearshape'} size={15} weight="medium" /></Show>
          <h1>{searching() ? `Settings matching “${query().trim()}”` : page() === 'update' ? 'Update' : pageOf(page())?.title}</h1>
        </header>
        <div class="st-scroll" ref={scroller}>
          <div class="st-column">
            <Show when={values()}>
              <Show when={searching()} fallback={<Show when={page() !== 'update'} fallback={<UpdateSection />}><Section page={page() as PageID} lit={lit()} /></Show>}>
                <Results hits={hits()} go={go} />
              </Show>
            </Show>
          </div>
        </div>
      </main>
      <Show when={said()}>{s => <div class="st-said" data-n={s().n}>{s().text}</div>}</Show>
    </div>
  )
}

function mergedFrom(prefs: Prefs): Record<string, unknown> {
  const g = (k: string) => prefs[k]
  const layout = !g('sidebar') ? 'top' : g('sidebar.icons') ? 'icons' : g('sidebar.position') === 'right' ? 'right' : 'left'
  return {
    'tabs.layout': layout,
    'tabs.sleep': g('tabs.sleep') ? (g('tabs.sleep.pace') || 'normal') : 'never',
    'float.own': g('float.away') ? 'tabsOrApps' : g('float.leave') ? 'tabs' : 'never',
    'pins.keep': !!(g('pins.home') || g('pins.peek')),
    'links.peek': g('links.peek') ? (g('links.peek.click') || g('links.peekClick') || 'shift') : 'off',
    'arc': values()?.merged.arc,
  }
}

function Rail(q: { page: PageID | 'update'; searching: boolean; counts: Record<string, number>; go: (p: PageID | 'update') => void; query: string; setQuery: (s: string) => void; findRef: (el: HTMLInputElement) => void }) {
  let list!: HTMLDivElement
  const [white, setWhite] = createSignal<{ y: number; h: number } | null>(null)
  const [ready, setReady] = createSignal(false)
  const place = () => {
    const el = list?.querySelector<HTMLElement>(`[data-page="${q.page}"]`)
    if (!el || q.searching) { setWhite(null); return }
    setWhite({ y: el.offsetTop, h: el.offsetHeight })
  }
  onMount(() => { place(); requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))) })
  createEffect(() => { void q.page; void q.searching; void facts()?.update?.pending; queueMicrotask(place) })
  return (
    <nav class="rail" aria-label="Settings sections">
      <div class="rail-title">Settings</div>
      <div class="st-find">
        <Symbol name="magnifyingglass" size={11} weight="medium" />
        <input ref={q.findRef} value={q.query} placeholder="Find a setting" aria-label="Find a setting"
          onInput={e => q.setQuery(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape') { q.setQuery(''); e.preventDefault() } }} />
        <Show when={q.query} fallback={<span class="st-find-key">Ctrl+F</span>}>
          <button class="st-find-clear" aria-label="Clear" onClick={() => q.setQuery('')}><Symbol name="xmark.circle.fill" size={11} /></button>
        </Show>
      </div>
      <div class="rail-list" ref={list}>
        <Show when={white()}>{w => <span class="rail-white" classList={{ ready: ready() }} style={{ transform: `translateY(${w().y}px)`, height: `${w().h}px` }} />}</Show>
        <Show when={facts()?.update?.pending}>{u => (
          <>
            <button class="rail-row rail-update" data-page="update" classList={{ on: !q.searching && q.page === 'update' }}
              aria-current={!q.searching && q.page === 'update' ? 'page' : undefined} onClick={() => q.go('update')}>
              <Symbol name="arrow.down.circle" size={12} weight="medium" />
              <span class="rail-name">Update to {u().version}</span>
            </button>
            <div class="rail-rule" />
          </>
        )}</Show>
        <For each={blocks}>{(block, b) => (
          <>
            <Show when={b() > 0}><div class="rail-rule" /></Show>
            <For each={block}>{id => {
              const pg = pageOf(id)!
              const count = () => (q.searching ? q.counts[id] ?? 0 : null)
              return (
                <button class="rail-row" data-page={id} classList={{ on: !q.searching && q.page === id, none: count() === 0 }}
                  aria-current={!q.searching && q.page === id ? 'page' : undefined} onClick={() => q.go(id)}>
                  <Symbol name={pg.icon} size={12} weight="medium" />
                  <span class="rail-name">{pg.title}</span>
                  <Show when={(count() ?? 0) > 0}><span class="rail-count">{count()}</span></Show>
                </button>
              )
            }}</For>
          </>
        )}</For>
      </div>
    </nav>
  )
}

function Row(q: { item: Item; searched: boolean; lit?: boolean }) {
  const counts = () => applies(q.item.id)
  return (
    <>
      <SettingRow id={q.item.id} icon={q.item.icon} title={title(q.item)} detail={counts() ? detail(q.item) : needs(q.item.id)}
        more={counts() ? q.item.more : undefined} wide={q.item.kind === 'wide'} lit={q.lit} dim={!counts()} control={control(q.item)} />
      {after(q.item, q.searched)}
    </>
  )
}

function Rows(q: { items: Item[]; searched: boolean; lit?: string | null }) {
  return (
    <For each={q.items}>{(item, k) => (
      <>
        <Show when={k() > 0}><div class="st-rule" /></Show>
        <Row item={item} searched={q.searched} lit={q.lit === item.id} />
      </>
    )}</For>
  )
}

function Groups(q: { page: PageID; lit: string | null }) {
  return (
    <For each={groupsOf(q.page)}>{g => (
      <GroupBlock title={g.title} icon={g.icon} id={g.id}>
        <Card><Rows items={itemsIn(g.id).filter(i => applies(i.id))} searched={false} lit={q.lit} /></Card>
      </GroupBlock>
    )}</For>
  )
}

function Section(q: { page: PageID; lit: string | null }) {
  return (
    <Choose fallback={<Groups page={q.page} lit={q.lit} />}>
      <Match when={q.page === 'about'}>
        <AboutHead />
        <Groups page="about" lit={q.lit} />
      </Match>
      <Match when={q.page === 'keyboard'}>
        <Groups page="keyboard" lit={q.lit} />
        <GroupBlock title="Shortcuts" icon="command" id="shortcuts">
          <Show when={pageFor('settings.shortcuts')} fallback={<Card><Nothing text="Each command's key is in its menu." /></Card>}>{c => <Dynamic component={c()} />}</Show>
        </GroupBlock>
      </Match>
      <Match when={q.page === 'privacy'}>
        <Groups page="privacy" lit={q.lit} />
        <GroupBlock title="Proxy" icon="network" id="proxy"><Proxy /></GroupBlock>
      </Match>
      <Match when={q.page === 'extensions'}>
        <Show when={pageFor('settings.extensions')} fallback={<Card><Nothing text="No extensions yet." /></Card>}>{c => <Dynamic component={c()} />}</Show>
      </Match>
    </Choose>
  )
}

/** The update waiting, as the first section (the user's wish, 24 Nov 2026):
 * its version, its notes in brief, Update and Restart. */
function UpdateSection() {
  const u = () => facts()?.update?.pending
  return (
    <Show when={u()}>{v => (
      <GroupBlock title="Update" icon="arrow.down.circle" id="update">
        <Card>
          <SettingRow id="update.now" icon="arrow.down.app"
            title={v().fetching ? `Oriel ${v().version} is downloading…` : v().ready ? `Oriel ${v().version} is ready` : `Oriel ${v().version} is out`}
            detail={v().notes ?? 'A newer Oriel, with what has changed since yours.'}
            control={<Pill title={v().fetching ? 'Downloading…' : 'Update and Restart'} filled disabled={v().fetching} act={() => void act('updates.now')} />} />
        </Card>
      </GroupBlock>
    )}</Show>
  )
}

/** Logo, name, and where it comes from (Settings.swift:1152). */
function AboutHead() {
  return (
    <div class="about-head">
      <svg class="about-logo" viewBox="0 0 608 276" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor" d="M469.443 0C545.471 0 607.103 61.633 607.104 137.66 607.104 213.688 545.471 275.321 469.443 275.321H137.66C61.632 275.321 0 213.688 0 137.66 0 61.633 61.633 0 137.66 0zM138 50a88 88 0 1 0 0 176 88 88 0 0 0 0-176" /></svg>
      <div>
        <div class="about-name">{facts()?.name ?? 'Oriel'}</div>
        <div class="about-line">from Search by Office Commun · version {facts()?.version}</div>
      </div>
    </div>
  )
}

/** Proxy (Proxy.swift:318): the setting is kept; sending pages through it is P1. */
function Proxy() {
  const v = () => { try { return JSON.parse(p<string>('network.proxy') || '{}') as { mode?: string; host?: string; port?: number } } catch { return {} } }
  const save = (patch: Record<string, unknown>) => void set('network.proxy', JSON.stringify({ ...v(), ...patch }))
  return (
    <div class="st-proxy">
      <Line title="Send everything through a proxy" detail="Off: Oriel follows Windows' own network settings.">
        <Menu label="Proxy" width={180} value={v().mode ?? 'off'} set={m => save({ mode: m })} options={[['off', "Off, or Windows' own"], ['http', 'HTTP'], ['socks5', 'SOCKS5']]} />
      </Line>
      <Show when={(v().mode ?? 'off') !== 'off'}>
        <div class="st-proxy-fields">
          <input placeholder="Host, such as 127.0.0.1" value={v().host ?? ''} onChange={e => save({ host: e.currentTarget.value.trim() })} />
          <input placeholder="Port, such as 7890" value={v().port ?? ''} onChange={e => save({ port: Number(e.currentTarget.value) || undefined })} />
          <div class="st-under-note">{v().mode === 'http' ? 'HTTP proxies are reached with CONNECT, so the proxy has to allow tunnelling.' : 'SOCKS5, as an SSH tunnel or a local client offers.'}</div>
        </div>
      </Show>
    </div>
  )
}

/** Found: grouped under PAGE › GROUP; what is always there comes apart, last. */
function Results(q: { hits: Item[]; go: (p: PageID, row?: string) => void }) {
  const found = () => q.hits.filter(i => i.kind !== 'note')
  const always = () => q.hits.filter(i => i.kind === 'note')
  const byGroup = () => groups.filter(g => found().some(i => i.group === g.id))
  return (
    <>
      <Show when={!q.hits.length}><Card><Nothing text="No setting called that. Try other words, like dark, tabs or video" /></Card></Show>
      <For each={byGroup()}>{g => {
        const list = () => found().filter(i => i.group === g.id)
        const pg = pageOf(g.page)!
        return (
          <section class="st-group found">
            <button class="found-head" title={`Open ${pg.title} at ${g.title}`} onClick={() => { const first = list()[0]; q.go(g.page, first && !first.findOnly ? first.id : undefined) }}>
              <Symbol name={g.icon} size={10.5} weight="medium" />
              <span>{`${pg.title}  ›  ${g.title}`.toUpperCase()}</span>
              <Symbol name="arrow.right" size={9} weight="semibold" class="found-arrow" />
            </button>
            <Card><Rows items={list()} searched /></Card>
          </section>
        )
      }}</For>
      <Show when={always().length}>
        <section class="st-group found">
          <div class="found-head"><Symbol name="checkmark.circle" size={10.5} weight="medium" /><span>{'Always on, nothing to set'.toUpperCase()}</span></div>
          <Card><Rows items={always()} searched /></Card>
        </section>
      </Show>
    </>
  )
}

// For the bench: what the catalog holds.
;(window as unknown as { __settings: unknown }).__settings = { items, groups, find, applies, itemOf, groupOf }
