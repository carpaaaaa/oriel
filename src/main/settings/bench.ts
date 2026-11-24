// The settings module's bench requests (test/settings_*.py).

import { writeFileSync } from 'node:fs'
import { benchRequest } from '../bench/server'
import { runtimes } from '../views/tabs'
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

/** A picture of one tab's page (an Oriel page), PNG to `path`. */
benchRequest('settings.shot', async req => {
  const wc = runtimes.get(String(req.id))?.contents
  if (!wc) throw new Error('tab has no page')
  const image = await wc.capturePage()
  writeFileSync(String(req.path), image.toPNG())
  return { width: image.getSize().width, height: image.getSize().height }
})

/** Answers a dialog would give, in a test world (never a dialog on screen). */
benchRequest('settings.answers', req => {
  if ('folder' in req) probeAnswers.folder = (req.folder as string | null) ?? null
  if ('saveAs' in req) probeAnswers.saveAs = (req.saveAs as string | null) ?? null
  return {}
})
