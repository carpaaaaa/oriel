// The bench: the same idea as Search on the Mac (Bench.swift, Tests/split_view.py).
// A test starts the app in a world of its own (SEARCH_PROBE=<name>: its own
// settings folder, its own socket) and drives it with one JSON object per
// line; each gets one JSON line back. Unix socket on a Mac, named pipe on
// Windows. Owned by the orchestrator; modules add requests under their name.

import type { Command } from './commands'

export type BenchRequest =
  /** The whole model, as tests read it. */
  | { do: 'state' }
  /** Run any interface command. */
  | { do: 'cmd'; cmd: Command; window?: string }
  /** Run JavaScript in a tab's page and return its value. */
  | { do: 'eval'; id: string; js: string }
  /** Run JavaScript in a window's interface ("chrome" or "overlay"). */
  | { do: 'ui'; js: string; root?: 'chrome' | 'overlay'; window?: string }
  /** A picture of the window, written as PNG to `path`. */
  | { do: 'shot'; path: string; window?: string }
  /** Send a key to the focused page or interface, as a person would. */
  | { do: 'key'; key: string; modifiers?: string[]; window?: string }
  /** Move and press the mouse at a point of the window. */
  | { do: 'mouse'; x: number; y: number; button?: 'left' | 'right' | 'middle'; clicks?: number; window?: string }
  /** Wait until the main process has nothing pending. */
  | { do: 'settle' }
  | { do: 'quit' }
  /** Requests a module adds: { do: '<module>.<name>', ... } */
  | { do: `${string}.${string}`; [field: string]: unknown }

export type BenchReply = { ok: true; [field: string]: unknown } | { ok: false; error: string }

export function benchAddress(world: string, userData: string, platform: string): string {
  return platform === 'win32'
    ? `\\\\.\\pipe\\search-bench-${world.replace(/[^A-Za-z0-9_-]/g, '_')}`
    : `${userData}/bench.sock`
}
