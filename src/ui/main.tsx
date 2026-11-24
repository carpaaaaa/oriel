import { render } from 'solid-js/web'
import '@fontsource-variable/plus-jakarta-sans'
import '../shared/tokens.css'
import './app.css'
import { connect } from './lib/store'

// Every module's register.ts(x): layers, outlets, keys.
import.meta.glob('./*/register.{ts,tsx}', { eager: true })
import { ChromeRoot } from './chrome/Chrome'
import { OverlayRoot } from './overlay/Overlay'

document.documentElement.dataset.root = window.search.root
connect()
render(() => (window.search.root === 'overlay' ? <OverlayRoot /> : <ChromeRoot />), document.getElementById('root')!)
