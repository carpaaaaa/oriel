// A rule checked as Chrome checks it (same refusals, same messages) and made
// ready to match: bitmasks for types and methods, domain sets, the urlFilter
// or regex. Static rules that fail are skipped, as Chrome skips them;
// dynamic and session ones fail the whole update.

import { RESOURCE_TYPES, REQUEST_METHODS, ACTION_TYPES, type Rule, type RuleActionType, type HeaderInfo, type ModifyHeaderInfo } from './types'
import { compileUrlFilter, urlFilterProblem, type UrlFilter } from './urlfilter'
import { translateRegex } from './regex'
import { domainList, type DomainList } from './domains'

/** Chrome's order when priorities tie: allow, allowAllRequests, block,
 * upgradeScheme, redirect (modifyHeaders is matched apart). */
const RANK: Record<RuleActionType, number> = { allow: 5, allowAllRequests: 4, block: 3, upgradeScheme: 2, redirect: 1, modifyHeaders: 0 }

const ALL_TYPES = (1 << RESOURCE_TYPES.length) - 1
const MAIN_FRAME = 1 << RESOURCE_TYPES.indexOf('main_frame')
const SUB_FRAME = 1 << RESOURCE_TYPES.indexOf('sub_frame')
const ALL_METHODS = (1 << REQUEST_METHODS.length) - 1

export const typeBit = (t: string) => { const i = (RESOURCE_TYPES as readonly string[]).indexOf(t); return i < 0 ? 0 : 1 << i }
export const methodBit = (m: string) => { const i = (REQUEST_METHODS as readonly string[]).indexOf(m); return 1 << (i < 0 ? REQUEST_METHODS.length - 1 : i) }

export interface HeaderMatcher { name: string; values: RegExp[] | null; excluded: RegExp[] | null }

export interface CompiledRule {
  rule: Rule
  id: number
  rulesetId: string
  priority: number
  type: RuleActionType
  /** priority and action precedence in one number: higher wins. */
  key: number
  types: number
  methods: number
  url: UrlFilter | null
  regex: RegExp | null
  requestDomains: DomainList | null
  excludedRequestDomains: DomainList | null
  initiatorDomains: DomainList | null
  excludedInitiatorDomains: DomainList | null
  topDomains: DomainList | null
  excludedTopDomains: DomainList | null
  /** 0 any, 1 first party only, 2 third party only. */
  party: 0 | 1 | 2
  tabIds: Set<number> | null
  excludedTabIds: Set<number> | null
  responseHeaders: HeaderMatcher[] | null
  excludedResponseHeaders: HeaderMatcher[] | null
}

export class RuleError extends Error {}

const fail = (id: unknown, text: string): never => { throw new RuleError(`Rule with id ${id} ${text}`) }

const appendable = new Set(['accept', 'accept-encoding', 'accept-language', 'access-control-request-headers', 'cache-control', 'connection', 'content-language', 'cookie', 'forwarded', 'if-match', 'if-none-match', 'keep-alive', 'range', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'user-agent', 'via', 'want-digest', 'x-forwarded-for'])
const headerName = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

