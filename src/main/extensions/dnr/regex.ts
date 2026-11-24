// regexFilter is RE2 in Chrome. RE2 and JavaScript agree on nearly all of
// what filter lists use; this turns the few RE2-only spellings into
// JavaScript and refuses what RE2 would refuse (lookarounds, backreferences,
// counts over 1000), so isRegexSupported answers as Chrome does.
//
// RE2 is linear; JavaScript's RegExp backtracks, in the main process, on
// every request: one regex like (a+)+$ would freeze the whole browser
// (studio/09 §1.9). So what could backtrack without end is refused too, as
// too complex: a repeated group with a quantifier inside (star height over
// one) unless one mandatory character starts or ends each round and nothing
// else in it can match that character ([a-z0-9-]+\.)*, and a repeated
// group whose alternatives can start with the same character (a|ab)+. URLs
// are ASCII, so characters are compared over ASCII only.

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
  let re: RegExp
  try {
    re = new RegExp(src, flags)
  } catch {
    return { reason: 'syntaxError' }
  }
  const tree = parse(src)
  if (!tree) return { reason: 'syntaxError' }
  if (overCount(tree)) return { reason: 'syntaxError' }
  if (!linearEnough(tree, flags)) return { reason: 'memoryLimitExceeded' }
  return { re }
}

// A small parse of the (JavaScript) source: what is repeated, and what each
// round can match.

/** One step of a sequence: a character's worth (a leaf, as its source), an
 * anchor (zero), or a group of alternatives; and how often. */
interface Step { leaf?: string; zero?: boolean; group?: Step[][]; min: number; max: number }

function parse(src: string): Step[][] | null {
  let i = 0
  const alternatives = (): Step[][] => {
    const out: Step[][] = [[]]
    while (i < src.length) {
      const c = src[i]
      if (c === ')') return out
      if (c === '|') { i++; out.push([]); continue }
      let step: Step
      if (c === '(') {
        i++
        if (src[i] === '?') {
          const named = /^\?(?::|<[A-Za-z_]\w*>|[imsU-]+:)/.exec(src.slice(i))
          if (!named) throw new Error('group')
          i += named[0].length
        }
        const body = alternatives()
        if (src[i] !== ')') throw new Error('unbalanced')
        i++
        step = { group: body, min: 1, max: 1 }
      } else if (c === '[') {
        const start = i++
        if (src[i] === '^') i++
        if (src[i] === ']') i++
        while (i < src.length && src[i] !== ']') i += src[i] === '\\' ? 2 : 1
        i++
        step = { leaf: src.slice(start, i), min: 1, max: 1 }
      } else if (c === '\\') {
        const n = src[i + 1] ?? ''
        if (n === 'b' || n === 'B') { i += 2; step = { zero: true, min: 1, max: 1 } }
        else {
          const m = /^\\(?:x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|u\{[0-9A-Fa-f]+\}|[pP]\{[^}]*\}|c[A-Za-z]|[\s\S])/.exec(src.slice(i))
          const text = m ? m[0] : '\\'
          i += text.length
          step = { leaf: text, min: 1, max: 1 }
        }
      } else if (c === '^' || c === '$') { i++; step = { zero: true, min: 1, max: 1 } }
      else { i++; step = { leaf: c, min: 1, max: 1 } }
      const q = /^(?:([*+?])|\{(\d+)(?:(,)(\d*))?\})\??/.exec(src.slice(i))
      if (q) {
        i += q[0].length
        if (q[1] === '*') { step.min = 0; step.max = Infinity }
        else if (q[1] === '+') { step.min = 1; step.max = Infinity }
        else if (q[1] === '?') { step.min = 0; step.max = 1 }
        else {
          step.min = Number(q[2])
          step.max = q[3] ? (q[4] ? Number(q[4]) : Infinity) : step.min
        }
      }
      out[out.length - 1].push(step)
    }
    return out
  }
  try {
    const top = alternatives()
    return i === src.length ? top : null
  } catch {
    return null
  }
}

const each = (alts: Step[][], f: (s: Step) => void): void => {
  for (const seq of alts) for (const s of seq) { f(s); if (s.group) each(s.group, f) }
}

/** RE2 refuses a count over 1000. */
function overCount(tree: Step[][]): boolean {
  let over = false
  each(tree, s => { if ((s.max !== Infinity && s.max > 1000) || s.min > 1000) over = true })
  return over
}

const ASCII = Array.from({ length: 128 }, (_, n) => String.fromCharCode(n))
const setCache = new Map<string, Set<string>>()
/** The ASCII characters a leaf matches. */
function setOf(leaf: string, flags: string): Set<string> {
  const key = flags + '\u0000' + leaf
  let set = setCache.get(key)
  if (!set) {
    let re: RegExp | null = null
    try { re = new RegExp(`^(?:${leaf})$`, flags) } catch {}
    set = new Set(re ? ASCII.filter(c => re!.test(c)) : ASCII)
    if (setCache.size > 2000) setCache.clear()
    setCache.set(key, set)
  }
  return set
}

const meets = (a: Set<string>, b: Set<string>) => { for (const c of a) if (b.has(c)) return true; return false }
const quantified = (s: Step) => s.min !== 1 || s.max !== 1
const repeats = (s: Step) => s.max > 1

/** The characters the first step of a sequence matches, or null when it
 * isn't one mandatory character's worth. */
function firstSet(seq: Step[], flags: string): Set<string> | null {
  const s = seq.find(x => !x.zero)
  return s && s.leaf && s.min >= 1 ? setOf(s.leaf, flags) : null
}

/** Each round of a repeated group starts or ends with a mandatory character
 * nothing else in it can match: the rounds can be told apart in one way. */
function delimited(body: Step[][], flags: string): boolean {
  if (body.length !== 1) return false
  const seq = body[0].filter(s => !s.zero)
  for (const edge of [seq[0], seq[seq.length - 1]]) {
    if (!edge?.leaf || quantified(edge)) continue
    const d = setOf(edge.leaf, flags)
    if (!d.size) continue
    let clash = false
    each([seq], s => { if (s !== edge && s.leaf && meets(setOf(s.leaf, flags), d)) clash = true })
    if (!clash) return true
  }
  return false
}

function linearEnough(tree: Step[][], flags: string): boolean {
  let ok = true
  each(tree, s => {
    if (!ok || !s.group || !repeats(s)) return
    let inner = false
    each(s.group, x => { if (quantified(x) && !x.zero) inner = true })
    if (inner && !delimited(s.group, flags)) { ok = false; return }
    // Alternatives that can start alike: (a|ab)+ tries every split.
    if (s.group.length > 1) {
      const firsts = s.group.map(seq => firstSet(seq, flags))
      if (firsts.some(f => !f)) { ok = false; return }
      for (let a = 0; a < firsts.length; a++) for (let b = a + 1; b < firsts.length; b++) if (meets(firsts[a]!, firsts[b]!)) ok = false
    }
  })
  return ok
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
