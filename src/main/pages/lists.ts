// Search's own short lists (studio/06 §2.1-§2.3), copied from Shield.swift,
// YouTubeAds.swift and CleanLink.swift: the same domains, slots and names,
// not EasyList, so the same pages are cleaned the same way.

import { getDomain } from 'tldts'

/** Third parties whose only job is to watch or to sell (Shield.unwanted). */
export const unwanted = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'googletagservices.com', 'google-analytics.com', 'googletagmanager.com',
  'adservice.google.com', 'amazon-adsystem.com', 'adnxs.com', 'adsrvr.org',
  'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com',
  'smartadserver.com', 'sharethrough.com', 'indexww.com', 'bidswitch.net',
  '33across.com', 'teads.tv', 'moatads.com', 'adroll.com',
  'scorecardresearch.com', 'quantserve.com', 'chartbeat.com',
  'hotjar.com', 'mouseflow.com', 'fullstory.com', 'clarity.ms',
  'mixpanel.com', 'amplitude.com', 'segment.com', 'segment.io',
  'branch.io', 'appsflyer.com', 'adjust.com', 'analytics.tiktok.com',
  'connect.facebook.net', 'ads-twitter.com', 'analytics.twitter.com',
  'intergient.com', 'btloader.com', 'ad-delivery.net', 'mentorsticks.com',
  'dns-finder.com', 'confiant-integrations.net', 'cloudflareinsights.com',
]

/** The host or one of its parents is on the list (Shield.networkFilter). */
export function isUnwanted(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  return unwanted.some(d => h === d || h.endsWith('.' + d))
}

/** Slots that are an advertisement and nothing else (Shield.slots). */
const slots = [
  '.adsbygoogle', 'ins.adsbygoogle', '[id^="google_ads_"]',
  '[id^="div-gpt-ad"]', '[id^="taboola-"]', '#taboola-below-article',
  'iframe[src*="doubleclick.net"]', 'iframe[src*="googlesyndication"]',
  'iframe[src*="amazon-adsystem"]',
  '.ad-slot', '.ad-slot-container', '.top-banner-ad-container',
  '.ad-leaderboard', '.ad-billboard', '.ad-giga', '.ad-mpu', '.ad-mrec',
  '.ad-unit', '.adunit', '.adslot', '.dfp-ad', '.gpt-ad', '.w_ad',
]

/** Slots hidden only on the sites EasyList hides them on (Shield.slotsBySite). */
const slotsBySite: [string[], string][] = [
  [['as.com', 'elpais.com'], '.ad'],
  [['theguardian.com'], '.top-fronts-banner-ad-container'],
  [['independent.co.uk', 'the-independent.com'], '#billboard-wrapper'],
  [['cnn.com'], '.ad-slot-header__wrapper'],
  [['albumoftheyear.org'], '.headerAd, .homePageAdSquare'],
]

/** Reddit's promoted posts (Shield.reddit). */
const reddit = ['shreddit-ad-post', 'shreddit-comments-page-ad', 'shreddit-sidebar-ad', 'shreddit-dynamic-ad-link', 'comment-tree-ad', '.promotedlink']

const onSite = (host: string, sites: string[]) => sites.some(s => host === s || host.endsWith('.' + s))

/** WebKit's css-display-none for a page on `host` (with test stand-ins for Reddit). */
export function hidingCSS(host: string, redditHosts: string[] = []): string {
  const h = host.toLowerCase()
  const lists = [slots.join(', ')]
  for (const [sites, selector] of slotsBySite) if (onSite(h, sites)) lists.push(selector)
  if (onSite(h, ['reddit.com', ...redditHosts])) lists.push(reddit.join(', '))
  return lists.map(l => `${l} { display: none !important; }`).join('\n')
}

// YouTube (YouTubeAds.swift, studio/06 §2.2)

/** Exact hosts with YouTube's player. */
export const youtubeHosts = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']

