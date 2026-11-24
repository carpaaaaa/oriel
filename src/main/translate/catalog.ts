// Mozilla's models, as Firefox finds them: the translations-models collection
// of Firefox's Remote Settings, each record one file of a language pair
// (model, lexical shortlist, vocabulary) with its size and SHA-256, the file
// itself on Mozilla's attachments CDN. The list is kept in Oriel's folder and
// read again after a week, or when a language isn't in it. Files are fetched
// once, checked, and kept: the next page in that language needs no network.
// Only the list and the model files are ever fetched; never a word of a page.
// Owned by the translate module.

import { app, session } from 'electron'
import { brand } from '../../shared/brand'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dataFile, probe } from '../paths'
import type { ModelFiles } from './engine'
import { testEnv } from '../testhooks'

const RECORDS = 'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records'
const FILES = 'https://firefox-settings-attachments.cdn.mozilla.net/'
const WEEK = 7 * 24 * 3600_000

/** Test worlds only: a local list and files, and a models folder shared by
 * runs so the real model isn't fetched for every test. */
const testing = !!probe
const recordsURL = (testing && testEnv('SEARCH_TRANSLATE_CATALOG')) || RECORDS
const filesBase = testing && testEnv('SEARCH_TRANSLATE_CATALOG') ? new URL('/', recordsURL).href : FILES
export const modelsFolder = () => (testing && testEnv('SEARCH_TRANSLATE_MODELS')) || dataFile('Translations')

interface ModelRecord {
  name: string
  fromLang: string
  toLang: string
  fileType: 'model' | 'lex' | 'vocab' | 'srcvocab' | 'trgvocab'
  version: string
  filter_expression?: string | null
  attachment: { hash: string; size: number; location: string; filename: string }
}

/** One pair's files at one version. */
export interface Pair { from: string; to: string; version: string; files: ModelRecord[] }

let records: ModelRecord[] | null = null
let fetchedAt = 0
/** What was fetched, for the bench: the list, and each file. */
export const fetched: string[] = []

// A session of its own: no cookies, nothing of the profile's. It names
// itself plainly (Mozilla's CDN turns away Electron's own user agent).
let made: Electron.Session | null = null
const net = () => {
  if (!made) { made = session.fromPartition('oriel-translations'); made.setUserAgent(`${brand.name}/${app.getVersion()}`) }
  return made
}

function cacheFile() { return path.join(modelsFolder(), 'catalog.json') }

function readCache(): void {
  if (records) return
  try {
    const kept = JSON.parse(readFileSync(cacheFile(), 'utf8')) as { at: number; data: ModelRecord[] }
    records = kept.data
    fetchedAt = kept.at
  } catch {}
}

async function refresh(): Promise<void> {
  fetched.push(recordsURL)
  const res = await net().fetch(recordsURL, { credentials: 'omit', cache: 'no-store' })
  if (!res.ok) throw new Error(`list ${res.status}`)
  const body = await res.json() as { data: ModelRecord[] }
  if (!Array.isArray(body.data)) throw new Error('no list')
  records = body.data
  fetchedAt = Date.now()
  mkdirSync(modelsFolder(), { recursive: true })
  writeFileSync(cacheFile(), JSON.stringify({ at: fetchedAt, data: records }))
}

/** Firefox on Windows, release channel: these filters let a record through. */
const forUs = (r: ModelRecord) => !r.filter_expression || r.filter_expression.trim() === "env.appinfo.OS != 'Android' || env.channel != 'release'"
const released = (r: ModelRecord) => /^\d+(\.\d+)*$/.test(r.version)
const parts = (v: string) => v.split('.').map(Number)
const newer = (a: string, b: string) => { const x = parts(a), y = parts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0 }
const whole = (files: ModelRecord[]) => {
  const has = (t: string) => files.some(f => f.fileType === t)
  return has('model') && has('lex') && (has('vocab') || (has('srcvocab') && has('trgvocab')))
}

/** The pair's files to use: the fast models (major version 1, Firefox's
 * "tiny") where Mozilla has them, as the Mac picks the low-latency model
 * (03 §6.3), the newest otherwise. */
function choose(from: string, to: string): Pair | null {
  const versions = new Map<string, ModelRecord[]>()
  for (const r of records ?? []) {
    if (r.fromLang !== from || r.toLang !== to || !forUs(r) || !released(r)) continue
    const list = versions.get(r.version) ?? []
    if (!list.some(x => x.fileType === r.fileType)) list.push(r)
    versions.set(r.version, list)
  }
  const complete = [...versions.entries()].filter(([, f]) => whole(f)).sort((a, b) => newer(b[0], a[0]))
  const pick = complete.find(([v]) => v.startsWith('1.')) ?? complete[0]
  return pick ? { from, to, version: pick[0], files: pick[1] } : null
}

