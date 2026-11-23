// The column's symbols, drawn to SF Symbols' boxes and weights (studio/02
// §7.1-7.2): a symbol of N points sits in a box about N × 1.1, its stroke
// N × 0.085 (regular), 0.10 (medium), 0.115 (semibold), 0.13 (bold).
// SF Symbols can't ship on Windows; these are drawn in their manner.

import type { JSX } from 'solid-js'

export type Weight = 'regular' | 'medium' | 'semibold' | 'bold'
const stroke: Record<Weight, number> = { regular: 0.085, medium: 0.1, semibold: 0.115, bold: 0.13 }

export interface GlyphProps { pt: number; weight?: Weight; class?: string; style?: JSX.CSSProperties }

/** d: drawn in a 16 × 16 box. `fill`: solid shapes, no stroke. */
function glyph(d: () => JSX.Element, fill = false) {
  return (p: GlyphProps) => {
    const box = () => +(p.pt * 1.1).toFixed(2)
    const sw = () => +((p.pt * stroke[p.weight ?? 'regular'] * 16) / box()).toFixed(3)
    return (
      <svg class={p.class} style={p.style} width={box()} height={box()} viewBox="0 0 16 16" aria-hidden="true"
        fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width={sw()}
        stroke-linecap="round" stroke-linejoin="round">{d()}</svg>
    )
  }
}