const youtubePaths = ['/api/stats/ads', '/pagead/', '/ptracking', '/get_midroll_info', '/youtubei/v1/player/ad_break', '/pcs/activeview']

/** YouTubeAds.standInPattern: what the page script answers itself (a port
 * allowed after the host, which YouTube never has and a test server does). */
export const standInPattern = String.raw`^https?:\/\/(?:googleads\.g\.doubleclick\.net(?::\d+)?\/pagead\/id|(?:[^\/]+\.)?youtube\.com(?::\d+)?(?:\/api\/stats\/ads|\/pagead\/|\/ptracking|\/api\/stats\/qoe\?.*adformat=))`

const isYouTube = (host: string, extra: string[]) => host === 'youtube.com' || host.endsWith('.youtube.com') || extra.includes(host)
const isYouTubeSite = (host: string, extra: string[]) => isYouTube(host, extra) || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')

/** YouTubeAds.rules: 'block', 'allow' (ignore-previous-rules) or nothing. */
export function youtubeRule(url: URL, topHost: string | null, extra: string[]): 'block' | 'allow' | null {
  const host = url.hostname.toLowerCase()
  const path = url.pathname
  if (isYouTube(host, extra)) {
    if (youtubePaths.some(p => path.startsWith(p))) return 'block'
    if (path === '/api/stats/qoe' && /adformat=/.test(url.search)) return 'block'
  }
  const fromYouTube = !!topHost && isYouTubeSite(topHost, extra)
  if (!fromYouTube) return null
  if ((host === 'google.com' || host.endsWith('.google.com')) && path.startsWith('/pagead/')) return 'block'
  if (host === 'imasdk.googleapis.com') return 'block'
  if (host === 'static.doubleclick.net' && path === '/instream/ad_status.js') return 'allow'
  return null
}

// Click IDs (CleanLink.swift; studio/06 §2.3: one list, without utm_)

const tracking = new Set(['fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'mc_eid', 'igshid', 'igsh', '_hsenc', '_hsmi', 'mkt_tok'])
const trackingOn: Record<string, string[]> = { si: ['youtube.com', 'youtu.be', 'spotify.com'] }
const signatures = new Set(['x-amz-signature', 'x-goog-signature', 'signature', 'sig'])

/** The address without its click IDs; the same address when there is none
 * or it carries a signature. Order, encoding and the fragment stay. */
export function withoutClickIDs(address: string): string {
  const q = address.indexOf('?')
  if (q < 0 || !/^https?:/i.test(address)) return address
  const hash = address.indexOf('#', q)
  const query = address.slice(q + 1, hash < 0 ? undefined : hash)
  if (!query) return address
  let host = ''
  try { host = new URL(address).hostname.toLowerCase() } catch { return address }
  const pieces = query.split('&')
  const names = pieces.map(p => {
    const raw = p.split('=')[0]
    try { return decodeURIComponent(raw.replace(/\+/g, ' ')).toLowerCase() } catch { return raw.toLowerCase() }
  })
  if (names.some(n => signatures.has(n))) return address
  const kept = pieces.filter((_, i) => !clickID(names[i], host))
  if (kept.length === pieces.length) return address
  return address.slice(0, q) + (kept.length ? '?' + kept.join('&') : '') + (hash < 0 ? '' : address.slice(hash))
}

function clickID(name: string, host: string): boolean {
  if (tracking.has(name)) return true
  const sites = trackingOn[name]
  return !!sites && onSite(host, sites)
}

// sites

/** A host's registrable domain, the Public Suffix List's private part too
 * (WebKit's RegistrableDomain); an address or a name without one stays whole. */
export function siteOf(host: string): string {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  return getDomain(h, { allowPrivateDomains: true }) ?? h
}

/** Search leaves these alone (HTTPSFirst.local). */
export function localHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.test') || h.endsWith('.local')) return true
  if (h.includes(':') || /^[\d.]+$/.test(h)) return true
  return !h.includes('.')
}
