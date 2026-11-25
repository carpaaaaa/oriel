// What the Jump List asks of Oriel: right-click its icon in the taskbar for
// New Window and New Private Tab (studio/01 §1.9, §3.7; studio/03 §5). A task
// runs Oriel.exe again with a flag; the running Oriel hears it as a second
// launch (index.ts), or the first one opens with it.

import { app } from 'electron'
import { run } from './router'
import { allControllers, type WindowController } from './views/window'
import { openWindow } from './context'
import { benchRequest } from './bench/server'

export type LaunchAction = 'window' | 'privateTab'

/** The Jump List's own flags on a command line. */
export function launchAction(argv: string[]): LaunchAction | null {
  if (argv.includes('--private-tab')) return 'privateTab'
  if (argv.includes('--new-window')) return 'window'
  return null
}

/** The window in front, else the first. */
export function frontController(): WindowController | undefined {
  const all = allControllers()
  return all.find(c => !c.base.isDestroyed() && c.base.isFocused()) ?? all[0]
}

/** Do what the Jump List's entry says, in the window in front (or a new one). */
export async function doLaunch(action: LaunchAction, c: WindowController | undefined = frontController()): Promise<void> {
  if (action === 'window' || !c) { openWindow({ restore: false }); return }
  if (c.base.isMinimized()) c.base.restore()
  c.base.focus()
  await run({ do: 'tab.newPrivate' } as never, { window: c })
}

/** Right-click on the taskbar icon (a packaged Oriel only: the program is
 * the one the user installed, or the portable file, not a temp copy). */
export function setupJumpList(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const program = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  const base = { program, iconPath: program, iconIndex: 0 }
  try {
    app.setUserTasks([
      { ...base, arguments: '--new-window', title: 'New Window', description: 'Open a new Oriel window' },
      { ...base, arguments: '--private-tab', title: 'New Private Tab', description: 'A tab that keeps nothing' },
    ])
  } catch (error) { console.warn('[jump list]', (error as Error).message) }
}

// For the bench: how a command line reads, and a second launch with one.
benchRequest('app.launch', async req => {
  const args = Array.isArray(req.args) ? (req.args as string[]) : []
  if (req.second) { app.emit('second-instance', {} as Electron.Event, ['Oriel.exe', ...args], process.cwd(), undefined as never); return { sent: true } }
  return { action: launchAction(args) }
})
