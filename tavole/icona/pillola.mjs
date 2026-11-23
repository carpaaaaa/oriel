// Seconda tavola: «il logo di Search ma con la O». Scrive accanto a sé pillola.html e pillola/<variante>/*.svg.
//   node pillola.mjs
// Niente dipendenze. La pillola e la S vengono dal tracciato di Search (Icon/icon.swift, Design.swift).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const f = n => { const v = Math.round(n * 100) / 100; return (Object.is(v, -0) ? 0 : v).toString(); };
const k = Math.tan(Math.PI / 8);

// ---------- Search, misurato ----------
const SEARCH_D = 'M469.443 0C545.471 0.00013198 607.103 61.6325 607.104 137.66C607.104 213.688 545.471 275.321 469.443 275.321H137.66C61.6323 275.321 0 213.688 0 137.66C0.00016085 61.6325 61.6325 0.000140192 137.66 0H469.443ZM138.104 51.5977C127.234 51.5977 117.512 53.5115 108.938 57.3389C100.518 61.0132 93.8581 66.2188 88.959 72.9551C84.2132 79.5381 81.8398 87.3464 81.8398 96.3789C81.8399 105.258 83.6773 112.607 87.3516 118.425C91.0258 124.089 95.9251 128.682 102.049 132.203C108.173 135.571 114.833 138.327 122.028 140.471L151.652 149.197C158.389 151.188 163.9 154.249 168.187 158.383C172.473 162.516 174.617 168.028 174.617 174.917C174.617 182.572 171.402 188.849 164.972 193.748C158.695 198.494 150.122 200.867 139.252 200.867C132.21 200.867 125.702 199.413 119.731 196.504C113.914 193.442 109.091 189.308 105.264 184.103C101.436 178.744 99.2169 172.697 98.6045 165.961H97.6855L75.4102 171.013C76.3287 180.658 79.697 189.308 85.5146 196.963C91.3322 204.618 98.9103 210.665 108.249 215.104C117.741 219.544 128.076 221.765 139.252 221.765C151.193 221.765 161.68 219.774 170.713 215.794C179.746 211.813 186.711 206.225 191.61 199.029C196.662 191.834 199.188 183.414 199.188 173.769C199.188 164.124 197.352 156.239 193.678 150.115C190.003 143.838 185.104 138.863 178.98 135.188C172.857 131.514 166.044 128.605 158.542 126.462L128.229 117.735C121.799 115.898 116.516 113.219 112.383 109.698C108.402 106.177 106.412 101.354 106.412 95.2305C106.412 88.188 109.168 82.6758 114.68 78.6953C120.344 74.5619 128.152 72.4951 138.104 72.4951C147.901 72.4952 155.939 74.9448 162.216 79.8438C168.493 84.7428 172.397 91.1729 173.928 99.1338H174.847L196.663 93.8525C195.745 85.5853 192.605 78.3131 187.247 72.0361C181.889 65.6061 174.923 60.6306 166.35 57.1094C157.929 53.4351 148.514 51.5977 138.104 51.5977Z';
const PILL_D = SEARCH_D.slice(0, SEARCH_D.indexOf('Z') + 1);     // la pillola, senza la S
const S_D = SEARCH_D.slice(SEARCH_D.indexOf('Z') + 1);           // la S
const W = 607.104, H = 275.321, R = 137.6605;                     // pillola: semicerchi di raggio H/2
// La S nel tracciato: in alto 51.598, in basso 221.765; tratto orizzontale 72.495 - 51.598; asta 106.412 - 81.840.
const S_TOP = 51.5977, S_BOT = 221.765, S_H = S_BOT - S_TOP;      // 170.17
const ORIZ = 72.4951 - 51.5977;                                   // 20.90
const ASTA = 106.412 - 81.8398;                                   // 24.57
// La O dello stesso carattere (carattere di sistema, fra Regular e Medium come la S): alta quanto la S,
// larga 0,902 dell'altezza, stessi tratti della S; curve al 73,1% lungo la diagonale, cioè maniglie al 61,6%.
const O_WH = 0.902, KAPPA = (8 * 0.731 - 4) / 3;
const CX = R, CY = (S_TOP + S_BOT) / 2;                           // centro del semicerchio sinistro, alla quota della S

