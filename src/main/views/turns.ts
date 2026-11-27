// Pages out of sight load a few at a time (Search 1.0.22, LoadTurns.swift).
//
// A page loading runs its scripts on a processor of its own, and twenty tabs
// reloaded at once, or a run of links opened behind the one you read, had
// twenty pages each wanting a whole processor: more than a PC has, and the
// window stalled while they loaded. So a page out of sight starts loading
// only while fewer than `at` others out of sight are; the rest wait, in the
// order they were asked for. A page on screen never waits, and one that
// comes on screen while waiting starts at once. A turn ends as the page
// stops loading, two seconds on if it never started, or twenty seconds on
// whatever it is doing: a page that never says it is done doesn't hold up
// the rest for good. Tabs that sleep, or wait to be looked at
// (tabs.lazy), load as before: when they are looked at.

import os from 'node:os'
import type { WebContents } from 'electron'
import type { ID } from '../../shared/state'
import { addDefaults } from '../../shared/prefs'
import { model } from '../model/model'

addDefaults({
  /** How many pages out of sight load at once; 0 is half the processors,
   * from two to eight (the bench and measurements set their own). */
  'load.turns': 0,
})

/** How many pages out of sight load at once. */
export function turnsAt(): number {
  const set = Number(model.pref<number>('load.turns') ?? 0)
  return set > 0 ? Math.floor(set) : Math.min(8, Math.max(2, Math.floor(os.availableParallelism() / 2)))
}

/** A tab's page, as far as its turn goes. */
export interface Loader { id: ID; readonly contents: WebContents | null }

/** A load: true when it asked for a page, false when it found it was no
 * longer wanted (the page gone, another load after it). */
export type Load = () => boolean

interface Turn { wc: WebContents | null; started: boolean; timers: NodeJS.Timeout[]; off: () => void }

const turns = new Map<Loader, Turn>()
let waiting: { who: Loader; load: Load }[] = []

const inSight = (who: Loader) => model.onScreen(who.id)

/** `load` for `who`: now, if it is on screen or a turn is free; otherwise
 * once one is. A load asked for again replaces the one waiting. */
export function startLoad(who: Loader, load: Load): void {
  waiting = waiting.filter(w => w.who !== who)
  finish(who, false)
  if (inSight(who)) load()
  else if (turns.size < turnsAt()) run(who, load)
  else waiting.push({ who, load })
  next()
}

/** On screen: what it waits for goes now, and the turn it held is given to another. */
export function shownLoad(who: Loader): void {
  finish(who)
  const at = waiting.findIndex(w => w.who === who)
  if (at < 0) return
  const [w] = waiting.splice(at, 1)
  w.load()
}

/** The page went (closed, put to sleep): nothing of it waits, its turn is given back. */
export function forgetLoad(who: Loader): void {
  waiting = waiting.filter(w => w.who !== who)
  finish(who)
}

/** Whether a load of this tab waits for its turn. */
export function waitsForTurn(who: Loader): boolean { return waiting.some(w => w.who === who) }

/** For the bench: who loads in a turn, and who waits. */
export function turnsNow(): { at: number; loading: ID[]; waiting: ID[] } {
  return { at: turnsAt(), loading: [...turns.keys()].map(w => w.id), waiting: waiting.map(w => w.who.id) }
}

function run(who: Loader, load: Load): void {
  const wc = who.contents
  const turn: Turn = { wc, started: false, timers: [], off: () => {} }
  turns.set(who, turn)
  if (wc) {
    const started = () => { turn.started = true }
    const stopped = () => { if (turn.started && turns.get(who) === turn) finish(who) }
    const gone = () => { if (turns.get(who) === turn) finish(who) }
    wc.on('did-start-loading', started)
    wc.on('did-stop-loading', stopped)
    wc.once('destroyed', gone)
    turn.off = () => {
      if (wc.isDestroyed()) return
      wc.off('did-start-loading', started)
      wc.off('did-stop-loading', stopped)
      wc.off('destroyed', gone)
    }
  }
  for (const [after, unlessStarted] of [[2000, true], [20_000, false]] as const) {
    const timer = setTimeout(() => {
      if (turns.get(who) !== turn || (unlessStarted && turn.started)) return
      finish(who)
    }, after)
    timer.unref?.()
    turn.timers.push(timer)
  }
  // Asked again while still loading, it may never stop loading in between
  // to say it started.
  if (!load()) finish(who)
  else if (wc && !wc.isDestroyed() && wc.isLoading()) turn.started = true
}

function finish(who: Loader, more = true): void {
  const turn = turns.get(who)
  if (!turn) return
  turns.delete(who)
  turn.timers.forEach(clearTimeout)
  turn.off()
  if (more) next()
}

function next(): void {
  while (turns.size < turnsAt() && waiting.length) {
    const first = waiting.shift()!
    if (inSight(first.who)) first.load()
    else run(first.who, first.load)
  }
}
