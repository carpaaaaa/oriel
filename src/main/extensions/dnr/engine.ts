// declarativeNetRequest for every loaded extension (studio/04 §3.5 and §8.4,
// checklist B "chrome.declarativeNetRequest completo"): static rulesets from
// the manifest with their enabled state saved, dynamic rules saved, session
// rules in memory; evaluation as Chrome does it, per extension and then
// across extensions; requests come only from src/main/net.

import { app, type Session, type Extension, type OnBeforeRequestListenerDetails, type OnBeforeSendHeadersListenerDetails, type OnHeadersReceivedListenerDetails } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { compileRule, RuleError, isUnsafe, type CompiledRule } from './compile'
import { RuleIndex, Req } from './matcher'
import { applyTransform, upgrade } from './transform'
import { substitute, translateRegex } from './regex'
import { HostAccess } from './hosts'
import { OwnFiles } from './war'
import { LIMITS, DYNAMIC_RULESET_ID, SESSION_RULESET_ID, type Rule, type ModifyHeaderInfo } from './types'

const TYPE_OF: Record<string, string> = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image',
  font: 'font', object: 'object', xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media',
  webSocket: 'websocket', other: 'other',
}

/** Requests no extension may touch, as in Chrome: the Web Store and its downloads. */
function sensitive(host: string, url: string): boolean {
  return host === 'chromewebstore.google.com' || host === 'clients2.googleusercontent.com'
    || (host === 'chrome.google.com' && url.includes('/webstore'))
    || (host === 'clients2.google.com' && url.includes('/service/update2'))
}

function hostOf(origin: string): string {
  if (!origin || origin === 'null') return ''
  try { return new URL(origin).hostname } catch { return '' }
}

interface Source { all: CompiledRule[]; main: RuleIndex; response: RuleIndex; headers: RuleIndex }

function source(rules: CompiledRule[]): Source {
  const main: CompiledRule[] = [], response: CompiledRule[] = [], headers: CompiledRule[] = []
  for (const r of rules) {
    if (r.type === 'modifyHeaders') headers.push(r)
    else if (r.responseHeaders || r.excludedResponseHeaders) response.push(r)
    else main.push(r)
  }
  return { all: rules, main: new RuleIndex(main), response: new RuleIndex(response), headers: new RuleIndex(headers) }
}

const EMPTY = source([])

interface Matched { rule: { ruleId: number; rulesetId: string }; tabId: number; timeStamp: number }

interface Saved { version: string; enabled?: string[]; disabled?: Record<string, number[]>; dynamic?: Rule[] }

class ExtRules {
  readonly id: string
  readonly access: HostAccess
  readonly files: OwnFiles
  readonly rulesets: { id: string; path: string; enabled: boolean }[]
  readonly feedback: boolean
  readonly unpacked: boolean
  enabled = new Set<string>()
  disabled = new Map<string, Set<number>>()
  /** Valid rules of each enabled static ruleset. */
  compiled = new Map<string, CompiledRule[]>()
  counts = new Map<string, number>()
  dynamic: Rule[] = []
  session: Rule[] = []
  sources: { session: Source; dynamic: Source; static: Source } = { session: EMPTY, dynamic: EMPTY, static: EMPTY }
  badge = false
  tabCounts = new Map<number, number>()
  matched: Matched[] = []
  warnings: string[] = []

  constructor(readonly ext: Extension, readonly order: number, extensionsRoot: string) {
    this.id = ext.id
    const manifest = ext.manifest as { declarative_net_request?: { rule_resources?: { id: string; path: string; enabled: boolean }[] }; permissions?: string[] }
    this.access = new HostAccess(manifest)
    this.files = new OwnFiles(manifest)
    this.rulesets = (manifest.declarative_net_request?.rule_resources ?? []).slice(0, LIMITS.MAX_NUMBER_OF_STATIC_RULESETS)
    const perms = manifest.permissions ?? []
    this.feedback = perms.includes('declarativeNetRequestFeedback') || perms.includes('activeTab')
    this.unpacked = !path.resolve(ext.path).startsWith(path.resolve(extensionsRoot) + path.sep)
  }

  get list(): Source[] { return [this.sources.session, this.sources.dynamic, this.sources.static] }
  get regexCount(): number { return this.sources.dynamic.all.filter(r => r.regex).length + this.sources.session.all.filter(r => r.regex).length }

