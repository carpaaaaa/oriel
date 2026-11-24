// Scrive tavole/icona/: tavola.html (autonoma) e, per ogni proposta, segno.svg, icona.svg, icona-senza-piastra.svg.
//   node costruisci.mjs
import fs from 'node:fs';
import { smusso, corsiva, scorcio, sporto, SEARCH_D, f } from './geometria.mjs';
import { SKIES, iconSVG } from './icona.mjs';

const OUT = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const k = Math.tan(Math.PI / 8);

const g1 = smusso(), g2 = corsiva({ wi: 260, hi: 320, t: 230, ang: 10 }), g3 = scorcio(), g4 = sporto({ B: 360, D: 250, v: 0.35, Hh: 300, g: 34 });

// fit = lato maggiore del segno rispetto alla piastra; fitBare = rispetto all'icona intera, senza piastra
const PROPOSTE = [
  {
    id: 'smusso', nome: 'Smusso', tag: 'la pianta', g: g1, fit: 0.58, fitBare: 0.9,
    righe: [
      'Una O pesante, tonda a sinistra; a destra ha la pianta di un bovindo: muro dritto, due lati a 45° e il vetro di fronte.',
      'Lettera e finestra sono una forma sola: calma come Search dove è tonda, con gli spigoli vivi dove la finestra sporge.',
    ],
    misura: 'Raggio 400, spessore 168 costante. Il mezzo ottagono ha lo stesso apotema del cerchio, così il suo lato dritto prosegue la tangente senza scalino; il vuoto è la stessa forma rientrata di 168.',
  },
  {
    id: 'corsiva', nome: 'Corsiva', tag: 'la O', g: g2, fit: 0.6, fitBare: 0.9,
    righe: [
      'Una O piena e inclinata di 10°, morbida fuori; il vuoto è un vetro con gli spigoli vivi, visto di sbieco come una finestra.',
      'Prende da Windows l’idea della finestra in prospettiva ma non i quattro riquadri: un solo vetro dentro una sola lettera.',
    ],
    misura: 'Vuoto 260 × 320 inclinato di 10°. Il contorno è il vuoto allargato di 230: lati paralleli e archi di raggio 230 centrati sugli spigoli del vuoto, quindi concentrici.',
  },
  {
    id: 'scorcio', nome: 'Scorcio', tag: 'i vetri', g: g3, fit: 0.66, fitBare: 0.94,
    righe: [
      'Il bovindo visto dalla strada: il vetro centrale di fronte, i due di lato più stretti e più corti perché girano verso il muro.',
      'È la finestra che sporge detta nel modo più diretto; i soli tagli sono le fessure fra un vetro e l’altro.',
    ],
    misura: 'Vetro centrale 300 × 520; fianchi larghi 182 (0,6 del centrale), col bordo esterno 112 più basso in alto e 40 in basso, come visti da sotto. Fessure 38, raggio 50 per tutti.',
  },
  {
    id: 'sporto', nome: 'Sporto', tag: 'libera', g: g4, fit: 0.68, fitBare: 0.96,
    righe: [
      'Il bovindo come un volume visto dall’alto: sopra il tetto, che è la sua pianta a mezzo ottagono, sotto i tre vetri.',
      'La più architettonica delle quattro: dice «una finestra che esce dal muro» anche a chi non conosce la parola oriel.',
    ],
    misura: 'Pianta: muro 720, profondità 250, lati a 45°, schiacciata al 35% come vista dall’alto. Vetri alti 300, fessure 34 sia fra tetto e vetri sia fra vetro e vetro.',
  },
];

const markOf = p => ({ d: p.g.d, box: p.g.box, fit: p.fit, fitBare: p.fitBare });

