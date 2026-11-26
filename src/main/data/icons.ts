// Site icons kept on disk, per site and per page (studio/01 §2.12-2.13,
// Icons.swift): icons/pages.json as the Mac writes it,
//   { "<site>": { "<path>": { "light": "<ident>", "seen": <seconds> } } }
// and icons/<ident>.png, ident = the first 16 bytes of SHA-256 of the icon's
// address, in hex. A tab on a site seen before has its icon at once; a page
// that declares none takes the one of the same site's page sharing most of
// its path, then the newest. Private tabs' icons stay in memory, theirs only.
//
// Fetched without cookies, 8 s at most, 60 bytes to 2 MB; decoded as PNG,
// JPEG, or an .ico's PNG or 32/24-bit frame closest to 64 px, and kept as a
// 64 px PNG. SVG and the page's own ranking of its icons are later (§2.14).

import { nativeImage, session, type NativeImage } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dataFile } from '../paths'

interface Entry { light: string; dark?: string; seen: number }
type Index = Record<string, Record<string, Entry>>

const folder = () => dataFile('icons')
let index: Index | null = null
let writing: ReturnType<typeof setTimeout> | null = null
/** Data URLs already read, newest last; about 16 MB at most. */
const memory = new Map<string, string>()
let memoryBytes = 0
/** Private tabs' icons: never written, forgotten with the last private tab. */
const shyIcons = new Map<string, string>()
/** Icon addresses that gave nothing usable this session, or failed lately. */
const failed = new Map<string, number>()
/** Told when a site's icon arrives, for the rows showing it. */
export const iconEvents: { learned: (site: string) => void } = { learned: () => {} }

export const fresh = 7 * 86_400

function load(): Index {
  if (index) return index
  try { index = JSON.parse(readFileSync(path.join(folder(), 'pages.json'), 'utf8')) as Index } catch { index = {} }
  if (!index || typeof index !== 'object') index = {}
  return index
}

function save(): void {
  if (writing) clearTimeout(writing)
  writing = setTimeout(flushIcons, 1000)
}

export function flushIcons(): void {
  if (writing) { clearTimeout(writing); writing = null }
  if (!index) return
  prune()
  mkdirSync(folder(), { recursive: true })
  const file = path.join(folder(), 'pages.json')
  writeFileSync(file + '.tmp', JSON.stringify(index))
  renameSync(file + '.tmp', file)
}

/** Over 4000 pages, the oldest go until 3000 are left. */
function prune(): void {
  const all: [string, string, number][] = []
  for (const [site, pages] of Object.entries(index!)) for (const [p, e] of Object.entries(pages)) all.push([site, p, e.seen])
  if (all.length <= 4000) return
  all.sort((a, b) => a[2] - b[2])
  for (const [site, p] of all.slice(0, all.length - 3000)) {
    delete index![site][p]
    if (!Object.keys(index![site]).length) delete index![site]
  }
}

/** The site: host, and its port when not the scheme's (localhost:3000 and
 * :5173 are two projects). The page: its path, without query or fragment. */
export function siteOf(url: string): { site: string; page: string } | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return { site: u.host.toLowerCase(), page: u.pathname || '/' }
  } catch { return null }
}

export const ident = (iconURL: string) => createHash('sha256').update(iconURL).digest('hex').slice(0, 32)

function remember(key: string, dataURL: string): void {
  memory.delete(key)
  memory.set(key, dataURL)
  memoryBytes += dataURL.length
  for (const [k, v] of memory) {
    if (memoryBytes <= 4 * 1024 * 1024) break
    memory.delete(k)
    memoryBytes -= v.length
  }
}

function read(id: string): string | undefined {
  const hit = memory.get(id)
  if (hit) return hit
  const file = path.join(folder(), id + '.png')
  if (!existsSync(file)) return undefined
  const url = 'data:image/png;base64,' + readFileSync(file).toString('base64')
  remember(id, url)
  return url
}

const segments = (p: string) => p.split('/').filter(Boolean)

/** The entry for a page: its own, else the same site's page sharing most of
 * its path, then the newest; none when the site's pages disagree and none
 * shares a segment or is the front door (the letter is truer than a guess).
 * With and without www. */
