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

// Registrable domain, for domainType (first or third party). Chrome uses the
// Public Suffix List; without it, a ccTLD with a common second level
// ("co.uk", "com.au") counts as the suffix. Good enough for ad blocking;
// the full list is a request in the report.
const secondLevels = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'mil', 'nic', 'ltd', 'plc', 'sch', 'nom', 'gv', 'gen', 'biz', 'info', 'web', 'int', 'res', 'lg', 'ed', 'in', 'ind', 'firm'])
const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/

export function registrable(host: string): string {
  if (!host || ipv4.test(host) || host.includes(':')) return host
  const labels = host.split('.')
  if (labels.length <= 2) return host
  const tld = labels[labels.length - 1]
  const sld = labels[labels.length - 2]
  const take = tld.length === 2 && secondLevels.has(sld) ? 3 : 2
  return labels.slice(-take).join('.')
}
