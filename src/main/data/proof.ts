// Proving it is the PC's owner before a saved password is shown, copied, all
// removed, or (when asked for in Settings) filled in: Windows Hello on
// Windows, where the Mac asks for Touch ID (Vault.prove, Vault.FillProof;
// studio/05 §2.5 and §2.11).
//
// Windows: Windows Hello over Oriel's window, else the Windows password in
// the system's credential dialog (hello.ts). Elsewhere (development on a
// Mac) a plain question stands in, and a test world answers as the bench
// says.

import { dialog, powerMonitor } from 'electron'
import { probe } from '../paths'
import type { WindowController } from '../views/window'
import { registrable } from './urls'
import { appName } from '../../shared/modules/data'
import { windowsProof, type HelloTrace } from './hello'

/** A test world's answer: yes, no, or nothing set (no). */
let testAnswer: boolean | null = null
export function setTestAnswer(yes: boolean | null): void { testAnswer = yes }
/** How many times a proof was asked, for the tests. */
export let asked = 0
/** The last Windows proof, step by step. */
export let lastTrace: HelloTrace | null = null

/** Yes only for the owner; any error, cancel or time out is a no. */
export async function prove(reason: string, c?: WindowController | null): Promise<boolean> {
  asked++
  if (probe) return testAnswer === true
  if (process.platform === 'win32') {
    lastTrace = await windowsProof(reason, c?.base ?? null, appName)
    if (lastTrace.verdict !== 'verified') console.warn('[proof]', lastTrace.verdict, lastTrace.steps.join(' · '))
    return lastTrace.verdict === 'verified'
  }
  const options = {
    type: 'question' as const,
    buttons: ['Allow', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `${appName} wants to ${reason}.`,
    detail: 'A stand-in for Windows Hello, while developing.',
  }
  const answer = c ? await dialog.showMessageBox(c.base as never, options) : await dialog.showMessageBox(options)
  return answer.response === 0
}

/** Ask for Windows Hello before filling (Vault.FillProof): one yes holds a
 * minute for that site, in private tabs or ordinary ones, and ends early
 * when the screen locks or the PC sleeps. */
export const fillProof = {
  grace: 60_000,
  provenAt: new Map<string, number>(),
  asking: false,
  asked: 0,
  watching: false,

  key(host: string, shy: boolean): string { return (shy ? 'private ' : '') + registrable(host) },

  fresh(host: string, shy: boolean, now = Date.now()): boolean {
    const at = this.provenAt.get(this.key(host, shy))
    return at != null && now - at >= 0 && now - at < this.grace
  },

  /** True once proven or still within the grace; false for a no, a failure,
   * or a question already up (a second pick fills nothing). */
  async ask(host: string, shy: boolean, c?: WindowController | null): Promise<boolean> {
    if (this.fresh(host, shy)) return true
    if (this.asking) return false
    this.watch()
    this.asking = true
    this.asked++
    try {
      const ok = await prove(`fill your password for ${host}`, c)
      if (ok) this.provenAt.set(this.key(host, shy), Date.now())
      return ok
    } finally { this.asking = false }
  },

  forget(): void { this.provenAt.clear() },

  /** A test world's: as if the yes was given `ms` ago. */
  age(ms: number): void { for (const k of this.provenAt.keys()) this.provenAt.set(k, Date.now() - ms) },

  watch(): void {
    if (this.watching) return
    this.watching = true
    const spend = () => this.forget()
    for (const e of ['lock-screen', 'suspend', 'user-did-resign-active'] as const) powerMonitor.on(e as never, spend)
  },
}
