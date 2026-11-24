// Reading mode in the page (studio/03 §6.2; Reader.swift): the article and
// nothing that was arranged around it. The piece of the page carrying the
// most prose, less what of it is links, is copied out with its pictures
// resolved and what the page hid left behind; the page's own stylesheets go
// and the reading page's come. With Read the site's own Markdown, the
// site's Markdown copy of the page is asked for first (a link rel=alternate,
// else <page>.md) and shown instead. With Reading mode follows light and
// dark, the article is as the window is, with a light/dark/window switch in
// its corner kept for the next one; without, it is light. Done in the
// preload's own world; the answer goes back as pages:reader. Owned by the
// pages module.

import { ipcRenderer, webFrame } from 'electron'
import { markdownPage } from './markdown'

const DARK = 'color-scheme:dark;--r-ground:#1c1c1c;--r-ink:#e0e0e0;--r-quiet:#8a8a8a;--r-aside:#a8a8a8;--r-rule:#333;--r-code:#2a2a2a;--r-picture:brightness(.92)'
const SANS = 'system-ui,"Segoe UI",sans-serif'
const R = '#oriel-reader'
const SHEET = [
  ':root{color-scheme:light;--r-ground:#fff;--r-ink:#171717;--r-quiet:#a3a3a3;--r-aside:#555;--r-rule:#e8e8e8;--r-code:#f5f5f5;--r-picture:none}',
  `@media (prefers-color-scheme:dark){:root:not([data-oriel-look=light]){${DARK}}}`,
  `:root[data-oriel-look=dark]{${DARK}}`,
  'html,body{background:var(--r-ground) !important;margin:0 !important;padding:0 !important}',
  `${R}{max-width:38em;margin:0 auto;padding:72px 24px 160px;font:400 18px/1.72 Georgia,"Times New Roman",serif;color:var(--r-ink)}`,
  `${R} h1{font:600 30px/1.24 ${SANS};margin:0 0 8px;letter-spacing:-0.01em}`,
  `${R} .oriel-from{font:400 12px/1 ${SANS};color:var(--r-quiet);margin:0 0 40px;text-transform:uppercase;letter-spacing:.06em}`,
  `${R} p{margin:0 0 1.35em}`,
  `${R} img,${R} video,${R} iframe{max-width:100%;height:auto;border-radius:6px;margin:1.6em 0;display:block}`,
  `${R} img{filter:var(--r-picture)}`,
  `${R} iframe{width:100%;aspect-ratio:16/9;height:auto;border:0}`,
  `${R} svg{max-width:100%}`,
  `${R} figure{margin:1.8em 0}`,
  `${R} figcaption{font:400 13px/1.5 ${SANS};color:var(--r-quiet);margin-top:.6em}`,
  `${R} a{color:var(--r-ink);text-underline-offset:3px}`,
  `${R} h2,${R} h3{font:600 20px/1.3 ${SANS};margin:2em 0 .6em}`,
  `${R} h4,${R} h5,${R} h6{font:600 16px/1.4 ${SANS};margin:1.8em 0 .5em}`,
  `${R} pre,${R} code,${R} kbd{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:14px}`,
  `${R} pre{background:var(--r-code);padding:14px;border-radius:8px;overflow:auto}`,
  `${R} blockquote{margin:1.6em 0;padding-left:1.2em;border-left:2px solid var(--r-rule);color:var(--r-aside)}`,
  `${R} ul,${R} ol{margin:0 0 1.35em;padding-left:1.4em}`,
  `${R} ul{list-style:disc outside}`, `${R} ol{list-style:decimal outside}`, `${R} li>ul{list-style-type:circle}`,
  `${R} :not(pre)>code{background:var(--r-code);padding:.1em .35em;border-radius:4px}`,
  `${R} li{margin:.3em 0}`, `${R} li>ul,${R} li>ol{margin-bottom:0}`,
  `${R} hr{border:0;border-top:1px solid var(--r-rule);margin:2.4em 0}`,
  `${R} .oriel-wide{overflow-x:auto;margin:1.6em 0}`,
  `${R} table{border-collapse:collapse;font:400 15px/1.5 ${SANS}}`,
  `${R} th,${R} td{border-bottom:1px solid var(--r-rule);padding:8px 12px 8px 0;text-align:left;vertical-align:top}`,
  `${R} th{font-weight:600}`,
].join('\n')

