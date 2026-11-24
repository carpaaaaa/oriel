// Runs in every page, isolated from it (sandboxed preload). Each module's
// part is a file in preload/page/; this only brings them together. The
// preload runs in a page's frames too (nodeIntegrationInSubFrames, for
// blocking and privacy): there only page/frame.ts, every other part stays
// the main frame's.
// Owned by the orchestrator.

if (window.top === window) {
  require('./page/compat')
  require('./page/keys')
  require('./page/fill')
  require('./page/internal')
  require('./page/tabs')
  require('./page/pages')
  require('./page/translate')
} else {
  require('./page/frame')
}
