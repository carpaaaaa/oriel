// Passwords and forms in the page: finding sign-in fields, offering to fill,
// noticing a sign-in to offer saving. Owned by the data module.
//
// Ported from the Mac's FormRelay script (Forms.swift, studio/05 §2.3-2.4).
// It runs in the preload's isolated world, where the page can't reach it:
// it tells Search where the caret is and what the box is, what a sign-in
// sends, and fills only when Search asks, with values handed over as
// arguments and only while the page is still the origin they were picked for.

import { ipcRenderer } from 'electron'

type Msg = Record<string, unknown> & { kind: string }
const tell = (msg: Msg) => ipcRenderer.send('data:forms', msg)

// A frame never runs this (the preload is the main frame's): the boxes of a
// frame of another origin are never looked at, offered anything or filled.
const framed = window !== window.top

// what a box is

function passwordBox(el: Element | null): el is HTMLInputElement {
  if (!el || el.tagName !== 'INPUT') return false
  const kind = ((el as HTMLInputElement).type || '').toLowerCase()
  return kind === 'password' || (kind === 'text' && /(^|\s)current-password(\s|$)/i.test(el.getAttribute('autocomplete') || ''))
}

/** A password box a password can be put in: a text box only while it draws dots. */
function maskedBox(el: Element): boolean {
  if (!passwordBox(el)) return false
  if ((el.type || '').toLowerCase() === 'password') return true
  try {
    const s = getComputedStyle(el) as CSSStyleDeclaration & { webkitTextSecurity?: string }
    return (s.webkitTextSecurity || s.getPropertyValue('-webkit-text-security') || 'none') !== 'none'
  } catch { return false }
}

/** A box there to see and type in: not tiny, faded, hidden, clipped or far off
 * the page (a box kept out of sight to catch robots is passed over). */