// ---------- disegni di costruzione ----------
const G = 'fill="none" stroke="#8C8C8C" stroke-width="1.2" vector-effect="non-scaling-stroke"';
const GD = G + ' stroke-dasharray="5 5"';
const T = (x, y, s, a = 'middle') => `<text x="${f(x)}" y="${f(y)}" text-anchor="${a}" font-size="52" fill="#5E5E5E">${s}</text>`;
function costruzione(p) {
  const [x0, y0, x1, y1] = p.g.box, m = 150;
  const vb = [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
  let s = `<path d="${p.g.d}" fill="#171717" fill-opacity="0.1" fill-rule="evenodd"/>`;
  if (p.id === 'smusso') {
    const { A, t } = p.g, a = A - t;
    const oct = R => { const q = R / Math.cos(Math.PI / 8); const pts = []; for (let i = 0; i < 8; i++) { const an = Math.PI / 8 + i * Math.PI / 4; pts.push(`${f(q * Math.cos(an))} ${f(q * Math.sin(an))}`); } return 'M' + pts.join(' L') + 'Z'; };
    s += `<circle r="${A}" ${GD}/><circle r="${a}" ${GD}/><path d="${oct(A)}" ${GD}/><path d="${oct(a)}" ${GD}/>`;
    s += `<path d="M0 ${-A - 90} V${A + 90}" ${G}/><path d="M0 0 H${-A}" ${G}/>`;
    s += T(-A / 2, -18, 'raggio 400') + T(A * 0.86, -A * 0.78, '45°', 'start') + T(0, A + 130, 'muro: qui finisce il tondo');
  }
  if (p.id === 'corsiva') {
    const { V, t } = p.g;
    s += `<path d="M${V.map(v => f(v[0]) + ' ' + f(v[1])).join(' L')}Z" ${G}/>`;
    for (const v of V) s += `<circle cx="${f(v[0])}" cy="${f(v[1])}" r="${t}" ${GD}/>`;
    const b = V[3], tp = V[0];
    s += `<path d="M${f(b[0])} ${f(b[1] + 60)} V${f(tp[1] - 140)}" ${G}/><path d="M${f(b[0] + (b[0] - tp[0]) * 0.15)} ${f(b[1] + (b[1] - tp[1]) * 0.15)} L${f(tp[0] - (b[0] - tp[0]) * 0.35)} ${f(tp[1] - (b[1] - tp[1]) * 0.35)}" ${G}/>`;
    s += T(b[0] + 20, tp[1] - 160, '10°', 'start') + T(0, p.g.box[3] + 120, 'archi di raggio 230 sugli spigoli del vetro');
  }
  if (p.id === 'scorcio') {
    const { H, dt, db, x0: a, x1: b, oy } = p.g, h2 = H / 2;
    const ext = 260;
    const lineThrough = (px, py, qx, qy) => { const dx = qx - px, dy = qy - py, L = Math.hypot(dx, dy); return `M${f(px)} ${f(py)} L${f(qx + dx / L * ext)} ${f(qy + dy / L * ext)}`; };
    for (const sg of [1, -1]) {
      s += `<path d="${lineThrough(sg * a, -h2 + oy, sg * b, -h2 + dt + oy)}" ${GD}/>`;
      s += `<path d="${lineThrough(sg * a, h2 + oy, sg * b, h2 + db + oy)}" ${GD}/>`;
    }
    s += `<path d="M${-b - 60} ${f(h2 + oy + 130)} H${b + 60}" ${G}/>`;
    s += T(0, h2 + oy + 190, 'i fianchi scendono verso l’orizzonte');
  }
  if (p.id === 'sporto') {
    const { B, D, F, v, oy, g } = p.g;
    // la pianta vera, ribaltata sopra il volume
    const py = p.g.box[1] - 40 - D;
    s += `<path d="M${-B} ${f(py)} L${-F} ${f(py + D)} L${F} ${f(py + D)} L${B} ${f(py)}" ${GD}/>`;
    s += `<path d="M${-B - 60} ${f(py)} H${B + 60}" ${G}/>`;
    s += T(B * 0.62, py + D * 0.55, '45°', 'start') + T(0, py - 30, 'pianta vera') + T(0, p.g.box[3] + 110, 'la stessa pianta schiacciata al 35% è il tetto');
    vb[1] = py - 110; vb[3] = p.g.box[3] + 170 - vb[1];
  }
  return `<svg viewBox="${vb.map(f).join(' ')}" role="img" aria-label="Costruzione di ${p.nome}" font-family="Segoe UI, system-ui, sans-serif">${s}</svg>`;
}

const segnoSVG = (p, fill = '#171717') => {
  const [x0, y0, x1, y1] = p.g.box, m = Math.max(x1 - x0, y1 - y0) * 0.06;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0 - m)} ${f(y0 - m)} ${f(x1 - x0 + 2 * m)} ${f(y1 - y0 + 2 * m)}"><path fill="${fill}" fill-rule="evenodd" d="${p.g.d}"/></svg>`;
};

