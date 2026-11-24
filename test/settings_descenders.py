#!/usr/bin/env python3
"""Settings: no g, j, p, q or y cut at the bottom (the user's report, 24 Nov
2026). On every page, each text cut to its box (overflow hidden: titles,
details, the rail, pop-up buttons) keeps at least a pixel of room under its
descenders' ink, measured with the font's own metrics, so Windows' rounding
can't cut them."""
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bench as b


def ev(tab, js):
    try:
        return b.ev(tab, js)
    except RuntimeError:
        return None


MEASURE = r"""(() => {
  const cv = document.createElement('canvas').getContext('2d'); const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    let clip = null; for (let p = e; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflow !== 'visible' || s.overflowY !== 'visible') { clip = p; break } if (p !== e && s.display !== 'inline') break }
    if (!clip) continue;
    const s = getComputedStyle(e); cv.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const m = cv.measureText('gjpqy'); const A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
    const fs = parseFloat(s.fontSize); const lh = s.lineHeight === 'normal' ? A + D : parseFloat(s.lineHeight);
    const r = e.getBoundingClientRect(), c = clip.getBoundingClientRect(); const cs = getComputedStyle(clip);
    const lines = Math.max(1, Math.round(r.height / lh));
    const lastTop = r.top + (lines - 1) * lh; const base = lastTop + (lh - (A + D)) / 2 + A;
    const ink = base + m.actualBoundingBoxDescent; const bottom = c.bottom - parseFloat(cs.borderBottomWidth);
    if (/[gjpqy,;]/.test(e.textContent) && ink > bottom - 1.0) out.push({ cls: (e.className || e.tagName) + ' < ' + (clip.className || clip.tagName), text: e.textContent.trim().slice(0, 30), fs, lh: +lh.toFixed(2), over: +(ink - bottom).toFixed(2) });
  }
  const seen = {}; return out.filter(o => (seen[o.cls] = (seen[o.cls] || 0) + 1) <= 1);
})()"""
t = b.T()
b.use("settings-descenders")
b.launch(env={"SEARCH_LOOK": "light"})
for page in ["general", "appearance", "themes", "tabs", "browsing", "spaces", "passwords", "privacy", "extensions", "keyboard", "about"]:
    b.cmd("settings.open", page=page)
    b.wait_for(lambda: any(x.get("internal") == "settings" for x in b.window()["tabs"]), within=30, what="settings")
    tab = next(x for x in b.window()["tabs"] if x.get("internal") == "settings")["id"]
    b.wait_for(lambda: ev(tab, "location.pathname") == "/" + page, within=20, what=page)
    time.sleep(0.6)
    cut = ev(tab, MEASURE) or []
    t.ok(not cut, f"{page}: every descender has room under it" + (f" ({cut})" if cut else ""))
t.done()
