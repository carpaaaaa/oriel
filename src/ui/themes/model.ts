// What a home theme is, as the Mac keeps it (HomeTheme.swift:5-201; studio/02
// §2.8, §8.2): the theme's raw name in home.theme, the knobs as one line of
// JSON with sorted keys in home.tuning, the picture's path in
// home.theme.image, and home.shuffle. Off unless chosen.

export type HomeTheme =
  | 'off'
  | 'openRoad' | 'desertHighway' | 'coastalCliffs' | 'mountainLake' | 'riceTerraces'
  | 'northernLights' | 'saturnRise' | 'moonscape' | 'cityAtNight' | 'monsoonForest'
  | 'stickers' | 'solid' | 'gradient' | 'custom'

export type Family = 'off' | 'wall' | 'stickers' | 'solid' | 'gradient' | 'image'

export const families: [Family, string][] = [
  ['off', 'Off'], ['wall', 'Wall painting'], ['stickers', 'Stickers'],
  ['solid', 'Solid colour'], ['gradient', 'Gradient'], ['image', 'Image'],
]

/** What choosing a family alone puts on the wall. */
export const firstOf: Record<Family, HomeTheme> = {
  off: 'off', wall: 'openRoad', stickers: 'stickers', solid: 'solid', gradient: 'gradient', image: 'custom',
}

export const walls: HomeTheme[] = ['openRoad', 'desertHighway', 'coastalCliffs', 'mountainLake', 'riceTerraces',
  'northernLights', 'saturnRise', 'moonscape', 'cityAtNight', 'monsoonForest']

export const titles: Record<HomeTheme, string> = {
  off: 'Off', openRoad: 'Open Road', desertHighway: 'Desert Highway', coastalCliffs: 'Coastal Cliffs',
  mountainLake: 'Mountain Lake', riceTerraces: 'Rice Terraces', northernLights: 'Northern Lights',
  saturnRise: 'Saturn Rise', moonscape: 'Moonscape', cityAtNight: 'City at Night', monsoonForest: 'Monsoon Forest',
  stickers: 'Stickers', solid: 'Solid colour', gradient: 'Gradient', custom: 'Image',
}

export function familyOf(t: HomeTheme): Family {
  if (t === 'off') return 'off'
  if (t === 'stickers') return 'stickers'
  if (t === 'solid') return 'solid'
  if (t === 'gradient') return 'gradient'
  if (t === 'custom') return 'image'
  return 'wall'
}

/** Reads a stored name; anything else is Off. */
export function stored(name: unknown): HomeTheme {
  return typeof name === 'string' && name in titles ? (name as HomeTheme) : 'off'
}

export type StickerPack = 'space' | 'roadTrip' | 'ocean' | 'jungle' | 'streetFood' | 'retroTech' | 'weather' | 'music' | 'wonders' | 'search'
export const packs: [StickerPack, string][] = [
  ['space', 'Space'], ['roadTrip', 'Road Trip'], ['ocean', 'Ocean'], ['jungle', 'Jungle'], ['streetFood', 'Street Food'],
  ['retroTech', 'Retro Tech'], ['weather', 'Weather'], ['music', 'Music'], ['wonders', 'Wonders'], ['search', 'Search'],
]

export type GradientPreset = 'dusk' | 'sea' | 'peach' | 'mint' | 'mono'
export const gradients: { id: GradientPreset; title: string; a: string; b: string; angle: number }[] = [
  { id: 'dusk', title: 'Dusk', a: '#E9B8A0', b: '#8E86B8', angle: 150 },
  { id: 'sea', title: 'Sea', a: '#BFE0DC', b: '#5E8FA8', angle: 160 },
  { id: 'peach', title: 'Peach', a: '#FBE0C8', b: '#F0A58F', angle: 135 },
  { id: 'mint', title: 'Mint', a: '#DDF0DC', b: '#8FC7AA', angle: 140 },
  { id: 'mono', title: 'Mono', a: '#F1EFEB', b: '#B9B5AE', angle: 90 },
]

/** The solid swatches (ThemesPage.swift:170). */
export const swatches = ['#E8DFD0', '#F3D9CF', '#D9E4D3', '#D3DFEA', '#E4D8EC', '#2B2B2E']

export interface HomeTuning {
  intensity: number
  density: number
  scale: number
  pack: StickerPack
  solid: string
  gradientA: string
  gradientB: string
  angle: number
}

export const defaultTuning: HomeTuning = {
  intensity: 1, density: 0.5, scale: 0.5, pack: 'space',
  solid: '#E8DFD0', gradientA: '#E9B8A0', gradientB: '#8E86B8', angle: 150,
}

/** Tolerant, as HomeTuning(from:): a line with fewer or more knobs is read as
 * far as it goes, the rest is the default. Not JSON at all: the default. */
export function readTuning(text: unknown): HomeTuning {
  const t = { ...defaultTuning }
  let o: Record<string, unknown> = {}
  if (typeof text === 'string' && text) { try { o = JSON.parse(text) ?? {} } catch { o = {} } }
  else if (text && typeof text === 'object') o = text as Record<string, unknown>
  const num = (k: keyof HomeTuning) => { if (typeof o[k] === 'number' && Number.isFinite(o[k])) (t as unknown as Record<string, unknown>)[k] = o[k] }
  const str = (k: keyof HomeTuning) => { if (typeof o[k] === 'string') (t as unknown as Record<string, unknown>)[k] = o[k] }
  num('intensity'); num('density'); num('scale'); num('angle')
  str('solid'); str('gradientA'); str('gradientB')
  if (typeof o.pack === 'string' && packs.some(([p]) => p === o.pack)) t.pack = o.pack as StickerPack
  return t
}

/** The line kept in home.tuning: JSONEncoder with sorted keys. */
export function tuningText(t: HomeTuning): string {
  const keys = Object.keys(defaultTuning).sort() as (keyof HomeTuning)[]
  return JSON.stringify(Object.fromEntries(keys.map(k => [k, t[k]])))
}

export const sameTuning = (a: HomeTuning, b: HomeTuning) => tuningText(a) === tuningText(b)

export type RGB = [number, number, number]

/** "#RRGGBB"; anything else is a mid grey rather than a crash. */
export function channels(hex: string): RGB {
  const d = hex.startsWith('#') ? hex.slice(1) : hex
  if (d.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(d)) return [0.53, 0.53, 0.53]
  const n = parseInt(d, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Color.hex: rounded channels, upper case. */
export function hexOf(c: RGB): string {
  return '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** What the prefs say, read once. */
export interface ThemePrefs { theme: HomeTheme; tuning: HomeTuning; image: string; shuffle: boolean }
export function themePrefs(p: Record<string, unknown>): ThemePrefs {
  return {
    theme: stored(p['home.theme']),
    tuning: readTuning(p['home.tuning']),
    image: typeof p['home.theme.image'] === 'string' ? (p['home.theme.image'] as string) : '',
    shuffle: !!p['home.shuffle'],
  }
}