function glob(pattern: string): RegExp {
  const src = pattern.replace(/[.+^${}()|[\]\\/]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${src}$`, 'is')
}

function headerMatchers(id: number, key: string, list: HeaderInfo[] | undefined): HeaderMatcher[] | null {
  if (list === undefined) return null
  if (!Array.isArray(list) || list.length === 0) fail(id, `cannot specify an empty list as the value for the "condition.${key}" key.`)
  return list.map(h => {
    if (!h || typeof h.header !== 'string' || !headerName.test(h.header)) fail(id, `must specify a valid header name for the "condition.${key}" key.`)
    return {
      name: h.header.toLowerCase(),
      values: h.values ? h.values.map(glob) : null,
      excluded: h.excludedValues ? h.excludedValues.map(glob) : null,
    }
  })
}

function checkModify(id: number, list: ModifyHeaderInfo[] | undefined, key: 'requestHeaders' | 'responseHeaders'): void {
  if (list === undefined) return
  if (!Array.isArray(list) || list.length === 0) fail(id, `cannot specify an empty list as the value for the "action.${key}" key.`)
  for (const h of list) {
    if (!h || typeof h.header !== 'string' || !headerName.test(h.header)) fail(id, 'must specify a valid header name to be modified.')
    if (!['append', 'set', 'remove'].includes(h.operation)) fail(id, `specifies an invalid value for the "action.${key}.operation" key.`)
    if (h.operation === 'remove' && h.value !== undefined) fail(id, 'must not provide a header value for a header to be removed.')
    if (h.operation !== 'remove' && (typeof h.value !== 'string' || h.value === '')) fail(id, `uses the "${h.operation}" operation without specifying a header value.`)
    if (key === 'requestHeaders' && h.operation === 'append' && !appendable.has(h.header.toLowerCase())) {
      fail(id, 'specifies an invalid request header to be appended. Only standard HTTP request headers that can specify multiple values for a single entry are supported.')
    }
  }
}

function bits(id: number, key: string, list: string[] | undefined, all: readonly string[], bitOf: (v: string) => number): number | null {
  if (list === undefined) return null
  if (!Array.isArray(list) || list.length === 0) fail(id, `cannot specify an empty list as the value for the "condition.${key}" key.`)
  let mask = 0
  for (const v of list) {
    if (!all.includes(v)) fail(id, `specifies an invalid value for the "condition.${key}" key.`)
    mask |= bitOf(v)
  }
  return mask
}

function domains(id: number, key: string, list: string[] | undefined): DomainList | null {
  if (list === undefined) return null
  if (!Array.isArray(list) || list.length === 0) fail(id, `cannot specify an empty list as the value for the "condition.${key}" key.`)
  for (const d of list) {
    if (typeof d !== 'string' || d === '') fail(id, `specifies an invalid value for the "condition.${key}" key.`)
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(d)) fail(id, `cannot have non-ascii characters as part of the "condition.${key}" key.`)
  }
  return domainList(list)
}

function checkRedirect(id: number, rule: Rule): void {
  const r = rule.action.redirect
  if (!r || typeof r !== 'object') fail(id, 'does not specify the value for "action.redirect" key.')
  const given = ['url', 'extensionPath', 'transform', 'regexSubstitution'].filter(k => (r as Record<string, unknown>)[k] !== undefined)
  if (given.length === 0) fail(id, 'does not specify the value for "action.redirect" key.')
  if (r!.url !== undefined) {
    let u: URL | null = null
    try { u = new URL(r!.url) } catch { /* below */ }
    if (!u) fail(id, 'specifies an invalid value for the "action.redirect.url" key.')
    if (u!.protocol === 'javascript:') fail(id, 'specifies a "javascript:" url for the "action.redirect.url" key.')
  }
  if (r!.extensionPath !== undefined && (typeof r!.extensionPath !== 'string' || !r!.extensionPath.startsWith('/'))) {
    fail(id, 'specifies an invalid value for the "action.redirect.extensionPath" key. It must start with a "/".')
  }
  if (r!.regexSubstitution !== undefined && rule.condition.regexFilter === undefined) {
    fail(id, `can't specify the "action.redirect.regexSubstitution" key without specifying the "condition.regexFilter" key.`)
  }
  const t = r!.transform
  if (t) {
    if (t.scheme !== undefined && !['http', 'https', 'ftp', 'chrome-extension'].includes(t.scheme)) fail(id, 'specifies an invalid value for the "action.redirect.transform.scheme" key. Allowed values are: "http", "https", "ftp", "chrome-extension".')
    if (t.query !== undefined && t.queryTransform !== undefined) fail(id, 'cannot specify both "query" and "queryTransform" keys.')
    if (t.query !== undefined && t.query !== '' && !t.query.startsWith('?')) fail(id, 'specifies an invalid value for the "action.redirect.transform.query" key. It should be empty or begin with a "?".')
    if (t.fragment !== undefined && t.fragment !== '' && !t.fragment.startsWith('#')) fail(id, 'specifies an invalid value for the "action.redirect.transform.fragment" key. It should be empty or begin with a "#".')
    if (t.path !== undefined && t.path !== '' && !t.path.startsWith('/')) fail(id, 'specifies an invalid value for the "action.redirect.transform.path" key. It should be empty or begin with a "/".')
  }
}

