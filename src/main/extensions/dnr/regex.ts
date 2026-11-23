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

const isAlnum = (c: string) => /[a-z0-9]/i.test(c)

/** What any URL a regex matches must contain: its literal runs outside
 * groups (none if it has a top-level "|"), so a URL without them is turned
 * down by `includes` before the regex runs, and index tokens: runs of
 * [a-z0-9] bounded inside a literal run, or by the regex's own ^ and $. */
export function regexLiterals(source: string): { pieces: string[]; tokens: string[] } {
  const runs: { text: string; left: boolean; right: boolean }[] = []
  let cur = ''
  let curLeft = false
  let depth = 0
  const flush = (right = false) => {
    if (cur) runs.push({ text: cur, left: curLeft, right })
    cur = ''
    curLeft = false
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      const n = source[++i] ?? ''
      if (/[A-Za-z0-9]/.test(n)) { if (depth === 0) flush(); continue } // \d \w \b \x41...
      if (depth === 0) cur += n
      continue
    }
    if (c === '[') {
      if (depth === 0) flush()
      for (i++; i < source.length && source[i] !== ']'; i++) if (source[i] === '\\') i++
      continue
    }
    if (c === '(') { if (depth === 0) flush(); depth++; continue }
    if (c === ')') { depth--; continue }
    if (c === '|') { if (depth === 0) return { pieces: [], tokens: [] }; continue }
    if (depth > 0) continue
    if (c === '?' || c === '*') { cur = cur.slice(0, -1); flush(); continue }
    if (c === '+') { flush(); continue }
    if (c === '{') {
      const m = /^\{(\d*)/.exec(source.slice(i))
      if (m && (m[1] === '' || m[1] === '0')) cur = cur.slice(0, -1)
      flush()
      while (i < source.length && source[i] !== '}') i++
      continue
    }
    if (c === '^' && i === 0) { curLeft = true; continue }
    if (c === '$') { flush(true); continue }
    if (c === '.') { flush(); continue }
    cur += c
  }
  flush()
  const pieces = runs.map(r => r.text).filter(t => t.length >= 3)
  const tokens: string[] = []
  for (const r of runs) {
    let start = -1
    for (let i = 0; i <= r.text.length; i++) {
      const tok = i < r.text.length && isAlnum(r.text[i])
      if (tok) { if (start < 0) start = i; continue }
      if (start >= 0) {
        if ((start > 0 || r.left) && (i < r.text.length || r.right)) tokens.push(r.text.slice(start, i).toLowerCase())
        start = -1
      }
    }
  }
  return { pieces, tokens }
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
