// A site's Markdown copy of a page, as reading mode shows it (studio/03
// §6.2; Markdown.swift, in short): CommonMark's common parts, tables,
// strike-through, task lists and bare links. Nothing in it can run: every
// character of text is escaped, raw HTML is shown as text, and addresses
// are only web or mail ones. The first level-one heading is the title.
// Owned by the pages module.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function address(raw: string, base: string): string | null {
  try {
    const u = new URL(raw.trim().replace(/^<|>$/g, ''), base)
    return /^(https?|mailto):$/.test(u.protocol) ? u.href : null
  } catch { return null }
}

function inline(text: string, base: string): string {
  const keep: string[] = []
  const hold = (html: string) => `\u0000${keep.push(html) - 1}\u0000`
  let s = text
  s = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_m, _t, code: string) => hold(`<code>${esc(code.trim())}</code>`))
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, alt: string, src: string) => {
    const a = address(src, base)
    return a && !a.startsWith('mailto:') ? hold(`<img src="${esc(a)}" alt="${esc(alt)}">`) : m
  })
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, label: string, href: string) => {
    const a = address(href, base)
    return a ? hold(`<a href="${esc(a)}">`) + label + hold('</a>') : m
  })
  s = s.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, (m, href: string) => { const a = address(href, base); return a ? hold(`<a href="${esc(a)}">${esc(href)}</a>`) : m })
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g, (m, pre: string, href: string) => { const a = address(href, base); return a ? pre + hold(`<a href="${esc(a)}">${esc(href)}</a>`) : m })
  s = esc(s)
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`)
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)|(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, (_m, p1, a, p2, b) => `${p1 ?? p2 ?? ''}<em>${a ?? b}</em>`)
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
  s = s.replace(/ {2,}\n|\\\n/g, '<br>')
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => keep[+i])
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))

/** The page's HTML and its title, if a level-one heading gives one. */
export function markdownPage(source: string, base: string): { html: string; title: string | null } {
  const lines = source.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n')
  const out: string[] = []
  let title: string | null = null
  let i = 0
  const para: string[] = []
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join('\n'), base)}</p>`); para.length = 0 } }
  const list = (start: number): number => {
    // A run of list items at one indent; deeper ones nest.
    const first = lines[start]
    const ordered = /^\s*\d+[.)]\s/.test(first)
    const indent = first.match(/^\s*/)![0].length
    const items: string[] = []
    let j = start
    while (j < lines.length) {
      const l = lines[j]
      const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l)
      if (!m || m[1].length < indent) break
      if (m[1].length > indent) { // nested
        const inner: string[] = []
        const end = list.call(null, j)
        inner.push(out.pop()!)
        items[items.length - 1] += inner.join('')
        j = end
        continue
      }
      let body = m[3]
      const task = /^\[([ xX])\]\s+(.*)$/.exec(body)
      body = task ? `<input type="checkbox" disabled${task[1] === ' ' ? '' : ' checked'}> ${inline(task[2], base)}` : inline(body, base)
      j++
      while (j < lines.length && lines[j].trim() && !/^\s*([-*+]|\d+[.)])\s/.test(lines[j]) && /^\s{2,}\S/.test(lines[j])) { body += ' ' + inline(lines[j].trim(), base); j++ }
      items.push(body)
      if (j < lines.length && !lines[j].trim() && j + 1 < lines.length && /^\s*([-*+]|\d+[.)])\s/.test(lines[j + 1])) j++
    }
    out.push(`<${ordered ? 'ol' : 'ul'}>${items.map(x => `<li>${x}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`)
    return j
  }
  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(line)
    if (fence) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i++])
      i++
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      flush()
      const level = h[1].length
      if (level === 1 && title === null) { title = h[2].replace(/[*_`]/g, ''); i++; continue }
      out.push(`<h${level}>${inline(h[2], base)}</h${level}>`)
      i++
      continue
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue }
    if (/^\s{0,3}>/.test(line)) {
      flush()
      const quote: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quote.push(lines[i++].replace(/^\s{0,3}>\s?/, ''))
      out.push(`<blockquote>${markdownPage(quote.join('\n'), base).html}</blockquote>`)
      continue
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) { flush(); i = list(i); continue }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush()
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      out.push(`<div class="oriel-wide"><table><thead><tr>${head.map(c => `<th>${inline(c, base)}</th>`).join('')}</tr></thead><tbody>` +
        rows.map(r => `<tr>${head.map((_c, k) => `<td>${inline(r[k] ?? '', base)}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>')
      continue
    }
    if (/^( {4}|\t)/.test(line) && !para.length) {
      // Four spaces are no code in MDX, which most of these copies are: a paragraph.
      para.push(line.trim()); i++; continue
    }
    if (!line.trim()) { flush(); i++; continue }
    para.push(line)
    i++
  }
  flush()
  return { html: out.join('\n'), title }
}
