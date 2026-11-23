// The questions about extensions, one at a time, on the window (studio/04
// §2.2 "Dialogo di installazione", §2.3 "Remove"): a native message box, as
// the Mac's NSAlert. A test world never shows one; its answers come from the
// bench (extensions.answer), and without one the question is cancelled.

import { dialog, nativeImage, type NativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { probe } from '../paths'
import { focusedController } from '../views/window'

const answers: string[] = []
let queue: Promise<unknown> = Promise.resolve()

/** Bench: the buttons to press for the next questions. */
export function answerNext(list: string[]): void { answers.push(...list) }
/** Bench: what was asked, for the tests to read. */
export const asked: { message: string; detail: string; buttons: string[] }[] = []

export function ask(o: { message: string; detail: string; buttons: string[]; cancel: number; icon?: NativeImage }): Promise<string> {
  const run = async () => {
    asked.push({ message: o.message, detail: o.detail, buttons: o.buttons })
    if (answers.length) return answers.shift()!
    if (probe) return o.buttons[o.cancel]
    const win = focusedController()?.base
    const options: Electron.MessageBoxOptions = { type: 'none', message: o.message, detail: o.detail, buttons: o.buttons, cancelId: o.cancel, defaultId: 0, noLink: true, icon: o.icon }
    const r = win ? await dialog.showMessageBox(win as never, options) : await dialog.showMessageBox(options)
    return o.buttons[r.response]
  }
  const next = queue.then(run, run)
  queue = next.catch(() => {})
  return next
}

/** "__MSG_name__" in the extension's default language. */
export function localize(folder: string, manifest: { default_locale?: string }, text: string | undefined): string {
  const m = /^__MSG_(\w+)__$/.exec(text ?? '')
  if (!m) return text ?? ''
  for (const locale of [manifest.default_locale ?? 'en', 'en']) {
    try {
      const messages = JSON.parse(fs.readFileSync(path.join(folder, '_locales', locale, 'messages.json'), 'utf8'))
      const entry = Object.entries(messages).find(([k]) => k.toLowerCase() === m[1].toLowerCase())?.[1] as { message?: string } | undefined
      if (entry?.message) return entry.message
    } catch { /* next */ }
  }
  return ''
}

export function iconOf(folder: string, manifest: { icons?: Record<string, string> }): NativeImage | undefined {
  const icons = manifest.icons ?? {}
  const size = Object.keys(icons).map(Number).sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64))[0]
  if (!size) return undefined
  const image = nativeImage.createFromPath(path.join(folder, icons[String(size)].replace(/^\//, '')))
  return image.isEmpty() ? undefined : image.resize({ width: 64, height: 64 })
}

// What it will be able to do, in the Mac's order (Extensions.describe,
// studio/04 §2.2). "on this Mac" becomes "on this PC".
const phrases: [string, string][] = [
  ['tabs', 'See your open tabs and their addresses'],
  ['cookies', 'Read and change cookies'],
  ['webNavigation', 'See where you go'],
  ['webRequest', 'See the requests pages make'],
  ['declarativeNetRequest', 'Block or change requests pages make'],
  ['clipboardWrite', 'Write to the clipboard'],
  ['nativeMessaging', 'Talk to apps on this PC'],
  ['scripting', 'Run scripts in pages'],
  ['userScripts', 'Run scripts you add to it on websites'],
  ['history', 'Read and change your history'],
  ['bookmarks', 'Read and change your bookmarks'],
  ['downloads', 'Manage your downloads'],
  ['privacy', 'Change your privacy settings'],
  ['browsingData', 'Clear your browsing data'],
  ['management', 'See your other extensions'],
  ['notifications', 'Show notifications'],
  ['sessions', 'See your recently closed tabs'],
  ['topSites', 'See your most visited sites'],
  ['readingList', 'Read and change your reading list'],
  ['downloads.open', 'Open files it downloads'],
  ['desktopCapture', 'Record your screen or a window, when you choose what to share'],
  ['tabCapture', 'Record a tab, when you ask it to'],
]

export function describe(manifest: { permissions?: string[]; host_permissions?: string[]; manifest_version?: number; content_scripts?: { matches?: string[] }[] }): string[] {
  const perms = new Set(manifest.permissions ?? [])
  const hostish = (p: string) => p === '<all_urls>' || p.includes('://')
  const hosts = [...(manifest.host_permissions ?? []), ...[...perms].filter(hostish), ...(manifest.content_scripts ?? []).flatMap(c => c.matches ?? [])]
  const out: string[] = []
  if (hosts.some(h => h === '<all_urls>' || /^(\*|https?):\/\/\*\//.test(h))) out.push('Read and change everything on every website')
  else if (hosts.length) {
    const names = [...new Set(hosts.map(h => h.replace(/^[^:]+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '')))]
    out.push(`Read and change what's on ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}`)
  }
  for (const [perm, text] of phrases) if (perms.has(perm) || (perm === 'declarativeNetRequest' && perms.has('declarativeNetRequestWithHostAccess'))) out.push(text)
  return out
}

/** Add “<Name>” to Oriel? (studio/04 §2.2) */
export async function askToAdd(name: string, manifest: Parameters<typeof describe>[0], appName: string, icon?: NativeImage): Promise<boolean> {
  const lines = describe(manifest)
  const detail = lines.length ? `It will be able to:\n${lines.map(l => `• ${l}`).join('\n')}` : `It doesn't ask for anything special.`
  return (await ask({ message: `Add “${name}” to ${appName}?`, detail, buttons: ['Add Extension', 'Cancel'], cancel: 1, icon })) === 'Add Extension'
}