type Look = 'light' | 'dark' | 'system'

function lookIt(look: Look): void {
  if (look === 'system') document.documentElement.removeAttribute('data-oriel-look')
  else document.documentElement.setAttribute('data-oriel-look', look)
}

/** The reading page in place of the page (Reader.present). */
function present(wrap: HTMLElement, title: string, from: string, look: Look, follows: boolean): void {
  lookIt(follows ? look : 'light')
  for (const s of document.querySelectorAll('style, link[rel~="stylesheet" i]')) s.remove()
  document.documentElement.removeAttribute('style')
  document.body?.removeAttribute('style')
  try { webFrame.insertCSS(SHEET, { cssOrigin: 'author' }) } catch {}
  const top = document.createElement('h1')
  top.textContent = title
  const line = document.createElement('p')
  line.className = 'oriel-from'
  line.textContent = from
  wrap.id = 'oriel-reader'
  wrap.insertBefore(line, wrap.firstChild)
  wrap.insertBefore(top, wrap.firstChild)
  if (!document.body) document.documentElement.appendChild(document.createElement('body'))
  document.body.replaceChildren(wrap)
  if (follows) document.body.appendChild(lookSwitch(look))
  window.scrollTo(0, 0)
}

/** ReaderLook: light, dark, as the window is; quiet until the pointer comes. */
function lookSwitch(chosen: Look): HTMLElement {
  const host = document.createElement('div')
  host.dataset.orielReaderLook = ''
  host.style.cssText = 'all:initial;position:fixed;top:14px;right:14px;z-index:2147483647'
  const root = host.attachShadow({ mode: 'closed' })
  const bar = document.createElement('div')
  Object.assign(bar.style, { display: 'flex', gap: '2px', padding: '3px', borderRadius: '999px', background: 'var(--r-ground)', border: '1px solid var(--r-rule)', opacity: '.55', transition: 'opacity .15s' })
  bar.addEventListener('mouseenter', () => { bar.style.opacity = '1' })
  bar.addEventListener('mouseleave', () => { bar.style.opacity = '.55' })
  const icons: Record<Look, string> = {
    light: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
    dark: '<path d="M12.6 9.8A5 5 0 0 1 6.2 3.4a5 5 0 1 0 6.4 6.4z"/>',
    system: '<circle cx="8" cy="8" r="5.2"/><path d="M8 2.8v10.4A5.2 5.2 0 0 0 8 2.8z" fill="currentColor"/>',
  }
  const buttons: HTMLButtonElement[] = []
  const paint = (now: Look) => buttons.forEach(b => {
    const on = b.dataset.look === now
    Object.assign(b.style, { color: on ? 'var(--r-ink)' : 'var(--r-quiet)', background: on ? 'var(--r-code)' : 'transparent' })
  })
  for (const each of ['light', 'dark', 'system'] as Look[]) {
    const b = document.createElement('button')
    b.dataset.look = each
    b.title = each === 'system' ? 'As the window is' : each === 'light' ? 'Light' : 'Dark'
    b.setAttribute('aria-label', b.title)
    Object.assign(b.style, { width: '24px', height: '22px', border: '0', borderRadius: '999px', display: 'grid', placeItems: 'center', padding: '0', cursor: 'default' })
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('width', '11'); svg.setAttribute('height', '11'); svg.setAttribute('viewBox', '0 0 16 16')
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.5'); svg.setAttribute('stroke-linecap', 'round')
    // Shapes from fixed text of ours, never the page's.
    svg.innerHTML = icons[each]
    b.appendChild(svg)
    b.addEventListener('click', () => { lookIt(each); paint(each); ipcRenderer.send('pages:reader-look', each) })
    buttons.push(b)
    bar.appendChild(b)
  }
  paint(chosen)
  root.appendChild(bar)
  return host
}