function entryFor(url: string): Entry | null {
  const at = siteOf(url)
  if (!at) return null
  const idx = load()
  const sites = [at.site, at.site.startsWith('www.') ? at.site.slice(4) : 'www.' + at.site]
  for (const site of sites) {
    const pages = idx[site]
    if (!pages) continue
    if (pages[at.page]) return pages[at.page]
    const mine = segments(at.page)
    let best: Entry | null = null, bestShared = -1
    for (const [p, e] of Object.entries(pages)) {
      const theirs = segments(p)
      let shared = 0
      while (shared < mine.length && shared < theirs.length && mine[shared] === theirs[shared]) shared++
      if (shared > bestShared || (shared === bestShared && e.seen > (best?.seen ?? -1))) { best = e; bestShared = shared }
    }
    if (!best) continue
    const kinds = new Set(Object.values(pages).map(e => e.light))
    if (bestShared === 0 && kinds.size > 1 && !pages['/']) return null
    if (bestShared === 0 && pages['/']) return pages['/']
    return best
  }
  return null
}

/** The icon for a page as a data URL, if one is kept. */
export function iconFor(url: string, shy = false): string | undefined {
  if (shy) {
    const at = siteOf(url)
    const own = at && (shyIcons.get(at.site + at.page) ?? shyIcons.get(at.site))
    if (own) return own
  }
  const e = entryFor(url)
  return e ? read(e.light) : undefined
}

// learning an icon

/** A PNG or JPEG through nativeImage; an .ico's frame closest to 64 px:
 * an embedded PNG, or a 32- or 24-bit bitmap. Nothing else is decoded. */
export function decode(bytes: Buffer): NativeImage | null {
  if (bytes.length >= 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) return decodeICO(bytes)
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  if (!png && !jpeg) return null
  const image = nativeImage.createFromBuffer(bytes)
  return image.isEmpty() ? null : image
}

function decodeICO(b: Buffer): NativeImage | null {
  const count = Math.min(b.readUInt16LE(4), 32)
  const frames: { size: number; offset: number; length: number }[] = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16
    if (at + 16 > b.length) break
    const size = b[at] || 256
    frames.push({ size, length: b.readUInt32LE(at + 8), offset: b.readUInt32LE(at + 12) })
  }
  frames.sort((x, y) => Math.abs(x.size - 64) - Math.abs(y.size - 64) || y.size - x.size)
  for (const f of frames) {
    if (f.offset + f.length > b.length || f.length < 40) continue
    const data = b.subarray(f.offset, f.offset + f.length)
    if (data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
      const image = nativeImage.createFromBuffer(Buffer.from(data))
      if (!image.isEmpty()) return image
      continue
    }
    const header = data.readUInt32LE(0), width = data.readInt32LE(4), height = Math.abs(data.readInt32LE(8)) / 2, bits = data.readUInt16LE(14)
    if (header < 40 || width <= 0 || width > 256 || height <= 0 || height > 256 || (bits !== 32 && bits !== 24)) continue
    const stride = Math.ceil((width * bits) / 32) * 4
    const pixels = data.subarray(header)
    if (pixels.length < stride * height) continue
    const out = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y++) {
      const row = pixels.subarray((height - 1 - y) * stride) // bottom-up
      for (let x = 0; x < width; x++) {
        const s = x * (bits / 8), d = (y * width + x) * 4
        out[d] = row[s]; out[d + 1] = row[s + 1]; out[d + 2] = row[s + 2]
        out[d + 3] = bits === 32 ? row[s + 3] : 255
      }
    }
    // A 32-bit frame with no alpha at all uses its mask: opaque.
    if (bits === 32 && !out.some((v, i) => i % 4 === 3 && v !== 0)) for (let i = 3; i < out.length; i += 4) out[i] = 255
    const image = nativeImage.createFromBitmap(out, { width, height })
    if (!image.isEmpty()) return image
  }
  return null
}

/** Drawn into a 64 px square, the way it is kept. */
function square(image: NativeImage): Buffer {
  const { width, height } = image.getSize()
  const scale = Math.min(64 / width, 64 / height, 1)
  const fit = scale < 1 ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' }) : image
  return fit.toPNG()
}

