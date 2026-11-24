// The SF Symbols Settings uses, drawn again (SF Symbols can't ship on
// Windows, studio/02 §0 and §7): one 16-unit box, round strokes in the text's
// colour, the weight from the size as §7.1 says. A name not drawn here takes
// the nearest one drawn (by its first word), then a plain rounded square.

import type { JSX } from 'solid-js'

const gear = (() => {
  const teeth = 8, r1 = 6.4, r2 = 4.9, c = 8
  let d = ''
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i * Math.PI) / teeth - Math.PI / (teeth * 2.6)
    const a1 = (i * Math.PI) / teeth + Math.PI / (teeth * 2.6)
    const r = i % 2 === 0 ? r1 : r2
    const p0 = `${(c + r * Math.cos(a0)).toFixed(2)} ${(c + r * Math.sin(a0)).toFixed(2)}`
    const p1 = `${(c + r * Math.cos(a1)).toFixed(2)} ${(c + r * Math.sin(a1)).toFixed(2)}`
    d += `${i ? 'L' : 'M'}${p0}L${p1}`
  }
  return d + 'Z'
})()

/** Path data per symbol; "F:" before a path fills it instead of stroking. */
const paths: Record<string, string[]> = {
  'gearshape': [gear, 'M8 6.1a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8'],
  'paintbrush': ['M13.6 2.4 7.4 8.6', 'M7.4 8.6c-.9-.9-2.4-.6-2.9.6-.4 1-.3 2.2-1.6 3.2 2.3.6 4.4-.1 4.9-1.4.3-.8.2-1.8-.4-2.4'],
  'photo.artframe': ['M2.5 3.5h11v9h-11z', 'M4.5 10.5l2.4-2.6 1.6 1.6 1.4-1.4 1.6 2.4z', 'M10.3 5.8a.7.7 0 1 0 0 .1'],
  'square.on.square': ['M5.5 5.5h8v8h-8z', 'M3 10.5h-.5v-8h8V3'],
  'globe': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M2.6 8h10.8', 'M8 2.4c1.6 1.6 2.4 3.5 2.4 5.6S9.6 12 8 13.6C6.4 12 5.6 10.1 5.6 8S6.4 4 8 2.4'],
  'square.stack': ['M3.5 6.5h9v7h-9z', 'M4.5 4.5h7', 'M5.5 2.5h5'],
  'key': ['M5.5 7.5a2.6 2.6 0 1 0 0 .1', 'M8 8h5.5v2', 'M11.5 8v1.6'],
  'hand.raised': ['M5 8.5V4a.9.9 0 0 1 1.8 0v3.5V2.9a.9.9 0 0 1 1.8 0v4.6V3.5a.9.9 0 0 1 1.8 0v4.5-2.5a.9.9 0 0 1 1.8 0V10c0 2.2-1.6 3.8-3.8 3.8H8c-1.2 0-2.2-.6-2.8-1.6L3.4 9.3a.9.9 0 0 1 1.5-1z'],
  'puzzlepiece.extension': ['M6 2.8a1.4 1.4 0 0 1 2.8 0v1h2.6v2.6h1a1.4 1.4 0 0 1 0 2.8h-1v3.2H8.6v-1a1.4 1.4 0 0 0-2.8 0v1H2.6V9.2h1a1.4 1.4 0 0 0 0-2.8h-1V3.8H6z'],
  'keyboard': ['M1.8 4.5h12.4v7H1.8z', 'M4 6.6h.1M6 6.6h.1M8 6.6h.1M10 6.6h.1M12 6.6h.1M4 8.6h.1M12 8.6h.1', 'M6 9.4h4'],
  'info.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M8 7.4v3.6', 'M8 5.2h.01'],
  'info.circle.fill': ['F:M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m-.7 5.2h1.4V11H7.3zm.7-2.9a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7'],
  'magnifyingglass': ['M7 2.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4', 'm10.2 10.2 3.3 3.3'],
  'xmark.circle.fill': ['F:M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2m2.2 3 .8.8L8.8 8l2.2 2.2-.8.8L8 8.8 5.8 11l-.8-.8L7.2 8 5 5.8l.8-.8L8 7.2z'],
  'xmark.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'm6 6 4 4m0-4-4 4'],
  'xmark': ['m4.5 4.5 7 7m0-7-7 7'],
  'checkmark': ['m3.5 8.4 3 3 6-6.8'],
  'checkmark.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'm5.4 8.2 1.8 1.8 3.4-3.8'],
  'arrow.right': ['M3 8h10', 'm9 4 4 4-4 4'],
  'chevron.right': ['m6 3.5 4.5 4.5L6 12.5'],
  'chevron.down': ['m3.5 6 4.5 4.5L12.5 6'],
  'minus': ['M3.5 8h9'],
  'plus': ['M8 3.5v9M3.5 8h9'],
  'link': ['M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.9.9', 'M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.9-.9'],
  'envelope': ['M2.2 4h11.6v8H2.2z', 'm2.4 4.3 5.6 4.4 5.6-4.4'],
  'envelope.open': ['M2.2 6.5 8 3l5.8 3.5V13H2.2z', 'm2.4 6.8 5.6 3.6 5.6-3.6'],
  'folder': ['M2.2 4.2h4l1.4 1.4h6.2v6.8H2.2z'],
  'arrow.down.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M8 5v5.6', 'm5.6 8.4 2.4 2.4 2.4-2.4'],
  'arrow.down': ['M8 3v9.5', 'm4 8.5 4 4 4-4'],
  'arrow.down.to.line': ['M8 2.5v7.5', 'm4.5 6.5 3.5 3.5 3.5-3.5', 'M3.5 13h9'],
  'clock': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M8 4.8V8l2.2 1.4'],
  'trash': ['M3 4.5h10', 'M6.2 4.5V3h3.6v1.5', 'M4.3 4.5l.7 9h6l.7-9'],
  'shield': ['M8 2.2 3.2 4v3.8c0 3 2.1 5 4.8 6 2.7-1 4.8-3 4.8-6V4z'],
  'checkmark.shield': ['M8 2.2 3.2 4v3.8c0 3 2.1 5 4.8 6 2.7-1 4.8-3 4.8-6V4z', 'm5.8 8 1.6 1.6 2.8-3.2'],
  'moon': ['M13 9.6A5.2 5.2 0 0 1 6.4 3a5.2 5.2 0 1 0 6.6 6.6'],
  'moon.stars': ['M11.6 10.2A4.6 4.6 0 0 1 5.8 4.4a4.6 4.6 0 1 0 5.8 5.8', 'M11.6 2.6v2.4M10.4 3.8h2.4'],
  'moon.zzz': ['M11.6 10.2A4.6 4.6 0 0 1 5.8 4.4a4.6 4.6 0 1 0 5.8 5.8', 'M10 2.6h2.6L10 5.4h2.6'],
  'sun.max': ['M8 5.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2', 'M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1'],
  'lock': ['M3.8 7.2h8.4v6.3H3.8z', 'M5.6 7.2V5.4a2.4 2.4 0 0 1 4.8 0v1.8'],
  'pin': ['M6 2.5h4', 'M6.6 2.5 6 7.2 4.2 9h7.6L10 7.2 9.4 2.5', 'M8 9v4.5'],
  'pin.slash': ['M6 2.5h4', 'M6.6 2.5 6 7.2 4.2 9h7.6L10 7.2 9.4 2.5', 'M8 9v4.5', 'm2.5 2.5 11 11'],
  'bell': ['M4.2 11V7.4a3.8 3.8 0 0 1 7.6 0V11l1.2 1.2H3z', 'M6.6 13.6a1.5 1.5 0 0 0 2.8 0'],
  'eye': ['M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8 11.9 12.2 8 12.2 1.8 8 1.8 8', 'M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6'],
  'eye.slash': ['M1.8 8s2.3-4.2 6.2-4.2S14.2 8 14.2 8 11.9 12.2 8 12.2 1.8 8 1.8 8', 'm2.6 2.6 10.8 10.8'],
  'bolt': ['M9 1.8 3.6 9h4l-.6 5.2L12.4 7h-4z'],
  'leaf': ['M3 13c0-6 3.6-9.6 10-10 .2 6.4-3.4 10-9 10', 'M3 13c2-3 4-5 7-7'],
  'wind': ['M2 6h8.2a1.8 1.8 0 1 0-1.8-1.8', 'M2 9h10.4a1.8 1.8 0 1 1-1.8 1.8', 'M2 12h4'],
  'timer': ['M8 3.6a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M8 6v2.6', 'M6.4 1.8h3.2'],
  'hourglass': ['M4 2.2h8M4 13.8h8', 'M5 2.2c0 3 3 3.6 3 5.8s-3 2.8-3 5.8M11 2.2c0 3-3 3.6-3 5.8s3 2.8 3 5.8'],
  'command': ['M6 6V4.3A1.7 1.7 0 1 0 4.3 6H11.7A1.7 1.7 0 1 0 10 4.3V11.7A1.7 1.7 0 1 0 11.7 10H4.3A1.7 1.7 0 1 0 6 11.7z'],
  'number': ['M6.2 2.5 5 13.5M11 2.5l-1.2 11M3 6h10.5M2.5 10h10.5'],
  'terminal': ['M2 3.2h12v9.6H2z', 'm4.6 6.4 2 1.6-2 1.6', 'M8 10.2h3'],
  'hammer': ['M9.4 5.4 3 11.8a1.1 1.1 0 0 0 1.6 1.6l6.4-6.4', 'M7.2 3.6 9.6 2l3.6 3.6-1.6 1.6z'],
  'power': ['M8 2.2v5.4', 'M5 4.2a5 5 0 1 0 6 0'],
  'bookmark': ['M4.5 2.2h7v11.6L8 11.2l-3.5 2.6z'],
  'macwindow': ['M2 3h12v10H2z', 'M2 5.8h12'],
  'macwindow.on.rectangle': ['M4.5 2.5h9v7.5h-9z', 'M4.5 4.6h9', 'M2.5 6v7.5h9'],
  'sidebar.left': ['M2.5 3h11v10h-11z', 'M6.3 3v10'],
  'sidebar.right': ['M2.5 3h11v10h-11z', 'M9.7 3v10'],
  'rectangle.split.2x1': ['M2 3h12v10H2z', 'M8 3v10'],
  'play.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M6.6 5.6v4.8L10.4 8z'],
  'play.rectangle': ['M2 3.5h12v9H2z', 'M6.8 6v4L10 8z'],
  'play.slash': ['M5 3.5v9l7-4.5z', 'm2.5 2.5 11 11'],
  'pip': ['M2 3h12v10H2z', 'M8.4 8.2h4v3.2h-4z'],
  'pip.exit': ['M2 3h12v10H2z', 'M8.4 8.2h4v3.2h-4z', 'M4.5 5.5 7 8'],
  'drop': ['M8 2.2S3.8 7 3.8 9.6a4.2 4.2 0 0 0 8.4 0C12.2 7 8 2.2 8 2.2'],
  'drop.halffull': ['M8 2.2S3.8 7 3.8 9.6a4.2 4.2 0 0 0 8.4 0C12.2 7 8 2.2 8 2.2', 'F:M4 9.4h8a4 4 0 0 1-8 0'],
  'sparkles': ['M7 2.5c.5 2.6 1.6 3.7 4.2 4.2-2.6.5-3.7 1.6-4.2 4.2-.5-2.6-1.6-3.7-4.2-4.2C5.4 6.2 6.5 5.1 7 2.5', 'M12 10v3.4M10.3 11.7h3.4'],
  'textformat.size': ['m2.5 12.5 3-8 3 8M3.6 9.7h3.8', 'm9.3 12.5 2.1-5.4 2.1 5.4M10 10.8h2.8'],
  'textformat.size.larger': ['m1.8 12.5 3.6-9 3.6 9M3.1 9.4h4.6', 'm9.8 12.5 1.9-4.6 1.9 4.6M10.4 11h2.6'],
  'bold': ['M4.5 2.8h4a2.5 2.5 0 0 1 0 5h-4zM4.5 7.8h4.6a2.7 2.7 0 0 1 0 5.4H4.5z'],
  'person.2': ['M6 7.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4', 'M2 13c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8', 'M10.6 3a2 2 0 0 1 0 4', 'M11.8 9.4c1.3.4 2.2 1.8 2.2 3.6'],
  'network': ['M8 2.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2M3.4 10.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2M12.6 10.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2', 'M8 5.4v2.6M3.4 10.6V8.8h9.2v1.8'],
  'speedometer': ['M2.6 11a5.6 5.6 0 1 1 10.8 0', 'M8 10.2 10.4 6'],
  'paintpalette': ['M8 2.2a5.8 5.8 0 0 0 0 11.6c1 0 1.4-.7 1-1.6-.4-1 .2-1.8 1.2-1.8H12a1.8 1.8 0 0 0 1.8-1.8C13.8 4.8 11.2 2.2 8 2.2', 'M5 7.2h.01M7.2 5h.01M10 5.4h.01'],
  'wand.and.stars': ['M2.5 13.5l7-7', 'M8.5 5.5l2 2', 'M11 1.8v2.4M9.8 3h2.4M13.4 5.6v1.8M12.5 6.5h1.8'],
  'escape': ['M3 3h5', 'M3 3v5', 'M3 3l6.6 6.6', 'M13 7.5V13H7.5'],
  'shift': ['M8 2.5 2.8 8.2h2.8v5h4.8v-5h2.8z'],
  'computermouse': ['M8 1.8a4 4 0 0 0-4 4v4.4a4 4 0 0 0 8 0V5.8a4 4 0 0 0-4-4', 'M8 3.8v2.4'],
  'hand.draw': ['M5 8.5V4a.9.9 0 0 1 1.8 0v3.5V2.9a.9.9 0 0 1 1.8 0v4.6V3.5a.9.9 0 0 1 1.8 0v4.5-2.5a.9.9 0 0 1 1.8 0V10c0 2.2-1.6 3.8-3.8 3.8H8c-1.2 0-2.2-.6-2.8-1.6L3.4 9.3a.9.9 0 0 1 1.5-1z'],
  'hand.point.up.left': ['M4 2.2 4.6 9l1.6-1.6 1.6 3.4 1.4-.6-1.6-3.4h2.2z'],
  'cursorarrow.rays': ['M7 7l2.2 6.8 1-2.8 2.8-1z', 'M5 2.2v1.6M2.2 5h1.6M2.9 2.9l1.1 1.1'],
  'camera.viewfinder': ['M2.2 5V3.2a1 1 0 0 1 1-1H5M11 2.2h1.8a1 1 0 0 1 1 1V5M13.8 11v1.8a1 1 0 0 1-1 1H11M5 13.8H3.2a1 1 0 0 1-1-1V11', 'M8 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4'],
  'doc': ['M4 2h5.2L12 4.8V14H4z', 'M9 2v3h3'],
  'doc.text': ['M4 2h5.2L12 4.8V14H4z', 'M9 2v3h3', 'M6 8h4M6 10.4h4'],
  'doc.plaintext': ['M4 2h8v12H4z', 'M6 5h4M6 7.4h4M6 9.8h4'],
  'doc.richtext': ['M4 2h8v12H4z', 'M6 5.2h4', 'M6 7.6l1.2 1.4 1.2-1 1.6 2H6z'],
  'doc.badge.ellipsis': ['M4 2h5.2L12 4.8V14H4z', 'M9 2v3h3', 'M6 10h.01M8 10h.01M10 10h.01'],
  'tray.and.arrow.down': ['M2 9.5h3l1 1.8h4l1-1.8h3V14H2z', 'M8 2v6', 'm5.6 5.8 2.4 2.4 2.4-2.4'],
  'square.and.arrow.down': ['M5 6H3.2v7.8h9.6V6H11', 'M8 2v7', 'm5.6 6.8 2.4 2.4 2.4-2.4'],
  'square.and.arrow.down.on.square': ['M5 6H3.2v7.8h9.6V6H11', 'M8 2v7', 'm5.6 6.8 2.4 2.4 2.4-2.4'],
  'plus.square': ['M2.5 2.5h11v11h-11z', 'M8 5v6M5 8h6'],
  'plus.rectangle.on.rectangle': ['M5 4.5h9v8H5z', 'M2.5 10V2.5h8', 'M9.5 6.6v3.8M7.6 8.5h3.8'],
  'plus.magnifyingglass': ['M7 2.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4', 'm10.2 10.2 3.3 3.3', 'M7 5v4M5 7h4'],
  'app': ['M3 3h10v10H3z'],
  'app.badge': ['M3 4h8.5v9H3z', 'F:M12.6 1.6a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6'],
  'square.grid.2x2': ['M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z'],
  'square.grid.4x3.fill': ['F:M2 3h2.4v2.4H2zM5.2 3h2.4v2.4H5.2zM8.4 3h2.4v2.4H8.4zM11.6 3H14v2.4h-2.4zM2 6.8h2.4v2.4H2zM5.2 6.8h2.4v2.4H5.2zM8.4 6.8h2.4v2.4H8.4zM11.6 6.8H14v2.4h-2.4zM2 10.6h2.4V13H2zM5.2 10.6h2.4V13H5.2zM8.4 10.6h2.4V13H8.4zM11.6 10.6H14V13h-2.4z'],
  'square.grid.3x1.below.line.grid.1x2': ['M2.2 3h3v3h-3zM6.5 3h3v3h-3zM10.8 3h3v3h-3z', 'M2 8.6h12', 'M2.2 10.6h5.4v2.6H2.2zM8.4 10.6h5.4v2.6H8.4z'],
  'list.bullet.rectangle': ['M2 3h12v10H2z', 'M4.6 6h.01M4.6 8h.01M4.6 10h.01M6.6 6h5M6.6 8h5M6.6 10h5'],
  'rectangle.stack': ['M2.5 6h11v7.5h-11z', 'M3.8 4h8.4', 'M5 2.2h6'],
  'rectangle.on.rectangle': ['M5 5h9v7.5H5z', 'M2 10.5V3h9'],
  'rectangle.3.group': ['M2 3h5.2v4.4H2zM8.8 3H14v4.4H8.8zM2 9h12v4H2z'],
  'square.stack.3d.up': ['M8 2.2 2.4 5.2 8 8.2l5.6-3z', 'm2.4 8 5.6 3 5.6-3', 'm2.4 10.8 5.6 3 5.6-3'],
  'character.cursor.ibeam': ['m1.8 12 2.4-7.6L6.6 12M2.6 9.6h3.2', 'M10.8 3v10M9.4 3h2.8M9.4 13h2.8'],
  'text.cursor': ['M8 2.5v11M6 2.5h4M6 13.5h4'],
  'textformat.abc.dottedunderline': ['m1.8 10 1.8-5.2L5.4 10M2.3 8.4h2.6', 'M7 4.6V10h1.6a1.4 1.4 0 0 0 0-2.8H7', 'M14 7.8a1.6 1.6 0 1 0 0 1.8', 'M2 12.6h.01M5 12.6h.01M8 12.6h.01M11 12.6h.01M14 12.6h.01'],
  'text.magnifyingglass': ['M2 4h7M2 7h4.5M2 10h3', 'M10.5 6.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8', 'm12.3 11.4 1.7 1.7'],
  'rectangle.and.text.magnifyingglass': ['M2 3h12v6.5', 'M2 3v9h5', 'M4 5.6h5M4 7.6h3', 'M11 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4', 'm12.5 12.5 1.5 1.5'],
  'circle.lefthalf.filled': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'F:M8 2.4v11.2a5.6 5.6 0 0 1 0-11.2'],
  'circle.righthalf.filled': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'F:M8 2.4v11.2a5.6 5.6 0 0 0 0-11.2'],
  'circle.dotted': ['M8 2.4h.01M10.8 3.2h.01M12.8 5.2h.01M13.6 8h.01M12.8 10.8h.01M10.8 12.8h.01M8 13.6h.01M5.2 12.8h.01M3.2 10.8h.01M2.4 8h.01M3.2 5.2h.01M5.2 3.2h.01'],
  'location': ['M13.6 2.4 2.4 7.2l4.8 1.6 1.6 4.8z'],
  'mic': ['M8 2a2 2 0 0 0-2 2v4a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2', 'M4.2 7.6a3.8 3.8 0 0 0 7.6 0', 'M8 11.4V14'],
  'video': ['M1.8 4.5h8.4v7H1.8z', 'm10.2 7 4-2.2v6.4l-4-2.2'],
  'person.crop.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M8 4.8a2 2 0 1 0 0 4 2 2 0 0 0 0-4', 'M4.4 12.2c.8-1.4 2-2.2 3.6-2.2s2.8.8 3.6 2.2'],
  'questionmark.folder': ['M2.2 4.2h4l1.4 1.4h6.2v6.8H2.2z', 'M7 8a1.1 1.1 0 1 1 1.6 1c-.4.2-.6.5-.6.9', 'M8 11.2h.01'],
  'slider.horizontal.below.rectangle': ['M2 2.5h12v7H2z', 'M2 12.5h12', 'M6 11v3'],
  'arrow.triangle.2.circlepath': ['M3 7a5 5 0 0 1 9-2.4', 'M12.4 2.4v2.6H9.8', 'M13 9a5 5 0 0 1-9 2.4', 'M3.6 13.6V11h2.6'],
  'clock.arrow.circlepath': ['M3 8a5 5 0 1 0 1.5-3.6', 'M2.6 2.6v2.6h2.6', 'M8 5.4V8l1.8 1.2'],
  'arrow.uturn.backward': ['M5.5 3.5 2.5 6.5l3 3', 'M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7'],
  'arrow.uturn.backward.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M6.6 5.6 5 7.2l1.6 1.6', 'M5 7.2h3.8a1.8 1.8 0 0 1 0 3.6H8'],
  'arrow.left.arrow.right': ['M2.5 5.5h11', 'm10.5 2.5 3 3-3 3', 'M13.5 10.5h-11', 'm5.5 7.5-3 3 3 3'],
  'arrow.left.and.right': ['M2 8h12', 'm4.5 5.5L2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5'],
  'arrow.right.to.line': ['M2 8h9', 'm8 4.5 3.5 3.5L8 11.5', 'M13.5 3v10'],
  'arrow.right.to.line.compact': ['M2.5 8h7.5', 'm7.2 5.2 2.8 2.8-2.8 2.8', 'M12.5 4v8'],
  'arrow.right.square': ['M2.5 2.5h11v11h-11z', 'M5 8h6', 'm8.6 5.6 2.4 2.4-2.4 2.4'],
  'arrow.turn.down.right': ['M3.5 2.5v5a2.5 2.5 0 0 0 2.5 2.5h7.5', 'm10.5 7 3 3-3 3'],
  'arrow.up.and.down': ['M8 2.2v11.6', 'm5 5 3-3 3 3M5 11l3 3 3-3'],
  'arrow.up.and.down.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M8 4.8v6.4', 'm6.2 6.4 1.8-1.8 1.8 1.8M6.2 9.6 8 11.4l1.8-1.8'],
  'arrow.up.left.and.arrow.down.right': ['M3 3l4 4M3 3v3.5M3 3h3.5', 'M13 13 9 9M13 13V9.5M13 13H9.5'],
  'arrow.down.right.and.arrow.up.left': ['M7 7 3 3M7 7V3.5M7 7H3.5', 'M9 9l4 4M9 9v3.5M9 9h3.5'],
  'arrow.down.forward.square': ['M2.5 2.5h11v11h-11z', 'm5.5 5.5 5 5', 'M10.5 6.8v3.7H6.8'],
  'arrow.down.app': ['M3 3h10v10H3z', 'M8 5.2v5', 'm6 8.4 2 2 2-2'],
  'link.badge.plus': ['M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.9.9', 'M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.9-.9', 'M12.5 10.5v3.4M10.8 12.2h3.4'],
  'envelope.badge': ['M2.2 4h9.2v8H2.2z', 'm2.4 4.3 4.6 4.4 4.4-4', 'F:M13 2a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 13 2'],
  'globe.desk': ['M8 1.8a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2', 'M3.4 6.4h9.2', 'M8 11v2.6M5 13.8h6'],
  'power.circle': ['M8 4.4v3.4', 'M5.8 5.6a3.2 3.2 0 1 0 4.4 0'],
  'rectangle.inset.filled': ['M2 3h12v10H2z', 'F:M4 5h8v6H4z'],
  'rectangle.compress.vertical': ['M2 6.5h12v3H2z', 'M8 1.8v3M6.5 3.5 8 5l1.5-1.5M8 14.2v-3M6.5 12.5 8 11l1.5 1.5'],
  'rectangle.topthird.inset.filled': ['M2 3h12v10H2z', 'F:M3.6 4.6h8.8v2.6H3.6z'],
  'rectangle.leftthird.inset.filled': ['M2 3h12v10H2z', 'F:M3.6 4.6h2.4v6.8H3.6z'],
  'rectangle.lefthalf.inset.filled.arrow.left': ['M2 3h12v10H2z', 'F:M3.6 4.6h3.6v6.8H3.6z', 'M12 8H9.2m1.4-1.4L9.2 8l1.4 1.4'],
  'sidebar.squares.left': ['M2.5 3h11v10h-11z', 'M6.3 3v10', 'M3.8 5h1.2M3.8 7h1.2M3.8 9h1.2'],
  'square.on.square.intersection.dashed': ['M2.5 2.5h7v7h-7z', 'M6.5 6.5h7v7h-7z'],
  'text.line.first.and.arrowtriangle.forward': ['M5 4h9M2 8h12M2 12h12', 'F:M1.8 2.4 4.4 4l-2.6 1.6z'],
  'pin.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M6.6 5h2.8M7 5l-.4 2.8-1 1h4.8l-1-1L9 5M8 8.8v2.2'],
  'minus.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M5.4 8h5.2'],
  'pause.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M6.6 5.8v4.4M9.4 5.8v4.4'],
  'exclamationmark.circle': ['M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4', 'M8 5v3.6', 'M8 10.8h.01'],
  // Translation languages (translate module): the sign of a translated page.
  'translate': ['M1.8 3.6h6.6', 'M5.1 2v1.6', 'M3 5.4c.8 2.2 2.3 3.6 4.4 4.4', 'M7.2 3.6C6.7 6.4 5 8.6 2.2 9.9', 'M8.6 14.2 11.3 7.4l2.7 6.8', 'M9.5 12h3.6'],
  'hand.raised.slash': ['M5 8.5V4a.9.9 0 0 1 1.8 0v3.5V2.9a.9.9 0 0 1 1.8 0v4.6V3.5a.9.9 0 0 1 1.8 0v4.5-2.5a.9.9 0 0 1 1.8 0V10c0 2.2-1.6 3.8-3.8 3.8H8c-1.2 0-2.2-.6-2.8-1.6L3.4 9.3a.9.9 0 0 1 1.5-1z', 'm2 2 12 12'],
  'hand.raised.fingers.spread': ['M5 8.5V4a.9.9 0 0 1 1.8 0v3.5V2.9a.9.9 0 0 1 1.8 0v4.6V3.5a.9.9 0 0 1 1.8 0v4.5-2.5a.9.9 0 0 1 1.8 0V10c0 2.2-1.6 3.8-3.8 3.8H8c-1.2 0-2.2-.6-2.8-1.6L3.4 9.3a.9.9 0 0 1 1.5-1z'],
  'person.badge.key': ['M6 7.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4', 'M2 13c0-2.2 1.8-3.8 4-3.8 1 0 1.8.3 2.4.8', 'M11 9.6a1.4 1.4 0 1 0 0 .1M12.4 9.6H14.4v1.2'],
  'key.viewfinder': ['M2.2 5V3.2a1 1 0 0 1 1-1H5M11 2.2h1.8a1 1 0 0 1 1 1V5M13.8 11v1.8a1 1 0 0 1-1 1H11M5 13.8H3.2a1 1 0 0 1-1-1V11', 'M6.4 7.6a1.4 1.4 0 1 0 0 .1M7.8 7.8h3v1.4'],
  'questionmark.square.dashed': ['M2.5 2.5h2M7 2.5h2M11.5 2.5h2v2M13.5 7v2M13.5 11.5v2h-2M9 13.5H7M4.5 13.5h-2v-2M2.5 9V7M2.5 4.5v-2', 'M6.6 6.6a1.4 1.4 0 1 1 2 1.3c-.4.2-.6.5-.6.9', 'M8 10.6h.01'],
  'person.crop.rectangle': ['M2 3h12v10H2z', 'M8 5a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 8 5', 'M5 11.6c.6-1 1.6-1.6 3-1.6s2.4.6 3 1.6'],
  'internaldrive': ['M2 6.5h12v5H2z', 'M3.6 6.5 5 3.5h6l1.4 3', 'M11.2 9h.01'],
  'sunrise': ['M4.4 11a3.6 3.6 0 0 1 7.2 0', 'M2 13h12', 'M8 2v3M6.4 3.6 8 2l1.6 1.6M2.8 7.8l1.1 1M13.2 7.8l-1.1 1'],
  'arrow.triangle.branch': ['M5 2.5v11', 'M5 7.5c0-2 1.6-3 3.6-3H12', 'm10 2.5 2 2-2 2'],
  'scissors': ['M4.2 4.4a1.6 1.6 0 1 0 0 .1M4.2 11.6a1.6 1.6 0 1 0 0 .1', 'M5.6 5.2 13.4 12M5.6 10.8 13.4 4'],
  'shield.lefthalf.filled': ['M8 2.2 3.2 4v3.8c0 3 2.1 5 4.8 6 2.7-1 4.8-3 4.8-6V4z', 'F:M8 2.2V13.8C5.3 12.8 3.2 10.8 3.2 7.8V4z'],
  'rectangle.center.inset.filled': ['M2 3h12v10H2z', 'F:M5 5.5h6v5H5z'],
  'rectangle.and.pencil.and.ellipsis': ['M2 4h12v8H2z', 'M4.5 8h.01M7 8h.01M9.5 8h.01'],
  'chevron.right.square': ['M2.5 2.5h11v11h-11z', 'm7 5 3 3-3 3'],
  'bell.badge': ['M4.2 11V7.4a3.8 3.8 0 0 1 6-3.1', 'M11.8 8v3l1.2 1.2H3', 'M6.6 13.6a1.5 1.5 0 0 0 2.8 0', 'F:M12.6 2.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2'],
  'person.crop.circle.badge.xmark': ['M7 2.6a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M7 4.8a1.8 1.8 0 1 0 0 3.6A1.8 1.8 0 0 0 7 4.8', 'm11.6 10.6 2.6 2.6m0-2.6-2.6 2.6'],
}