const oval = (cx, cy, a, b, q) => `M${f(cx + a)} ${f(cy)} C${f(cx + a)} ${f(cy + q * b)} ${f(cx + q * a)} ${f(cy + b)} ${f(cx)} ${f(cy + b)} C${f(cx - q * a)} ${f(cy + b)} ${f(cx - a)} ${f(cy + q * b)} ${f(cx - a)} ${f(cy)} C${f(cx - a)} ${f(cy - q * b)} ${f(cx - q * a)} ${f(cy - b)} ${f(cx)} ${f(cy - b)} C${f(cx + q * a)} ${f(cy - b)} ${f(cx + a)} ${f(cy - q * b)} ${f(cx + a)} ${f(cy)}Z`;
const leftHalfUp = (cx, cy, a, b, q) => `C${f(cx - q * a)} ${f(cy + b)} ${f(cx - a)} ${f(cy + q * b)} ${f(cx - a)} ${f(cy)} C${f(cx - a)} ${f(cy - q * b)} ${f(cx - q * a)} ${f(cy - b)} ${f(cx)} ${f(cy - b)}`;

const A = O_WH * S_H / 2, B = S_H / 2;                            // semiassi esterni della O: 76.75 x 85.09
const Ai = A - ASTA, Bi = B - ORIZ;                               // semiassi del vuoto: 52.18 x 64.19
const O_D = oval(CX, CY, A, B, KAPPA) + ' ' + oval(CX, CY, Ai, Bi, KAPPA);

// O smussata: metà sinistra uguale; a destra lato dritto k*A, facce a 45°, vetro verticale.
// Il vuoto segue a spessore costante: ORIZ sopra e sotto, ASTA sul vetro, la media sulle facce.
const FACCIA = (ORIZ + ASTA) / 2;
function oSmussata() {
  const Fv = B - A * (1 - k);                                     // mezza altezza del vetro esterno
  const out = `M${f(CX)} ${f(CY - B)} L${f(CX + k * A)} ${f(CY - B)} L${f(CX + A)} ${f(CY - Fv)} L${f(CX + A)} ${f(CY + Fv)} L${f(CX + k * A)} ${f(CY + B)} L${f(CX)} ${f(CY + B)} ${leftHalfUp(CX, CY, A, B, KAPPA)}Z`;
  const Q = [CX + k * A, CY - B], s2 = Math.SQRT2;
  const yt = CY - Bi, xf = CX + Ai;
  const sTop = s2 * (yt - Q[1]) - FACCIA, x1 = Q[0] - FACCIA / s2 + sTop / s2;
  const y2 = Q[1] + FACCIA / s2 + (xf - Q[0] + FACCIA / s2);
  const inn = `M${f(CX)} ${f(yt)} L${f(x1)} ${f(yt)} L${f(xf)} ${f(y2)} L${f(xf)} ${f(2 * CY - y2)} L${f(x1)} ${f(CY + Bi)} L${f(CX)} ${f(CY + Bi)} ${leftHalfUp(CX, CY, Ai, Bi, KAPPA)}Z`;
  return { d: out + ' ' + inn, Fv, x1, y2 };
}
const OS = oSmussata();

// Pillola a prua: a destra il semicerchio diventa la pianta del bovindo, mezzo ottagono con lo stesso apotema R.
const xs = W - R, PRUA_D = `M${f(R)} 0 H${f(xs + k * R)} L${f(W)} ${f(R - k * R)} V${f(R + k * R)} L${f(xs + k * R)} ${f(H)} H${f(R)} A${f(R)} ${f(R)} 0 0 1 ${f(R)} 0Z`;

