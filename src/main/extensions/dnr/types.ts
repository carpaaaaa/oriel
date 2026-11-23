// chrome.declarativeNetRequest: the rule shapes and the API's constants, as
// Chrome 156 defines them (studio/04 §3.5, §8.4). The engine is ours because
// Electron loads no static rulesets (studio/07 §1.1, #55729).

export const RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other',
] as const
export type ResourceType = typeof RESOURCE_TYPES[number]

export const REQUEST_METHODS = ['connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'other'] as const
export type RequestMethod = typeof REQUEST_METHODS[number]

export const ACTION_TYPES = ['block', 'redirect', 'allow', 'upgradeScheme', 'modifyHeaders', 'allowAllRequests'] as const
export type RuleActionType = typeof ACTION_TYPES[number]

export interface HeaderInfo { header: string; values?: string[]; excludedValues?: string[] }

export interface RuleCondition {
  urlFilter?: string
  regexFilter?: string
  isUrlFilterCaseSensitive?: boolean
  initiatorDomains?: string[]
  excludedInitiatorDomains?: string[]
  requestDomains?: string[]
  excludedRequestDomains?: string[]
  topDomains?: string[]
  excludedTopDomains?: string[]
  /** Before Chrome 101. */
  domains?: string[]
  excludedDomains?: string[]
  resourceTypes?: ResourceType[]
  excludedResourceTypes?: ResourceType[]
  requestMethods?: RequestMethod[]
  excludedRequestMethods?: RequestMethod[]
  domainType?: 'firstParty' | 'thirdParty'
  tabIds?: number[]
  excludedTabIds?: number[]
  responseHeaders?: HeaderInfo[]
  excludedResponseHeaders?: HeaderInfo[]
}

export interface QueryKeyValue { key: string; value: string; replaceOnly?: boolean }
export interface URLTransform {
  scheme?: string
  host?: string
  port?: string
  path?: string
  query?: string
  queryTransform?: { removeParams?: string[]; addOrReplaceParams?: QueryKeyValue[] }
  fragment?: string
  username?: string
  password?: string
}
export interface Redirect { extensionPath?: string; transform?: URLTransform; url?: string; regexSubstitution?: string }

export interface ModifyHeaderInfo { header: string; operation: 'append' | 'set' | 'remove'; value?: string }

export interface RuleAction {
  type: RuleActionType
  redirect?: Redirect
  requestHeaders?: ModifyHeaderInfo[]
  responseHeaders?: ModifyHeaderInfo[]
}

export interface Rule { id: number; priority?: number; action: RuleAction; condition: RuleCondition }

/** Where a rule comes from: a static ruleset's id, or one of these two. */
export const DYNAMIC_RULESET_ID = '_dynamic'
export const SESSION_RULESET_ID = '_session'

export const LIMITS = {
  GUARANTEED_MINIMUM_STATIC_RULES: 30000,
  /** The global pool Chrome shares among extensions. */
  GLOBAL_STATIC_RULES: 300000,
  MAX_NUMBER_OF_DYNAMIC_RULES: 30000,
  MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: 5000,
  MAX_NUMBER_OF_SESSION_RULES: 5000,
  MAX_NUMBER_OF_UNSAFE_SESSION_RULES: 5000,
  MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES: 5000,
  MAX_NUMBER_OF_REGEX_RULES: 1000,
  MAX_NUMBER_OF_STATIC_RULESETS: 100,
  MAX_NUMBER_OF_ENABLED_STATIC_RULESETS: 50,
  MAX_NUMBER_OF_DISABLED_STATIC_RULES: 5000,
  GETMATCHEDRULES_QUOTA_INTERVAL: 10,
  MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL: 20,
}

/** The constants and enums of chrome.declarativeNetRequest, for contexts
 * where Electron doesn't give them. */
export function apiConstants(): Record<string, unknown> {
  const e = (values: readonly string[], key = (v: string) => v.toUpperCase()) => Object.fromEntries(values.map(v => [key(v), v]))
  const snake = (v: string) => v.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()
  return {
    DYNAMIC_RULESET_ID, SESSION_RULESET_ID,
    ...LIMITS,
    ResourceType: e(RESOURCE_TYPES),
    RequestMethod: e(REQUEST_METHODS),
    RuleActionType: e(ACTION_TYPES, snake),
    DomainType: { FIRST_PARTY: 'firstParty', THIRD_PARTY: 'thirdParty' },
    HeaderOperation: { APPEND: 'append', SET: 'set', REMOVE: 'remove' },
    UnsupportedRegexReason: { SYNTAX_ERROR: 'syntaxError', MEMORY_LIMIT_EXCEEDED: 'memoryLimitExceeded' },
  }
}