// ---------- file sorgente ----------
for (const p of PROPOSTE) {
  fs.mkdirSync(`${OUT}/${p.id}`, { recursive: true });
  fs.writeFileSync(`${OUT}/${p.id}/segno.svg`, segnoSVG(p) + '\n');
  fs.writeFileSync(`${OUT}/${p.id}/icona.svg`, iconSVG(markOf(p), SKIES.alba, true, true) + '\n');
  fs.writeFileSync(`${OUT}/${p.id}/icona-senza-piastra.svg`, iconSVG(markOf(p), SKIES.alba, false, false) + '\n');
}

// ---------- tavola ----------
const img = (id, plate, size, extra = '') => `<img class="ic" data-m="${id}" data-p="${plate ? 1 : 0}" data-size="${size}" width="${size}" height="${size}" alt=""${extra}>`;
const cv = (id, plate, size, bg) => `<canvas data-m="${id}" data-p="${plate ? 1 : 0}" data-size="${size}" data-bg="${bg}" style="width:${size * 4}px;height:${size * 4}px"></canvas>`;

const winCtl = dark => {
  const c = dark ? '#FFFFFF' : '#1A1A1A';
  return `<span class="ctl"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5 H10" stroke="${c}" stroke-width="1"/></svg></span>` +
    `<span class="ctl"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="${c}" stroke-width="1"/></svg></span>` +
    `<span class="ctl"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="${c}" stroke-width="1"/></svg></span>`;
};

const NOTE16 = {
  smusso: ['si legge', 'Resta una O netta: lo spessore regge anche con il segno largo 8 pixel. Gli smussi del bovindo qui valgono mezzo pixel sfumato e la O sembra quasi tonda; il bovindo si riconosce da 24 px in su.'],
  corsiva: ['si legge', 'Si legge come una O pesante con il vuoto aperto. La pendenza di 10° a questa misura vale mezzo pixel e quasi sparisce: resta una O squadrata, che rischia di sembrare uno zero.'],
  scorcio: ['è al limite', 'Le fessure sono più sottili di un pixel e diventano due righe sfumate: si vede un blocco a strisce più che tre vetri. Per 16 e 20 px servirebbe un disegno a parte con fessure da un pixel pieno.'],
  sporto: ['non si legge', 'Le fessure scendono sotto il pixel e resta un trapezio pieno, una vaschetta. Già a 24 px è al limite, e anche in grande può sembrare un cassetto aperto: per le misure piccole servirebbe un disegno semplificato.'],
};

function card(p) {
  const id = p.id;
  const strip = (dark, size) => `<div class="tb ${dark ? 'dark' : 'light'} s${size}"><span class="btn on">${img(id, 1, size)}</span><span class="btn run">${img(id, 0, size)}</span></div>`;
  const title = (dark, plate) => `<div class="tt ${dark ? 'dark' : 'light'}">${img(id, plate, 16)}<span class="tn">Oriel</span>${winCtl(dark)}</div>`;
  const start = dark => `<div class="sm ${dark ? 'dark' : 'light'}"><span class="st">${img(id, 1, 48)}<span>Oriel</span></span><span class="st">${img(id, 0, 48)}<span>Oriel</span></span></div>`;
  const expl = dark => `<div class="ex ${dark ? 'dark' : 'light'}"><span class="fi">${img(id, 1, 96)}<span>Oriel</span></span><span class="fi">${img(id, 0, 96)}<span>Oriel</span></span></div>`;
  const [stato, nota] = NOTE16[id];
  return `
<article class="prop" id="${id}">
  <header class="ph">
    <div class="ttl"><h2>${p.nome}</h2><span class="tag">${p.tag}</span></div>
    <p>${p.righe[0]}<br>${p.righe[1]}</p>
  </header>
  <div class="hero">
    <figure class="tile mark"><div class="art">${segnoSVG(p).replace('<svg xmlns="http://www.w3.org/2000/svg" ', '<svg ')}</div><figcaption>Il segno</figcaption></figure>
    <figure class="tile build"><div class="art">${costruzione(p)}</div><figcaption>Costruzione <span class="mis">${p.misura}</span></figcaption></figure>
    <figure class="tile x256"><div class="art fi">${img(id, 1, 256)}<span>Oriel</span></div><figcaption>Con piastra · 256 px, Esplora file a icone molto grandi</figcaption></figure>
    <figure class="tile x256"><div class="art fi">${img(id, 0, 256)}<span>Oriel</span></div><figcaption>Senza piastra · 256 px, il segno porta il cielo</figcaption></figure>
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
    <p class="n16"><b class="st-${stato === 'si legge' ? 'ok' : stato === 'è al limite' ? 'mid' : 'no'}">A 16 px ${stato}.</b> ${nota}</p>
    <div class="skies">${Object.keys(SKIES).map(s => `<figure>${img(id, 1, 48, ` data-sky="${s}"`)}<figcaption>${SKIES[s].nome}</figcaption></figure>`).join('')}</div>
  </div>
</article>`;
}

