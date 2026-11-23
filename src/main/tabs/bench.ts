// The tabs module's bench requests ("tabs.<name>"): the model as tests read
// it, and the few nudges a test needs that no person makes (moving a tab's
// last look back in time, crashing a page, a sleep round now).

import { benchRequest } from '../bench/server'
import { model, type TabRecord, type WindowRecord } from '../model/model'
import { runtimes, visits } from '../views/tabs'
import { controllerFor } from '../views/window'
import { sleepIdle, sleepTab, awakeBecause } from './sleep'

function tabOut(t: TabRecord) {
  return { ...t, label: model.label(t), live: !!runtimes.get(t.id)?.awake, kept: model.keeps.has(t.id) }
}

function windowOut(w: WindowRecord) {
  const rows: Record<string, unknown> = {}
  for (const space of Object.keys(w.tabs)) {
    rows[space] = {
      tabs: w.tabs[space].map(id => model.tabs.get(id)).filter(Boolean).map(t => tabOut(t!)),
      active: w.active[space] ?? null,
      groups: w.groupsBy[space] ?? [],
      splits: w.splitsBy[space] ?? [],
    }
  }
  const tabs = model.spaceTabs(w).map(id => model.tabs.get(id)).filter(Boolean).map(t => tabOut(t!))
  return {
    id: w.id, space: w.space, shy: w.shy, primary: model.primary() === w,
    tabs, activeID: w.active[w.space] ?? null, groups: w.groups, splits: w.splits,
    pins: model.pinViews(w), pinFolders: model.folderViews(w),
    rows, loaded: [...w.loaded],
    ghosts: w.ghosts.map(g => ({ ...g, kept: model.keeps.has(`ghost:${g.id}`) })),
    reopenTitle: model.reopenTitle(w), picked: w.picked, switcher: w.switcher,
    recent: w.recent, targets: model.shortcutTargets(w), switcherOrder: model.switcherOrder(w),
    linkRun: w.linkRun ? { ...w.linkRun, opened: [...w.linkRun.opened] } : null,
  }
}

const pickWindow = (id?: unknown) => {
  const w = typeof id === 'string' ? model.windows.get(id) : (model.front && model.windows.get(model.front)) || [...model.windows.values()][0]
  if (!w) throw new Error('no window')
  return w
}

benchRequest('tabs.state', () => ({
  windows: [...model.windows.values()].map(windowOut),
  spaces: model.spaces, homeSpace: model.homeSpace, spacesOn: model.spacesOn(),
  pinsBySpace: Object.fromEntries(model.pinsBySpace), sharedPins: model.sharedPins,
  folders: Object.fromEntries(model.folders), closedWindows: model.closedWindows.length,
  front: model.front,
}))

benchRequest('tabs.visits', () => ({ visits }))

/** A tab's last look moved back, so nothing waits for a clock. */
benchRequest('tabs.age', req => {
  const t = model.tabs.get(String(req.id))
  if (!t) throw new Error('no tab')
  t.touched = (t.touched ?? Date.now()) - Number(req.seconds) * 1000
  return { touched: t.touched }
})

/** A sleep round now (`within` seconds, the pace's wait otherwise). */
benchRequest('tabs.tidy', async req => ({ slept: await sleepIdle(req.within === undefined ? undefined : Number(req.within)) }))
benchRequest('tabs.sleep', async req => ({ reason: await sleepTab(String(req.id)) }))
benchRequest('tabs.awake', req => { const t = model.tabs.get(String(req.id)); return { reason: t ? awakeBecause(t) : 'gone' } })

/** What only the page or the system would say (a call, a download). */
benchRequest('tabs.fake', req => {
  const patch = req.patch as Partial<TabRecord>
  model.updateTab(String(req.id), patch)
  const t = model.tabs.get(String(req.id))
  if (t && 'downloads' in patch) t.downloads = patch.downloads
  return {}
})

benchRequest('tabs.crash', req => {
  const wc = runtimes.get(String(req.id))?.contents
  if (!wc) throw new Error('tab has no page')
  wc.forcefullyCrashRenderer()
  return {}
})

/** Every row and windows.json written now, as at quitting, but staying up. */
benchRequest('tabs.write', () => {
  for (const w of model.windows.values()) {
    for (const space of w.loaded) if (model.spaceOf(space)) model.writeRow(w, space, true)
  }
  model.writeWindows(true)
  return {}
})

/** Close a window as its close button does. */
benchRequest('tabs.closeWindow', req => {
  const w = pickWindow(req.window)
  controllerFor(w.id)?.base.close()
  return {}
})