export const G = {
  chevronLeft: glyph(() => <path d="M10.2 2.6 4.8 8l5.4 5.4" />),
  chevronRight: glyph(() => <path d="M5.8 2.6 11.2 8l-5.4 5.4" />),
  chevronDown: glyph(() => <path d="M2.6 5.6 8 11l5.4-5.4" />),
  reload: glyph(() => <><path d="M13.2 8.4A5.2 5.2 0 1 1 11.5 4" /><path d="M12.2 1.6v3.1H9.1" /></>),
  xmark: glyph(() => <path d="m3.2 3.2 9.6 9.6m0-9.6-9.6 9.6" />),
  minus: glyph(() => <path d="M2.6 8h10.8" />),
  plus: glyph(() => <path d="M8 2.2v11.6M2.2 8h11.6" />),
  arrowDown: glyph(() => <><path d="M8 2v12" /><path d="m3 9 5 5 5-5" /></>),
  checkmark: glyph(() => <path d="m2.6 8.6 3.4 3.6 7.4-8.6" />),
  speaker: glyph(() => <><path d="M1.6 5.6h2.6L7.8 2.6v10.8L4.2 10.4H1.6z" /><path d="M10 5.4a3.2 3.2 0 0 1 0 5.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M12 3.4a6 6 0 0 1 0 9.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></>, true),
  speakerSlash: glyph(() => <><path d="M1.6 5.6h2.6L7.8 2.6v10.8L4.2 10.4H1.6z" /><path d="m10 5.6 4.6 4.8m0-4.8L10 10.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></>, true),
  folder: glyph(() => <path d="M1.8 4.4c0-.8.6-1.4 1.4-1.4h3l1.6 1.6h5c.8 0 1.4.6 1.4 1.4v6.2c0 .8-.6 1.4-1.4 1.4H3.2c-.8 0-1.4-.6-1.4-1.4z" />),
  folderFill: glyph(() => <path d="M1.4 4.4c0-1 .8-1.8 1.8-1.8h3.1l1.6 1.6h4.9c1 0 1.8.8 1.8 1.8v6.2c0 1-.8 1.8-1.8 1.8H3.2c-1 0-1.8-.8-1.8-1.8z" />, true),
  radio: glyph(() => <><circle cx="8" cy="9.4" r="1.3" /><path d="M5.2 6.6a4 4 0 0 0 0 5.6M10.8 6.6a4 4 0 0 1 0 5.6M3 4.4a7 7 0 0 0 0 10M13 4.4a7 7 0 0 1 0 10" /></>),
  eyeSlash: glyph(() => <><path d="M2 8s2.2-4.4 6-4.4S14 8 14 8s-2.2 4.4-6 4.4S2 8 2 8z" /><circle cx="8" cy="8" r="1.9" /><path d="m2.6 2.6 10.8 10.8" /></>),
  record: glyph(() => <><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="2.6" fill="currentColor" /></>),
  flask: glyph(() => <><path d="M6 1.8h4M6.6 1.8v4.4L2.6 13a1 1 0 0 0 .9 1.4h9a1 1 0 0 0 .9-1.4L9.4 6.2V1.8" /><path d="M4.4 10h7.2" /></>),
  magnifyPlus: glyph(() => <><circle cx="7" cy="7" r="4.8" /><path d="m10.6 10.6 3.6 3.6M7 4.8v4.4M4.8 7h4.4" /></>),
  sidebarLeft: glyph(() => <><rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.4" /><path d="M6 2.6v10.8" /></>),
  sidebarRight: glyph(() => <><rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.4" /><path d="M10 2.6v10.8" /></>),
  // the spaces' icons (Spaces.icons)
  briefcase: glyph(() => <><rect x="1.6" y="4.6" width="12.8" height="9" rx="1.8" /><path d="M5.6 4.6V3.4c0-.7.5-1.2 1.2-1.2h2.4c.7 0 1.2.5 1.2 1.2v1.2M1.6 8.6h12.8" /></>),
  'building.2': glyph(() => <><path d="M2.2 14V4.2c0-.6.4-1 1-1h4.6c.6 0 1 .4 1 1V14M8.8 7.4h4c.6 0 1 .4 1 1V14M1.4 14h13.2" /><path d="M4.6 5.8h1.8M4.6 8.4h1.8M4.6 11h1.8M10.8 10h.4M10.8 12h.4" /></>),
  desktopcomputer: glyph(() => <><rect x="1.6" y="2.4" width="12.8" height="8.6" rx="1.4" /><path d="M6.4 11v2.6M9.6 11v2.6M4.8 13.8h6.4" /></>),
  laptopcomputer: glyph(() => <><rect x="3" y="3" width="10" height="7.4" rx="1.2" /><path d="M1.2 12.6h13.6" /></>),
  'chevron.left.forwardslash.chevron.right': glyph(() => <path d="M4.6 4.4 1.4 8l3.2 3.6M11.4 4.4 14.6 8l-3.2 3.6M9.4 2.8 6.6 13.2" />),
  terminal: glyph(() => <><rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.8" /><path d="m4.4 6.2 2 1.8-2 1.8M7.8 10.2h3.4" /></>),
  sparkles: glyph(() => <><path d="M6.4 2.2 7.6 5.6l3.4 1.2-3.4 1.2-1.2 3.4-1.2-3.4L1.8 6.8l3.4-1.2z" /><path d="M12.2 9.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" /></>),
  'brain.head.profile': glyph(() => <><path d="M10.6 14.2v-2.4h1.6c.6 0 1-.4 1-1V9l1.2-.6-1.2-2.2A5.6 5.6 0 0 0 7.8 2 5.2 5.2 0 0 0 4.6 11.2v3" /><path d="M7.4 5.2c-1 0-1.8.7-1.8 1.6M9.4 8.2c0 1-.8 1.6-1.8 1.6" /></>),
  lightbulb: glyph(() => <><path d="M5.6 12.4h4.8M6.2 14.4h3.6M5.6 10.6c0-1.2-2.2-2.2-2.2-4.6a4.6 4.6 0 0 1 9.2 0c0 2.4-2.2 3.4-2.2 4.6" /></>),
  gamecontroller: glyph(() => <><path d="M4.6 4.4h6.8a3.4 3.4 0 0 1 3.2 2.4l.8 3.4a1.8 1.8 0 0 1-3 1.6L10.8 10H5.2l-1.6 1.8a1.8 1.8 0 0 1-3-1.6l.8-3.4a3.4 3.4 0 0 1 3.2-2.4z" /><path d="M4.8 6.4v2.2M3.7 7.5h2.2M10.8 7.2h.2M12 8.4h.2" /></>),
  'beach.umbrella': glyph(() => <><path d="M2 8.4a6.4 6.4 0 0 1 12 0z" /><path d="M8 8.4 10.4 14M1.6 14.2h12.8" /></>),
  'cup.and.saucer': glyph(() => <><path d="M2.6 4.4h8.2v4.4a3.4 3.4 0 0 1-3.4 3.4H6a3.4 3.4 0 0 1-3.4-3.4z" /><path d="M10.8 5.4h1.2a1.8 1.8 0 0 1 0 3.6h-1.4M1.6 14h11.2" /></>),
  'music.note': glyph(() => <><circle cx="5" cy="12" r="2.2" /><path d="M7.2 12V2.2l5.2 1.6v2.6L7.2 4.8" /></>),
  film: glyph(() => <><rect x="2.2" y="1.8" width="11.6" height="12.4" rx="1.4" /><path d="M5 1.8v12.4M11 1.8v12.4M2.2 5.2H5M2.2 8H5M2.2 10.8H5M11 5.2h2.8M11 8h2.8M11 10.8h2.8" /></>),
  paintpalette: glyph(() => <><path d="M8 1.8a6.2 6.2 0 0 0 0 12.4c1 0 1.6-.6 1.6-1.4 0-.4-.2-.8-.4-1.1a1.3 1.3 0 0 1 1-2.1h1.6a2.4 2.4 0 0 0 2.4-2.4C14.2 4.2 11.4 1.8 8 1.8z" /><circle cx="5.2" cy="7" r=".6" fill="currentColor" /><circle cx="7.4" cy="4.6" r=".6" fill="currentColor" /><circle cx="10.4" cy="5.2" r=".6" fill="currentColor" /></>),
  camera: glyph(() => <><path d="M1.6 5.4c0-.8.6-1.4 1.4-1.4h1.8l1.2-1.6h4l1.2 1.6H13c.8 0 1.4.6 1.4 1.4v6.8c0 .8-.6 1.4-1.4 1.4H3c-.8 0-1.4-.6-1.4-1.4z" /><circle cx="8" cy="8.6" r="2.6" /></>),
  house: glyph(() => <><path d="M2 7.2 8 2l6 5.2" /><path d="M3.4 6v7c0 .5.4.9.9.9h7.4c.5 0 .9-.4.9-.9V6" /><path d="M6.4 13.9V10h3.2v3.9" /></>),
  book: glyph(() => <><path d="M8 4.2C6.6 3 4.4 2.6 1.8 2.8v9.8c2.6-.2 4.8.2 6.2 1.4 1.4-1.2 3.6-1.6 6.2-1.4V2.8C11.6 2.6 9.4 3 8 4.2z" /><path d="M8 4.2V14" /></>),
  graduationcap: glyph(() => <><path d="M8 2.6 1.2 6 8 9.4 14.8 6z" /><path d="M4 7.4v3.4c0 1 1.8 2.2 4 2.2s4-1.2 4-2.2V7.4M14.8 6v4" /></>),
  cart: glyph(() => <><path d="M1.2 2h2l1.6 8.4h8l1.6-6H4" /><circle cx="5.6" cy="13" r="1" /><circle cx="11.8" cy="13" r="1" /></>),
  airplane: glyph(() => <path d="M7.2 9.2 3.8 13l-1.4-.4 1.6-4.6-2.6-.2-1-1.6 1.2-.4 2.6.8L7.6 4.2 5.2 1.6l1.2-.4 4.4 2.4 2.4-2.2c.6-.6 1.6-.6 2 0 .4.4.4 1.4-.2 2L12.6 6l2.4 4.4-.4 1.2-2.6-2.4-3 3 .8 2.6-.4 1.2-1.6-1-.2-2.6" />),
  dumbbell: glyph(() => <><path d="M5.4 8h5.2" /><rect x="2.8" y="4.4" width="2.6" height="7.2" rx="1" /><rect x="10.6" y="4.4" width="2.6" height="7.2" rx="1" /><path d="M1.2 6.4v3.2M14.8 6.4v3.2" /></>),
  leaf: glyph(() => <><path d="M3 13c0-6 3.6-10 11-10.4C13.6 10 9.6 13.4 3.6 13" /><path d="M3 13c2.2-3 4.6-5.4 7.6-7" /></>),
  heart: glyph(() => <path d="M8 13.6S1.8 10 1.8 5.8A3.2 3.2 0 0 1 8 4.4a3.2 3.2 0 0 1 6.2 1.4C14.2 10 8 13.6 8 13.6z" />),
}

export type GlyphName = keyof typeof G

export function Glyph(p: GlyphProps & { name: string }) {
  const C = (G as Record<string, (q: GlyphProps) => JSX.Element>)[p.name] ?? G.briefcase
  return <C pt={p.pt} weight={p.weight} class={p.class} style={p.style} />
}

/** The ring of a page on its way (TabBar.swift:2417-2490): 10 points, a stroke
 * of 1.4, 78% of the circle, once round every 0.85 s. */
export function Ring(p: { size?: number }) {
  const s = () => p.size ?? 10
  const r = () => (s() - 1.4) / 2
  const c = () => 2 * Math.PI * r()
  return (
    <svg class="ring" width={s()} height={s()} viewBox={`0 0 ${s()} ${s()}`} aria-hidden="true">
      <circle cx={s() / 2} cy={s() / 2} r={r()} fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"
        stroke-dasharray={`${(c() * 0.78).toFixed(2)} ${c().toFixed(2)}`} />
    </svg>
  )
}
