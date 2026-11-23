// regexFilter is RE2 in Chrome. RE2 and JavaScript agree on nearly all of
// what filter lists use; this turns the few RE2-only spellings into
// JavaScript and refuses what RE2 would refuse (lookarounds, backreferences),
// so isRegexSupported answers as Chrome does.

export type RegexReason = 'syntaxError' | 'memoryLimitExceeded'

const posix: Record<string, string> = {
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z',
  space: '\\s', word: '\\w', xdigit: '0-9A-Fa-f', punct: '!-\\/:-@\\[-`{-~',
}

/** Chrome's RE2 refuses programs over about 2 KB; long sources are the
 * ones that get there. */
const MAX_SOURCE = 4096

export function translateRegex(source: string, caseSensitive: boolean): { re: RegExp } | { reason: RegexReason } {
  let src = source
  let flags = caseSensitive ? '' : 'i'
  // Leading inline flags: (?i), (?s), (?is)...
  const lead = /^\(\?([imsU]+)\)/.exec(src)
  if (lead) {
    if (lead[1].includes('i')) flags = flags.includes('i') ? flags : flags + 'i'
    if (lead[1].includes('s')) flags += 's'
    src = src.slice(lead[0].length)
  }
  // RE2 has no lookarounds and no backreferences.
  if (/\(\?<?[=!]/.test(src)) return { reason: 'syntaxError' }
  if (/(^|[^\\])(\\\\)*\\[1-9]/.test(src)) return { reason: 'syntaxError' }
  src = src
    .replace(/\(\?P</g, '(?<')
    .replace(/\\A/g, '^')
    .replace(/\\z/g, '$')
    .replace(/\[:(\w+):\]/g, (m, name: string) => posix[name] ?? m)
  if (source.length > MAX_SOURCE) return { reason: 'memoryLimitExceeded' }
  try {
    return { re: new RegExp(src, flags) }
  } catch {
    return { reason: 'syntaxError' }
  }
}

/** The regexSubstitution of a redirect: \0 is the whole match, \1..\9 groups,
 * "\\" a backslash. Chrome replaces the first match only. */
export function substitute(url: string, re: RegExp, substitution: string): string | null {
  const m = re.exec(url)
  if (!m) return null
  let out = ''
  for (let i = 0; i < substitution.length; i++) {
    const ch = substitution[i]
    if (ch === '\\' && i + 1 < substitution.length) {
      const next = substitution[i + 1]
      if (next >= '0' && next <= '9') { out += m[Number(next)] ?? ''; i++; continue }
      if (next === '\\') { out += '\\'; i++; continue }
    }
    out += ch
  }
  return url.slice(0, m.index) + out + url.slice(m.index + m[0].length)
}
