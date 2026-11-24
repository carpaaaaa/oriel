// The pages module's bench requests (test/settings_c_*.py).

import { app, type WebContents } from 'electron'
import { benchRequest } from '../bench/server'
import { runtimes } from '../views/tabs'
import { blocked, redirected } from './shield'
import { describe, update, useTestList } from './blocker'
import { framesDressed } from './page'
import type { Source } from './blocker/core'
import { fellBack } from './privacy'
import { reminder } from './escape'
import { gliding, systemGlides } from './smooth'
import { model } from '../model/model'
import { peekContents, peekInfo } from './peek'
import { floatControls, floatInfo } from './float'
import { allControllers } from '../views/window'
import { captures } from './capture'
import { readerInfo, readerSaid } from './reader'
import { unpainted } from './ground'

/** The last page menu each page asked for: its misspelt word, if any. */
const menus = new Map<number, { misspelled: string; suggestions: string[] }>()
app.on('web-contents-created', (_e, wc: WebContents) => {
  wc.on('context-menu', (_ev, params) => { menus.set(wc.id, { misspelled: params.misspelledWord, suggestions: params.dictionarySuggestions }) })
})

benchRequest('pages.state', req => {
  const wc = req.id ? runtimes.get(String(req.id))?.contents : null
  return {
    blocked: blocked.slice(-50),
    redirected: redirected.slice(-50),
    fellBack: fellBack.slice(-20),
    reminder: { ...reminder },
    gliding,
    systemGlides: systemGlides(),
    peeks: peekInfo(),
    float: floatInfo(),
    captures: captures.slice(-10),
    reading: readerInfo(),
    readerSaid: readerSaid.slice(-5),
    spelling: wc ? wc.session.isSpellCheckerEnabled() : null,
    menu: wc ? menus.get(wc.id) ?? null : null,
    // Still on the dark ground, waiting for its first paint (ground.ts).
    unpainted: wc ? unpainted(wc) : null,
    commandLine: { smooth: app.commandLine.hasSwitch('enable-smooth-scrolling'), jumpy: app.commandLine.hasSwitch('disable-smooth-scrolling') },
  }
})

/** Input as a person gives it, to one tab's page: wheel notches, keys
 * with what they are, a mouse button held and moved. */
benchRequest('pages.input', req => {
  const wc = runtimes.get(String(req.id))?.contents
  if (!wc) throw new Error('tab has no page')
  for (const e of (req.events as Electron.InputEvent[]) ?? []) wc.sendInputEvent(e as never)
  return {}
})

/** A test world's stand-ins (test.youtubeHosts, test.redditHosts): keys
 * with no row in Settings, written only here. */
benchRequest('pages.testHosts', req => {
  for (const key of ['test.youtubeHosts', 'test.redditHosts', 'test.playerHosts']) if (key in req) model.setPref(key, req[key])
  return {}
})

/** Script in the peek's page (its own view, not a tab's). */
benchRequest('pages.peekEval', async req => {
  const wc = peekContents(req.window as string | undefined)
  if (!wc) throw new Error('no peek')
  return { value: await wc.executeJavaScript(String(req.js), true) }
})

/** Input to the peek's page. */
benchRequest('pages.peekInput', req => {
  const wc = peekContents(req.window as string | undefined)
  if (!wc) throw new Error('no peek')
  for (const e of (req.events as Electron.InputEvent[]) ?? []) wc.sendInputEvent(e as never)
  return {}
})

/** Script in the floating window's buttons (a click on one), or input to them. */
benchRequest('pages.floatControls', async req => {
  const wc = floatControls()
  if (!wc) throw new Error('nothing floats')
  for (const e of (req.events as Electron.InputEvent[]) ?? []) wc.sendInputEvent(e as never)
  return { value: req.js ? await wc.executeJavaScript(String(req.js), true) : null }
})

/** Oriel left for another app, or back (a test world's windows never take
 * the focus): the front window's blur or focus, as Windows would send it. */
benchRequest('pages.appFocus', req => {
  const c = allControllers()[0]
  if (!c) throw new Error('no window')
  if (req.focused) { c.base.isFocused = () => true; c.base.emit('focus') } else { c.base.isFocused = () => false; c.base.emit('blur') }
  return {}
})

/** The ad blocker: where its engine came from, its lists, what it did. */
benchRequest('pages.blocker', () => ({ ...describe(), blocked: blocked.slice(-100), redirected: redirected.slice(-50), frames: framesDressed.slice(-20) }))

/** A test world's own filter list (and resources), in place of uBlock
 * Origin's, so a test knows exactly what is blocked; null puts them back. */
benchRequest('pages.blockerTest', req => {
  useTestList(typeof req.filters === 'string' ? req.filters : null, typeof req.resources === 'string' ? req.resources : undefined, req.none === true)
  return describe()
})

/** The daily update, now, from addresses on this computer: `lists` and
 * `resources` are the sources' stand-ins ({id, urls}). */
benchRequest('pages.blockerUpdate', async req => {
  const lists = req.lists as Source[] | undefined
  const resources = req.resources as Source | undefined
  return update(lists && resources ? { lists, resources } : undefined)
})
