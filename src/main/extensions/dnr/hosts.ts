// Host permissions from the manifest, as match patterns. Redirect and
// modifyHeaders rules act only where the extension has host access to the
// request (and its initiator), as in Chrome.

type Pattern = { schemes: string[] | null; host: string; sub: boolean } | 'all'

function parse(p: string): Pattern | null {
  if (p === '<all_urls>') return 'all'
  const m = /^(\*|https?|wss?|ftp|file):\/\/([^/]*)(\/.*)?$/.exec(p)
  if (!m) return null
  const schemes = m[1] === '*' ? ['http', 'https', 'ws', 'wss'] : [m[1]]
  let host = m[2].toLowerCase().replace(/:\d+$/, '')
  let sub = false
  if (host === '*') return { schemes, host: '', sub: true }
  if (host.startsWith('*.')) { sub = true; host = host.slice(2) }
  return { schemes, host, sub }
}

export class HostAccess {
  private patterns: Pattern[]

  constructor(manifest: unknown) {
    const m = manifest as { host_permissions?: string[]; permissions?: string[]; manifest_version?: number }
    const list = [...(m.host_permissions ?? []), ...(m.manifest_version === 2 ? (m.permissions ?? []) : [])]
    this.patterns = list.map(parse).filter((p): p is Pattern => p !== null)
  }

  get any(): boolean { return this.patterns.length > 0 }

  allows(url: string): boolean {
    let u: URL
    try { u = new URL(url) } catch { return false }
    const scheme = u.protocol.slice(0, -1)
    const host = u.hostname.toLowerCase()
    return this.patterns.some(p => {
      if (p === 'all') return ['http', 'https', 'ws', 'wss', 'ftp', 'file'].includes(scheme)
      if (p.schemes && !p.schemes.includes(scheme)) return false
      if (p.host === '') return true
      return host === p.host || (p.sub && host.endsWith('.' + p.host))
    })
  }
}
