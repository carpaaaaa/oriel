// Smooth scrolling with a mouse wheel (studio/06 §1.11 #129; WheelGlide.swift).
// Chromium glides a wheel's notches itself unless told not to: off (Search's
// default) every page made from then on gets them as they come, on they
// glide over a few frames as in Chrome. Chromium reads it as each page is
// made, so pages already open follow once they are made again (sleep and
// wake, or a new tab).

import { app } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { model } from '../model/model'
import { probe, productName } from '../paths'

function set(glide: boolean): void {
  const cl = app.commandLine
  for (const s of ['enable-smooth-scrolling', 'disable-smooth-scrolling']) if (cl.hasSwitch(s)) cl.removeSwitch(s)
  cl.appendSwitch(glide ? 'enable-smooth-scrolling' : 'disable-smooth-scrolling')
}

/** Before Chromium starts: read straight from prefs.json (the model loads later). */
function atStart(): boolean {
  try {
    const folder = path.join(app.getPath('appData'), probe ? `${productName} (${probe})` : productName)
    const prefs = JSON.parse(readFileSync(path.join(folder, 'prefs.json'), 'utf8'))
    return prefs['wheel.smooth'] === true
  } catch { return false }
}

export let gliding = atStart()
set(gliding)

// Chromium's own middle-button scrolling (Windows has it on): left to the
// page script, so the switch, off unless turned on, says what happens as
// on the Mac (Scroll with the middle button, AutoScroll.swift).
app.commandLine.appendSwitch('disable-blink-features', 'MiddleClickAutoscroll')

model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs')) return
  const now = model.pref<boolean>('wheel.smooth') === true
  if (now === gliding) return
  gliding = now
  set(now)
})