const BOX = [0, 0, W, H];
const VARIANTI = [
  {
    id: 'calco', nome: 'Calco', d: PILL_D + ' ' + O_D,
    righe: [
      'Somiglia a Search quasi del tutto: stessa pillola, stessa posizione, stessa altezza e stesso peso del tratto della S. Cambia solo la lettera.',
      'La distingue soltanto la O, disegnata con le proporzioni della O dello stesso carattere. Rischio: una O tonda in fondo a una pillola può ricordare un interruttore.',
    ],
    misura: `S misurata nel tracciato: alta 170,2, tratti orizzontali 20,9, aste 24,6. La O ha la stessa altezza e gli stessi tratti, è larga 0,90 dell'altezza e le curve sono squadrate quanto quelle della O del carattere (maniglie al 61,6%).`,
  },
  {
    id: 'faccetta', nome: 'Faccetta', d: PILL_D + ' ' + OS.d,
    righe: [
      'Somiglia a Search nella pillola e nel posto della lettera, che ha la stessa altezza e lo stesso peso della S.',
      'La distingue la O: a sinistra è quella del carattere, a destra ha la pianta del bovindo come Smusso. È l’unico tratto solo di Oriel e toglie l’aria da interruttore.',
    ],
    misura: `Metà sinistra uguale a Calco. A destra lato dritto lungo 0,41 della mezza larghezza, facce a 45°, vetro alto ${f(2 * OS.Fv).replace('.', ',')}. Il vuoto segue a spessore costante: 20,9 sopra e sotto, 24,6 sul vetro, 22,7 sulle facce.`,
  },
  {
    id: 'prua', nome: 'Prua', d: PRUA_D + ' ' + O_D,
    righe: [
      'Somiglia a Search nella grammatica: una forma piena con la lettera ritagliata, la stessa O di Calco al posto della S.',
      'La distingue la pillola: l’estremità destra non è tonda ma è la pianta del bovindo, con lo stesso apotema del semicerchio, e il contorno sporge come una finestra.',
    ],
    misura: 'Pillola di Search 607 × 275. A destra il semicerchio diventa un mezzo ottagono con lo stesso apotema (137,7): il lato dritto prosegue senza scalino, facce a 45°, fronte alta 114. O uguale a Calco.',
  },
];

// ---------- cieli: gli stessi della prima tavola; qui il bianco di Search viene per primo ----------
const SKIES = {
  bianco: { nome: 'Bianco, come Search', base: ['#FFFFFF', '#FFFFFF'], ink: '#171717', grain: 0, bare: ['#171717'], blobs: [], shadow: true },
  alba: {
    nome: 'Alba', base: ['#FF7E6E', '#E2878E'], ink: '#FFFBF4', grain: 0.13, bare: ['#FF7466', '#DE7C9E', '#8E98D2'],
    blobs: [[520, 1095, 600, 130, 60, 0.95, '#E792AA'], [590, 950, 280, 110, 70, 0.95, '#D9D0E0'], [470, 800, 390, 235, 90, 1.0, '#8DA0D2'], [512, 720, 470, 300, 120, 0.9, '#BF87AC'], [-60, 640, 170, 420, 110, 0.85, '#E77B80'], [1010, 1010, 230, 230, 110, 0.9, '#F29CC2'], [390, 330, 460, 160, 110, 1.0, '#FF9670'], [930, 110, 300, 260, 120, 0.9, '#FF6F88']],
  },
  notte: {
    nome: 'Notte', base: ['#09122B', '#152652'], ink: '#FFFBF4', grain: 0.12, bare: ['#8FA8E8', '#4D69B4', '#2E4688'],
    blobs: [[300, 1000, 560, 210, 120, 0.9, '#2C4C95', -28], [620, 940, 300, 110, 90, 0.55, '#6A82C4', -28], [-40, 560, 180, 420, 110, 0.5, '#1F3A78'], [860, 120, 380, 260, 130, 0.75, '#050A1C']],
  },
  oliva: {
    nome: 'Oliva', base: ['#2B3019', '#525932'], ink: '#FFFBF4', grain: 0.13, bare: ['#B9B27A', '#7F8549', '#565D30'],
    blobs: [[260, 980, 580, 210, 120, 0.9, '#7D8050', -26], [640, 900, 280, 110, 90, 0.6, '#A9A36D', -26], [-60, 560, 180, 420, 110, 0.5, '#3C4325'], [880, 130, 360, 260, 130, 0.75, '#1C200E']],
  },
  brace: {
    nome: 'Brace', base: ['#110E0C', '#1B1613'], ink: '#FFFBF4', grain: 0.12, bare: ['#F58A47', '#D4572A', '#A0361A'],
    blobs: [[170, 1000, 540, 210, 130, 0.95, '#A6381A', -32], [110, 1030, 270, 110, 80, 0.85, '#E3672C', -32], [700, 720, 420, 260, 150, 0.35, '#3B2A21'], [900, 120, 300, 240, 120, 0.6, '#070605']],
  },
};

