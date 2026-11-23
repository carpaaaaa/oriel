// Search's own passwords, as commands for the Passwords panel and Settings
// (Passwords.swift, Browser.swift remove and copy; studio/05 §2.2, §2.6).
// The panel itself lives where the settings module puts it.

import { clipboard, ClipboardItem } from 'electron'
import { handle } from '../router'
import { need } from '../context'
import { addDefaults } from '../../shared/prefs'
import { benchRequest } from '../bench/server'
import { prove, setTestAnswer, fillProof, asked } from './proof'
import { never, vault } from './vault'
import { siteHost } from './urls'
import { lastSaid, pendingOffer } from './forms'
import { windowData } from './store'
import { focusedController } from '../views/window'
import { runtimes } from '../views/tabs'
import { readFileSync, existsSync } from 'node:fs'
import { dataFile } from '../paths'

// Settings › Passwords, with the Mac's keys and defaults (05 §2.10).
addDefaults({
  'passwords.save': true,
  'passwords.fill': true,
  'passwords.fill.prove': false,
  'passwords.never': [],
})

const matches = (q: string) => {
  const needle = q.trim().toLowerCase()
  return vault.all().filter(k => !needle || k.host.includes(needle) || k.user.toLowerCase().includes(needle))
}

handle('passwords.list', ({ query }) => ({ logins: matches(query ?? ''), never: never.list().length }))

handle('passwords.add', ({ host, user, password }) => {
  const site = siteHost(host)
  if (!site || !password) return { ok: false, said: '' }
  const ok = vault.save(site, user, password, null, /^http:\/\//i.test(host.trim()))
  return { ok, said: ok ? `Kept for ${site}` : 'The vault refused it' }
})

/** Immediate, no question and no proof, as on the Mac. */
handle('passwords.remove', ({ host, user }) => ({ ok: vault.forget(host, user) }))

handle('passwords.removeAll', async ({ query }, ctx) => {
  const list = matches(query ?? '')
  if (!list.length) return { removed: 0, said: '' }
  if (!(await prove(list.length === 1 ? 'remove 1 password' : `remove ${list.length} passwords`, need(ctx)))) return { removed: 0, said: '' }
  let removed = 0
  for (const k of list) if (vault.forget(k.host, k.user)) removed++
  const said = removed === list.length ? `Removed ${removed} password${removed === 1 ? '' : 's'}`
    : removed === 0 ? 'The vault refused them' : `Removed ${removed} of ${list.length} passwords`
  return { removed, said }
})

/** The password on the clipboard, kept out of Windows' clipboard history and
 * cloud clipboard (and, on a Mac, marked concealed and transient): every
 * format in one atomic write (05 §2.11). Plain text if that is refused. */
async function concealed(secret: string): Promise<void> {
  const raw = (format: string) => `electron application/osclipboard;format="${format}"`
  const zero = new Blob([new Uint8Array(4)])
  const extra: Record<string, Blob> = process.platform === 'win32'
    ? { [raw('ExcludeClipboardContentFromMonitorProcessing')]: zero, [raw('CanIncludeInClipboardHistory')]: zero, [raw('CanUploadToCloudClipboard')]: zero }
    : process.platform === 'darwin'
      ? { [raw('org.nspasteboard.ConcealedType')]: new Blob(['']), [raw('org.nspasteboard.TransientType')]: new Blob(['']) }
      : {}
  try { await clipboard.write([new ClipboardItem({ 'text/plain': secret, ...extra })]) }
  catch { await clipboard.writeText(secret) }
}

/** Shown after a proof, for 15 seconds (the panel forgets it then). */
handle('passwords.reveal', async ({ host, user }, ctx) => {
  if (!(await prove(`show the password for ${host}`, need(ctx)))) return null
  return { password: vault.secret(host, user), seconds: 15 }
})

/** Copied after a proof, and taken off the clipboard after 90 seconds if
 * nothing else was copied since. */
handle('passwords.copy', async ({ host, user }, ctx) => {
  if (!(await prove(`copy the password for ${host}`, need(ctx)))) return { ok: false }
  const secret = vault.secret(host, user)
  if (secret == null) return { ok: false }
  await concealed(secret)
  setTimeout(() => { void clipboard.readText().then(now => { if (now === secret) void clipboard.clear() }) }, 90_000)
  return { ok: true, said: 'Password copied' }
})

handle('passwords.forgetNever', () => { never.clear() })

// bench (test worlds only)

benchRequest('data.vault', () => ({
  logins: vault.all(),
  never: never.list(),
  file: existsSync(dataFile('vault.json')) ? readFileSync(dataFile('vault.json'), 'utf8') : null,
}))
benchRequest('data.secret', req => ({ value: vault.secret(String(req.host), String(req.user)) }))
benchRequest('data.prove', req => { setTestAnswer(req.answer === true ? true : req.answer === false ? false : null); return {} })
benchRequest('data.forms', () => {
  const c = focusedController()
  const d = c ? windowData(c) : null
  return { fill: d?.fill ?? null, save: d?.save ?? null, offering: pendingOffer(), said: lastSaid, proofs: asked, fillAsked: fillProof.asked, overlay: c?.overlayLayer ?? null }
})
benchRequest('data.fillAge', req => { fillProof.age(Number(req.ms)); return {} })
// A key to the page in front, as a person's keyboard would send it: the
// bench's own key goes to whatever has focus, and a window behind others has none.
benchRequest('data.pageKey', req => {
  const c = focusedController()
  const id = c?.record.active[c.record.space]
  const wc = id ? runtimes.get(id)?.contents : null
  if (!wc) throw new Error('no page')
  wc.focus()
  // Electron's names for the keys: Down, not ArrowDown.
  const keyCode = ({ ArrowDown: 'Down', ArrowUp: 'Up' } as Record<string, string>)[String(req.key)] ?? String(req.key)
  wc.sendInputEvent({ type: 'keyDown', keyCode })
  if (keyCode === 'Enter') wc.sendInputEvent({ type: 'char', keyCode: '\r' })
  wc.sendInputEvent({ type: 'keyUp', keyCode })
  return {}
})
benchRequest('data.vaultReload', () => { vault.reload(); return {} })
