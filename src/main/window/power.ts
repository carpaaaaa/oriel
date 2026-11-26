// Saving power (Design.swift Motion.light / savingPower; Settings › Save
// power in Low Power Mode, motion.light): with the switch on and Windows'
// battery saver on (the Mac's Low Power Mode), the two springs become a short
// ease-out in the interface and idle tabs sleep sooner (Sleep.swift:88).
// SEARCH_LOW_POWER=1 stands in for the battery saver in tests, as the Mac's
// testLowPower does.

import { app } from 'electron'
import { model } from '../model/model'
import { allControllers, registerSlice } from '../views/window'
import { testEnv } from '../testhooks'

let saver = false
let status: ((s: Record<string, number>) => number) | null | undefined

/** Windows' battery saver, from GetSystemPowerStatus (SystemStatusFlag). */
function batterySaver(): boolean {
  if (testEnv('SEARCH_LOW_POWER') === '1') return true
  if (process.platform !== 'win32') return false
  try {
    if (status === undefined) {
      status = null
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const koffi = require('koffi')
      koffi.struct('SEARCH_POWER_STATUS', { ac: 'uint8', battery: 'uint8', percent: 'uint8', flags: 'uint8', life: 'uint32', full: 'uint32' })
      status = koffi.load('kernel32.dll').func('int __stdcall GetSystemPowerStatus(_Out_ SEARCH_POWER_STATUS *status)')
    }
    const s = { ac: 0, battery: 0, percent: 0, flags: 0, life: 0, full: 0 }
    return !!status && status(s) !== 0 && (s.flags & 1) === 1
  } catch { return false }
}

/** The switch is on and the machine is saving power. */
export function savingPower(): boolean { return !!model.pref<boolean>('motion.light') && saver }

function look(): void {
  const now = batterySaver()
  if (now === saver) return
  saver = now
  for (const c of allControllers()) c.mark('power')
}

// Windows is asked only while the switch is on: everything that saves power
// waits on it (motion.light, off by default), so with it off no look is needed.
let poll: NodeJS.Timeout | null = null
function follow(): void {
  const on = !!model.pref<boolean>('motion.light')
  if (on && !poll) { look(); poll = setInterval(look, 30_000); poll.unref?.() }
  else if (!on && poll) { clearInterval(poll); poll = null }
}
// (setImmediate: after index.ts has loaded the model.)
app.whenReady().then(() => setImmediate(follow))
model.on('window-changed', (_id: string, slices: string[]) => { if (slices.includes('prefs')) follow() })
registerSlice('power', () => ({ saving: saver }))
