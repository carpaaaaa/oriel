// The pages module's places in the interface: the peek's dimming and knobs,
// and Edit Site Style…, both panels over the page. Owned by the pages module.

import { registerPanel } from '../lib/registry'
import { PeekLayer } from './Peek'
import { SiteStylePanel } from './SiteStyle'
import './pagetools.css'

registerPanel('pages.peek', PeekLayer)
registerPanel('pages.style', SiteStylePanel)
