// Oriel's own icon on its windows, for what Windows shows of them: the
// taskbar's previews (they showed Electron's icon over the picture), Alt+Tab
// and a window's own corner. Shipped beside the app as resources/icon.ico
// (package.json extraResources); in a checkout, build/icon.ico.

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

let found: string | undefined | null = null

export function appIcon(): string | undefined {
  if (process.platform !== 'win32') return undefined
  if (found !== null) return found
  const file = app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(app.getAppPath(), 'build', 'icon.ico')
  found = fs.existsSync(file) ? file : undefined
  return found
}

/** The window options that carry it (nothing on a Mac or without the file). */
export const iconOption = (): { icon?: string } => { const icon = appIcon(); return icon ? { icon } : {} }