function shown(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return false
  const doc = document.documentElement, x = scrollX, y = scrollY
  if (r.right + x <= 0 || r.bottom + y <= 0 || r.left + x >= Math.max(doc.scrollWidth, doc.clientWidth) || r.top + y >= Math.max(doc.scrollHeight, doc.clientHeight)) return false
  try { if ((el as any).checkVisibility && !(el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false } catch {}
  let up: Element | null = el
  for (let i = 0; up && up.nodeType === 1 && i < 12; i++) {
    const s = getComputedStyle(up)
    if (!(parseFloat(s.opacity) > 0)) return false
    if (up === el && s.visibility !== 'visible') return false
    if (/inset\(\s*(50|100)%|circle\(\s*0|polygon\(\s*0(px)?\s+0(px)?\s*\)/.test(s.clipPath || '')) return false
    const clip = /^rect\((.*)\)$/.exec(s.clip || '')
    if (clip && (s.position === 'absolute' || s.position === 'fixed')) {
      const edge = clip[1].split(/[\s,]+/).map(parseFloat)
      if (edge.length === 4 && edge.every(isFinite) && (edge[1] - edge[3] < 4 || edge[2] - edge[0] < 4)) return false
    }
    if (up !== el && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) {
      const b = up.getBoundingClientRect()
      if (b.width < 4 || b.height < 4) return false
    }
    up = up.parentElement || ((up.getRootNode() as ShadowRoot).host ?? null)
  }
  return true
}

const passwordBoxes = 'input[type="password"], input[autocomplete~="current-password" i]'

/** The box the caret is in, inside open shadow roots too. */
function active(): Element | null {
  let a = document.activeElement
  for (let i = 0; a && a.shadowRoot && a.shadowRoot.activeElement && i < 32; i++) a = a.shadowRoot.activeElement
  return a
}

function deepInputs(): HTMLInputElement[] {
  const out: HTMLInputElement[] = []
  const walk = (root: Document | ShadowRoot, depth: number) => {
    root.querySelectorAll('*').forEach(el => {
      if (el.tagName === 'INPUT') out.push(el as HTMLInputElement)
      if (el.shadowRoot && depth < 8) walk(el.shadowRoot, depth + 1)
    })
  }
  walk(document, 0)
  return out
}

function formOf(el: Element): HTMLFormElement | null {
  return (el as HTMLInputElement).form || el.closest('form')
}

// Password boxes something typed or filled into: only their passwords are
// offered a place in the vault. One the page filled by itself never is.
const touched = new WeakSet<Element>()
let lastTyped: Element | null = null
function touch(box: Element | null) { if (box) { touched.add(box); lastTyped = box } }
function boxOf(e: Event): Element | null { const p = e.composedPath ? e.composedPath() : []; return (p[0] as Element) || (e.target as Element) }
for (const kind of ['input', 'change']) {
  document.addEventListener(kind, e => { const box = boxOf(e); if (passwordBox(box)) touch(box) }, true)
}
// A "show password" that swaps the box for a new one with the same value.
try {
  new MutationObserver(changes => {
    const gone: HTMLInputElement[] = [], came: HTMLInputElement[] = []
    const inputs = (node: Node, into: HTMLInputElement[]) => {
      if (node.nodeType !== 1) return
      const el = node as Element
      if (el.tagName === 'INPUT') into.push(el as HTMLInputElement)
      el.querySelectorAll?.('input').forEach(i => into.push(i))
    }
    changes.forEach(c => { c.removedNodes.forEach(n => inputs(n, gone)); c.addedNodes.forEach(n => inputs(n, came)) })
    const typed = gone.filter(b => touched.has(b) && b.value).map(b => b.value)
    if (typed.length) came.forEach(b => { if (typed.includes(b.value)) touch(b) })
  }).observe(document, { childList: true, subtree: true })
} catch {}

/** The password box and the last box before it that could hold a name. */
function pair(near?: Element | null): { user: HTMLInputElement | null; pass: HTMLInputElement } | null {
  const root = near?.getRootNode ? near.getRootNode() : document
  const shadowed = root !== document && root.nodeType === 11
  const seen = (b: Element) => maskedBox(b) && shown(b)
  let boxes = Array.from((shadowed ? root as ShadowRoot : document).querySelectorAll(passwordBoxes)).filter(seen) as HTMLInputElement[]
  if (shadowed && !boxes.length) boxes = deepInputs().filter(seen)
  if (!boxes.length) return null
  let pass = boxes[0]
  if (near && boxes.includes(near as HTMLInputElement)) pass = near as HTMLInputElement
  else if (near && near.tagName === 'INPUT') {
    const form = formOf(near)
    const mine = form ? boxes.filter(b => formOf(b) === form) : boxes
    const after = mine.filter(b => near.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING)
    if (after.length) pass = after[0]
    else if (form && mine.length) pass = mine[0]
  }
  const scope = formOf(pass)
  const all = scope ? Array.from(scope.querySelectorAll('input')) : pass.getRootNode() === document ? Array.from(document.querySelectorAll('input')) : deepInputs()
  let user: HTMLInputElement | null = null
  for (const el of all) {
    if (el === pass) break
    if (couldBeName(el, !scope)) user = el
  }
  return { user, pass }
}

function couldBeName(el: HTMLInputElement, loose: boolean): boolean {
  const kind = (el.type || 'text').toLowerCase()
  if (kind !== 'text' && kind !== 'email' && kind !== 'tel') return false
  if (passwordBox(el as Element)) return false
  if (vouched(el) && !elsewhere(el)) return true
  if (el.disabled || el.readOnly || el.getAttribute('aria-hidden') === 'true') return false
  if (!shown(el)) return false
  return !aside(el) && !elsewhere(el) && (!loose || claimsName(el))
}

function texty(el: Element | null): el is HTMLInputElement {
  if (!el || el.tagName.toLowerCase() !== 'input') return false
  const i = el as HTMLInputElement
  if (i.disabled || i.readOnly) return false
  if (!['text', 'email', 'tel', 'number'].includes((i.type || 'text').toLowerCase())) return false
  const r = i.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
const tokens = (el: Element) => (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).filter(Boolean)
const foreign = /^(name|honorific-prefix|given-name|additional-name|family-name|honorific-suffix|nickname|organization|organization-title|one-time-code|new-password|street-address|postal-code|country|country-name|bday(-.*)?|sex|url|photo|language|impp|transaction-.*|cc-.*|address-.*|shipping|billing)$/
const elsewhere = (el: Element) => tokens(el).some(t => foreign.test(t))
const vouched = (el: Element) => tokens(el).some(t => /^(username|email|webauthn)$/.test(t))
function labels(el: HTMLInputElement): string {
  const out: string[] = []
  try { el.labels?.forEach(l => out.push(l.textContent || '')) } catch {}
  el.getAttribute('aria-labelledby')?.split(/\s+/).forEach(id => { const l = document.getElementById(id); if (l) out.push(l.textContent || '') })
  return out.join(' ').slice(0, 200)
}
const words = (el: HTMLInputElement) => [el.name, el.id, el.getAttribute('aria-label'), el.getAttribute('placeholder'), labels(el)].join(' ').toLowerCase()
function aside(el: HTMLInputElement): boolean {
  if (/^(q|to|cc|bcc|subject)$/.test((el.name || '').toLowerCase()) || /^(q|to|cc|bcc|subject)$/.test((el.id || '').toLowerCase())) return true
  if (/(^|[\s_\-[])title($|[\s_\-\]])|query|search|recherche|suche|buscar|otp|otc|one-time|captcha|code|coupon|promo|voucher|gift|recipient|destinataire|comment|message|description|project|projet/.test(words(el))) return true
  return !!el.closest?.('[role="search"], [role="combobox"] input, form[role="search"]') || ((el.getAttribute('role') || '') === 'combobox' && !vouched(el))
}
const who = /user|login|log-in|logon|e-?mail|courriel|correo|identifi|account|compte|cuenta|konto|phone|mobile|portable|t[eé]l[eé]phone|benutzer|nutzer|anmelde|usuario|utente|utilizador|gebruiker|nom d.utilisateur|fiscal|(^|[\s_-])spi($|[\s_-])/
const claimsName = (el: HTMLInputElement) => vouched(el) || (el.type || '').toLowerCase() === 'email' || who.test(words(el))
const otherForm = /project|projet|title|titre|descri|comment|message|compose|reply|(?<!e-?mail[\s_-]?)address|adresse|coupon|promo|newsletter|subscri|abonn|checkout|cart|basket|panier|shipping|billing|payment|paiement|search|contact|feedback|survey|invite|share/
const otherPage = /checkout|\/cart|basket|panier|commande|payment|paiement|newsletter|subscribe|abonnement/
function about(scope: Element | Document): string {
  if (!scope || scope === document || !(scope as Element).getAttribute) return ''
  const s = scope as Element
  return [s.id, s.getAttribute('name'), s.getAttribute('class'), s.getAttribute('aria-label'), s.getAttribute('action')].join(' ').toLowerCase()
}
const signInPath = /log-?in|log-?on|sign-?in|sign_in|signon|auth(?!or)|account|identif|connexion|connect|session|sso|saml|idp/
const signInHost = /^(login|signin|auth|accounts?|sso|id|idp|identity|connexion|connect|secure|compte)\./
const signInButton = /^(next|continue|continuer|suivant|sign ?in|log ?in|login|log on|se connecter|connexion|me connecter|s.identifier|weiter|anmelden|einloggen|siguiente|continuar|iniciar sesi[oó]n|entrar|acceder|avanti|accedi|volgende|inloggen|doorgaan|dalej|zaloguj)(\s|$)/
function looksLikeSignIn(el: Element, scope: Element | Document): boolean {
  if (signInHost.test(location.hostname) || signInPath.test(location.pathname.toLowerCase())) return true
  const action = scope !== document ? (scope as Element).getAttribute('action') : ''
  if (action) { try { if (signInPath.test(new URL(action, location.href).pathname.toLowerCase())) return true } catch {} }
  let near: Element | null = el
  for (let up = 0; near && up < 5; up++, near = near.parentElement) {
    const buttons = near.querySelectorAll('button, input[type="submit"], [role="button"]')
    for (let i = 0; i < buttons.length && i < 20; i++) {
      const b = buttons[i]
      let said = (b.tagName.toLowerCase() === 'input' ? (b as HTMLInputElement).value : b.textContent) || b.getAttribute('aria-label') || ''
      said = said.replace(/[^\p{L}\s']/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
      if (said.length <= 40 && signInButton.test(said)) return true
    }
    if (near === scope) break
  }
  return false
}
/** The name box of a sign-in that asks for the password on the next page:
 * "wide", "exact" (only this host's accounts), or null. */
function firstStep(el: Element | null): 'wide' | 'exact' | null {
  if (!texty(el) || aside(el) || elsewhere(el) || !claimsName(el)) return null
  const scope: Element | Document = el.form || el.closest('form') || document
  if (otherForm.test(about(scope)) || otherPage.test(location.pathname.toLowerCase())) return null
  let others = 0
  scope.querySelectorAll('input').forEach(i => { if (i !== el && texty(i) && !aside(i)) others++ })
  if (others > (vouched(el) ? 1 : 0)) return null
  if (!vouched(el) && !scope.querySelector('button, input[type="submit"], input[type="image"], [role="button"]')) return null
  return looksLikeSignIn(el, scope) ? 'wide' : 'exact'
}
const nameBox = (el: Element | null) => !!firstStep(el)
const newPassword = (el: Element) => tokens(el).includes('new-password')

/** What a box the caret is in is offered: null for nothing. */
function judge(el: Element | null): { name: boolean; wide: boolean } | null {
  if (!el || el.tagName.toLowerCase() !== 'input') return null
  const both = pair(el)
  if (both) {
    if (el === both.pass) return newPassword(el) ? null : { name: false, wide: true }
    if (el !== both.user || newPassword(both.pass)) return null
    if (aside(el as HTMLInputElement) || elsewhere(el)) return null
    const together = !!(el as HTMLInputElement).form && (el as HTMLInputElement).form === both.pass.form
    return together || claimsName(el as HTMLInputElement) ? { name: false, wide: true } : null
  }
  const step = firstStep(el)
  return step ? { name: true, wide: step === 'wide' } : null
}

/** The name box of a first step, if this page is one. */
function named(): HTMLInputElement | null {
  if (pair()) return null
  const el = active()
  if (nameBox(el)) return el as HTMLInputElement
  const seen: HTMLInputElement[] = []
  for (const i of Array.from(document.querySelectorAll('input'))) {
    if (texty(i) && !aside(i)) seen.push(i)
    if (seen.length > 6) return null
  }
  return seen.find(nameBox) ?? null
}

/** A value put in as a person would: the native setter, then input and change,
 * so React and the like see it. */
function put(el: HTMLInputElement, value: string): void {
  el.focus()
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

// what a sign-in sends (Forms.swift offer)

let offered = 0
function offer(): void {
  if (framed) return
  let both = pair()
  if (!both) {
    const box = named()
    const name = box ? box.value.trim() : ''
    if (name) { offered = Date.now(); tell({ kind: 'name', user: name }) }
    return
  }
  // The one last typed in goes with its own name, not a sign-up form's above it.
  if (lastTyped && lastTyped.isConnected && lastTyped !== both.pass) both = pair(lastTyped) || both
  if (!both.pass.value || !touched.has(both.pass)) return
  offered = Date.now()
  tell({ kind: 'submit', user: both.user ? both.user.value : '', password: both.pass.value })
}

document.addEventListener('submit', offer, true)
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || listUp.lit != null) return
  const el = active(), both = pair(el)
  if (both && (el === both.pass || el === both.user)) offer()
  else if (!both && nameBox(el)) offer()
}, true)
// Plenty of sign-in buttons aren't in a form and never fire submit.
document.addEventListener('click', e => {
  const el = e.target as Element | null
  if (el?.closest?.('button, input[type="submit"], [role="button"]')) setTimeout(offer, 0)
}, true)

// The boxes going away without a new page is the other way a sign-in shows
// it took: looked at a quarter of a second after the page changes.
let told = false, settling: ReturnType<typeof setTimeout> | undefined, looking: ReturnType<typeof setTimeout> | null = null
function look(): void {
  looking = null
  if (!told) { if (pair()) told = true; return }
  if (pair()) return
  told = false
  clearTimeout(settling)
  settling = setTimeout(() => { if (!pair()) tell({ kind: 'settled' }) }, 400)
}
if (!framed) {
  const start = () => {
    told = !!pair()
    new MutationObserver(() => { if (!looking) looking = setTimeout(look, 250) })
      .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
}

// where the caret is (Forms.swift caret)

let said = ''
let judged: { el: Element | null; verdict: ReturnType<typeof judge> } = { el: null, verdict: null }
function caret(scrolled = false): void {
  if (framed) return
  const el = active()
  if (!scrolled || judged.el !== el) judged = { el, verdict: judge(el) }
  const verdict = judged.verdict
  let rect: { x: number; y: number; w: number; h: number } | null = null
  if (verdict && el) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) rect = { x: r.left, y: r.top, w: r.width, h: r.height }
  }
  const now = rect ? `${verdict!.name} ${verdict!.wide} ${rect.x} ${rect.y} ${rect.w} ${rect.h}` : ''
  if (scrolled && now === said) return
  said = now
  tell({ kind: 'focus', rect, name: !!verdict?.name, wide: verdict ? verdict.wide : true })
}
let moving = false
function moved(): void {
  if (moving) return
  moving = true
  requestAnimationFrame(() => { moving = false; caret(true) })
}
window.addEventListener('scroll', moved, true)
window.addEventListener('resize', moved)
document.addEventListener('focusin', () => caret(), true)
document.addEventListener('focusout', () => setTimeout(() => caret(), 0), true)
document.addEventListener('mouseup', () => setTimeout(() => caret(), 0), true)
// The box can go without a focusout: a sign-in that moves on to its next
// step, or goes back, takes it out of the page (Chromium says nothing when
// a focused element is removed), and the list stayed over whatever came
// next. Looked at again whenever the page changes while the list is up.
window.addEventListener('popstate', () => caret(), true)
window.addEventListener('hashchange', () => caret(), true)
window.addEventListener('pagehide', () => tell({ kind: 'focus', rect: null, name: false, wide: true }), true)
if (!framed) {
  const watch = () => new MutationObserver(() => { if (listUp.up) moved() }).observe(document.documentElement, { childList: true, subtree: true })
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch)
  else watch()
}

// the account list's keys, while it hangs from a box here

const listUp: { up: boolean; lit: number | null } = { up: false, lit: null }
ipcRenderer.on('data:forms-list', (_e, state: { up: boolean; lit: number | null }) => { listUp.up = state.up; listUp.lit = state.lit })
window.addEventListener('keydown', e => {
  if (!listUp.up) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (e.key === 'Enter' && listUp.lit != null)) {
    e.preventDefault()
    e.stopImmediatePropagation()
    tell({ kind: 'listKey', key: e.key })
  } else if (e.key === 'Escape') {
    tell({ kind: 'listKey', key: e.key })
  }
}, true)

// what Search asks of the page

const calls: Record<string, (args: Record<string, string>) => unknown> = {
  fill({ user, password }) {
    const both = pair(active())
    if (!both) return false
    if (both.user && !both.user.value) put(both.user, user)
    touch(both.pass)
    put(both.pass, password)
    return true
  },
  name({ user }) {
    const box = named()
    if (!box) return false
    put(box, user)
    return true
  },
  hasPassword() { return !!pair() },
  // A form on its way out that no listener here heard (form.submit() from
  // the page's script): Search asks as the page starts to leave.
  sent() { if (Date.now() - offered > 2000) offer(); return true },
  verdict() { return judge(active()) },
}

ipcRenderer.on('data:forms-call', (_e, req: { serial: number; call: string; args: Record<string, string>; origin?: string }) => {
  let value: unknown = false
  try {
    // A document that changed since it was picked for gets nothing.
    if (!req.origin || location.origin === req.origin) value = calls[req.call]?.(req.args ?? {}) ?? false
  } catch { value = false }
  tell({ kind: 'reply', serial: req.serial, value })
})

if (!framed) tell({ kind: 'page' })
