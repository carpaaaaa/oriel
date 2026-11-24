// The themes module's commands (Settings › Themes, the blank tab's wall;
// studio/02 §8.2, §8.3; HomeTheme.swift). Its keys are Prefs.swift's:
// home.theme, home.theme.image, home.tuning, home.shuffle (shared/prefs.ts).
// Owned by the themes module.

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type None = {}

declare module '../commands' {
  interface Commands {
    /** Windows' Open dialog for a picture; the copy kept, and the wall set
     * to it. Null when cancelled or not copied (what was there stays). */
    'themes.choose': None
    /** The kept copy goes, and the wall with it if it was showing. */
    'themes.forget': None
    /** The kept copy's bytes, for the interface to decode; null if unreadable. */
    'themes.picture': { path: string }
    /** What the page draws with: the system accent (the ring on the choice). */
    'themes.facts': None
  }
}

export {}