/** Reader.script's choice: most prose, less what of it is links. */
function prose(el: Element): number {
  const paragraphs = el.querySelectorAll('p')
  if (paragraphs.length < 2) return 0
  let letters = 0
  for (const p of paragraphs) letters += ((p as HTMLElement).innerText || '').length
  if (letters < 400) return 0
  const whole = (el.textContent || '').length
  if (!whole) return 0
  let inside = 0
  for (const a of el.querySelectorAll('a')) inside += (a.textContent || '').length
  return letters * (1 - Math.min(inside / whole, 1))
}

function best(): Element | null {
  let top: Element | null = null, mark = 0
  for (const el of document.querySelectorAll('article, main, [role="main"], .post, .entry, .article, .content, #content, div, section')) {
    const score = prose(el)
    if (!score) continue
    if (!top) { top = el; mark = score; continue }
    if (top.contains(el)) { if (score * 1.25 > mark) { top = el; mark = score } }
    else if (el.contains(top)) { if (score > mark * 1.25) { top = el; mark = score } }
    else if (score > mark) { top = el; mark = score }
  }
  return top
}

function guess(look: Look, follows: boolean): boolean {
  if (document.getElementById('oriel-reader')) return true
  const article = best()
  if (!article) return false
  const late = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-full-src', 'data-hi-res-src', 'data-image', 'data-echo']
  for (const picture of article.querySelectorAll('img')) {
    let real = picture.currentSrc || picture.getAttribute('src') || ''
    if (!real || real.startsWith('data:image') || picture.naturalWidth <= 2) {
      for (const k of late) { const kept = picture.getAttribute(k); if (kept) { real = kept; break } }
    }
    if (real) picture.setAttribute('src', real)
    picture.setAttribute('loading', 'eager')
  }
  const inherent = /^(SOURCE|TRACK|PARAM|AREA|TEMPLATE|BR|WBR|SCRIPT|STYLE|NOSCRIPT)$/
  for (const el of article.querySelectorAll('*')) {
    if (inherent.test(el.tagName) || el.closest('details:not([open])')) continue
    const look = getComputedStyle(el)
    let gone = look.display === 'none' || look.visibility === 'hidden'
    if (!gone && look.overflow === 'hidden') { const box = el.getBoundingClientRect(); gone = box.width <= 1 && box.height <= 1 }
    if (gone && !(look.display === 'none' && el.querySelector('p'))) el.setAttribute('data-oriel-hidden', '')
  }
  const heading = document.querySelector('h1')
  const title = (heading && (heading as HTMLElement).innerText.trim()) || document.title
  const wrap = document.createElement('div')
  wrap.append(...[...article.childNodes].map(n => n.cloneNode(true)))
  for (const el of article.querySelectorAll('[data-oriel-hidden]')) el.removeAttribute('data-oriel-hidden')
  wrap.querySelectorAll('[data-oriel-hidden]').forEach(el => el.remove())
  wrap.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'))
  wrap.querySelectorAll('script,style,noscript,form,nav,aside,footer,button,input,select,textarea,[role="complementary"],[role="navigation"],[role="banner"],[aria-hidden="true"]').forEach(el => el.remove())
  wrap.querySelectorAll('[class*="newsletter" i]').forEach(el => { if (el.querySelectorAll('p').length < 3) el.remove() })
  const players = /youtube|youtu\.be|vimeo|dailymotion|loom\.com|streamable|wistia|ted\.com/i
  wrap.querySelectorAll('iframe').forEach(f => {
    const where = f.getAttribute('src') || f.getAttribute('data-src') || ''
    if (players.test(where)) { f.setAttribute('src', where); f.removeAttribute('height'); f.removeAttribute('width') } else f.remove()
  })
  wrap.querySelectorAll('img').forEach(img => { const s = img.getAttribute('src') || ''; if (!s || s.startsWith('data:image')) img.remove() })
  const boxes = wrap.querySelectorAll('figure, picture, div, section, p')
  for (let e = boxes.length - 1; e >= 0; e--) if (!boxes[e].textContent?.trim() && !boxes[e].querySelector('img, video, audio, iframe, svg, canvas, table')) boxes[e].remove()
  const own = wrap.querySelector('h1')
  if (own && own.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === title.replace(/\s+/g, ' ').toLowerCase()) own.remove()
  present(wrap, title, location.host.replace(/^www\./, ''), look, follows)
  return true
}

