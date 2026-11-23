Each module declares its own commands and state here, in a file of its own,
by augmenting the shared interfaces (TypeScript declaration merging):

```ts
// src/shared/modules/downloads.ts
import type { ID } from '../state'
declare module '../commands' {
  interface Commands { 'download.pause': { id: ID } }
}
declare module '../state' {
  interface WindowState { downloadsPanel: { open: boolean } }
}
export {}
```

Then in the main process: `handle('download.pause', ...)` and
`registerSlice('downloadsPanel', c => ...)`; in the interface, `state.downloadsPanel`.
A module never edits commands.ts, state.ts, ipc.ts or bench.ts.
