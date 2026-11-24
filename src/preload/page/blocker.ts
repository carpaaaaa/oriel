// Block ads and trackers, the page's half of uBlock Origin's lists
// (studio/06 §2.1; src/main/pages/blocker): the scriptlets run in the
// page's own world before its scripts (how uBlock Origin gets past
// YouTube's and the anti-adblock walls), the generic hiding rules that
// match the page's classes and ids asked for as they appear, and the
// procedural filters (:has-text, :upward, :matches-css...) applied as the
// page changes. The site's hiding rules and the generic ones that need no
// look at the page come with the page's first prefs (pages.ts). Main frame
// only, as the rest of the preload; frames get theirs from the main process.

import { ipcRenderer, webFrame } from 'electron'
import { querySelectorAll, handlePseudoDirective, type AST } from '@ghostery/adblocker-extended-selectors'
import { DOMMonitor } from '@ghostery/adblocker-content'

interface Extended { ast: AST; id: number; attribute?: string; directive?: AST }

/** Before the page's own scripts: each scriptlet on its own, so one that
 * fails leaves the others. Not subject to the page's CSP. */
export function runScriptlets(scripts: string[]): void {
  for (const s of scripts) {
    try { void webFrame.executeJavaScript(s).catch(() => {}) } catch {}
  }
}

export interface Watch { stop(): void }

/** The generic rules for what the page has, and its procedural filters,
 * from the DOM's start to its end. `add` inserts CSS of the user's origin. */
export function watchPage(dom: boolean, extended: unknown[], add: (css: string) => void): Watch {
  let monitor: DOMMonitor | null = null
  let observer: MutationObserver | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const procedural = (extended as Extended[]).filter(e => e && e.ast)
  const marked = new Map<Element, string>()

  const applyProcedural = () => {
    timer = null
    if (stopped || !document.documentElement) return
    const now = new Set<Element>()
    for (const e of procedural) {
      let found: Element[] = []
      try { found = querySelectorAll(document.documentElement, e.ast) } catch { continue }
      for (const el of found) {
        if (e.directive) { try { handlePseudoDirective(el, e.directive) } catch {} ; continue }
        if (!e.attribute) continue
        if (!el.hasAttribute(e.attribute)) el.setAttribute(e.attribute, '')
        marked.set(el, e.attribute)
        now.add(el)
      }
    }
    // An element that no longer matches shows again.
    for (const [el, attribute] of marked) if (!now.has(el)) { el.removeAttribute(attribute); marked.delete(el) }
  }
  const soon = (wait: number) => { if (!timer && !stopped) timer = setTimeout(applyProcedural, wait) }

  const ask = (features: { classes: string[]; ids: string[]; hrefs: string[] }) => {
    if (stopped || (!features.classes.length && !features.ids.length && !features.hrefs.length)) return
    ipcRenderer.invoke('pages:cosmetics', features).then((css: unknown) => { if (!stopped && typeof css === 'string' && css) add(css) }, () => {})
  }

  const start = () => {
    if (stopped) return
    if (dom) {
      monitor = new DOMMonitor(update => {
        if (update.type === 'features') ask(update)
        else if (procedural.length && update.elements.length) soon(300)
      })
      monitor.queryAll(window)
      monitor.start(window)
    } else if (procedural.length) {
      observer = new MutationObserver(() => soon(300))
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
    }
    if (procedural.length) soon(0)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
  // A procedural filter often waits for text that comes late.
  if (procedural.length) addEventListener('load', () => soon(0), { once: true })

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      try { monitor?.stop() } catch {}
      observer?.disconnect()
      for (const [el, attribute] of marked) el.removeAttribute(attribute)
      marked.clear()
    },
  }
}
