// Cieli e modello dell'icona. iconSVG è pura: la stessa funzione scrive i file e gira nella tavola.

// Alba: le macchie di make.py delle icone Alba (Charcal), stessa posizione, colore, sfocatura e forza.
export const SKIES = {
  alba: {
    nome: 'Alba', base: ['#FF7E6E', '#E2878E'], ink: '#FFFBF4', grain: 0.13,
    bare: ['#FF7466', '#DE7C9E', '#8E98D2'],
    blobs: [
      [520, 1095, 600, 130, 60, 0.95, '#E792AA'],
      [590, 950, 280, 110, 70, 0.95, '#D9D0E0'],
      [470, 800, 390, 235, 90, 1.0, '#8DA0D2'],
      [512, 720, 470, 300, 120, 0.9, '#BF87AC'],
      [-60, 640, 170, 420, 110, 0.85, '#E77B80'],
      [1010, 1010, 230, 230, 110, 0.9, '#F29CC2'],
      [390, 330, 460, 160, 110, 1.0, '#FF9670'],
      [930, 110, 300, 260, 120, 0.9, '#FF6F88'],
    ],
  },
  notte: {
    nome: 'Notte', base: ['#09122B', '#152652'], ink: '#FFFBF4', grain: 0.12,
    bare: ['#8FA8E8', '#4D69B4', '#2E4688'],
    blobs: [
      [300, 1000, 560, 210, 120, 0.9, '#2C4C95', -28],
      [620, 940, 300, 110, 90, 0.55, '#6A82C4', -28],
      [-40, 560, 180, 420, 110, 0.5, '#1F3A78'],
      [900, 60, 520, 300, 200, 0.6, '#050A1C', -30],
    ],
  },
  oliva: {
    nome: 'Oliva', base: ['#2B3019', '#525932'], ink: '#FFFBF4', grain: 0.13,
    bare: ['#B9B27A', '#7F8549', '#565D30'],
    blobs: [
      [260, 980, 580, 210, 120, 0.9, '#7D8050', -26],
      [640, 900, 280, 110, 90, 0.6, '#A9A36D', -26],
      [-60, 560, 180, 420, 110, 0.5, '#3C4325'],
      [900, 60, 520, 300, 200, 0.6, '#1C200E', -30],
    ],
  },
  brace: {
    nome: 'Brace', base: ['#110E0C', '#1B1613'], ink: '#FFFBF4', grain: 0.12,
    bare: ['#F58A47', '#D4572A', '#A0361A'],
    blobs: [
      [170, 1000, 540, 210, 130, 0.95, '#A6381A', -32],
      [110, 1030, 270, 110, 80, 0.85, '#E3672C', -32],
      [700, 720, 420, 260, 150, 0.35, '#3B2A21'],
      [920, 60, 480, 280, 200, 0.55, '#070605', -30],
    ],
  },
  bianco: {
    nome: 'Bianco, come Search', base: ['#FFFFFF', '#FFFFFF'], ink: '#171717', grain: 0,
    bare: ['#171717'], blobs: [], shadow: true,
  },
};

// m: { d, box, fit, fitBare }   sky: un elemento di SKIES   plate: piastra sì/no   grain: grana sì/no
export function iconSVG(m, sky, plate, grain) {
  const r = n => Math.round(n * 100) / 100;
  const P0 = 64, PS = 896, PR = r(PS * 0.2237);
  const [x0, y0, x1, y1] = m.box, w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let defs = '', body = '';
  const sky1 = () => {
    let g = '<rect width="1024" height="1024" fill="url(#sb)"/>';
    defs += `<linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.base[0]}"/><stop offset="1" stop-color="${sky.base[1]}"/></linearGradient>`;
    // macchie morbide: gradiente radiale che arriva a zero sul bordo (le sfocature grandi di Chromium lasciano un bordo)
    const prof = [[0, 1], [0.3, 0.93], [0.5, 0.72], [0.68, 0.42], [0.84, 0.15], [1, 0]];
    sky.blobs.forEach(([bx, by, rx, ry, bl, op, col, rot], i) => {
      defs += `<radialGradient id="m${i}">${prof.map(([o, a]) => `<stop offset="${o}" stop-color="${col}" stop-opacity="${r(a * op)}"/>`).join('')}</radialGradient>`;
      g += `<ellipse cx="${bx}" cy="${by}" rx="${r(rx + 1.7 * bl)}" ry="${r(ry + 1.7 * bl)}" fill="url(#m${i})"${rot ? ` transform="rotate(${rot} ${bx} ${by})"` : ''}/>`;
    });
    if (grain && sky.grain) {
      defs += '<filter id="gr" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>';
      g += `<rect width="1024" height="1024" filter="url(#gr)" opacity="${sky.grain}" style="mix-blend-mode:overlay"/>`;
    }
    return g;
  };
  if (plate) {
    const s = m.fit * PS / Math.max(w, h);
    const tx = r(512 - cx * s), ty = r(512 - cy * s);
    if (sky.shadow) {
      defs += '<filter id="sh" x="-0.2" y="-0.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="14"/></filter>';
      body += `<rect x="${P0}" y="${P0 + 8}" width="${PS}" height="${PS}" rx="${PR}" fill="#000" opacity="0.16" filter="url(#sh)"/>`;
    }
    defs += `<clipPath id="pl"><rect x="${P0}" y="${P0}" width="${PS}" height="${PS}" rx="${PR}"/></clipPath>`;
    body += `<g clip-path="url(#pl)">${sky1()}</g>`;
    if (sky.shadow) body += `<rect x="${P0 + 1}" y="${P0 + 1}" width="${PS - 2}" height="${PS - 2}" rx="${PR - 1}" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="2"/>`;
    body += `<path fill="${sky.ink}" fill-rule="evenodd" transform="translate(${tx} ${ty}) scale(${r(s * 10000) / 10000})" d="${m.d}"/>`;
  } else {
    const s = m.fitBare * 1024 / Math.max(w, h);
    const tx = r(512 - cx * s), ty = r(512 - cy * s);
    let fill = sky.bare[0];
    if (sky.bare.length > 1) {
      const n = sky.bare.length - 1;
      defs += `<linearGradient id="bg" x1="0.2" y1="0" x2="0.8" y2="1">${sky.bare.map((c, i) => `<stop offset="${r(i / n)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
      fill = 'url(#bg)';
    }
    body += `<path fill="${fill}" fill-rule="evenodd" transform="translate(${tx} ${ty}) scale(${r(s * 10000) / 10000})" d="${m.d}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>${defs}</defs>${body}</svg>`;
}
