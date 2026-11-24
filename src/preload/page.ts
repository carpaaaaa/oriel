// Runs in every page, isolated from it (sandboxed preload). Each module's
// part is a file in preload/page/; this only brings them together.
// Owned by the orchestrator.

import './page/compat'
import './page/keys'
import './page/fill'
import './page/internal'
import './page/tabs'
import './page/pages'
import './page/translate'
