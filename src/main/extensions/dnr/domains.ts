import { getDomain } from 'tldts'

// Domains for declarativeNetRequest: lists match a host and its subdomains,
// and when a rule names both, the longest matching entry decides (Chrome's
// url_pattern_index: "a.com" with "~b.a.com" leaves out x.b.a.com, and
// "b.a.com" with "~a.com" keeps b.a.com).

/** "www.Example.com." -> "www.example.com" */
export function normalizeHost(host: string): string {
  let h = host.toLowerCase()
  if (h.endsWith('.')) h = h.slice(0, -1)
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  return h
}

/** "a.b.c" -> ["a.b.c", "b.c", "c"] */
export function suffixes(host: string): string[] {
  const out = [host]
  let i = host.indexOf('.')
  while (i >= 0) {
    out.push(host.slice(i + 1))
    i = host.indexOf('.', i + 1)
  }
  return out
}

/** A compiled domain list: small lists stay arrays, big ones become sets. */
export type DomainList = ReadonlySet<string>

export function domainList(list: string[] | undefined): DomainList | null {
  if (!list) return null
  return new Set(list.map(normalizeHost))
}

/** Length of the longest entry of `list` that the host equals or is a
 * subdomain of; 0 when none. `hostSuffixes` is suffixes(host). */
function longest(hostSuffixes: readonly string[], list: DomainList): number {
  for (const s of hostSuffixes) if (list.has(s)) return s.length
  return 0
}

/** Does the host pass a pair of include/exclude lists? */
export function passes(hostSuffixes: readonly string[] | null, include: DomainList | null, exclude: DomainList | null): boolean {
  if (!include && !exclude) return true
  if (!hostSuffixes) return !include // no host (no initiator): only rules without an include list
  const inc = include ? longest(hostSuffixes, include) : 0
  if (include && inc === 0) return false
  const exc = exclude ? longest(hostSuffixes, exclude) : 0
  if (!include) return exc === 0
  return inc > exc
}

// Registrable domain, for domainType (first or third party), from the
// Public Suffix List's ICANN part as Chrome's DNR uses it (private suffixes
// like github.io left out). An IP address or a bare name is its own.
// Remembered, since every third-party check asks for two.
const known = new Map<string, string>()

export function registrable(host: string): string {
  if (!host) return host
  let site = known.get(host)
  if (site === undefined) {
    site = getDomain(host, { allowPrivateDomains: false }) ?? host
    if (known.size > 20000) known.clear()
    known.set(host, site)
  }
  return site
}