/** Reader.twin: the site's own Markdown copy of this page, same origin only. */
async function twin(): Promise<{ url: string; text: string; title: string; from: string } | null> {
  const markdown = ['text/markdown', 'text/x-markdown']
  const kind = (t: string | null) => (t || '').toLowerCase().split(';')[0].trim()
  const heading = document.querySelector('h1')
  const about = { title: (heading && (heading as HTMLElement).innerText.trim()) || document.title, from: location.host.replace(/^www\./, '') }
  const own = kind(document.contentType)
  if (markdown.includes(own) || (own === 'text/plain' && /\.(md|markdown)$/i.test(location.pathname))) {
    return { url: location.href, text: document.body ? document.body.textContent || '' : '', ...about }
  }
  if (!/^https?:$/.test(location.protocol)) return null
  const home = (a: string) => { try { return new URL(a, location.href).origin === location.origin } catch { return false } }
  const read = async (a: string, patience: number, named: boolean) => {
    if (!home(a)) return null
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), patience)
    try {
      const answer = await fetch(a, { headers: { Accept: 'text/markdown, text/plain;q=0.5' }, cache: 'no-store', credentials: 'same-origin', signal: stop.signal })
      const type = kind(answer.headers.get('content-type'))
      const fits = markdown.includes(type) || (named && type === 'text/plain')
      if (!answer.ok || !fits || (answer.url && !home(answer.url))) { void answer.body?.cancel(); return null }
      const text = await answer.text()
      if (text.length > 4_000_000 || /^\s*<(!doctype|html)/i.test(text)) return null
      return { url: answer.url || a, text, ...about }
    } catch { return null } finally { clearTimeout(timer) }
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="alternate" i][type]')) {
    if (!markdown.includes(kind(link.type)) || !/^https?:/.test(link.href) || !home(link.href)) continue
    const named = await read(link.href, 5000, true)
    if (named) return named
    break
  }
  const g = new URL(location.href)
  g.hash = ''
  if (/\.(md|markdown)$/i.test(g.pathname)) return null
  g.pathname += /\/$/.test(g.pathname) ? 'index.html.md' : '.md'
  return read(g.href, 1500, false)
}

export function setupReader(): void {
  ;(globalThis as unknown as { __orielReader: unknown }).__orielReader = {
    /** Into reading mode; the answer ("read" with how, or "none") comes back as pages:reader. */
    read(o: { twins: boolean; look: Look; follows: boolean }): boolean {
      void (async () => {
        let how: 'markdown' | 'guess' | null = null
        try {
          if (o.twins && !document.getElementById('oriel-reader')) {
            const found = await twin()
            if (found) {
              const page = markdownPage(found.text, found.url)
              if (page.html.trim()) {
                const wrap = document.createElement('div')
                // Our own HTML, from text escaped character by character.
                wrap.innerHTML = page.html
                present(wrap, page.title ?? found.title, found.from ? `${found.from} · markdown` : 'markdown', o.look, o.follows)
                how = 'markdown'
              }
            }
          }
          if (!how && guess(o.look, o.follows)) how = 'guess'
        } catch {}
        ipcRenderer.send('pages:reader', how ? { read: true, how } : { read: false })
      })()
      return true
    },
    look: (look: Look) => { if (document.getElementById('oriel-reader')) lookIt(look) },
  }
}
