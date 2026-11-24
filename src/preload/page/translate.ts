// Translate Page, the page's side (studio/03 §6.3; Translate.swift's script),
// in Oriel's isolated world, never the page's. It reads the page's words:
// text, and the title, alt, placeholder and aria-label attributes, in the
// page and its open shadow roots. Code, fields, editable areas and whatever
// the page marks translate="no" or .notranslate are left alone. A
// paragraph's inline text goes as one unit, its links and bold as separate
// parts, so each piece comes back to its own node; what is on screen goes
// first, in slices, each put back as it comes. Only text node values and
// those four attributes are ever written, each original kept beside it:
// no element is added or removed (React keeps working) and Show Original
// puts back exactly what was there. What the page adds later follows (a
// MutationObserver) until Show Original or the next page. Nothing runs
// until a translation starts. Owned by the translate module.

import { ipcRenderer } from 'electron'

type Unit = [number, string[], boolean[], boolean[]]
type Target = { fixed: true } | { node: Text; rec: Rec; fixed?: false } | { el: Element; attr: string; rec: Rec; fixed?: false }
interface Rec { orig: string; ours?: string | null; sent?: string | null; kept?: string | null }
interface Run { block: Node | null; parts: string[]; gaps: boolean[]; targets: Target[]; chars: number; space: boolean; at: Node | null }
interface Collected { id: number; parts: string[]; gaps: boolean[]; fixed: boolean[]; at: Node | null }

// Left as they are, with everything in them.
const SKIP: Record<string, 1> = { script: 1, style: 1, noscript: 1, textarea: 1, input: 1, select: 1, option: 1, code: 1, pre: 1,
  kbd: 1, samp: 1, var: 1, svg: 1, math: 1, canvas: 1, template: 1, iframe: 1, frame: 1, object: 1, embed: 1, video: 1, audio: 1, head: 1 }
// Inline: a sentence goes on through them.
const INLINE: Record<string, 1> = { a: 1, abbr: 1, b: 1, bdi: 1, bdo: 1, big: 1, cite: 1, data: 1, del: 1, dfn: 1, em: 1, font: 1,
  i: 1, ins: 1, label: 1, mark: 1, nobr: 1, q: 1, s: 1, small: 1, span: 1, strike: 1, strong: 1, sub: 1, sup: 1, time: 1, tt: 1,
  u: 1, img: 1, wbr: 1, code: 1, kbd: 1, samp: 1, var: 1 }
// Read as part of the sentence around them, never written.
const FIXED: Record<string, 1> = { code: 1, kbd: 1, samp: 1, var: 1 }
const ATTRS = ['title', 'alt', 'placeholder', 'aria-label']
const LETTER = /\p{L}/u
/** The page's <title> too (Translate.swift does): off, see collect(). */
const TITLE = false as boolean
const SPACE = /\S/

