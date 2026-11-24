// Smooth scrolling with a mouse wheel (studio/06 §1.11 #129; WheelGlide.swift).
// Chromium glides a wheel's notches itself, on the compositor: every frame
// and every scroller, a page that takes the wheel left to it, never held up
// by a busy page. Its glide is Chrome's on Windows: eased in and out over 100
// to 200 ms by the distance, retargeted with its speed kept when another
// notch comes; a touchpad's precise deltas are left as they come. (Edge's
// "impulse" curve, WindowsScrollingPersonality, is gone from Chromium 156:
// nothing in enable-features changes the feel.)
//
// On by default in Oriel (the user's choice; Search's default is off),
// unless the system asks for less motion: Windows' Animation effects off or
// a Remote Desktop session, as Chrome follows it (Reduce motion on a Mac).
// The switch is told to Chromium before a page is made and read as it is
// made: new tabs follow at once, tabs already open once Oriel restarts (or
// a sleeping tab wakes). A page's compositor keeps the settings it was made
// with, so nothing can change an open page in place.

import { app, systemPreferences } from 'electron'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { model } from '../model/model'
import { probe, productName } from '../paths'
import { defaultOf } from '../../shared/prefs'

function set(glide: boolean): void {
  const cl = app.commandLine
  for (const s of ['enable-smooth-scrolling', 'disable-smooth-scrolling']) if (cl.hasSwitch(s)) cl.removeSwitch(s)
  cl.appendSwitch(glide ? 'enable-smooth-scrolling' : 'disable-smooth-scrolling')
}

/** The system lets scrolls animate (what Chromium reads with no switch). */
export function systemGlides(): boolean {
  try {
    const a = systemPreferences.getAnimationSettings()
    return a.scrollAnimationsEnabledBySystem && !a.prefersReducedMotion
  } catch { return true }
}

const wantedIn = (prefs: Record<string, unknown>): boolean => {
  const v = prefs['wheel.smooth']
  return typeof v === 'boolean' ? v : defaultOf('wheel.smooth') !== false
}

/** Before Chromium starts: read straight from prefs.json (the model loads later). */
function atStart(): boolean {
  try {
    const folder = path.join(app.getPath('appData'), probe ? `${productName} (${probe})` : productName)
    return wantedIn(JSON.parse(readFileSync(path.join(folder, 'prefs.json'), 'utf8')))
  } catch { return wantedIn({}) }
}

/** Settings › Keyboard & Mouse › Smooth scrolling with a mouse wheel. */
export let wanted = atStart()
/** What Chromium is told for the next page made. */
export let gliding = wanted && systemGlides()
set(gliding)

function refresh(): void {
  const now = wanted && systemGlides()
  if (now === gliding) return
  gliding = now
  set(now)
}

// Chromium's own middle-button scrolling (Windows has it on): left to the
// page script, so the switch, off unless turned on, says what happens as
// on the Mac (Scroll with the middle button, AutoScroll.swift).
app.commandLine.appendSwitch('disable-blink-features', 'MiddleClickAutoscroll')

model.on('window-changed', (_id: string, slices: string[]) => {
  if (!slices.includes('prefs')) return
  wanted = wantedIn(model.prefs)
  refresh()
})
// Animation effects turned off or on while Oriel runs: the next page made
// follows, as in Chrome.
app.on('web-contents-created', refresh)
