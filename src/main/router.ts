// Commands from the interface (and the bench) find their handler here.
// Each module registers its own: handle('tab.select', (args, ctx) => ...).

import type { CommandName, Commands } from '../shared/commands'
import type { WindowController } from './views/window'

export interface Context {
  /** The window the command came from (or the bench named). */
  window: WindowController | null
}

type Handler<K extends CommandName> = (args: Commands[K], ctx: Context) => unknown | Promise<unknown>

const handlers = new Map<CommandName, Handler<any>>()

export function handle<K extends CommandName>(name: K, handler: Handler<K>): void {
  if (handlers.has(name)) throw new Error(`command ${name} handled twice`)
  handlers.set(name, handler)
}

export async function run(command: { do: CommandName } & Record<string, unknown>, ctx: Context): Promise<unknown> {
  const handler = handlers.get(command.do)
  if (!handler) throw new Error(`no handler for ${command.do}`)
  const { do: _name, ...args } = command
  return handler(args as never, ctx)
}

export function handled(): CommandName[] {
  return [...handlers.keys()]
}
