// What Search says it is. Sites (Google sign-in first of all) turn away
// browsers that name Electron, so the user agent is Chrome's own, reduced the
// way Chrome reduces it (major version, then .0.0.0).

import { app, type Session } from 'electron'

export function chromeUserAgent(platform: NodeJS.Platform = process.platform): string {
  const major = process.versions.chrome.split('.')[0]
  const os =
    platform === 'win32' ? 'Windows NT 10.0; Win64; x64'
    : platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}

export function setupUserAgent(): void {
  app.userAgentFallback = chromeUserAgent()
}

export function applyUserAgent(session: Session): void {
  session.setUserAgent(chromeUserAgent(), 'en-US,en')
}
