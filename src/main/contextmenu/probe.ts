// What a test world gets in place of Windows' own windows (the Save dialog,
// printing, the inspector, the emoji panel): answers given ahead, and a
// record of what was asked.

import type { ID } from '../../shared/state'

export const log = {
  dialogs: [] as { title: string; defaultPath: string }[],
  /** The Save dialog's answer: a path, or null for Cancel. */
  saveAs: null as string | null,
  printed: [] as ID[],
  inspected: [] as { id: ID; x: number; y: number }[],
  emoji: 0,
}