  /** Reads and checks one static ruleset; bad rules are left out with a warning. */
  readRuleset(rulesetId: string): CompiledRule[] {
    const rs = this.rulesets.find(r => r.id === rulesetId)
    if (!rs) return []
    const file = path.resolve(this.ext.path, rs.path.replace(/^\/+/, ''))
    if (!file.startsWith(path.resolve(this.ext.path) + path.sep)) return []
    let raw: unknown
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) {
      this.warnings.push(`Ruleset ${rulesetId}: ${(e as Error).message}`)
      return []
    }
    const out: CompiledRule[] = []
    const ids = new Set<number>()
    for (const rule of Array.isArray(raw) ? raw as Rule[] : []) {
      try {
        if (ids.has(rule?.id)) throw new RuleError(`Rule with id ${rule.id} does not have a unique ID.`)
        const c = compileRule(rule, rulesetId, 'static')
        ids.add(c.id)
        out.push(c)
      } catch (e) {
        if (this.warnings.length < 40) this.warnings.push(`Ruleset ${rulesetId}: ${(e as Error).message}`)
      }
    }
    this.counts.set(rulesetId, out.length)
    return out
  }

  countOf(rulesetId: string): number {
    if (!this.counts.has(rulesetId)) this.readRuleset(rulesetId)
    return this.counts.get(rulesetId) ?? 0
  }

  rebuildStatic(): void {
    const all: CompiledRule[] = []
    for (const rs of this.rulesets) {
      if (!this.enabled.has(rs.id)) { this.compiled.delete(rs.id); continue }
      let rules = this.compiled.get(rs.id)
      if (!rules) { rules = this.readRuleset(rs.id); this.compiled.set(rs.id, rules) }
      const off = this.disabled.get(rs.id)
      for (const r of rules) if (!off?.has(r.id)) all.push(r)
    }
    this.sources.static = source(all)
  }

  get staticRuleCount(): number {
    let n = 0
    for (const id of this.enabled) n += this.countOf(id)
    return n
  }
}

interface Pending { q: Req; allow: Map<string, number> }
interface Redirected { st: ExtRules; url: string; upgrade: boolean; navigate: boolean }

export class DnrEngine {
  private exts = new Map<string, ExtRules>()
  private order = 0
  private pending = new Map<number, Pending>()
  /** allowAllRequests on frames: tab → frame ("main" or frameTreeNodeId) → extension → priority. */
  private frames = new Map<number, Map<string | number, Map<string, number>>>()
  private saveTimers = new Map<string, NodeJS.Timeout>()
  private anyLater = false
  private anyRequestHeaders = false
  profile: Session | null = null
  extensionsRoot = ''
  /** Badge counter changed (setExtensionActionOptions). */
  onCount: (extensionId: string, tabId: number, count: number | null) => void = () => {}

  private get folder(): string { return path.join(app.getPath('userData'), 'ExtensionRules') }
  private file(id: string): string { return path.join(this.folder, `${id}.json`) }

  // ---- extensions coming and going

  load(ext: Extension): void {
    const manifest = ext.manifest as { permissions?: string[] }
    const perms = manifest.permissions ?? []
    if (!perms.includes('declarativeNetRequest') && !perms.includes('declarativeNetRequestWithHostAccess')) return
    const started = performance.now()
    const st = new ExtRules(ext, this.order++, this.extensionsRoot)
    let saved: Saved | null = null
    try { saved = JSON.parse(fs.readFileSync(this.file(ext.id), 'utf8')) } catch { /* first time */ }
    // Enabled rulesets and disabled rules are kept across restarts, not
    // across updates (Chrome).
    const sameVersion = saved?.version === ext.version
    const known = new Set(st.rulesets.map(r => r.id))
    st.enabled = new Set(sameVersion && saved?.enabled ? saved.enabled.filter(id => known.has(id)) : st.rulesets.filter(r => r.enabled).map(r => r.id))
    if (sameVersion && saved?.disabled) for (const [k, v] of Object.entries(saved.disabled)) st.disabled.set(k, new Set(v))
    st.rebuildStatic()
    st.dynamic = Array.isArray(saved?.dynamic) ? saved!.dynamic! : []
    st.sources.dynamic = source(this.compileAll(st.dynamic, DYNAMIC_RULESET_ID, 'dynamic', st))
    this.exts.set(ext.id, st)
    this.refresh()
    console.log(`[dnr] ${ext.name}: ${st.sources.static.all.length} static rules (${[...st.enabled].join(', ')}), ${st.dynamic.length} dynamic, in ${Math.round(performance.now() - started)} ms`)
  }

