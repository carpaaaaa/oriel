// urlFilter as Chrome reads it: "*" any run, "^" a separator (anything but a
// letter, digit, "_", "-", "." or "%", or the end), "|" at either end anchors
// to the start or the end of the URL, "||" at the start anchors to the start
// of the host or of one of its labels. Case-insensitive unless the rule says.
//
// Besides matching, a filter offers "tokens" for the index: runs of
// [a-z0-9_%] that any matching URL must contain as a whole run, because the
// pattern bounds them on both sides by literal separators or anchors.

const isTokenCode = (c: number) =>
  (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95 || c === 37 || (c >= 65 && c <= 90)

/** Runs of token characters in a lowercased URL, each once. */
export function urlTokens(lower: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let start = -1
  for (let i = 0; i <= lower.length; i++) {
    const tok = i < lower.length && isTokenCode(lower.charCodeAt(i))
    if (tok) { if (start < 0) start = i; continue }
    if (start >= 0) {
      const t = lower.slice(start, i)
      if (!seen.has(t)) { seen.add(t); out.push(t) }
      start = -1
    }
  }
  return out
}

export interface UrlFilter {
  /** Index tokens, best first is up to the index (it knows frequencies). */
  tokens: string[]
  /** `lower` is url.toLowerCase(), `hostStart`/`hostEnd` the host's span. */
  test(url: string, lower: string, hostStart: number, hostEnd: number): boolean
}

const special = /[*^|]/

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

const SEPARATOR = '(?:[^A-Za-z0-9_\\-.%]|$)'
const DOMAIN_ANCHOR = '^[a-z][a-z0-9+.\\-]*:\\/\\/(?:[^\\/?#@]*@)?(?:[^\\/?#@:]*\\.)?'

export function isSeparatorCode(c: number): boolean {
  return !(isTokenCode(c) || c === 45 || c === 46)
}

export function compileUrlFilter(pattern: string, caseSensitive: boolean): UrlFilter {
  let body = pattern
  let left: 'none' | 'start' | 'domain' = 'none'
  if (body.startsWith('||')) { left = 'domain'; body = body.slice(2) }
  else if (body.startsWith('|')) { left = 'start'; body = body.slice(1) }
  let endAnchor = false
  if (body.endsWith('|')) { endAnchor = true; body = body.slice(0, -1) }

  // Tokens with safe boundaries.
  const tokens: string[] = []
  let start = -1
  for (let i = 0; i <= body.length; i++) {
    const tok = i < body.length && isTokenCode(body.charCodeAt(i))
    if (tok) { if (start < 0) start = i; continue }
    if (start >= 0) {
      const leftOk = start === 0 ? left !== 'none' : body[start - 1] !== '*'
      const rightOk = i === body.length ? endAnchor : body[i] !== '*'
      if (leftOk && rightOk) tokens.push(body.slice(start, i).toLowerCase())
      start = -1
    }
  }

  const needle = caseSensitive ? body : body.toLowerCase()

  // Plain substring: no wildcard, separator or anchor.
  if (left === 'none' && !endAnchor && !special.test(body)) {
    return { tokens, test: caseSensitive ? (url) => url.includes(needle) : (_u, lower) => lower.includes(needle) }
  }

  // "||host.part/path" with at most a trailing "^": try each label start.
  const trailingSep = body.endsWith('^')
  const literal = trailingSep ? needle.slice(0, -1) : needle
  if (left === 'domain' && !endAnchor && !special.test(literal) && literal.length > 0) {
    return {
      tokens,
      test(url, lower, hostStart, hostEnd) {
        const hay = caseSensitive ? url : lower
        for (let p = hostStart; p < hostEnd; p++) {
          if (p !== hostStart && hay.charCodeAt(p - 1) !== 46) continue
          if (!hay.startsWith(literal, p)) continue
          if (!trailingSep) return true
          const after = p + literal.length
          if (after >= hay.length || isSeparatorCode(hay.charCodeAt(after))) return true
        }
        return false
      },
    }
  }

  // Everything else: a regular expression, made on first use.
  let re: RegExp | null = null
  return {
    tokens,
    test(url) {
      if (!re) {
        let src = left === 'domain' ? DOMAIN_ANCHOR : left === 'start' ? '^' : ''
        for (const ch of body) src += ch === '*' ? '.*' : ch === '^' ? SEPARATOR : escapeRegex(ch)
        if (endAnchor) src += '$'
        re = new RegExp(src, caseSensitive ? 's' : 'is')
      }
      return re.test(url)
    },
  }
}

/** Chrome refuses these urlFilters. */
export function urlFilterProblem(pattern: string): string | null {
  if (pattern === '') return 'empty'
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(pattern)) return 'nonAscii'
  if (pattern.startsWith('||*')) return 'domainWildcard'
  return null
}