/** One page's translation state: the Mac's __searchTr, as a closure. */
function translator(dirty: () => void) {
  const texts = new Map<Text, Rec>()
  const attrs = new Map<Element, Record<string, Rec>>()
  const units: ({ targets: Target[] } | null)[] = []
  const watched: Node[] = []
  let touched: Node[] = []
  let whole = true
  let applying = false
  let timer: ReturnType<typeof setTimeout> | 0 = 0
  let run: Run | null = null
  let out: Collected[] | null = null

  const pending = (rec: Rec, v: string) => rec.ours !== v && rec.sent !== v && rec.kept !== v
  function closed(el: Element): boolean {
    if (el.getAttribute('translate') === 'no') return true
    if (el.classList?.contains('notranslate')) return true
    const c = el.getAttribute('contenteditable')
    return c !== null && c !== 'false'
  }
  function blockOf(n: Node): Node | null {
    let el = n.parentNode
    while (el && el.nodeType === 1 && INLINE[(el as Element).localName]) el = el.parentNode
    return el
  }
  function close(): void {
    if (run && run.targets.some(t => !t.fixed)) {
      const id = units.length
      units.push({ targets: run.targets })
      out!.push({ id, parts: run.parts, gaps: run.gaps, fixed: run.targets.map(t => !!t.fixed), at: run.at })
    }
    run = null
  }
  function part(text: string, target: Target, at: Node | null, block: Node | null, lead: boolean): void {
    if (run && (run.block !== block || run.parts.length >= 16 || run.chars + text.length > 1500)) close()
    if (!run) run = { block, parts: [], gaps: [], targets: [], chars: 0, space: false, at }
    run.gaps.push(run.parts.length > 0 && (run.space || lead))
    run.parts.push(text.trim())
    run.targets.push(target)
    run.chars += text.length
    run.space = /\s$/.test(text)
  }
  function fixedPart(el: Element): void {
    const t = el.textContent ?? ''
    if (!SPACE.test(t)) { if (run) run.space = true; return }
    part(t, { fixed: true }, el, blockOf(el), /^\s/.test(t))
  }
  function attributes(el: Element): void {
    const name = el.localName
    for (const a of ATTRS) {
      if (a === 'alt' && name !== 'img' && name !== 'area' && name !== 'input') continue
      if (a === 'placeholder' && name !== 'input' && name !== 'textarea') continue
      const v = el.getAttribute(a)
      if (!v || !LETTER.test(v)) continue
      let map = attrs.get(el)
      if (!map) { map = {}; attrs.set(el, map) }
      let rec = map[a]
      if (rec && !pending(rec, v)) continue
      if (!rec) rec = map[a] = { orig: v }
      else if (rec.ours !== v) { rec.orig = v; rec.ours = null }
      rec.kept = null; rec.sent = v
      const id = units.length
      units.push({ targets: [{ el, attr: a, rec }] })
      out!.push({ id, parts: [v.trim()], gaps: [false], fixed: [false], at: el })
    }
  }
  // An element as the walk meets it: what it says about the sentence being
  // read, and whether to go into it.
  function element(el: Element): number {
    const name = el.localName
    if (name === 'br') { close(); return NodeFilter.FILTER_SKIP }
    if (closed(el)) {
      if (INLINE[name]) fixedPart(el); else close()
      return NodeFilter.FILTER_REJECT
    }
    if (el.hasAttribute('title') || el.hasAttribute('alt') || el.hasAttribute('placeholder') || el.hasAttribute('aria-label')) attributes(el)
    if (SKIP[name]) {
      if (FIXED[name]) fixedPart(el); else close()
      return NodeFilter.FILTER_REJECT
    }
    if (el.shadowRoot) { close(); watch(el.shadowRoot); walk(el.shadowRoot); close() }
    if (!INLINE[name]) close()
    return NodeFilter.FILTER_SKIP
  }
  function text(n: Text): void {
    const v = n.nodeValue
    if (!v || !SPACE.test(v)) { if (run) run.space = true; return }
    const block = blockOf(n)
    if (!LETTER.test(v)) { part(v, { fixed: true }, n.parentNode, block, /^\s/.test(v)); return }
    let rec = texts.get(n)
    if (rec && !pending(rec, v)) { close(); return }
    if (!rec) { rec = { orig: v }; texts.set(n, rec) } else if (rec.ours !== v) { rec.orig = v; rec.ours = null }
    rec.kept = null; rec.sent = v
    part(v, { node: n, rec }, n.parentNode, block, /^\s/.test(v))
  }
  function walk(root: Node): void {
    const doc = (root as Node).ownerDocument ?? (root as Document)
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.nodeType === 1 ? element(n as Element) : NodeFilter.FILTER_ACCEPT),
    })
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeType === 3) text(n as Text)
    close()
  }
  // Whether something that changed is somewhere the walk goes.
  function open(el: Node): boolean {
    for (let e: Node | null = el; e;) {
      if (e.nodeType === 11) { e = (e as ShadowRoot).host; continue }
      if (e.nodeType !== 1) { e = e.parentNode; continue }
      if (SKIP[(e as Element).localName] || closed(e as Element)) return false
      e = e.parentNode
    }
    return true
  }
  function top(el: Element | null): number {
    if (!el?.getBoundingClientRect) return 1e9
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return 1e8
    return r.bottom < 0 ? 1e7 - r.bottom : r.top
  }
  function changed(node: Node | null): void {
    if (!node) return
    if (!whole) touched.push(node)
    if (touched.length > 200) { whole = true; touched = [] }
    if (!timer) timer = setTimeout(() => { timer = 0; dirty() }, 300)
  }
  const observer = new MutationObserver(records => {
    if (applying) return
    for (const r of records) {
      const t = r.target
      if (r.type === 'characterData') {
        const k = texts.get(t as Text)
        if (k && (k.ours === t.nodeValue || k.sent === t.nodeValue)) continue
        changed(t.parentNode)
      } else if (r.type === 'attributes') {
        const rec = attrs.get(t as Element)?.[r.attributeName!]
        const v = (t as Element).getAttribute(r.attributeName!)
        if (rec && (rec.ours === v || rec.sent === v)) continue
        changed(t)
      } else {
        let real = false
        for (const a of r.addedNodes) if (a.nodeType === 1 || (a.nodeType === 3 && LETTER.test(a.nodeValue ?? ''))) { real = true; break }
        if (real) changed(t)
      }
    }
  })
  function watch(root: Node): void {
    if (watched.includes(root)) return
    watched.push(root)
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  }

  return {
    /** Every unit not yet sent, on screen first. */
    collect(): Unit[] {
      if (document.designMode === 'on') return []
      out = []
      watch(document)
      // The Mac translates the title too but keeps it out of History; here a
      // new title goes straight into History (the tabs module records it),
      // so it stays the page's own until that can be told apart.
      const title = TITLE && window === window.top && document.querySelector('title')
      if (title && title.firstChild?.nodeType === 3 && LETTER.test(title.textContent ?? '')) { text(title.firstChild as Text); close() }
      const roots = whole ? [document.body ?? document.documentElement] : touched
      whole = false; touched = []
      const seen: Node[] = []
      for (const root of roots) {
        if (!root || !root.isConnected || seen.some(s => s.contains(root))) continue
        if (root.nodeType === 1 && root !== document.body && !open(root)) continue
        seen.push(root)
        if (root.nodeType === 1 && root !== document.body && root !== document.documentElement) {
          if (element(root as Element) !== NodeFilter.FILTER_SKIP) { close(); continue }
        }
        walk(root)
      }
      if (texts.size > 20000) texts.forEach((_rec, node) => { if (!node.isConnected) texts.delete(node) })
      const list = out; out = null
      const tops = list.map(u => top(u.at && u.at.nodeType === 1 ? (u.at as Element) : (u.at?.parentElement ?? null)))
      const order = list.map((_u, i) => i).sort((a, b) => tops[a] - tops[b] || a - b)
      return order.map(i => [list[i].id, list[i].parts, list[i].gaps, list[i].fixed])
    },
    /** [id, parts or null]: each part back in its own node; null keeps the
     * unit as it is (already in the reader's language, or can't be done). */
    apply(pairs: [number, (string | null)[] | null][]): number {
      applying = true
      let n = 0
      for (const [id, parts] of pairs) {
        const u = units[id]
        if (!u) continue
        units[id] = null
        u.targets.forEach((t, j) => {
          if (t.fixed) return
          const cur = 'node' in t ? t.node.nodeValue : t.el.getAttribute(t.attr)
          if (cur !== t.rec.sent) return // changed meanwhile: the next round has it
          t.rec.sent = null
          const p = parts?.[j]
          // null keeps it; "" is a short word whose sense went into its
          // neighbours: only its spaces stay.
          if (p == null || (p !== '' && !SPACE.test(p))) { t.rec.kept = cur; return }
          const o = t.rec.orig
          const v = o.match(/^\s*/)![0] + p.trim() + o.match(/\s*$/)![0]
          t.rec.ours = v
          if ('node' in t) t.node.nodeValue = v; else t.el.setAttribute(t.attr, v)
          n++
        })
      }
      observer.takeRecords()
      applying = false
      return n
    },
    /** Show Original: each value back exactly as it was, where the page
     * hasn't put something else there since. */
    restore(): number {
      observer.disconnect()
      if (timer) clearTimeout(timer)
      let n = 0
      texts.forEach((rec, node) => { if (rec.ours != null && node.nodeValue === rec.ours) { node.nodeValue = rec.orig; n++ } })
      attrs.forEach((map, el) => {
        for (const a in map) { const rec = map[a]; if (rec.ours != null && el.getAttribute(a) === rec.ours) { el.setAttribute(a, rec.orig); n++ } }
      })
      return n
    },
  }
}

