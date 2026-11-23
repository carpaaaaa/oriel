// The settings module's bench requests (test/settings_*.py).

import { benchRequest } from '../bench/server'
import { refused } from './internal'
import { probeAnswers, said, mergedValues } from './prefs'
import { asked, saved } from './permissions'
import { downloadsState } from './downloads'

/** What Oriel said, opened, refused and asked: a test reads it back. */
benchRequest('settings.state', () => ({
  said: said.slice(-20),
  opened: probeAnswers.opened.slice(-20),
  refused: refused.slice(-20),
  asked: asked.slice(-20),
  permissions: saved(),
  merged: mergedValues(),
  downloads: downloadsState(),
}))

/** Answers a dialog would give, in a test world (never a dialog on screen). */
benchRequest('settings.answers', req => {
  if ('folder' in req) probeAnswers.folder = (req.folder as string | null) ?? null
  if ('saveAs' in req) probeAnswers.saveAs = (req.saveAs as string | null) ?? null
  return {}
})