/** Throws RuleError with Chrome's wording when the rule isn't valid. */
export function compileRule(rule: Rule, rulesetId: string, scope: 'static' | 'dynamic' | 'session'): CompiledRule {
  if (!rule || typeof rule !== 'object') throw new RuleError('Rule is not an object.')
  const id = rule.id
  if (!Number.isInteger(id) || id < 1) fail(id, 'must have a positive value for the "id" key.')
  if (rule.priority !== undefined && (!Number.isInteger(rule.priority) || rule.priority < 1)) fail(id, 'must have a positive value for the "priority" key.')
  const action = rule.action
  if (!action || !(ACTION_TYPES as readonly string[]).includes(action.type)) fail(id, 'specifies an invalid value for the "action.type" key.')
  const c = rule.condition ?? {}
  if (typeof c !== 'object') fail(id, 'specifies an invalid value for the "condition" key.')

  if (c.urlFilter !== undefined && c.regexFilter !== undefined) fail(id, 'can only specify one of "condition.urlFilter" or "condition.regexFilter" keys.')
  let url: UrlFilter | null = null
  let regex: RegExp | null = null
  if (c.urlFilter !== undefined) {
    const problem = typeof c.urlFilter !== 'string' ? 'empty' : urlFilterProblem(c.urlFilter)
    if (problem === 'empty') fail(id, 'cannot have an empty value for the "condition.urlFilter" key.')
    if (problem === 'nonAscii') fail(id, 'cannot have non-ascii characters as part of the "condition.urlFilter" key.')
    if (problem === 'domainWildcard') fail(id, 'specifies an incorrect value for the "condition.urlFilter" key. It cannot start with "||*".')
    url = compileUrlFilter(c.urlFilter, c.isUrlFilterCaseSensitive === true)
  }
  if (c.regexFilter !== undefined) {
    if (typeof c.regexFilter !== 'string' || c.regexFilter === '') fail(id, 'cannot have an empty value for the "condition.regexFilter" key.')
    const t = translateRegex(c.regexFilter, c.isUrlFilterCaseSensitive === true)
    if ('reason' in t) {
      fail(id, t.reason === 'memoryLimitExceeded'
        ? 'specified a more complex regex than allowed as part of the "condition.regexFilter" key.'
        : 'specified an invalid regular expression as part of the "condition.regexFilter" key.')
    } else regex = t.re
  }

  let types = bits(id, 'resourceTypes', c.resourceTypes, RESOURCE_TYPES, typeBit)
  const excludedTypes = bits(id, 'excludedResourceTypes', c.excludedResourceTypes, RESOURCE_TYPES, typeBit)
  if (types !== null && excludedTypes !== null && (types & excludedTypes)) fail(id, 'includes and excludes the same resource.')
  if (types === null) types = excludedTypes === null ? ALL_TYPES & ~MAIN_FRAME : ALL_TYPES
  if (excludedTypes !== null) types &= ~excludedTypes
  if (!types) fail(id, 'is not applicable to any resource type.')
  if (action.type === 'allowAllRequests' && (c.resourceTypes === undefined || (types & ~(MAIN_FRAME | SUB_FRAME)))) {
    fail(id, 'is an "allowAllRequests" rule and must specify the "condition.resourceTypes" key. It may only include the "main_frame" and "sub_frame" resource types.')
  }

  let methods = bits(id, 'requestMethods', c.requestMethods, REQUEST_METHODS, methodBit)
  const excludedMethods = bits(id, 'excludedRequestMethods', c.excludedRequestMethods, REQUEST_METHODS, methodBit)
  if (methods !== null && excludedMethods !== null && (methods & excludedMethods)) fail(id, 'includes and excludes the same request method.')
  if (methods === null) methods = ALL_METHODS
  if (excludedMethods !== null) methods &= ~excludedMethods

  if ((c.tabIds !== undefined || c.excludedTabIds !== undefined) && scope !== 'session') {
    fail(id, 'specifies a value for "condition.tabIds" or "condition.excludedTabIds" key. These are only supported for session-scoped rules.')
  }
  if (c.tabIds !== undefined && (!Array.isArray(c.tabIds) || c.tabIds.length === 0)) fail(id, 'cannot specify an empty list as the value for the "condition.tabIds" key.')
  const tabIds = c.tabIds ? new Set(c.tabIds) : null
  const excludedTabIds = c.excludedTabIds ? new Set(c.excludedTabIds) : null
  if (tabIds && excludedTabIds && [...tabIds].some(t => excludedTabIds.has(t))) fail(id, 'includes and excludes the same tab ID.')

  if (action.type === 'redirect') checkRedirect(id, rule)
  if (action.type === 'modifyHeaders') {
    if (!action.requestHeaders && !action.responseHeaders) fail(id, 'does not specify the value for "action.requestHeaders" or "action.responseHeaders" key. This is required for "modifyHeaders" rules.')
    checkModify(id, action.requestHeaders, 'requestHeaders')
    checkModify(id, action.responseHeaders, 'responseHeaders')
  }

  const priority = rule.priority ?? 1
  return {
    rule,
    id,
    rulesetId,
    priority,
    type: action.type,
    key: priority * 8 + RANK[action.type],
    types,
    methods,
    url,
    regex,
    // "domains" and "excludedDomains" are the names before Chrome 101.
    requestDomains: domains(id, 'requestDomains', c.requestDomains),
    excludedRequestDomains: domains(id, 'excludedRequestDomains', c.excludedRequestDomains),
    initiatorDomains: domains(id, 'initiatorDomains', c.initiatorDomains ?? c.domains),
    excludedInitiatorDomains: domains(id, 'excludedInitiatorDomains', c.excludedInitiatorDomains ?? c.excludedDomains),
    topDomains: domains(id, 'topDomains', c.topDomains),
    excludedTopDomains: domains(id, 'excludedTopDomains', c.excludedTopDomains),
    party: c.domainType === 'firstParty' ? 1 : c.domainType === 'thirdParty' ? 2 : 0,
    tabIds,
    excludedTabIds,
    responseHeaders: headerMatchers(id, 'responseHeaders', c.responseHeaders),
    excludedResponseHeaders: headerMatchers(id, 'excludedResponseHeaders', c.excludedResponseHeaders),
  }
}

/** Redirects and header changes count against Chrome's "unsafe" limits. */
export const isUnsafe = (r: Rule) => r.action?.type === 'redirect' || r.action?.type === 'modifyHeaders'