// the run, driven from here: the main process detects, downloads and translates

interface Job { session: number; tr: ReturnType<typeof translator>; ready: boolean; busy: boolean; again: boolean }
let current: Job | null = null

const plain = (u: Unit) => u[1].map((p, i) => (i > 0 && u[2][i] ? ' ' : '') + p).join('')

/** Units in slices: a small one first, for what is on screen, then the
 * rest two at a time (the engine has two threads where the PC can), each
 * put back as it comes. */
async function process(job: Job, units: Unit[]): Promise<number> {
  const slices: Unit[][] = []
  for (let i = 0; i < units.length;) {
    const first = slices.length === 0
    const size = first ? 24 : 48
    const cap = first ? 1500 : 4000
    const slice: Unit[] = []
    let chars = 0
    while (i < units.length && slice.length < size && chars < cap) { slice.push(units[i]); chars += plain(units[i]).length; i++ }
    slices.push(slice)
  }
  let applied = 0
  const send = async (slice: Unit[]) => {
    if (current !== job) return false
    const back = await ipcRenderer.invoke('translate:slice', { session: job.session, units: slice }) as [number, string[] | null][] | null
    if (current !== job || !back) return false
    applied += job.tr.apply(back)
    return true
  }
  if (!slices.length || !(await send(slices[0]))) return applied
  let next = 1
  const lane = async () => { while (next < slices.length) if (!(await send(slices[next++]))) return }
  await Promise.all([lane(), lane()])
  return applied
}

