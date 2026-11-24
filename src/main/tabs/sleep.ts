// Tabs you aren't using let their page go (Sleep.swift; studio/01 §9.22-
// §9.26): after the wait the pace sets, counted from when you left them, the
// longest left first, one at a time; never one with a reason to stay awake.

import { model, type TabRecord } from '../model/model'
import { runtimes, onPageSession } from '../views/tabs'
import { savingPower } from '../window/power'

/** Later 2 h, Normal 30 min, Sooner 10 min; `sleep.after` (seconds) wins, for tests. */
export function sleepAfter(): number {
  const forced = model.pref<number>('sleep.after')
  if (typeof forced === 'number' && forced >= 0) return forced
  const pace = model.pref<string>('tabs.sleep.pace')
  const wait = pace === 'later' ? 7200 : pace === 'sooner' ? 600 : 1800
  // Saving power: no later than Sooner (Sleep.swift:88, motion.light).
  return savingPower() ? Math.min(wait, 600) : wait
}

/** Why a tab stays awake, in Sleep.swift's order, or null (awake(because:)). */
export function awakeBecause(t: TabRecord): string | null {
  const win = model.windows.get(t.win)
  if (model.onScreen(t.id)) return 'on screen'
  // Pins in the space on screen; elsewhere they sleep like the rest (their
  // site's notifications are the permissions module's to say).
  if (t.pinID && win && win.space === t.space) return 'pinned'
  if (t.bench) return 'a bench tab'
  if (t.empty) return 'blank'
  if (t.asleep) return 'already asleep'
  if (!runtimes.get(t.id)?.awake) return 'no page'
  if (t.loading) return 'still loading'
  if (keptAwake(t)) return 'kept awake for this site'
  if (t.audible) return 'playing sound'
  if (t.capturing) return 'on a call'
  if ((t.downloads ?? 0) > 0) return 'downloading'
  for (const w of model.windows.values()) {
    const front = w.active[w.space]
    if (front && model.tabs.get(front)?.opener === t.id) return 'the page on screen came from it'
  }
  return null
}

/** Keep This Site Awake (§9.24): the host exactly, any port, http(s) only;
 * a private tab's choice is its own, for as long as it lasts. */
export function siteOf(url: string): string | null {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) && u.hostname ? u.hostname.toLowerCase() : null } catch { return null }
}
export const shyAwake = new Map<string, Set<string>>()
export function keptAwake(t: TabRecord): boolean {
  const site = siteOf(t.url)
  if (!site) return false
  if (t.shy) return !!shyAwake.get(t.id)?.has(site)
  return (model.pref<string[]>('tabs.awakeSites') ?? []).includes(site)
}

const typedScript = `(() => {
  const kinds = new Set(['', 'text', 'email', 'url', 'tel', 'number'])
  for (const el of document.querySelectorAll('textarea, input')) {
    if (el.tagName === 'INPUT' && !kinds.has((el.getAttribute('type') || '').toLowerCase())) continue
    if (el.value.trim() && el.value !== el.defaultValue) return true
  }
  for (const el of document.querySelectorAll('[contenteditable=""], [contenteditable="true"]')) {
    if (el.dataset.searchTyped) return true
  }
  return false
})()`

/** Something typed and not sent, asked of the page apart from its own
 * scripts; a page that doesn't answer in 3 s is passed over (PageDrafts). */
export async function holdsTyping(id: string): Promise<boolean> {
  const wc = runtimes.get(id)?.contents
  if (!wc) return false
  const answer = wc.executeJavaScriptInIsolatedWorld(1001, [{ code: typedScript }]).catch(() => false)
  return Promise.race([answer, new Promise(r => setTimeout(() => r(true), 3000))]) as Promise<boolean>
}

/** Sleep.sleep: checked again at each step, since you may be back by then. */
export async function sleepTab(id: string): Promise<string | null> {
  const t = model.tabs.get(id)
  if (!t) return 'gone'
  const first = awakeBecause(t)
  if (first) return first
  const touched = t.touched
  if (await holdsTyping(id)) return 'holding something typed'
  const again = model.tabs.get(id)
  if (!again) return 'gone'
  const reason = awakeBecause(again)
  if (reason) return reason
  if (again.touched !== touched) return 'page changed'
  return runtimes.get(id)?.sleep() ? null : 'no page'
}

/** Put to Sleep, from the tab's menu: the reason it stays awake, if any. */
export async function putToSleep(id: string): Promise<{ asleep: boolean; awake?: string }> {
  const reason = await sleepTab(id)
  return reason ? { asleep: false, awake: `Stays awake: ${reason}` } : { asleep: true }
}

let running = false

/** One round: every tab left long enough, the longest left first. */
export async function sleepIdle(within = sleepAfter()): Promise<string[]> {
  if (running || model.pref<boolean>('tabs.sleep') === false) return []
  running = true
  const slept: string[] = []
  try {
    const now = Date.now()
    const due = [...model.tabs.values()]
      .filter(t => runtimes.get(t.id)?.awake && !t.asleep && now - (t.touched ?? 0) >= within * 1000 && !awakeBecause(t))
      .sort((a, b) => (a.touched ?? 0) - (b.touched ?? 0))
    for (const t of due) {
      const fresh = model.tabs.get(t.id)
      if (!fresh || now - (fresh.touched ?? 0) < within * 1000) continue
      if (!(await sleepTab(t.id))) slept.push(t.id)
    }
  } finally {
    running = false
  }
  return slept
}

/** Every min(60, max(5, wait/4)) s, worked out once at launch (§9.22). */
let timer: NodeJS.Timeout | null = null
export function startSleeping(): void {
  if (timer) return
  const every = Math.min(60, Math.max(5, sleepAfter() / 4))
  timer = setInterval(() => { void sleepIdle() }, every * 1000)
  timer.unref?.()
}

// A download keeps its tab awake while it runs (§9.23).
onPageSession(s => {
  s.on('will-download', (_e, item, wc) => {
    const entry = [...runtimes.entries()].find(([, r]) => r.contents === wc)
    const t = entry && model.tabs.get(entry[0])
    if (!t) return
    t.downloads = (t.downloads ?? 0) + 1
    item.once('done', () => { const x = model.tabs.get(t.id); if (x) x.downloads = Math.max(0, (x.downloads ?? 1) - 1) })
  })
})
