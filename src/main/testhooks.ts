// The test worlds' knobs (SEARCH_PROBE, which opens the bench socket, and the
// other SEARCH_* and ORIEL_* variables: update feed, store host, translation
// catalogue, frame variants...) work only in a build run with `electron .`.
// An installed Oriel (app.isPackaged) never reads them, so no shortcut,
// startup entry or environment can turn a copy someone uses into a test
// world (studio/09 §1.2). Every read of such a variable goes through here.

import { app } from 'electron'

/** Test hooks are on only outside a package. `packaged` is for the bench,
 * to ask what an installed copy would do. */
export function testHooksAllowed(packaged: boolean = app.isPackaged): boolean {
  return !packaged
}

/** A test knob from the environment, or undefined in an installed Oriel. */
export function testEnv(name: string, packaged: boolean = app.isPackaged): string | undefined {
  return testHooksAllowed(packaged) ? process.env[name] : undefined
}
