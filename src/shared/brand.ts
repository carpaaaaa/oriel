// The app's name and the scheme of its own pages. Oriel is an unofficial
// Windows port of Search by Office Commun; wherever Search names itself in
// its interface ("Add to Search", "Search › What's New"), Oriel says Oriel.
// Owned by the orchestrator.

export const brand = {
  name: 'Oriel',
  /** Internal pages: oriel://settings, oriel://history... (search:// on the Mac). */
  scheme: 'oriel',
  /** Who made the original. */
  original: 'Search by Office Commun',
} as const