let iconSession: Electron.Session | null = null

/** At most 8 s, no cookies, nothing past 2 MB. */
async function fetchIcon(url: string): Promise<Buffer | null> {
  if (url.startsWith('data:')) {
    const m = /^data:[^;,]*(;base64)?,(.*)$/s.exec(url)
    if (!m) return null
    const body = m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]))
    return body.length > 60 && body.length < 2_000_000 ? body : null
  }
  iconSession ??= session.fromPartition('icons')
  const stop = new AbortController()
  const timer = setTimeout(() => stop.abort(), 8000)
  try {
    const res = await iconSession.fetch(url, { signal: stop.signal, credentials: 'omit', redirect: 'follow' } as never)
    if (!res.ok || !res.body) return null
    const chunks: Buffer[] = []
    let size = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size >= 2_000_000) { stop.abort(); return null }
      chunks.push(Buffer.from(value))
    }
    const body = Buffer.concat(chunks)
    return body.length > 60 ? body : null
  } catch { return null } finally { clearTimeout(timer) }
}

/** A page told its icon: kept for its site and path (or, for a private
 * tab, in memory only). Fetched again only when older than a week. */
export async function learn(pageURL: string, iconURL: string, shy = false): Promise<boolean> {
  const at = siteOf(pageURL)
  if (!at || !iconURL) return false
  const id = ident(iconURL)
  const existing = load()[at.site]?.[at.page]
  const now = Math.floor(Date.now() / 1000)
  if (!shy && existing?.light === id && now - existing.seen < fresh && read(id)) return true
  const known = !shy && read(id)
  let dataURL = known || undefined
  if (!dataURL) {
    const until = failed.get(iconURL)
    if (until && until > Date.now()) return false
    const bytes = await fetchIcon(iconURL)
    const image = bytes && decode(bytes)
    if (!image) { failed.set(iconURL, Date.now() + 60_000); return false }
    const png = square(image)
    dataURL = 'data:image/png;base64,' + png.toString('base64')
    if (!shy) {
      mkdirSync(folder(), { recursive: true })
      const file = path.join(folder(), id + '.png')
      writeFileSync(file + '.tmp', png)
      renameSync(file + '.tmp', file)
      remember(id, dataURL)
    }
  }
  if (shy) {
    shyIcons.set(at.site + at.page, dataURL)
    shyIcons.set(at.site, dataURL)
  } else {
    const idx = load()
    ;(idx[at.site] ??= {})[at.page] = { light: id, seen: now }
    save()
  }
  iconEvents.learned(at.site)
  return true
}

/** An icon another browser kept for a site, worth the whole site until a
 * page says otherwise (seen 0, Icons.adopt). Not over one already here. */
export function adopt(pageURL: string, png: Buffer): boolean {
  const at = siteOf(pageURL)
  if (!at) return false
  const idx = load()
  if (idx[at.site] && Object.keys(idx[at.site]).length) return false
  const image = decode(png)
  if (!image) return false
  const bytes = square(image)
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 32)
  mkdirSync(folder(), { recursive: true })
  writeFileSync(path.join(folder(), id + '.png'), bytes)
  idx[at.site] = { '/': { light: id, seen: 0 } }
  save()
  return true
}

/** The last private tab closed: their icons go. */
export function forgetShy(): void { shyIcons.clear() }

/** A page forgotten from the history: out of the index, and its file when
 * no page wears it any more. Everything, for Clear History. */
export function forgetPage(url: string): void {
  const at = siteOf(url)
  const idx = load()
  const e = at && idx[at.site]?.[at.page]
  if (!at || !e) return
  delete idx[at.site][at.page]
  if (!Object.keys(idx[at.site]).length) delete idx[at.site]
  const worn = Object.values(idx).some(pages => Object.values(pages).some(x => x.light === e.light))
  if (!worn) { try { rmSync(path.join(folder(), e.light + '.png')) } catch {} memory.delete(e.light) }
  save()
}

export function forgetAll(): void {
  index = {}
  memory.clear()
  memoryBytes = 0
  try { rmSync(folder(), { recursive: true, force: true }) } catch {}
  save()
}

export function iconIndex(): Index { return load() }