/** The list, from the cache when it is fresh enough or the network fails. */
export async function catalog(force = false): Promise<void> {
  readCache()
  if (records && !force && Date.now() - fetchedAt < WEEK) return
  try {
    await refresh()
  } catch (error) {
    if (!records) throw error
  }
}

/** The pairs from → to needs: one, or two through English. Null when Mozilla
 * has no way between them. */
export async function route(from: string, to: string): Promise<Pair[] | null> {
  await catalog()
  const find = (a: string, b: string) => choose(a, b)
  let direct = find(from, to)
  if (!direct && Date.now() - fetchedAt > 3600_000) { await catalog(true).catch(() => {}); direct = find(from, to) }
  if (direct) return [direct]
  if (from === 'en' || to === 'en') return null
  const a = find(from, 'en'), b = find('en', to)
  return a && b ? [a, b] : null
}

const folderOf = (p: Pair) => path.join(modelsFolder(), `${p.from}-${p.to}`, p.version)
const fileOf = (p: Pair, r: ModelRecord) => path.join(folderOf(p), r.name)
const there = (p: Pair, r: ModelRecord) => { try { return statSync(fileOf(p, r)).size === r.attachment.size } catch { return false } }

/** All of the pair's files are on this PC already. */
export const kept = (p: Pair) => p.files.every(r => there(p, r))

/** What's on this PC for from → to without asking the network (a quote in
 * another language is translated only with a language already here, as on
 * the Mac). */
export function keptRoute(from: string, to: string): Pair[] | null {
  readCache()
  const direct = choose(from, to)
  if (direct) return kept(direct) ? [direct] : null
  if (from === 'en' || to === 'en') return null
  const a = choose(from, 'en'), b = choose('en', to)
  return a && b && kept(a) && kept(b) ? [a, b] : null
}

/** The bytes still to fetch for these pairs. */
export const missing = (pairs: Pair[]) => pairs.flatMap(p => p.files.filter(r => !there(p, r)).map(r => ({ p, r })))

/** Fetches what's missing, each file checked against its SHA-256 before it
 * is kept; `progress` hears 0 to 1. */
export async function download(pairs: Pair[], progress: (share: number) => void, cancelled: () => boolean): Promise<void> {
  const todo = missing(pairs)
  const total = todo.reduce((n, x) => n + x.r.attachment.size, 0) || 1
  let done = 0
  for (const { p, r } of todo) {
    if (cancelled()) throw new Error('cancelled')
    mkdirSync(folderOf(p), { recursive: true })
    const target = fileOf(p, r)
    const part = target + '.part'
    const url = new URL(r.attachment.location, filesBase).href
    fetched.push(url)
    const res = await net().fetch(url, { credentials: 'omit' })
    if (!res.ok || !res.body) throw new Error(`file ${res.status}`)
    const hash = createHash('sha256')
    const out = createWriteStream(part)
    const reader = res.body.getReader()
    try {
      for (;;) {
        const { done: end, value } = await reader.read()
        if (end) break
        if (cancelled()) throw new Error('cancelled')
        hash.update(value)
        if (!out.write(value)) await new Promise(r => out.once('drain', r))
        done += value.byteLength
        progress(Math.min(1, done / total))
      }
      await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
    } catch (error) {
      out.destroy()
      rmSync(part, { force: true })
      throw error
    }
    if (hash.digest('hex') !== r.attachment.hash) { rmSync(part, { force: true }); throw new Error(`${r.name} didn't match its checksum`) }
    renameSync(part, target)
  }
  progress(1)
}

/** What the engine loads for a pair. */
export function filesFor(p: Pair): ModelFiles {
  const of = (t: string) => p.files.find(r => r.fileType === t)
  const model = of('model')!
  const vocabs = of('vocab') ? [of('vocab')!] : [of('srcvocab')!, of('trgvocab')!]
  return {
    key: `${p.from}-${p.to}-${p.version}`,
    model: fileOf(p, model),
    lex: fileOf(p, of('lex')!),
    vocabs: vocabs.map(v => fileOf(p, v)),
    // intgemm8 files hold plain int8 numbers; .alphas ones carry their scales.
    precision: /intgemm8/.test(model.name) ? 'int8shiftAll' : 'int8shiftAlphaAll',
  }
}

/** Every language the list can translate from and into, through English. */
export function knownLanguages(): string[] {
  readCache()
  const set = new Set<string>()
  for (const r of records ?? []) if (forUs(r) && released(r)) { set.add(r.fromLang); set.add(r.toLang) }
  return [...set]
}