const families: Record<string, string> = {
  rectangle: 'macwindow', square: 'app', arrow: 'arrow.right', circle: 'circle.dotted', doc: 'doc', hand: 'hand.raised', person: 'person.2',
  text: 'text.cursor', play: 'play.rectangle', pin: 'pin', eye: 'eye', moon: 'moon', clock: 'clock', envelope: 'envelope',
}

export function Symbol(p: { name: string; size?: number; weight?: 'regular' | 'medium' | 'semibold'; class?: string; style?: JSX.CSSProperties }) {
  const size = p.size ?? 12
  // §7.1: stroke ≈ size × 0.085 / 0.10 / 0.115 for regular, medium, semibold;
  // the box is size × 1.1, drawn here in 16 units.
  const box = Math.round(size * 1.15 * 10) / 10
  const k = p.weight === 'semibold' ? 0.115 : p.weight === 'regular' ? 0.085 : 0.1
  const stroke = Math.max(1, (size * k * 16) / box)
  const list = () => paths[p.name] ?? paths[families[p.name.split('.')[0]] ?? ''] ?? ['M3.5 3.5h9v9h-9z']
  return (
    <svg width={box} height={box} viewBox="0 0 16 16" class={p.class} style={p.style} aria-hidden="true" data-symbol={p.name}
      fill="none" stroke="currentColor" stroke-width={stroke.toFixed(2)} stroke-linecap="round" stroke-linejoin="round">
      {list().map(d => (d.startsWith('F:') ? <path d={d.slice(2)} fill="currentColor" stroke="none" /> : <path d={d} />))}
    </svg>
  )
}

export const drawn = (name: string) => name in paths
