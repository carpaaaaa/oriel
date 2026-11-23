// Where Search keeps its things. A test world (SEARCH_PROBE=<name>) gets a
// folder, settings and socket of its own, as on the Mac (Tests/split_view.py
// use()), so a test never touches the Search someone is using.

import { app } from 'electron'
import path from 'node:path'

export const probe = process.env.SEARCH_PROBE ?? ''
export const productName = 'Search for Windows'

/** Call before app is ready. */
export function setupPaths(): void {
  const name = probe ? `${productName} (${probe})` : productName
  app.setPath('userData', path.join(app.getPath('appData'), name))
  if (probe) app.setName(`${productName} (${probe})`)
}

export function dataFile(name: string): string {
  return path.join(app.getPath('userData'), name)
}

/** The look of the window's chrome: Windows controls on the right, or the
 * Mac's lights. On a Mac, SEARCH_CHROME=windows draws the Windows one, for
 * developing and comparing. */
export function chromeKind(): 'windows' | 'mac' {
  if (process.env.SEARCH_CHROME === 'windows') return 'windows'
  if (process.env.SEARCH_CHROME === 'mac') return 'mac'
  return process.platform === 'darwin' ? 'mac' : 'windows'
}