async function round(job: Job): Promise<void> {
  job.busy = true
  job.again = false
  const applied = await process(job, job.tr.collect())
  job.busy = false
  if (current !== job) return
  ipcRenderer.send('translate:round', { session: job.session, applied })
  if (job.again) void round(job)
}

async function begin(job: Job): Promise<void> {
  const units = job.tr.collect()
  const sample = units.slice(0, 400).map(plain).join('\n').slice(0, 4000)
  const answer = await ipcRenderer.invoke('translate:begin', { session: job.session, sample, hint: document.documentElement.lang || '' }) as { from?: string } | null
  if (current !== job || !answer?.from) return
  job.busy = true
  const applied = await process(job, units)
  job.busy = false
  if (current !== job) return
  job.ready = true
  ipcRenderer.send('translate:pass', { session: job.session, applied })
  if (job.again) void round(job)
}

function stop(restore: boolean): void {
  const job = current
  current = null
  if (job && restore) job.tr.restore()
}

ipcRenderer.on('translate:start', (_e, { session }: { session: number }) => {
  stop(true)
  const job: Job = { session, ready: false, busy: false, again: false, tr: null! }
  job.tr = translator(() => {
    if (current !== job) return
    if (!job.ready || job.busy) { job.again = true; return }
    void round(job)
  })
  current = job
  void begin(job)
})

ipcRenderer.on('translate:stop', (_e, { session, restore }: { session: number; restore: boolean }) => {
  if (current && (session === undefined || current.session === session)) stop(restore)
})
