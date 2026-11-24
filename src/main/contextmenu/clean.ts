// Text only, nothing looked up: Copy Clean Link (CleanLink.swift, studio/06
// §2.3, studio/03 §1.13) and Copy Link to Highlight (a text fragment).

/** Names that track and do nothing else, on any site; `utm_` covers every
 * one of Google Analytics' campaign tags. */
const tracking = new Set(['fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'mc_eid', 'igshid', 'igsh', '_hsenc', '_hsmi', 'mkt_tok'])
/** Names that track on some sites only: a YouTube or Spotify share's `si`. */
const trackingOn: Record<string, string[]> = { si: ['youtube.com', 'youtu.be', 'spotify.com'] }
/** A signed address (S3, Google Cloud, CloudFront): copied as it is. */
const signatures = new Set(['x-amz-signature', 'x-goog-signature', 'signature', 'sig'])

function tracks(name: string, host: string): boolean {
  if (name.startsWith('utm_') || tracking.has(name)) return true
  return (trackingOn[name] ?? []).some(site => host === site || host.endsWith('.' + site))
}

function decoded(raw: string): string {
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')) } catch { return raw }
}

/** The address without its tracking parameters; the others keep their order,
 * their encoding and the part after #. Anything else comes back as it was. */
export function cleanLink(address: string): string {
  const m = /^(https?:\/\/[^?#]*)\?([^#]*)(#.*)?$/i.exec(address.trim())
  if (!m || !m[2]) return address
  let host = ''
  try { host = new URL(address).hostname.toLowerCase() } catch { return address }
  const pieces = m[2].split('&')
  const names = pieces.map(p => decoded(p.split('=')[0]).toLowerCase())
  if (names.some(n => signatures.has(n))) return address
  const kept = pieces.filter((_, i) => !tracks(names[i], host))
  if (kept.length === pieces.length) return address
  return m[1] + (kept.length ? '?' + kept.join('&') : '') + (m[3] ?? '')
}

/** A text fragment's part: what encodeURIComponent leaves, and - , & too. */
const part = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D')

/** Copy Link to Highlight: the page's address with #:~:text= for the words
 * chosen; a long choice is its first and last words (start,end), as Chrome
 * makes them. */
export function highlightLink(page: string, selection: string): string | null {
  const text = selection.replace(/\s+/g, ' ').trim()
  if (!text || !/^https?:/i.test(page)) return null
  const base = page.split('#')[0]
  const words = text.split(' ')
  const fragment = text.length <= 80 || words.length <= 8
    ? part(text)
    : `${part(words.slice(0, 4).join(' '))},${part(words.slice(-4).join(' '))}`
  return `${base}#:~:text=${fragment}`
}