// Icona su tela 1024: piastra 896 a 64 con raggio 22,37% del lato, segno largo il 75,4% della piastra come Search.
function iconSVG(m, sky, plate, grain) {
  const r = n => Math.round(n * 100) / 100;
  const P0 = 64, PS = 896, PR = r(PS * 0.2237);
  const [x0, y0, x1, y1] = m.box, w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let defs = '', body = '';
  const skyG = () => {
    let g = '<rect width="1024" height="1024" fill="url(#sb)"/>';
    defs += `<linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.base[0]}"/><stop offset="1" stop-color="${sky.base[1]}"/></linearGradient>`;
    const seen = {};
    for (const [bx, by, rx, ry, bl, op, col, rot] of sky.blobs) {
      if (!seen[bl]) { seen[bl] = 1; defs += `<filter id="b${bl}" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="${bl}"/></filter>`; }
      g += `<ellipse cx="${bx}" cy="${by}" rx="${rx}" ry="${ry}" fill="${col}" opacity="${op}" filter="url(#b${bl})"${rot ? ` transform="rotate(${rot} ${bx} ${by})"` : ''}/>`;
    }
    if (grain && sky.grain) {
      defs += '<filter id="gr" x="0" y="0" width="1024" height="1024" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>';
      g += `<rect width="1024" height="1024" filter="url(#gr)" opacity="${sky.grain}" style="mix-blend-mode:overlay"/>`;
    }
    return g;
  };
  if (plate) {
    const s = m.fit * PS / Math.max(w, h), tx = r(512 - cx * s), ty = r(512 - cy * s);
    if (sky.shadow) {
      defs += '<filter id="sh" x="-0.2" y="-0.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="14"/></filter>';
      body += `<rect x="${P0}" y="${P0 + 8}" width="${PS}" height="${PS}" rx="${PR}" fill="#000" opacity="0.16" filter="url(#sh)"/>`;
    }
    defs += `<clipPath id="pl"><rect x="${P0}" y="${P0}" width="${PS}" height="${PS}" rx="${PR}"/></clipPath>`;
    body += `<g clip-path="url(#pl)">${skyG()}</g>`;
    if (sky.shadow) body += `<rect x="${P0 + 1}" y="${P0 + 1}" width="${PS - 2}" height="${PS - 2}" rx="${PR - 1}" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="2"/>`;
    body += `<path fill="${sky.ink}" fill-rule="evenodd" transform="translate(${tx} ${ty}) scale(${r(s * 10000) / 10000})" d="${m.d}"/>`;
  } else {
    const s = m.fitBare * 1024 / Math.max(w, h), tx = r(512 - cx * s), ty = r(512 - cy * s);
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

const markOf = v => ({ d: v.d, box: BOX, fit: 0.754, fitBare: 0.94 });
const MARKS = Object.fromEntries(VARIANTI.map(v => [v.id, markOf(v)]));
MARKS.search = { d: SEARCH_D, box: BOX, fit: 0.754, fitBare: 0.94 };

// ---------- disegni di costruzione ----------
const G = 'fill="none" stroke="#8C8C8C" stroke-width="1.2" vector-effect="non-scaling-stroke"';
const GD = G + ' stroke-dasharray="5 5"';
const T = (x, y, s, a = 'middle') => `<text x="${f(x)}" y="${f(y)}" text-anchor="${a}" font-size="25" fill="#5E5E5E">${s}</text>`;
function costruzione(v) {
  let s = `<path d="${v.d}" fill="#171717" fill-opacity="0.1" fill-rule="evenodd"/>`;
  const quote = `<path d="M-30 ${f(S_TOP)} H${f(W + 30)} M-30 ${f(S_BOT)} H${f(W + 30)}" ${GD}/>`;
  if (v.id === 'calco') {
    s += `<path d="${S_D}" ${G} transform="translate(250 0)"/>` + quote;
    s += `<path d="${oval(CX, CY, A, B, KAPPA)}" ${G}/><path d="${oval(CX, CY, Ai, Bi, KAPPA)}" ${G}/>`;
    s += T(CX, -22, 'O alta come la S') + T(250 + 137, -22, 'la S di Search') + T(W / 2, H + 52, 'orizzontali 20,9 · aste 24,6, come nella S');
  }
  if (v.id === 'faccetta') {
    s += quote + `<path d="${oval(CX, CY, A, B, KAPPA)}" ${GD}/>`;
    s += `<path d="M${f(CX)} ${f(CY - B - 30)} V${f(CY + B + 30)}" ${G}/>`;
    s += T(CX + A + 14, CY - OS.Fv - 18, '45°', 'start') + T(CX, -22, 'a destra la pianta del bovindo') + T(W / 2, H + 52, 'tratteggiata: la O del carattere che sostituisce');
  }
  if (v.id === 'prua') {
    s += `<path d="M${f(xs)} 0 A${f(R)} ${f(R)} 0 0 1 ${f(xs)} ${f(H)}" ${GD}/><path d="M${f(xs)} ${f(R)} H${f(W)}" ${G}/><path d="M${f(xs)} -30 V${f(H + 30)}" ${G}/>`;
    s += T(xs + R / 2, R - 12, '137,7') + T(W - 40, 40, '45°', 'end') + T(xs, -22, 'mezzo ottagono, stesso apotema') + T(W / 2, H + 52, 'tratteggiato: il semicerchio di Search che sostituisce');
  }
  return `<svg viewBox="-50 -70 ${f(W + 100)} ${f(H + 150)}" role="img" aria-label="Costruzione di ${v.nome}" font-family="Segoe UI, system-ui, sans-serif">${s}</svg>`;
}
const segnoSVG = (d, fill = '#171717') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -24 ${f(W + 48)} ${f(H + 48)}"><path fill="${fill}" fill-rule="evenodd" d="${d}"/></svg>`;

// ---------- file sorgente ----------
for (const v of VARIANTI) {
  const dir = path.join(HERE, 'pillola', v.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'segno.svg'), segnoSVG(v.d) + '\n');
  fs.writeFileSync(path.join(dir, 'icona.svg'), iconSVG(markOf(v), SKIES.bianco, true, false) + '\n');
  fs.writeFileSync(path.join(dir, 'icona-senza-piastra.svg'), iconSVG(markOf(v), SKIES.bianco, false, false) + '\n');
}

// ---------- tavola ----------
const img = (id, plate, size, extra = '') => `<img class="ic" data-m="${id}" data-p="${plate ? 1 : 0}" data-size="${size}" width="${size}" height="${size}" alt=""${extra}>`;
const cv = (id, plate, size, bg, extra = '') => `<canvas data-m="${id}" data-p="${plate ? 1 : 0}" data-size="${size}" data-bg="${bg}"${extra} style="width:${size * 4}px;height:${size * 4}px"></canvas>`;
const winCtl = dark => {
  const c = dark ? '#FFFFFF' : '#1A1A1A';
  return `<span class="ctl"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5 H10" stroke="${c}" stroke-width="1"/></svg></span>` +
    `<span class="ctl"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="${c}" stroke-width="1"/></svg></span>` +
    `<span class="ctl"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="${c}" stroke-width="1"/></svg></span>`;
};
const NOTE16 = {
  calco: ['non si legge la lettera', 'A 16 px la pillola è larga 11 pixel e alta 5: la O diventa un punto chiaro sfocato, come la S di Search alla stessa misura. Resta la sagoma della pillola; la lettera si legge da 32 px in su.'],
  faccetta: ['non si legge la lettera', 'Come Calco: a 16 e 24 px le faccette sono più piccole di un pixel e la O smussata non si distingue da quella tonda. La differenza si vede da 48 px in su.'],
  prua: ['si legge la sagoma', 'La lettera sparisce come nelle altre, ma la punta a bovindo a destra cambia la sagoma della pillola e resta riconoscibile già a 24 px; a 16 è un pixel di differenza.'],
};
function card(v) {
  const id = v.id;
  const strip = (dark, size) => `<div class="tb ${dark ? 'dark' : 'light'} s${size}"><span class="btn on">${img(id, 1, size)}</span><span class="btn run">${img(id, 0, size)}</span></div>`;
  const title = (dark, plate) => `<div class="tt ${dark ? 'dark' : 'light'}">${img(id, plate, 16)}<span class="tn">Oriel</span>${winCtl(dark)}</div>`;
  const start = dark => `<div class="sm ${dark ? 'dark' : 'light'}"><span class="st">${img(id, 1, 48)}<span>Oriel</span></span><span class="st">${img(id, 0, 48)}<span>Oriel</span></span></div>`;
  const expl = dark => `<div class="ex ${dark ? 'dark' : 'light'}"><span class="fi">${img(id, 1, 96)}<span>Oriel</span></span><span class="fi">${img(id, 0, 96)}<span>Oriel</span></span></div>`;
  const [stato, nota] = NOTE16[id];
  return `
<article class="prop" id="${id}">
  <header class="ph">
    <div class="ttl"><h2>${v.nome}</h2></div>
    <p>${v.righe[0]}<br>${v.righe[1]}</p>
  </header>
  <div class="hero">
    <figure class="tile mark"><div class="art">${segnoSVG(v.d).replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg ')}<div class="vs">${segnoSVG(SEARCH_D, '#9A9A9A').replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg ')}<span>Search</span></div></div><figcaption>Il segno, con Search sotto alla stessa scala</figcaption></figure>
    <figure class="tile build"><div class="art">${costruzione(v)}</div><figcaption>Costruzione <span class="mis">${v.misura}</span></figcaption></figure>
    <figure class="tile x256"><div class="art fi">${img(id, 1, 256)}<span>Oriel</span></div><figcaption>Con piastra · 256 px, Esplora file a icone molto grandi</figcaption></figure>
    <figure class="tile x256"><div class="art fi">${img(id, 0, 256)}<span>Oriel</span></div><figcaption>Senza piastra · 256 px</figcaption></figure>
  </div>
  <div class="sizes">
    <section class="pn"><h3>Barra delle applicazioni · 24 px</h3>${strip(false, 24)}${strip(true, 24)}<p class="leg">a sinistra con piastra, a destra senza</p></section>
    <section class="pn"><h3>Barra delle applicazioni · 32 px</h3>${strip(false, 32)}${strip(true, 32)}<p class="leg">a sinistra con piastra, a destra senza</p></section>
    <section class="pn"><h3>Titolo della finestra · 16 px</h3>${title(false, 1)}${title(false, 0)}${title(true, 1)}${title(true, 0)}</section>
    <section class="pn"><h3>Start · 48 px</h3>${start(false)}${start(true)}</section>
    <section class="pn"><h3>Esplora file · 96 px</h3>${expl(false)}${expl(true)}</section>
    <section class="pn px"><h3>Pixel veri, ingranditi 4 volte</h3>
      <div class="zr">
        <figure>${cv(id, 1, 16, '#F3F3F3')}<figcaption>16</figcaption></figure>
        <figure>${cv(id, 1, 24, '#F3F3F3')}<figcaption>24</figcaption></figure>
        <figure>${cv(id, 1, 32, '#F3F3F3')}<figcaption>32</figcaption></figure>
        <figure>${cv(id, 0, 16, '#F3F3F3')}<figcaption>16 senza</figcaption></figure>
        <figure>${cv(id, 0, 16, '#1C1C1C')}<figcaption>16 senza, scuro</figcaption></figure>
      </div>
    </section>
  </div>
  <div class="foot">
    <p class="n16"><b class="st-${stato.startsWith('si') ? 'ok' : 'no'}">A 16 px ${stato}.</b> ${nota}</p>
    <div class="skies">${Object.keys(SKIES).map(s => `<figure>${img(id, 1, 48, ` data-sky="${s}"`)}<figcaption>${SKIES[s].nome}</figcaption></figure>`).join('')}</div>
  </div>
</article>`;
}

const DATA = { SKIES, MARKS };
const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Oriel, la pillola</title>
<style>
:root {
  color-scheme: light;
  --bg: #F4F4F4; --card: #FFFFFF; --ink: #171717; --muted: #8C8C8C; --soft: #5E5E5E;
  --line: rgba(23,23,23,.08); --tile: #F7F7F7;
  --r-card: 24px; --pad: 16px; --r-in: calc(var(--r-card) - var(--pad));
  font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
main { max-width: 1400px; margin: 0 auto; padding: 40px 32px 64px; }
.top { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
h1 { font-size: 40px; line-height: 1; margin: 0 0 10px; font-weight: 650; letter-spacing: -0.02em; display: flex; align-items: center; gap: 18px; }
h1 .ref { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 400; color: var(--muted); letter-spacing: 0; }
h1 .ref svg { width: 74px; height: auto; }
.sub { margin: 0; color: var(--soft); font-size: 15px; line-height: 1.5; max-width: 780px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chips span { font-size: 13px; color: var(--muted); margin-right: 4px; }
.chips button { font: inherit; font-size: 13px; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.chips button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
.cmp { display: flex; gap: 28px; align-items: flex-end; flex-wrap: wrap; background: var(--card); border-radius: var(--r-card); padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 0 0 1px var(--line); }
.cmp h3, .pn h3 { font-size: 12px; font-weight: 600; color: var(--soft); margin: 0 0 8px; letter-spacing: .01em; }
.cmp .row { display: flex; gap: 16px; align-items: flex-end; }
.cmp figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.cmp figcaption { font-size: 11.5px; color: var(--muted); }
.cmp p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--soft); max-width: 560px; }
.prop { background: var(--card); border-radius: var(--r-card); padding: var(--pad); margin-bottom: 20px; box-shadow: 0 0 0 1px var(--line); }
.ph { display: grid; grid-template-columns: 260px 1fr; gap: 16px; padding: 8px 8px 16px; align-items: start; }
.ph h2 { font-size: 30px; margin: 0; font-weight: 650; letter-spacing: -0.015em; }
.ph p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.55; max-width: 940px; }
.hero { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.tile { margin: 0; background: var(--tile); border-radius: var(--r-in); padding: 16px; display: flex; flex-direction: column; justify-content: space-between; min-height: 330px; }
.tile .art { flex: 1; display: grid; place-items: center; align-content: center; gap: 18px; }
.tile.mark .art > svg { width: 240px; height: auto; }
.tile .vs { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); }
.tile .vs svg { width: 240px; height: auto; opacity: .55; }
.tile.build svg { width: 100%; height: auto; }
.tile figcaption { font-size: 12px; color: var(--soft); line-height: 1.45; margin-top: 10px; }
.tile .mis { display: block; color: var(--muted); margin-top: 3px; }
.tile.x256 { background: #FFFFFF; box-shadow: inset 0 0 0 1px var(--line); }
.fi { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; color: #1A1A1A; }
.sizes { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px; }
.pn { background: var(--tile); border-radius: var(--r-in); padding: 14px; }
.pn .leg { font-size: 11.5px; color: var(--muted); margin: 6px 0 0; }
.tb { display: flex; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; margin-bottom: 6px; }
.tb.light { background: #F3F3F3; box-shadow: inset 0 1px 0 #E3E3E3, 0 0 0 1px rgba(0,0,0,.05); }
.tb.dark { background: #1C1C1C; }
.tb.s24 { height: 48px; } .tb.s24 .btn { width: 40px; height: 40px; }
.tb.s32 { height: 62px; } .tb.s32 .btn { width: 52px; height: 52px; }
.tb .btn { position: relative; display: grid; place-items: center; border-radius: 4px; }
.tb.light .btn.on { background: rgba(0,0,0,.045); }
.tb.dark .btn.on { background: rgba(255,255,255,.07); }
.tb .btn::after { content: ""; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 6px; height: 3px; border-radius: 1.5px; background: #8A8A8A; }
.tb .btn.on::after { width: 16px; background: #5A5A5A; }
.tb.dark .btn.on::after { background: #CFCFCF; }
.tb.s32 .btn::after { bottom: 3px; }
.tt { display: flex; align-items: center; height: 32px; padding-left: 10px; gap: 8px; border-radius: 8px; margin-bottom: 6px; font-size: 12px; overflow: hidden; }
.tt.light { background: #F3F3F3; color: #1A1A1A; box-shadow: 0 0 0 1px rgba(0,0,0,.05); }
.tt.dark { background: #202020; color: #FFFFFF; }
.tt .tn { flex: 1; }
.tt .ctl { width: 40px; height: 32px; display: grid; place-items: center; }
.sm { display: flex; gap: 4px; padding: 8px; border-radius: 8px; margin-bottom: 6px; }
.sm.light { background: #F9F9F9; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
.sm.dark { background: #2C2C2C; }
.st { width: 96px; height: 84px; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 12px; border-radius: 4px; }
.sm.light .st { color: #1A1A1A; } .sm.dark .st { color: #FFFFFF; }
.ex { display: flex; gap: 8px; padding: 10px; border-radius: 8px; margin-bottom: 6px; }
.ex.light { background: #FFFFFF; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
.ex.dark { background: #191919; }
.ex .fi { width: 116px; }
.ex.dark .fi { color: #FFFFFF; }
.zr { display: flex; gap: 14px 18px; align-items: flex-end; flex-wrap: wrap; }
.zr figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.zr figcaption { font-size: 11.5px; color: var(--muted); }
canvas { image-rendering: pixelated; display: block; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
.foot { display: grid; grid-template-columns: 1fr auto; gap: 24px; align-items: center; padding: 14px 8px 4px; }
.n16 { margin: 0; font-size: 13.5px; line-height: 1.55; max-width: 720px; }
.n16 b { font-weight: 600; }
.st-no { color: #A23A1E; }
.skies { display: flex; gap: 10px; }
.skies figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.skies figcaption { font-size: 11px; color: var(--muted); white-space: nowrap; }
.end { font-size: 13px; color: var(--soft); line-height: 1.6; padding: 4px 8px; }
.end code { font-size: 12px; }
@media (max-width: 1100px) { .hero { grid-template-columns: 1fr 1fr; } .sizes { grid-template-columns: 1fr 1fr; } .ph { grid-template-columns: 1fr; } }
@media (max-width: 640px) { main { padding: 24px 16px 48px; } .hero, .sizes { grid-template-columns: 1fr; } .foot { grid-template-columns: 1fr; } .skies { flex-wrap: wrap; } }
</style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Oriel, la pillola <span class="ref">${segnoSVG(SEARCH_D).replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg role="img" aria-label="Search" ')}Search, riferimento</span></h1>
      <p class="sub">Il logo di Search con la O al posto della S, in tre varianti. Seconda tavola, accanto alla prima: nulla è installato. Ogni misura è a grandezza vera, un pixel come su Windows al 100%; il cielo predefinito è il bianco di Search.</p>
    </div>
    <div class="chips" role="group" aria-label="Cielo della piastra"><span>Cielo</span>${Object.keys(SKIES).map(s => `<button type="button" data-sky="${s}" aria-pressed="${s === 'bianco'}">${SKIES[s].nome}</button>`).join('')}</div>
  </div>

  <section class="cmp">
    <div>
      <h3>Search, alle stesse misure</h3>
      <div class="row">
        <figure>${img('search', 1, 96, ' data-sky="bianco"')}<figcaption>96</figcaption></figure>
        <figure>${img('search', 1, 48, ' data-sky="bianco"')}<figcaption>48</figcaption></figure>
        <figure>${img('search', 1, 32, ' data-sky="bianco"')}<figcaption>32</figcaption></figure>
        <figure>${img('search', 1, 24, ' data-sky="bianco"')}<figcaption>24</figcaption></figure>
        <figure>${img('search', 1, 16, ' data-sky="bianco"')}<figcaption>16</figcaption></figure>
        <figure>${cv('search', 1, 16, '#F3F3F3', ' data-sky="bianco"')}<figcaption>16, pixel ×4</figcaption></figure>
      </div>
    </div>
    <p>La S di Search, misurata nel tracciato, sta fra il Regular e il Medium del carattere di sistema: alta 170,2 su una pillola alta 275, tratti orizzontali 20,9, aste 24,6. Nello stesso carattere la O è alta quanto la S e ha gli stessi tratti: le tre O qui sotto partono da queste misure, non da un disegno a occhio. Anche Search a 16 px perde la lettera e resta una pillola.</p>
  </section>

  ${VARIANTI.map(card).join('\n')}

  <p class="end">Generata da <code>pillola.mjs</code> (stessa cartella: <code>node pillola.mjs</code>). File sorgente in <code>pillola/</code>, una cartella per variante: <code>segno.svg</code> (inchiostro), <code>icona.svg</code> (piastra bianca come Search, tela 1024, piastra 896 con raggio 200,4, segno largo il 75,4% della piastra) e <code>icona-senza-piastra.svg</code>. Senza piastra e col bianco di Search il segno è nero: sulla barra scura sparisce, ed è il motivo per cui la piastra qui serve davvero.</p>
</main>
<script>
const DATA = ${JSON.stringify(DATA)};
const iconSVG = ${iconSVG.toString()};
const url = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
let sky = 'bianco';
function paint() {
  for (const el of document.querySelectorAll('img.ic')) {
    el.src = url(iconSVG(DATA.MARKS[el.dataset.m], DATA.SKIES[el.dataset.sky || sky], el.dataset.p === '1', +el.dataset.size >= 96));
  }
  for (const c of document.querySelectorAll('canvas[data-m]')) {
    const n = +c.dataset.size; c.width = n; c.height = n;
    const ctx = c.getContext('2d'), im = new Image();
    im.onload = () => { ctx.fillStyle = c.dataset.bg; ctx.fillRect(0, 0, n, n); ctx.drawImage(im, 0, 0, n, n); };
    im.src = url(iconSVG(DATA.MARKS[c.dataset.m], DATA.SKIES[c.dataset.sky || sky], c.dataset.p === '1', false));
  }
}
for (const b of document.querySelectorAll('.chips button')) {
  b.addEventListener('click', () => {
    sky = b.dataset.sky;
    for (const o of document.querySelectorAll('.chips button')) o.setAttribute('aria-pressed', String(o === b));
    paint();
  });
}
paint();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(HERE, 'pillola.html'), html);
console.log('scritto', path.join(HERE, 'pillola.html'), (html.length / 1024).toFixed(0) + ' KB');
