// The index that keeps matching fast with hundreds of thousands of rules
// (studio/04 §8.4): each rule sits in one bucket, found by one key the URL
// must contain. The key is, in order of preference, a token of its urlFilter
// (a run of [a-z0-9] the pattern bounds on both sides), one of its
// requestDomains, one of its initiatorDomains; only rules with none of these
// are tried on every request. A request looks up its own URL tokens and host
// suffixes, so the work grows with the URL, not with the rules. Buckets are
// sorted by priority, so the search for the winning rule stops early.

import { suffixes, passes, registrable, normalizeHost } from './domains'
import { urlTokens } from './urlfilter'
import { typeBit, methodBit, type CompiledRule, type HeaderMatcher } from './compile'

/** A request as the rules see it. Costly parts are computed on first use. */
export class Req {
  readonly lower: string
  readonly host: string
  readonly hostStart: number
  readonly hostEnd: number
  readonly typeBit: number
  readonly methodBit: number
  private _tokens: string[] | null = null
  private _hostSuffixes: string[] | null = null
  private _initiator: string[] | null | undefined
  private _top: string[] | null | undefined
  private _third: boolean | undefined
  /** Lower-cased names, set only when matching at response time. */
  responseHeaders: Map<string, string[]> | null = null

  constructor(
    readonly url: string,
    readonly type: string,
    method: string,
    readonly tabId: number,
    /** Host of the initiator ("" when none), or a function that finds it. */
    private initiatorHost: string | (() => string),
    private topHost: string | (() => string),
  ) {
    this.lower = url.toLowerCase()
    const schemeEnd = this.lower.indexOf('://')
    let start = schemeEnd < 0 ? 0 : schemeEnd + 3
    let end = start
    while (end < this.lower.length) {
      const c = this.lower.charCodeAt(end)
      if (c === 47 || c === 63 || c === 35) break // / ? #
      end++
    }
    const at = this.lower.lastIndexOf('@', end)
    if (at >= start) start = at + 1
    let hostEnd = end
    if (this.lower.charCodeAt(start) === 91) hostEnd = this.lower.indexOf(']', start) + 1 || end
    else { const colon = this.lower.indexOf(':', start); if (colon >= 0 && colon < end) hostEnd = colon }
    this.hostStart = start
    this.hostEnd = hostEnd
    this.host = normalizeHost(this.lower.slice(start, hostEnd))
    this.typeBit = typeBit(type)
    this.methodBit = methodBit(method.toLowerCase())
  }

  get tokens(): string[] { return this._tokens ??= urlTokens(this.lower) }
  get hostSuffixes(): string[] { return this._hostSuffixes ??= suffixes(this.host) }
  get initiatorSuffixes(): string[] | null {
    if (this._initiator === undefined) {
      const h = typeof this.initiatorHost === 'function' ? this.initiatorHost() : this.initiatorHost
      this._initiator = h ? suffixes(normalizeHost(h)) : null
    }
    return this._initiator
  }
  get topSuffixes(): string[] | null {
    if (this._top === undefined) {
      const h = typeof this.topHost === 'function' ? this.topHost() : this.topHost
      this._top = h ? suffixes(normalizeHost(h)) : null
    }
    return this._top
  }
  /** Third party: the request's site isn't the initiator's. No initiator
   * (a typed address) is first party, as in Chrome. */
  get thirdParty(): boolean {
    if (this._third === undefined) {
      const init = this.initiatorSuffixes
      this._third = !!init && registrable(init[0]) !== registrable(this.host)
    }
    return this._third
  }
}

function headerMatches(m: HeaderMatcher, headers: Map<string, string[]>): boolean {
  const values = headers.get(m.name)
  if (!values) return false
  if (m.excluded && values.some(v => m.excluded!.some(re => re.test(v)))) return false
  if (m.values && !values.some(v => m.values!.some(re => re.test(v)))) return false
  return true
}

export function ruleMatches(r: CompiledRule, q: Req): boolean {
  if (!(r.types & q.typeBit)) return false
  if (!(r.methods & q.methodBit)) return false
  if (r.tabIds && !r.tabIds.has(q.tabId)) return false
  if (r.excludedTabIds && r.excludedTabIds.has(q.tabId)) return false
  if ((r.requestDomains || r.excludedRequestDomains) && !passes(q.hostSuffixes, r.requestDomains, r.excludedRequestDomains)) return false
  if ((r.initiatorDomains || r.excludedInitiatorDomains) && !passes(q.initiatorSuffixes, r.initiatorDomains, r.excludedInitiatorDomains)) return false
  if ((r.topDomains || r.excludedTopDomains) && !passes(q.topSuffixes, r.topDomains, r.excludedTopDomains)) return false
  if (r.party && (r.party === 2) !== q.thirdParty) return false
  if (r.responseHeaders || r.excludedResponseHeaders) {
    const h = q.responseHeaders
    if (!h) return false
    if (r.responseHeaders && !r.responseHeaders.some(m => headerMatches(m, h))) return false
    if (r.excludedResponseHeaders && r.excludedResponseHeaders.some(m => headerMatches(m, h))) return false
  }
  if (r.url && !r.url.test(q.url, q.lower, q.hostStart, q.hostEnd)) return false
  if (r.regex) {
    if (r.piece && !(r.caseSensitive ? q.url : q.lower).includes(r.piece)) return false
    if (!r.regex.test(q.url)) return false
  }
  return true
}

