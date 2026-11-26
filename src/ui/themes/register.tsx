// The themes module's places: the wall behind the blank tab's field and the
// door to Settings over it (the window's interface), and Settings › Themes
// under the Home background row (oriel://settings). Owned by the themes module.

import { lazy } from 'solid-js'
import { registerOutlet, registerPage } from '../lib/registry'
import { BlankWall, SettingsDoor } from './Blank'
import { lastPlaced, render } from './paint'
import { readTuning, stored } from './model'
import './themes.css'

registerOutlet('blank.under', BlankWall)
registerOutlet('blank.over', SettingsDoor)
registerPage('settings.themes', lazy(() => import('./ThemesPage').then(m => ({ default: m.ThemesPage }))))

// For the bench: paint a theme apart, and where the last stickers went.
;(window as unknown as { __themes: unknown }).__themes = {
  placed: () => lastPlaced,
  png: async (theme: string, tuning: string, w: number, h: number, scale: number, dark: boolean) => {
    const c = new OffscreenCanvas(1, 1)
    render(c, stored(theme), readTuning(tuning), w, h, scale, dark)
    const blob = await c.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(s)
  },
}
