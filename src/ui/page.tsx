// Oriel's own pages in a tab (oriel://settings, oriel://history...): one
// bundle; the page to draw is the host of the address. Each module registers
// its pages with registerPage in its src/ui/<module>/register.tsx.
// Owned by the orchestrator.

import { render } from 'solid-js/web'
import { Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import '@fontsource-variable/plus-jakarta-sans'
import '../shared/tokens.css'
import './app.css'
import { pageFor } from './lib/registry'

import.meta.glob('./*/register.{ts,tsx}', { eager: true })

const name = location.protocol === 'oriel:' ? location.host : new URLSearchParams(location.search).get('page') ?? ''
document.documentElement.dataset.root = 'page'
const dark = matchMedia('(prefers-color-scheme: dark)')
const look = () => { document.documentElement.dataset.look = dark.matches ? 'dark' : 'light' }
look(); dark.addEventListener('change', look)

render(() => (
  <Show when={pageFor(name)} fallback={<p style={{ padding: '44px 22px' }}>This page doesn't exist.</p>}>
    {c => <Dynamic component={c()} />}
  </Show>
), document.getElementById('root')!)
