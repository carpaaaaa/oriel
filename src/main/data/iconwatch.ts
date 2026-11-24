// Icons learned from what the tabs report, and given back (studio/01 §2.12):
// a tab's favicon kept for its page, the tabs of a site taking it when it
// arrives, private tabs' icons forgotten with the last private tab.

import { model, type TabRecord } from '../model/model'
import { benchRequest } from '../bench/server'
import { handle } from '../router'
import { forgetShy, iconFor, iconIndex, learn } from './icons'

model.on('tab-changed', (tab: TabRecord, patch: Partial<TabRecord>) => {
  const icon = patch.favicon
  if (!icon || !tab.url || tab.empty || tab.internal) return
  void learn(tab.url, icon, !!tab.shy)
})

model.on('tab-closed', () => {
  if (![...model.tabs.values()].some(t => t.shy)) forgetShy()
})

benchRequest('data.icon', req => ({ value: iconFor(String(req.url), !!req.shy) ?? null }))
// For the interface: the column's mark before the page has loaded.
handle('data.icon', ({ url, shy }) => iconFor(String(url), !!shy) ?? null)
benchRequest('data.icons', () => ({ index: iconIndex() }))
benchRequest('data.learnIcon', async req => ({ ok: await learn(String(req.page), String(req.icon), !!req.shy) }))