const searchIcon = (() => {
  // icona di Search per Windows nello stesso modello: piastra bianca, segno largo il 75,4% della piastra
  const s = 0.754 * 896 / 608, tx = 512 - 304 * s, ty = 512 - 138 * s;
  return `<svg viewBox="0 0 1024 1024" width="96" height="96" role="img" aria-label="Icona di Search"><rect x="64" y="72" width="896" height="896" rx="200.44" fill="#000" opacity="0.08"/><rect x="64" y="64" width="896" height="896" rx="200.44" fill="#fff" stroke="#000" stroke-opacity="0.08" stroke-width="2"/><path fill="#171717" fill-rule="evenodd" transform="translate(${f(tx)} ${f(ty)}) scale(${f(s * 1000) / 1000})" d="${SEARCH_D}"/></svg>`;
})();

const DATA = {
  SKIES,
  MARKS: Object.fromEntries(PROPOSTE.map(p => [p.id, markOf(p)])),
};

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Oriel, icona e segno</title>
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
h1 { font-size: 40px; line-height: 1; margin: 0 0 10px; font-weight: 650; letter-spacing: -0.02em; }
.sub { margin: 0; color: var(--soft); font-size: 15px; line-height: 1.5; max-width: 760px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chips span { font-size: 13px; color: var(--muted); margin-right: 4px; }
.chips button { font: inherit; font-size: 13px; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 6px 12px; cursor: pointer; }
.chips button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
.ref { display: grid; grid-template-columns: auto 1fr; gap: 20px; align-items: start; background: var(--card); border-radius: var(--r-card); padding: 20px 24px; margin-bottom: 20px; box-shadow: 0 0 0 1px var(--line); }
.ref h3, .pn h3 { font-size: 12px; font-weight: 600; color: var(--soft); margin: 0 0 8px; letter-spacing: .01em; }
.ref ul { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.55; color: var(--ink); }
.ref li { margin-bottom: 3px; }
.ref .scart { margin: 8px 0 0; font-size: 13px; color: var(--soft); line-height: 1.5; }
.ref .src { text-align: center; font-size: 12px; color: var(--muted); }
.prop { background: var(--card); border-radius: var(--r-card); padding: var(--pad); margin-bottom: 20px; box-shadow: 0 0 0 1px var(--line); }
.ph { display: grid; grid-template-columns: 260px 1fr; gap: 16px; padding: 8px 8px 16px; align-items: start; }
.ttl { display: flex; align-items: baseline; gap: 10px; }
.ph h2 { font-size: 30px; margin: 0; font-weight: 650; letter-spacing: -0.015em; }
.tag { font-size: 13px; color: var(--muted); }
.ph p { margin: 2px 0 0; font-size: 14.5px; line-height: 1.55; color: var(--ink); max-width: 900px; }
.hero { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.tile { margin: 0; background: var(--tile); border-radius: var(--r-in); padding: 16px; display: flex; flex-direction: column; justify-content: space-between; min-height: 330px; }
.tile .art { flex: 1; display: grid; place-items: center; }
.tile.mark svg { width: 210px; height: 210px; }
.tile.build svg { width: 250px; height: 220px; }
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
.st-mid { color: #8A5A00; }
.skies { display: flex; gap: 10px; }
.skies figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.skies figcaption { font-size: 11px; color: var(--muted); white-space: nowrap; }
.end { font-size: 13px; color: var(--soft); line-height: 1.6; padding: 4px 8px; }
.end code { font-size: 12px; }
@media (max-width: 1100px) {
  .hero { grid-template-columns: 1fr 1fr; }
  .sizes { grid-template-columns: 1fr 1fr; }
  .ph { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  main { padding: 24px 16px 48px; }
  .hero, .sizes { grid-template-columns: 1fr; }
  .foot { grid-template-columns: 1fr; }
  .skies { flex-wrap: wrap; }
}
</style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>Oriel</h1>
      <p class="sub">Icona e segno, quattro direzioni per il port di Search su Windows. Qui si sceglie soltanto: nulla è installato e nulla sostituisce l’icona di adesso. Ogni misura è a grandezza vera, un pixel come su Windows al 100%.</p>
    </div>
    <div class="chips" role="group" aria-label="Cielo della piastra"><span>Cielo</span>${Object.keys(SKIES).map(s => `<button type="button" data-sky="${s}" aria-pressed="${s === 'alba'}">${SKIES[s].nome}</button>`).join('')}</div>
  </div>

  <section class="ref">
    <div class="src">${searchIcon}<div>Search per Mac</div></div>
    <div>
      <h3>Prima di disegnare</h3>
      <ul>
        <li>La finestra di Windows del 2012 (Pentagram): la prospettiva da sola dice «finestra». Presa la prospettiva; lasciati i quattro vetri, che sono il loro marchio.</li>
        <li>Le piante dei bovindi nei disegni d’architettura: muro dritto, due lati a 45° e il vetro di fronte. Preso il mezzo ottagono.</li>
        <li>Le O dei marchi essenziali (Opera, Oculus, Oura): una O pesante vive di com’è fatto il suo vuoto. Evitato il vuoto ovale e stretto di Opera, che è già un browser.</li>
        <li>Search: un solo segno pieno su una piastra bianca col raggio al 22,37% del lato. Presi la calma e la piastra; il cielo è nuovo e si cambia qui sopra.</li>
      </ul>
      <p class="scart">Scartate prima della tavola perché sembravano altro: mensola a punta (matita, scudo), pianta piena (ciotola), O col vuoto a trapezio (tasto play), O spezzata in due (icona di aggiornamento), sguincio (occhiali da sole), tessera col bovindo (batteria), O sul davanzale (Ω).</p>
    </div>
  </section>

  ${PROPOSTE.map(card).join('\n')}

  <p class="end">File sorgente accanto a questa pagina, una cartella per proposta: <code>segno.svg</code> (inchiostro, monocromo), <code>icona.svg</code> (piastra con il cielo Alba, tela 1024, piastra 896 con raggio 200,4) e <code>icona-senza-piastra.svg</code>. La grana compare solo da 96 px in su: sotto diventerebbe rumore. Senza piastra un’app classica di Windows ha una sola icona per barra chiara e scura, per questo il segno porta il colore del cielo invece del bianco o del nero.</p>
</main>
<script>
const DATA = ${JSON.stringify(DATA)};
const iconSVG = ${iconSVG.toString()};
const url = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
let sky = 'alba';
function paint() {
  for (const el of document.querySelectorAll('img.ic')) {
    const sk = DATA.SKIES[el.dataset.sky || sky];
    el.src = url(iconSVG(DATA.MARKS[el.dataset.m], sk, el.dataset.p === '1', +el.dataset.size >= 96));
  }
  for (const c of document.querySelectorAll('canvas[data-m]')) {
    const n = +c.dataset.size; c.width = n; c.height = n;
    const ctx = c.getContext('2d');
    const im = new Image();
    im.onload = () => { ctx.fillStyle = c.dataset.bg; ctx.fillRect(0, 0, n, n); ctx.drawImage(im, 0, 0, n, n); };
    im.src = url(iconSVG(DATA.MARKS[c.dataset.m], DATA.SKIES[sky], c.dataset.p === '1', false));
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
fs.writeFileSync(`${OUT}/tavola.html`, html);
console.log('scritto', OUT, (html.length / 1024).toFixed(0) + ' KB');
