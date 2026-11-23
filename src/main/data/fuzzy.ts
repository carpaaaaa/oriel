// Typos in the address field: a word with a letter wrong, missing or swapped
// still finds what it meant. Only a fallback, ranked below exact matches
// (Fuzzy.swift, 05 §3.5). Texts are lowercased by the caller.

/** Letters and digits, and anything outside ASCII. */
function inWord(c: string): boolean {
  const code = c.charCodeAt(0)
  return code >= 0x80 || (code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a)
}

/** Whether `word` starts a word of `text`: "api" in "team/api", not "rapid". */
export function startsWord(word: string, text: string): boolean {
  if (!word || text.length < word.length) return false
  const anywhere = !inWord(word[0])
  let from = 0
  for (;;) {
    const at = text.indexOf(word, from)
    if (at < 0) return false
    if (anywhere || at === 0 || !inWord(text[at - 1])) return true
    from = at + 1
  }
}

/** 1 if every word is in `text` as typed, 0 if one needed a typo forgiven,
 * null if one isn't there. */
export function match(words: string[], text: string): 0 | 1 | null {
  let slipped = false
  for (const w of words) {
    if (text.includes(w)) continue
    if (!nearly(w, text)) return null
    slipped = true
  }
  return slipped ? 0 : 1
}

/** Whether a word of `text` starts with `typed`, allowing one typo, or two in
 * long words. None under four letters, where a guess is noise. */
export function nearly(typed: string, text: string): boolean {
  const allowed = typed.length < 4 ? 0 : typed.length < 8 ? 1 : 2
  if (!allowed) return false
  const width = typed.length + allowed + 1
  let start = 0
  while (start < text.length) {
    if (!inWord(text[start])) { start++; continue }
    let end = start
    while (end < text.length && inWord(text[end])) end++
    const word = text.slice(start, end)
    start = end
    // The first letter (or a swap with the second) is required: cheap skip.
    if (word.length < 2 || word.length < typed.length - allowed) continue
    if (!(word[0] === typed[0] || (word[0] === typed[1] && word[1] === typed[0]))) continue
    const columns = Math.min(word.length, width - 1)
    let before = new Array(width).fill(0), above = new Array(width).fill(0), row = new Array(width).fill(0)
    for (let j = 0; j <= columns; j++) above[j] = j
    let far = false
    for (let i = 1; i <= typed.length; i++) {
      row[0] = i
      let least = i
      for (let j = 1; j <= columns; j++) {
        let best = Math.min(above[j] + 1, row[j - 1] + 1, above[j - 1] + (typed[i - 1] === word[j - 1] ? 0 : 1))
        if (i > 1 && j > 1 && typed[i - 1] === word[j - 2] && typed[i - 2] === word[j - 1]) best = Math.min(best, before[j - 2] + 1)
        row[j] = best
        least = Math.min(least, best)
      }
      if (least > allowed) { far = true; break }
      ;[before, above, row] = [above, row, before]
    }
    if (!far && above.slice(1, columns + 1).some(v => v <= allowed)) return true
  }
  return false
}
