// The app icon: PNGs at every size from build/icon/icon.svg (drawn by
// Electron), then build/icon.ico (PNG entries, Windows Vista and later) and
// build/icon.png for electron-builder. node scripts/make-icon.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const electron = createRequire(import.meta.url)('electron')
execFileSync(electron, ['scripts/icon-render.cjs'], { stdio: 'inherit', env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } })
const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
const images = sizes.map(s => readFileSync(`build/icon/icon-${s}.png`))
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4)
const dir = Buffer.alloc(16 * sizes.length)
let offset = 6 + dir.length
sizes.forEach((s, i) => {
  const e = i * 16
  dir.writeUInt8(s >= 256 ? 0 : s, e); dir.writeUInt8(s >= 256 ? 0 : s, e + 1)
  dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3)
  dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6)
  dir.writeUInt32LE(images[i].length, e + 8); dir.writeUInt32LE(offset, e + 12)
  offset += images[i].length
})
writeFileSync('build/icon.ico', Buffer.concat([header, dir, ...images]))
copyFileSync('build/icon/icon-1024.png', 'build/icon.png')
console.log('build/icon.ico and build/icon.png')
