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

/** Window buttons (chrome/Buttons.tsx): the window's top right corner in small,
 * the column's doors on the left for the line they share, the pointer on
 * close. Inline: doors in the band's middle, close a soft red; Classic:
 * Windows' places in the corner, close in full red. */
export function ButtonsPicture(p: { style: 'inline' | 'classic' }) {
  const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const
  const glyph = (name: 'min' | 'max' | 'close', size: number) => (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'block' }}>
      {name === 'min' ? <path d="M1 5h8" {...stroke} /> : name === 'max' ? <rect x="1.2" y="1.2" width="7.6" height="7.6" rx="2" {...stroke} /> : <path d="m1.5 1.5 7 7m0-7-7 7" {...stroke} />}
    </svg>
  )
  const door = (child: unknown, bg = 'transparent', color = 'var(--muted)') => (
    <span style={{ width: '11px', height: '11px', 'border-radius': '3.5px', display: 'grid', 'place-items': 'center', background: bg, color }}>{child as never}</span>
  )
  return (
    <span class="mini" style={{ position: 'relative', padding: '0', display: 'block', background: 'var(--frame, var(--wash))' }}>
      <span style={{ position: 'absolute', left: '5px', top: '6px', display: 'flex', gap: '2px', opacity: '.8' }}>
        {(['M6.5 2 3.5 5l3 3', 'M3.5 2l3 3-3 3', 'M8 5.4A3 3 0 1 1 6.8 2.6'] as const).map((d, i) => door(
          <svg width="6" height="6" viewBox="0 0 10 10" style={{ display: 'block', opacity: i === 1 ? '.35' : '1' }}><path d={d} {...stroke} /></svg>))}
      </span>
      {p.style === 'inline' ? (
        <span style={{ position: 'absolute', right: '4px', top: '6px', display: 'flex', gap: '2px' }}>
          {door(glyph('min', 6))}{door(glyph('max', 6))}{door(glyph('close', 6), 'rgba(196, 43, 28, .14)', '#C42B1C')}
        </span>
      ) : (
        <span style={{ position: 'absolute', right: '0', top: '0', display: 'flex' }}>
          {(['min', 'max', 'close'] as const).map(n => (
            <span style={{ width: '13px', height: '18px', display: 'grid', 'place-items': 'center', color: n === 'close' ? '#fff' : 'var(--muted)', position: 'relative' }}>
              {n === 'close' ? <i style={{ position: 'absolute', inset: '2px', 'border-radius': '3px 5px 3px 3px', background: '#C42B1C', display: 'block' }} /> : null}
              <span style={{ position: 'relative' }}>{glyph(n, 5)}</span>
            </span>
          ))}
        </span>
      )}
      <span style={{ position: 'absolute', left: '22px', right: '3px', top: p.style === 'inline' ? '23px' : '18px', bottom: '-4px', 'border-radius': '4px', background: 'var(--ground)', 'box-shadow': '0 .5px 3px rgba(0,0,0,.12)' }} />
    </span>
  )
}
