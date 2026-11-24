// Run by scripts/make-icon.mjs under Electron: draws build/icon/icon.svg at
// every size Windows asks for and writes PNGs next to it.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const dir = path.resolve(__dirname, '../build/icon')
const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024]
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<body></body>')
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8')
  for (const size of sizes) {
    const data = await win.webContents.executeJavaScript(`new Promise(done => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = ${size}
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'
        g.drawImage(img, 0, 0, ${size}, ${size})
        done(c.toDataURL('image/png').split(',')[1])
      }
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
    })`)
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), Buffer.from(data, 'base64'))
  }
  app.quit()
})