/** Tokens too common to tell rules apart: a rule keyed on them would be
 * tried on most requests. */
const COMMON = new Set(['http', 'https', 'www', 'com', 'net', 'org', 'js', 'html', 'htm', 'php', 'css', 'json', 'cdn', 'static', 'assets', 'img', 'images', 'api', 'ws', 'wss', 'io', 'co', 'uk', 'de'])

const byKey = (a: CompiledRule, b: CompiledRule) => b.key - a.key

export class RuleIndex {
  private tokens = new Map<string, CompiledRule[]>()
  private requestDomains = new Map<string, CompiledRule[]>()
  private initiatorDomains = new Map<string, CompiledRule[]>()
  private generic: CompiledRule[] = []
  readonly size: number
  readonly regexCount: number

  constructor(rules: CompiledRule[]) {
    this.size = rules.length
    this.regexCount = rules.filter(r => r.regex).length
    // How often each token is offered, to give each rule its rarest one.
    const freq = new Map<string, number>()
    for (const r of rules) for (const t of r.tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
    const cost = (t: string) => (freq.get(t) ?? 0) + (COMMON.has(t) ? 1e6 : 0) + (t.length < 3 ? 1e4 : 0)
    const put = (map: Map<string, CompiledRule[]>, key: string, r: CompiledRule) => {
      const list = map.get(key)
      if (list) list.push(r); else map.set(key, [r])
    }
    for (const r of rules) {
      let best: string | null = null
      for (const t of r.tokens) if (best === null || cost(t) < cost(best)) best = t
      if (best !== null && (!COMMON.has(best) || !r.requestDomains)) { put(this.tokens, best, r); continue }
      if (r.requestDomains) { for (const d of r.requestDomains) put(this.requestDomains, d, r); continue }
      if (r.initiatorDomains) { for (const d of r.initiatorDomains) put(this.initiatorDomains, d, r); continue }
      this.generic.push(r)
    }
    for (const map of [this.tokens, this.requestDomains, this.initiatorDomains]) for (const list of map.values()) list.sort(byKey)
    this.generic.sort(byKey)
  }

  /** Visit candidate buckets; `f` returns the floor below which a sorted
   * bucket can stop. */
  private visit(q: Req, f: (list: CompiledRule[]) => void): void {
    for (const t of q.tokens) { const l = this.tokens.get(t); if (l) f(l) }
    if (this.requestDomains.size) for (const s of q.hostSuffixes) { const l = this.requestDomains.get(s); if (l) f(l) }
    if (this.initiatorDomains.size) {
      const init = q.initiatorSuffixes
      if (init) for (const s of init) { const l = this.initiatorDomains.get(s); if (l) f(l) }
    }
    if (this.generic.length) f(this.generic)
  }

  /** The matching rule with the highest key above `floor`, or null. */
  best(q: Req, floor = 0): CompiledRule | null {
    let winner: CompiledRule | null = null
    let min = floor
    this.visit(q, list => {
      for (const r of list) {
        if (r.key <= min) break
        if (ruleMatches(r, q)) { winner = r; min = r.key; break }
      }
    })
    return winner
  }

  /** Every matching rule (for modifyHeaders, where all of them count). */
  all(q: Req, out: CompiledRule[], minPriority = 0): void {
    const seen = new Set<CompiledRule>()
    this.visit(q, list => {
      for (const r of list) {
        if (r.priority <= minPriority) break
        if (!seen.has(r) && ruleMatches(r, q)) { seen.add(r); out.push(r) }
      }
    })
  }

  /** Bucket sizes, for the report. */
  stats(): Record<string, number> {
    let biggest = 0
    for (const l of this.tokens.values()) biggest = Math.max(biggest, l.length)
    return { rules: this.size, tokenBuckets: this.tokens.size, domainKeys: this.requestDomains.size, initiatorKeys: this.initiatorDomains.size, generic: this.generic.length, biggestBucket: biggest }
  }
}
