// The floating video's buttons: a page of its own, drawn over the video in
// the little window (src/main/pages/float.ts). No preload and no bridge: it
// speaks through its console and is told through window.set. Follows the
// window's light or dark look, as the interface's pages do (page.tsx).
// Owned by the pages module.

import { render } from 'solid-js/web'
import '@fontsource-variable/plus-jakarta-sans'
import '../shared/tokens.css'
import './pagetools/float.css'
import { FloatControls } from './pagetools/FloatControls'

document.documentElement.dataset.root = 'float'
const dark = matchMedia('(prefers-color-scheme: dark)')
const look = () => { document.documentElement.dataset.look = dark.matches ? 'dark' : 'light' }
look(); dark.addEventListener('change', look)

render(() => <FloatControls />, document.getElementById('root')!)
