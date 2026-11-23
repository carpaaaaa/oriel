import { render } from 'solid-js/web'
import '@fontsource-variable/inter'
import '../shared/tokens.css'
import './app.css'
import { connect } from './lib/store'
import { ChromeRoot } from './chrome/Chrome'
import { OverlayRoot } from './overlay/Overlay'

document.documentElement.dataset.root = window.search.root
connect()
render(() => (window.search.root === 'overlay' ? <OverlayRoot /> : <ChromeRoot />), document.getElementById('root')!)
