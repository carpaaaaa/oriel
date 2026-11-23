// Redirects to an extension's own files. Chrome lets a declarativeNetRequest
// redirect reach a web accessible resource even when the manifest says
// use_dynamic_url (uBlock Origin Lite says it for all its stubs, 866 redirect
// rules in its default lists). Electron refuses the static
// chrome-extension:// address then, for subresources and navigations alike,
// doesn't tell the dynamic one, and refuses redirects to data: URLs.
//
// So the package is prepared before it loads, as the Mac prepares packages at
// install (studio/04 §3.4): use_dynamic_url is turned off in the copy Oriel
// keeps. Cost: a site can tell the extension is there by its static address,
// as it can on the Mac. A folder loaded in place (tests) isn't touched; for
// it a main frame redirect still works by loading the page in the tab.

import fs from 'node:fs'
import path from 'node:path'

interface War { globs: RegExp[]; dynamic: boolean }

function glob(p: string): RegExp {
  const src = p.replace(/^\/+/, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${src}$`)
}

export const PREPARED = '.oriel-prepared'

/** Turns use_dynamic_url off in the manifest of a package Oriel keeps. */
export function prepare(dir: string): void {
  const file = path.join(dir, 'manifest.json')
  let manifest: { web_accessible_resources?: unknown[] }
  try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return }
  const changed: number[] = []
  manifest.web_accessible_resources?.forEach((e, i) => {
    if (e && typeof e === 'object' && (e as { use_dynamic_url?: boolean }).use_dynamic_url === true) {
      (e as { use_dynamic_url?: boolean }).use_dynamic_url = false
      changed.push(i)
    }
  })
  if (!changed.length) return
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(dir, PREPARED), JSON.stringify({ use_dynamic_url: changed }))
}

export class OwnFiles {
  private entries: War[]

  constructor(manifest: unknown) {
    const war = (manifest as { web_accessible_resources?: unknown[] }).web_accessible_resources ?? []
    this.entries = war.map(e => typeof e === 'string'
      ? { globs: [glob(e)], dynamic: false }
      : { globs: ((e as { resources?: string[] }).resources ?? []).map(glob), dynamic: (e as { use_dynamic_url?: boolean }).use_dynamic_url === true })
  }

  /** True when only the dynamic URL may reach this file. */
  dynamicOnly(url: URL): boolean {
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const matching = this.entries.filter(e => e.globs.some(g => g.test(rel)))
    return matching.length > 0 && matching.every(e => e.dynamic)
  }
}
