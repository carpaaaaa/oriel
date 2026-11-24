// The small pictures of Appearance's choices: a window in miniature drawn in
// the look itself (Settings.swift:1390-1535, LayoutPicture, CardPicture,
// LookPicture). 76 × 50, in CSS boxes of the Mac's sizes.

const ink = (a: number) => `rgb(var(--ink-rgb) / ${a})`
const cap = (w: number, h: number, c: string) => <span class="mini-cap" style={{ width: `${w}px`, height: `${h}px`, background: c }} />

function Page() {
  return (
    <span class="mini-page">
      {cap(22, 3, ink(0.18))}{cap(30, 2.5, ink(0.1))}{cap(26, 2.5, ink(0.1))}
    </span>
  )
}

function Lights() {
  return <span class="mini-lights"><i /><i /><i /></span>
}

export function LayoutPicture(p: { layout: 'top' | 'left' | 'right' | 'icons' }) {
  const tab = ink(0.22), lit = ink(0.55)
  if (p.layout === 'top') {
    return (
      <span class="mini mini-top">
        <span class="mini-strip"><Lights />{cap(14, 4, lit)}{cap(14, 4, tab)}{cap(10, 4, tab)}</span>
        <Page />
      </span>
    )
  }
  if (p.layout === 'icons') {
    return (
      <span class="mini mini-row">
        <span class="mini-icons"><Lights /><i style={{ background: lit }} /><i style={{ background: tab }} /><i style={{ background: tab }} /></span>
        <Page />
      </span>
    )
  }
  const column = (
    <span class="mini-column">
      {p.layout === 'left' ? <Lights /> : <span style={{ height: '3px' }} />}
      {cap(16, 3.5, lit)}{cap(16, 3.5, tab)}{cap(12, 3.5, tab)}
    </span>
  )
  return <span class="mini mini-row">{p.layout === 'right' ? <><Page />{column}</> : <>{column}<Page /></>}</span>
}

export function CardPicture(p: { card: boolean }) {
  return (
    <span class="mini mini-row" classList={{ 'mini-card': p.card, 'mini-edge': !p.card }}>
      <span class="mini-column card-col">{cap(15, 3.5, ink(0.55))}{cap(15, 3.5, ink(0.22))}{cap(11, 3.5, ink(0.22))}</span>
      {p.card ? null : <span class="mini-hair" />}
      <span class="mini-sheet" />
    </span>
  )
}

/** Drawn in the look itself, not the one Oriel is in now; Auto is both halves. */
export function LookPicture(p: { look: 'light' | 'dark' | 'system' }) {
  const win = (dark: boolean) => {
    const ground = dark ? '#1C1C1C' : '#FFFFFF'
    const wash = dark ? '#2D2D2D' : '#EDEDED'
    const i = (a: number) => (dark ? `rgba(237,237,237,${a})` : `rgba(23,23,23,${a})`)
    return (
      <span class="mini mini-row" style={{ background: wash }}>
        <span class="mini-column" style={{ width: '16px', 'padding-top': '8px' }}>{cap(14, 3.5, i(0.55))}{cap(14, 3.5, i(0.2))}</span>
        <span class="mini-page" style={{ background: ground }}>{cap(20, 3, i(0.4))}{cap(28, 2.5, i(0.18))}</span>
      </span>
    )
  }
  if (p.look !== 'system') return win(p.look === 'dark')
  return (
    <span class="mini-auto">
      {win(false)}
      <span class="mini-auto-half">{win(true)}</span>
    </span>
  )
}