  unload(ext: Extension): void {
    if (!this.exts.delete(ext.id)) return
    this.refresh()
    // Gone from disk: removed, so its rules go too.
    setTimeout(() => { if (!fs.existsSync(ext.path) && !this.exts.has(ext.id)) fs.rmSync(this.file(ext.id), { force: true }) }, 3000)
  }

  private compileAll(rules: Rule[], rulesetId: string, scope: 'dynamic' | 'session', st: ExtRules): CompiledRule[] {
    const out: CompiledRule[] = []
    for (const r of rules) {
      try { out.push(compileRule(r, rulesetId, scope)) } catch (e) { st.warnings.push(String((e as Error).message)) }
    }
    return out
  }

  private refresh(): void {
    this.anyLater = false
    this.anyRequestHeaders = false
    for (const st of this.exts.values()) for (const s of st.list) {
      if (s.headers.size || s.response.size) this.anyLater = true
      if (s.headers.size && s.all.some(r => r.rule.action.requestHeaders)) this.anyRequestHeaders = true
    }
  }

  private save(st: ExtRules): void {
    clearTimeout(this.saveTimers.get(st.id))
    this.saveTimers.set(st.id, setTimeout(() => this.write(st), 150))
  }

  private write(st: ExtRules): void {
    this.saveTimers.delete(st.id)
    const data: Saved = {
      version: st.ext.version,
      enabled: st.rulesets.filter(r => st.enabled.has(r.id)).map(r => r.id),
      disabled: Object.fromEntries([...st.disabled].filter(([, v]) => v.size).map(([k, v]) => [k, [...v]])),
      dynamic: st.dynamic,
    }
    fs.mkdirSync(this.folder, { recursive: true })
    const tmp = this.file(st.id) + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(data))
    fs.renameSync(tmp, this.file(st.id))
  }

  /** Before quitting: what's waiting to be written. */
  flush(): void {
    for (const id of [...this.saveTimers.keys()]) {
      clearTimeout(this.saveTimers.get(id))
      const st = this.exts.get(id)
      if (st) this.write(st)
    }
  }

  // ---- matching

  private request(d: { url: string; resourceType: string; method: string; webContentsId?: number; initiatorOrigin?: string; frame?: Electron.WebFrameMain | null }): Req | null {
    if (this.exts.size === 0) return null
    const url = d.url
    if (!/^(https?|wss?):/i.test(url)) return null
    const type = TYPE_OF[d.resourceType] ?? 'other'
    const initiator = d.initiatorOrigin ?? ''
    const q = new Req(url, type, d.method || 'GET', d.webContentsId ?? -1, () => hostOf(initiator), () => {
      if (type === 'main_frame') return ''
      try { return hostOf(d.frame?.top?.url ?? '') } catch { return '' }
    })
    if (sensitive(q.host, q.lower)) return null
    return q
  }

  /** The extension whose page or worker made the request, if one did: only
   * its own rules apply then. */
  private static byExtension(initiator: string | undefined): string | null {
    return initiator?.startsWith('chrome-extension://') ? initiator.slice(19).replace(/\/.*$/, '') : null
  }

  private inherited(tabId: number, extId: string, frame: Electron.WebFrameMain | null | undefined): number {
    const fm = this.frames.get(tabId)
    if (!fm) return 0
    let p = fm.get('main')?.get(extId) ?? 0
    if (fm.size > (fm.has('main') ? 1 : 0)) {
      try {
        for (let f = frame ?? null; f; f = f.parent) p = Math.max(p, fm.get(f.frameTreeNodeId)?.get(extId) ?? 0)
      } catch { /* frame gone */ }
    }
    return p
  }

  private remember(tabId: number, key: string | number, extId: string, priority: number, webContents?: Electron.WebContents): void {
    let fm = this.frames.get(tabId)
    if (!fm) {
      fm = new Map()
      this.frames.set(tabId, fm)
      webContents?.once('destroyed', () => this.frames.delete(tabId))
    }
    let m = fm.get(key)
    if (!m) { m = new Map(); fm.set(key, m) }
    m.set(extId, priority)
  }

  private note(st: ExtRules, r: CompiledRule, tabId: number): void {
    if (!st.feedback) return
    st.matched.push({ rule: { ruleId: r.id, rulesetId: r.rulesetId }, tabId, timeStamp: Date.now() })
    if (st.matched.length > 5000) st.matched.splice(0, 1000)
  }

  private count(st: ExtRules, tabId: number): void {
    if (tabId < 0) return
    const n = (st.tabCounts.get(tabId) ?? 0) + 1
    st.tabCounts.set(tabId, n)
    if (st.badge) this.onCount(st.id, tabId, n)
  }

  /** Where a redirect rule sends this request, or null. */
  private target(st: ExtRules, r: CompiledRule, q: Req): string | null {
    if (r.type === 'upgradeScheme') return upgrade(q.url)
    const red = r.rule.action.redirect!
    if (red.url) return red.url
    if (red.extensionPath) return `chrome-extension://${st.id}${red.extensionPath}`
    if (red.regexSubstitution !== undefined && r.regex) return substitute(q.url, r.regex, red.regexSubstitution)
    if (red.transform) return applyTransform(q.url, red.transform)
    return null
  }

  private hostAllowed(st: ExtRules, q: Req, initiator: string | undefined): boolean {
    if (!st.access.allows(q.url)) return false
    return !initiator || initiator === 'null' || initiator.startsWith('chrome-extension://') || st.access.allows(initiator)
  }

  /** Each extension's winning rule for the request, before it is sent. */
  private decide(q: Req, d: OnBeforeRequestListenerDetails | null, record: boolean): { block: ExtRules | null; redirect: Redirected | null; allow: Map<string, number>; winners: Map<string, CompiledRule> } {
    const only = DnrEngine.byExtension(d?.initiatorOrigin)
    const allow = new Map<string, number>()
    const winners = new Map<string, CompiledRule>()
    let block: ExtRules | null = null
    let redirect: Redirected | null = null
    const isFrame = q.type === 'main_frame' || q.type === 'sub_frame'
    const frameKey: string | number | null = q.type === 'main_frame' ? 'main' : q.type === 'sub_frame' ? (d?.frame?.frameTreeNodeId ?? null) : null
    if (record && q.type === 'main_frame') {
      this.frames.delete(q.tabId)
      for (const st of this.exts.values()) if (st.tabCounts.delete(q.tabId) && st.badge) this.onCount(st.id, q.tabId, 0)
    }
    if (record && frameKey !== null && frameKey !== 'main') this.frames.get(q.tabId)?.delete(frameKey)

    for (const st of this.exts.values()) {
      if (only && only !== st.id) continue
      let win: CompiledRule | null = null
      for (const s of st.list) { const r = s.main.best(q, win?.key ?? 0); if (r) win = r }
      if (!isFrame && d) {
        const p = this.inherited(q.tabId, st.id, d.frame)
        if (p && (!win || p * 8 + 4 >= win.key)) { allow.set(st.id, p); continue }
      }
      if (!win) continue
      winners.set(st.id, win)
      if (win.type === 'allow' || win.type === 'allowAllRequests') {
        allow.set(st.id, win.priority)
        if (record) this.note(st, win, q.tabId)
        if (record && win.type === 'allowAllRequests' && frameKey !== null) this.remember(q.tabId, frameKey, st.id, win.priority, d?.webContents)
        continue
      }
      if (win.type === 'block') {
        if (record) { this.note(st, win, q.tabId); this.count(st, q.tabId) }
        if (!block || st.order > block.order) block = st
        continue
      }
      // redirect, upgradeScheme: only with host access.
      if (win.type === 'redirect' && !this.hostAllowed(st, q, d?.initiatorOrigin)) continue
      const url = this.target(st, win, q)
      if (!url || url === q.url) continue
      // See war.ts.
      const navigate = q.type === 'main_frame' && url.startsWith(`chrome-extension://${st.id}/`) && st.files.dynamicOnly(new URL(url))
      const up = win.type === 'upgradeScheme'
      // Across extensions: upgrade before redirect, then the latest installed.
      if (!redirect || (up && !redirect.upgrade) || (up === redirect.upgrade && st.order > redirect.st.order)) {
        redirect = { st, url, upgrade: up, navigate }
      }
      if (record) { this.note(st, win, q.tabId); this.count(st, q.tabId) }
    }
    return { block, redirect, allow, winners }
  }

  /** Time spent on real requests, for the report. */
  readonly timing = { requests: 0, totalMs: 0, maxMs: 0 }

  beforeRequest(d: OnBeforeRequestListenerDetails): { cancel?: boolean; redirectURL?: string } | void {
    if (this.profile && d.webContents && d.webContents.session !== this.profile) return
    const started = performance.now()
    const q = this.request(d)
    if (!q) return
    const { block, redirect, allow } = this.decide(q, d, true)
    if (this.anyLater) {
      this.pending.set(d.id, { q, allow })
      if (this.pending.size > 4000) this.pending.delete(this.pending.keys().next().value!)
    }
    const ms = performance.now() - started
    this.timing.requests++
    this.timing.totalMs += ms
    if (ms > this.timing.maxMs) this.timing.maxMs = ms
    if (block) return { cancel: true }
    if (redirect?.navigate) {
      // See war.ts: the tab loads the extension's page itself.
      const wc = d.webContents
      const url = redirect.url
      if (wc) setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(url).catch(() => {}) })
      return { cancel: true }
    }
    if (redirect) return { redirectURL: redirect.url }
  }

  private later(d: OnBeforeSendHeadersListenerDetails | OnHeadersReceivedListenerDetails): Pending | null {
    const p = this.pending.get(d.id)
    if (p && p.q.url === d.url) return p
    const q = this.request(d)
    if (!q) return null
    return { q, allow: this.decide(q, null, false).allow }
  }

  /** modifyHeaders rules that apply, newest extension first, then by priority. */
  private headerRules(p: Pending, kind: 'requestHeaders' | 'responseHeaders', initiator: string | undefined): { st: ExtRules; r: CompiledRule }[] {
    const out: { st: ExtRules; r: CompiledRule }[] = []
    const only = DnrEngine.byExtension(initiator)
    const exts = [...this.exts.values()].sort((a, b) => b.order - a.order)
    for (const st of exts) {
      if (only && only !== st.id) continue
      const found: CompiledRule[] = []
      for (const s of st.list) if (s.headers.size) s.headers.all(p.q, found, p.allow.get(st.id) ?? 0)
      const mine = found.filter(r => r.rule.action[kind])
      if (!mine.length || !this.hostAllowed(st, p.q, initiator)) continue
      mine.sort((a, b) => b.priority - a.priority)
      for (const r of mine) { out.push({ st, r }); this.note(st, r, p.q.tabId) }
    }
    return out
  }

  beforeSendHeaders(d: OnBeforeSendHeadersListenerDetails, headers: Record<string, string>): void {
    if (!this.anyRequestHeaders) return
    if (this.profile && d.webContents && d.webContents.session !== this.profile) return
    const p = this.later(d)
    if (!p) return
    const rules = this.headerRules(p, 'requestHeaders', d.initiatorOrigin)
    if (!rules.length) return
    const state = new Map<string, 'final' | 'append'>()
    const keyOf = (name: string) => Object.keys(headers).find(k => k.toLowerCase() === name)
    for (const { r } of rules) for (const h of r.rule.action.requestHeaders as ModifyHeaderInfo[]) {
      const name = h.header.toLowerCase()
      const was = state.get(name)
      if (was === 'final') continue
      const key = keyOf(name)
      if (h.operation === 'append') {
        headers[key ?? h.header] = key ? `${headers[key]}${name === 'cookie' ? '; ' : ', '}${h.value}` : h.value!
        state.set(name, 'append')
      } else if (!was) {
        if (key) delete headers[key]
        if (h.operation === 'set') headers[h.header] = h.value!
        state.set(name, 'final')
      }
    }
  }

  headersReceived(d: OnHeadersReceivedListenerDetails, headers: Record<string, string[]>): { cancel?: boolean } | void {
    if (!this.anyLater) return
    if (this.profile && d.webContents && d.webContents.session !== this.profile) return
    const p = this.later(d)
    if (!p) return
    const lower = new Map<string, string[]>()
    for (const [k, v] of Object.entries(headers)) {
      const name = k.toLowerCase()
      lower.set(name, [...(lower.get(name) ?? []), ...v])
    }
    p.q.responseHeaders = lower
    // Rules that look at response headers: block or allow, now.
    const only = DnrEngine.byExtension(d.initiatorOrigin)
    for (const st of this.exts.values()) {
      if (only && only !== st.id) continue
      const floor = (p.allow.get(st.id) ?? 0) * 8 + 5
      let win: CompiledRule | null = null
      for (const s of st.list) if (s.response.size) { const r = s.response.best(p.q, win?.key ?? floor); if (r) win = r }
      if (!win) continue
      this.note(st, win, p.q.tabId)
      if (win.type === 'block') { this.count(st, p.q.tabId); return { cancel: true } }
      if (win.type === 'allow' || win.type === 'allowAllRequests') p.allow.set(st.id, Math.max(p.allow.get(st.id) ?? 0, win.priority))
    }
    const rules = this.headerRules(p, 'responseHeaders', d.initiatorOrigin)
    if (!rules.length) return
    const state = new Map<string, 'final' | 'append'>()
    const keysOf = (name: string) => Object.keys(headers).filter(k => k.toLowerCase() === name)
    for (const { r } of rules) for (const h of r.rule.action.responseHeaders as ModifyHeaderInfo[]) {
      const name = h.header.toLowerCase()
      const was = state.get(name)
      if (was === 'final') continue
      const keys = keysOf(name)
      if (h.operation === 'append') {
        if (keys.length) headers[keys[0]] = [...headers[keys[0]], h.value!]
        else headers[h.header] = [h.value!]
        state.set(name, 'append')
      } else if (!was) {
        for (const k of keys) delete headers[k]
        if (h.operation === 'set') headers[h.header] = [h.value!]
        state.set(name, 'final')
      }
    }
  }

  // ---- the API (chrome.declarativeNetRequest.*), one method per call

  private ext(id: string): ExtRules {
    const st = this.exts.get(id)
    if (!st) throw new Error('This extension has no declarativeNetRequest permission.')
    return st
  }

  private checkDynamicOrSession(st: ExtRules, rules: Rule[], scope: 'dynamic' | 'session', other: Rule[]): CompiledRule[] {
    const compiled: CompiledRule[] = []
    const ids = new Set<number>()
    for (const r of rules) {
      if (ids.has(r?.id)) throw new Error(`Rule with id ${r.id} does not have a unique ID.`)
      const c = compileRule(r, scope === 'dynamic' ? DYNAMIC_RULESET_ID : SESSION_RULESET_ID, scope)
      ids.add(c.id)
      compiled.push(c)
    }
    const name = scope === 'dynamic' ? 'Dynamic' : 'Session'
    const max = scope === 'dynamic' ? LIMITS.MAX_NUMBER_OF_DYNAMIC_RULES : LIMITS.MAX_NUMBER_OF_SESSION_RULES
    if (rules.length > max) throw new Error(`${name} rule count exceeded.`)
    const unsafeMax = scope === 'dynamic' ? LIMITS.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES : LIMITS.MAX_NUMBER_OF_UNSAFE_SESSION_RULES
    if (rules.filter(isUnsafe).length > unsafeMax) throw new Error(`${name} rule count for unsafe rules exceeded.`)
    const regex = compiled.filter(c => c.regex).length + other.filter(r => r.condition?.regexFilter !== undefined).length
    if (regex > LIMITS.MAX_NUMBER_OF_REGEX_RULES) throw new Error(`${name} rule count for regex rules exceeded.`)
    return compiled
  }

  private update(id: string, scope: 'dynamic' | 'session', options: { removeRuleIds?: number[]; addRules?: Rule[] } = {}): void {
    const st = this.ext(id)
    const remove = new Set(options.removeRuleIds ?? [])
    const current = scope === 'dynamic' ? st.dynamic : st.session
    const next = [...current.filter(r => !remove.has(r.id)), ...(options.addRules ?? [])]
    const compiled = this.checkDynamicOrSession(st, next, scope, scope === 'dynamic' ? st.session : st.dynamic)
    if (scope === 'dynamic') { st.dynamic = next; st.sources.dynamic = source(compiled); this.save(st) }
    else { st.session = next; st.sources.session = source(compiled) }
    this.refresh()
  }

  private static pick(rules: Rule[], filter?: { ruleIds?: number[] }): Rule[] {
    if (!filter?.ruleIds) return rules
    const want = new Set(filter.ruleIds)
    return rules.filter(r => want.has(r.id))
  }

  readonly api: Record<string, (id: string, ...args: any[]) => unknown> = {
    updateDynamicRules: (id, options) => { this.update(id, 'dynamic', options) },
    getDynamicRules: (id, filter) => DnrEngine.pick(this.ext(id).dynamic, filter),
    updateSessionRules: (id, options) => { this.update(id, 'session', options) },
    getSessionRules: (id, filter) => DnrEngine.pick(this.ext(id).session, filter),

    updateEnabledRulesets: (id, options: { disableRulesetIds?: string[]; enableRulesetIds?: string[] } = {}) => {
      const st = this.ext(id)
      const known = new Set(st.rulesets.map(r => r.id))
      for (const rid of [...(options.disableRulesetIds ?? []), ...(options.enableRulesetIds ?? [])]) {
        if (!known.has(rid)) throw new Error(`Invalid ruleset id: ${rid}.`)
      }
      const next = new Set(st.enabled)
      for (const rid of options.disableRulesetIds ?? []) next.delete(rid)
      for (const rid of options.enableRulesetIds ?? []) next.add(rid)
      if (next.size > LIMITS.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS) throw new Error('The number of enabled static rulesets exceeds the API limits.')
      let wanted = 0
      for (const rid of next) wanted += st.countOf(rid)
      if (wanted > st.staticRuleCount + (this.api.getAvailableStaticRuleCount(id) as number)) throw new Error('The set of enabled rulesets exceeds the rule count limit.')
      st.enabled = next
      st.rebuildStatic()
      this.refresh()
      this.save(st)
    },
    getEnabledRulesets: id => { const st = this.ext(id); return st.rulesets.filter(r => st.enabled.has(r.id)).map(r => r.id) },

    updateStaticRules: (id, options: { rulesetId: string; disableRuleIds?: number[]; enableRuleIds?: number[] }) => {
      const st = this.ext(id)
      if (!st.rulesets.some(r => r.id === options?.rulesetId)) throw new Error(`Invalid ruleset id: ${options?.rulesetId}.`)
      const set = new Set(st.disabled.get(options.rulesetId) ?? [])
      for (const r of options.disableRuleIds ?? []) set.add(r)
      for (const r of options.enableRuleIds ?? []) set.delete(r)
      let total = set.size
      for (const [k, v] of st.disabled) if (k !== options.rulesetId) total += v.size
      if (total > LIMITS.MAX_NUMBER_OF_DISABLED_STATIC_RULES) throw new Error('The number of disabled static rules exceeds the disabled rule count limit.')
      st.disabled.set(options.rulesetId, set)
      if (st.enabled.has(options.rulesetId)) { st.rebuildStatic(); this.refresh() }
      this.save(st)
    },
    getDisabledRuleIds: (id, options: { rulesetId: string }) => {
      const st = this.ext(id)
      if (!st.rulesets.some(r => r.id === options?.rulesetId)) throw new Error(`Invalid ruleset id: ${options?.rulesetId}.`)
      return [...(st.disabled.get(options.rulesetId) ?? [])]
    },

    getAvailableStaticRuleCount: id => {
      const mine = this.ext(id).staticRuleCount
      let globalUsed = 0
      for (const st of this.exts.values()) globalUsed += Math.max(0, st.staticRuleCount - LIMITS.GUARANTEED_MINIMUM_STATIC_RULES)
      return Math.max(0, LIMITS.GUARANTEED_MINIMUM_STATIC_RULES - mine) + Math.max(0, LIMITS.GLOBAL_STATIC_RULES - globalUsed)
    },

    isRegexSupported: (_id, options: { regex: string; isCaseSensitive?: boolean }) => {
      const t = translateRegex(String(options?.regex ?? ''), options?.isCaseSensitive === true)
      return 're' in t ? { isSupported: true } : { isSupported: false, reason: t.reason }
    },

    getMatchedRules: (id, filter: { tabId?: number; minTimeStamp?: number } = {}) => {
      const st = this.ext(id)
      if (!st.feedback) throw new Error('The extension must have the declarativeNetRequestFeedback permission or have activeTab granted for the specified tab ID in order to call this function.')
      const since = Math.max(filter?.minTimeStamp ?? 0, Date.now() - 5 * 60_000)
      const rulesMatchedInfo = st.matched.filter(m => m.timeStamp >= since && (filter?.tabId === undefined || m.tabId === filter.tabId))
      return { rulesMatchedInfo }
    },

    setExtensionActionOptions: (id, options: { displayActionCountAsBadgeText?: boolean; tabUpdate?: { tabId: number; increment: number } } = {}) => {
      const st = this.ext(id)
      if (options.displayActionCountAsBadgeText !== undefined && options.displayActionCountAsBadgeText !== st.badge) {
        st.badge = options.displayActionCountAsBadgeText
        for (const [tab, n] of st.tabCounts) this.onCount(st.id, tab, st.badge ? n : null)
      }
      if (options.tabUpdate) {
        const { tabId, increment } = options.tabUpdate
        const n = Math.max(0, (st.tabCounts.get(tabId) ?? 0) + increment)
        st.tabCounts.set(tabId, n)
        if (st.badge) this.onCount(st.id, tabId, n)
      }
    },

    testMatchOutcome: (id, request: { url: string; type: string; method?: string; initiator?: string; tabId?: number; responseHeaders?: Record<string, string[]> }) => {
      const st = this.ext(id)
      if (!st.unpacked) throw new Error('testMatchOutcome is only available for unpacked extensions.')
      return { matchedRules: this.outcome(st, request) }
    },
  }

  /** What the extension's rules would do with a request, without one:
   * testMatchOutcome, and the tests. */
  outcome(st: ExtRules, request: { url: string; type: string; method?: string; initiator?: string; tabId?: number; top?: string; responseHeaders?: Record<string, string[]> }): { ruleId: number; rulesetId: string }[] {
    const initiator = request.initiator ?? ''
    const q = new Req(request.url, request.type, request.method ?? 'get', request.tabId ?? -1, hostOf(initiator), request.top ? hostOf(request.top) : '')
    const out: CompiledRule[] = []
    let win: CompiledRule | null = null
    for (const s of st.list) { const r = s.main.best(q, win?.key ?? 0); if (r) win = r }
    if (request.responseHeaders) {
      q.responseHeaders = new Map(Object.entries(request.responseHeaders).map(([k, v]) => [k.toLowerCase(), v]))
      const floor = win && (win.type === 'allow' || win.type === 'allowAllRequests') ? win.priority * 8 + 5 : 0
      let late: CompiledRule | null = null
      for (const s of st.list) { const r = s.response.best(q, late?.key ?? floor); if (r) late = r }
      if (late) win = late
    }
    if (win) out.push(win)
    const allowP = win && (win.type === 'allow' || win.type === 'allowAllRequests') ? win.priority : 0
    const headers: CompiledRule[] = []
    for (const s of st.list) s.headers.all(q, headers, allowP)
    if (!win || win.type !== 'block') out.push(...headers.sort((a, b) => b.priority - a.priority))
    return out.map(r => ({ ruleId: r.id, rulesetId: r.rulesetId }))
  }

  /** For the bench and the tests. */
  state(id: string): ExtRules | undefined { return this.exts.get(id) }
  all(): ExtRules[] { return [...this.exts.values()] }

  /** What the whole engine would do with a request, without sending one. */
  simulate(r: { url: string; type: string; method?: string; initiator?: string; tabId?: number }): { action: 'none' | 'block' | 'redirect'; url?: string; winners: Record<string, { ruleId: number; rulesetId: string; type: string }> } {
    const q = new Req(r.url, r.type, r.method ?? 'get', r.tabId ?? -1, hostOf(r.initiator ?? ''), '')
    const { block, redirect, winners } = this.decide(q, null, false)
    const w = Object.fromEntries([...winners].map(([k, v]) => [k, { ruleId: v.id, rulesetId: v.rulesetId, type: v.type }]))
    return block ? { action: 'block', winners: w } : redirect ? { action: 'redirect', url: redirect.url, winners: w } : { action: 'none', winners: w }
  }
}

export const dnr = new DnrEngine()
