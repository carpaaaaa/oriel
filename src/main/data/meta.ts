// The data module's own small settings, under the keys the Mac keeps in
// UserDefaults: import.records, bookmarks.top, bookmarks.lastFolder.<file>
// (studio/05 §1.11, §5). In data.json rather than prefs.json: the records
// carry every imported bookmark's id, and prefs travel to every window.

import { readJSON, writeJSON, writeJSONNow, toAppleDate, fromAppleDate } from '../model/persist'

type Meta = Record<string, unknown>
let meta: Meta | null = null
const file = 'data.json'

function all(): Meta { return (meta ??= readJSON<Meta>(file, {})) }

export function getMeta<T>(key: string): T | undefined { return all()[key] as T | undefined }
export function setMeta(key: string, value: unknown): void {
  const m = all()
  if (value === undefined) delete m[key]
  else m[key] = value
  writeJSON(file, () => m, 200)
}
export function flushMeta(): void { if (meta) writeJSONNow(file, meta) }

/** What was brought over from a browser, and when (ImportRecord.swift). */
export interface ImportRecord {
  date: number
  bookmarks: number
  places: number
  passwords: number
  bookmarkIDs: string[]
}

type Stored = Omit<ImportRecord, 'date'> & { date: number }

export const records = {
  all(): Record<string, ImportRecord> {
    const raw = getMeta<Record<string, Stored>>('import.records') ?? {}
    return Object.fromEntries(Object.entries(raw).map(([k, r]) => [k, { ...r, date: fromAppleDate(r.date), bookmarkIDs: r.bookmarkIDs ?? [] }]))
  },
  of(name: string): ImportRecord | undefined { return records.all()[name] },
  /** What an import just added, on top of what was noted before. */
  note(name: string, add: { ids?: string[]; bookmarks?: number; places?: number; passwords?: number }): void {
    const raw = getMeta<Record<string, Stored>>('import.records') ?? {}
    const r = raw[name] ?? { date: 0, bookmarks: 0, places: 0, passwords: 0, bookmarkIDs: [] }
    r.date = toAppleDate(Date.now())
    r.bookmarks += add.bookmarks ?? 0
    r.places += add.places ?? 0
    r.passwords += add.passwords ?? 0
    r.bookmarkIDs = [...(r.bookmarkIDs ?? []), ...(add.ids ?? [])]
    raw[name] = r
    setMeta('import.records', raw)
  },
  /** Its bookmarks taken back out: what is recorded of them goes too. */
  forgetBookmarks(name: string): void {
    const raw = getMeta<Record<string, Stored>>('import.records') ?? {}
    if (!raw[name]) return
    raw[name].bookmarkIDs = []
    raw[name].bookmarks = 0
    setMeta('import.records', raw)
  },
}

/** Which browser filled the empty top level of the bookmarks. */
export const top = {
  get: () => getMeta<string>('bookmarks.top'),
  set: (name: string) => setMeta('bookmarks.top', name),
}
