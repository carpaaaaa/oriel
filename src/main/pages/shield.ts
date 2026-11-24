// Block ads and trackers (studio/06 §2.1, §2.2; Shield.swift, YouTubeAds.swift).
// The network half: Search's 52 third parties, blocked only as third
// parties, and YouTube's ad paths, through the one webRequest owner
// (src/main/net, Shield at order 100). Read on every request, so the switch
// and a site's pause take effect on the next one, as on the Mac. The hiding
// rules and YouTube's page script go into each page from the preload
// (src/preload/page/pages.ts) with what pagePrefs() hands it.

import { net } from '../net'
import { addDefaults } from '../../shared/prefs'
import { hostOf, shieldOn, testHosts, thirdParty, topAddress } from './facts'
import { isUnwanted, youtubeRule } from './lists'

addDefaults({ 'shield.paused': [] as string[] })

/** What was blocked last, for the bench (no counter is shown anywhere). */
export const blocked: string[] = []

net.onBeforeRequest('shield', 100, d => {
  if (!/^https?:/i.test(d.url)) return
  const topHost = hostOf(topAddress(d))
  if (!shieldOn(topHost)) return
  let url: URL
  try { url = new URL(d.url) } catch { return }
  const yt = youtubeRule(url, topHost, testHosts('test.youtubeHosts'))
  if (yt === 'allow') return
  if (yt === 'block' || (thirdParty(d) && isUnwanted(url.hostname))) {
    blocked.push(d.url)
    if (blocked.length > 200) blocked.shift()
    return { cancel: true }
  }
})
