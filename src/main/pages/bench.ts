// The pages module's bench requests (test/settings_c_*.py).

import { app, type WebContents } from 'electron'
import { benchRequest } from '../bench/server'
import { runtimes } from '../views/tabs'
import { blocked } from './shield'
import { fellBack } from './privacy'
import { reminder } from './escape'
import { gliding } from './smooth'
import { model } from '../model/model'

/** The last page menu each page asked for: its misspelt word, if any. */
const menus = new Map<number, { misspelled: string; suggestions: string[] }>()
app.on('web-contents-created', (_e, wc: WebContents) => {
  wc.on('context-menu', (_ev, params) => { menus.set(wc.id, { misspelled: params.misspelledWord, suggestions: params.dictionarySuggestions }) })
})

benchRequest('pages.state', req => {
  const wc = req.id ? runtimes.get(String(req.id))?.contents : null
  return {
    blocked: blocked.slice(-50),
    fellBack: fellBack.slice(-20),
    reminder: { ...reminder },
    gliding,
    spelling: wc ? wc.session.isSpellCheckerEnabled() : null,
    menu: wc ? menus.get(wc.id) ?? null : null,
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
  for (const key of ['test.youtubeHosts', 'test.redditHosts']) if (key in req) model.setPref(key, req[key])
  return {}
})
