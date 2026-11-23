// Proving it is the PC's owner before a saved password is shown, copied, all
// removed, or (when asked for in Settings) filled in: Windows Hello on
// Windows, where the Mac asks for Touch ID (Vault.prove, Vault.FillProof;
// studio/05 §2.5 and §2.11).
//
// Windows: UserConsentVerifier through PowerShell's WinRT bridge for now;
// the dialog belongs over the window (IUserConsentVerifierInterop with the
// window's handle) and, without Hello, the Windows password
// (CredUIPromptForWindowsCredentials). Both want a native call: see the
// module's report. Elsewhere (development on a Mac) a plain question stands
// in, and a test world answers as the bench says.

import { dialog, powerMonitor } from 'electron'
import { execFile } from 'node:child_process'
import { probe } from '../paths'
import type { WindowController } from '../views/window'
import { registrable } from './urls'
import { appName } from '../../shared/modules/data'

/** A test world's answer: yes, no, or nothing set (no). */
let testAnswer: boolean | null = null
export function setTestAnswer(yes: boolean | null): void { testAnswer = yes }
/** How many times a proof was asked, for the tests. */
export let asked = 0

/** Windows Hello's verdicts that mean there is nothing it can ask. */
const cannotAsk = new Set(['DeviceNotPresent', 'NotConfiguredForUser', 'DisabledByPolicy', 'DeviceBusy'])

function hello(reason: string): Promise<'Verified' | string> {
  // The reason goes in through the environment, never as script text.
  const script = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
    function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
    $avail = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])
    if ($avail -ne 'Available') { Write-Output $avail; exit }
    $r = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync($env:SEARCH_HELLO_REASON)) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
    Write-Output $r`
  return new Promise(done => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 120_000, env: { ...process.env, SEARCH_HELLO_REASON: reason } },
      (error, stdout) => done(error ? 'Failed' : String(stdout).trim()))
  })
}

/** Yes only for the owner; any error is a no. */
export async function prove(reason: string, c?: WindowController | null): Promise<boolean> {
  asked++
  if (probe) return testAnswer === true
  if (process.platform === 'win32') {
    const verdict = await hello(reason)
    if (verdict === 'Verified') return true
    if (!cannotAsk.has(verdict)) return false
    // Hello isn't set up: the Windows password should be asked here
    // (CredUIPromptForWindowsCredentials). Until then, a plain question.
  }
  const options = {
    type: 'question' as const,
    buttons: ['Allow', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `${appName} wants to ${reason}.`,
    detail: process.platform === 'win32' ? 'Windows Hello isn\'t set up on this PC.' : 'A stand-in for Windows Hello, while developing.',
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
