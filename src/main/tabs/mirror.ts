// Settings › Tabs › Windows › Same tabs in every window (`tabs.mirror`,
// Twins.swift; studio/01 §10.34-§10.36): each window lists the same open
// tabs in a space, as it lists the same pins. Each holds its own tab for
// each, its own page; only what makes the tab that tab is shared: its twin
// id, its page, its title, its name, its group, its place in the row. A row
// changed in one window is said once a turn and the others follow
// (model.applyTwins). Never a private tab, an empty one, a pin, a bench tab
// or one of Oriel's own pages. Turned on, every window's tabs come together.

import { model, newID, type TabRecord, type WindowRecord } from '../model/model'
import type { GroupView } from '../../shared/state'
import { benchRequest } from '../bench/server'

interface TwinDef { id: string; url: string; title: string; name?: string; group?: string }

const rows = new Map<string, TwinDef[]>()
const groupsBy = new Map<string, GroupView[]>()
const known = new Set<string>()
/** Windows that took the twins before saying anything (twinsJoined). */
const joined = new Set<string>()
let applying = false
let on = false

const twinnable = (t: TabRecord) => !t.shy && !t.bench && !t.empty && !t.pinID && !t.internal && /^(https?|file):/i.test(t.url)

function defsOf(win: WindowRecord, space: string): TwinDef[] {
  return model.spaceTabs(win, space).map(id => model.tabs.get(id)!).filter(t => t && twinnable(t)).map(t => {
    if (!t.twinID) t.twinID = newID()
    const d: TwinDef = { id: t.twinID, url: t.url, title: t.title }
    if (t.name) d.name = t.name
    if (t.groupID) d.group = t.groupID
    return d
  })
}

/** A window's row for a space as it now is, passed to the others when it
 * differs from what was said. */
function say(win: WindowRecord, space: string): void {
  if (!on || win.shy || !win.loaded.has(space) || !joined.has(win.id)) return
  const defs = defsOf(win, space)
  const groups = (win.groupsBy[space] ?? []).filter(g => defs.some(d => d.group === g.id)).map(g => ({ ...g, folded: false }))
  const before = rows.get(space)
  if (before && JSON.stringify(before) === JSON.stringify(defs) && JSON.stringify(groupsBy.get(space) ?? []) === JSON.stringify(groups)) return
  rows.set(space, defs)
  groupsBy.set(space, groups)
  defs.forEach(d => known.add(d.id))
  applying = true
  try {
    for (const other of model.windows.values()) if (other !== win && joined.has(other.id)) model.applyTwins(other, space, defs, groups, known)
  } finally { applying = false }
}

/** A window takes what the others said before it says anything: an empty
 * row would otherwise close every other window's tabs. */
function join(win: WindowRecord): void {
  if (!on || win.shy || joined.has(win.id)) return
  applying = true
  try {
    for (const space of win.loaded) {
      const defs = rows.get(space)
      if (defs) model.applyTwins(win, space, defs, groupsBy.get(space) ?? [], known)
    }
  } finally { applying = false }
  joined.add(win.id)
  for (const space of win.loaded) say(win, space)
}

const soon = new Set<string>()
model.on('window-changed', (id: string, slices: string[]) => {
  if (slices.includes('prefs')) toggled()
  if (!on || applying || !(slices.includes('tabs') || slices.includes('groups'))) return
  if (soon.has(id)) return
  soon.add(id)
  setImmediate(() => {
    soon.delete(id)
    const win = model.windows.get(id)
    if (!win) return
    if (!joined.has(win.id)) { join(win); return }
    for (const space of win.loaded) say(win, space)
  })
})
model.on('window-opened', (id: string) => setImmediate(() => { toggled(); const w = model.windows.get(id); if (w) join(w) }))
model.on('space-changed', (win: WindowRecord, space: string) => {
  if (!on || !joined.has(win.id)) return
  const defs = rows.get(space)
  applying = true
  try { if (defs) model.applyTwins(win, space, defs, groupsBy.get(space) ?? [], known) } finally { applying = false }
  say(win, space)
})

/** On: what was said before is nothing to go by; every window joins in
 * turn, so nothing any had is lost. Off: each keeps what it has. */
function toggled(): void {
  const now = model.pref<boolean>('tabs.mirror') === true
  if (now === on) return
  on = now
  rows.clear(); groupsBy.clear(); known.clear(); joined.clear()
  if (!on) return
  for (const win of model.windows.values()) join(win)
  // A second turn: the first window hears what the later ones brought.
  for (const win of model.windows.values()) for (const space of win.loaded) say(win, space)
}

benchRequest('settingsb.twins', () => ({ on, rows: Object.fromEntries(rows), joined: [...joined] }))
