/* LOGIKA INTI: state, glyph store, raster -> kontur vektor, undo/redo, proyek */
(() => {
  const W = 500, S = 2, BASE = 400; // kanvas 500px = 1000 unit font (1px = 2 unit)
  const FG = window.FG = {
    W, S, BASE, UPM: 1000, ASC: 800, DESC: -200,
    L: { asc: 60, cap: 100, x: 230, base: 400, desc: 470 },
    sets: {
      Besar: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      Kecil: 'abcdefghijklmnopqrstuvwxyz',
      Angka: '0123456789',
      Simbol: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
      Aksen: 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿßÐðÞþ€£¥©®°±×÷¿¡§¶•…«»'
    },
    meta: { family: 'Tulisanku', style: 'Regular', weight: 400, copyright: '', version: '1.0' },
    opt: { smooth: 4, detail: 1.2, corner: 50, slant: 0, sb: 40 },
    ui: { tool: 'pen', size: 18, shape: 'round', pressure: true, sym: false, guides: true, grid: false,
      ghost: true, ghostFont: 'sans-serif', outline: false, tab: 'Semua', q: '', fmt: 'ttf', pvSize: 64, pvSp: 0 },
    glyphs: {}, cur: 'A'
  };
  FG.all = () => Object.values(FG.sets).join('');

  // glyph dibuat malas (lazy) supaya hemat memori
  FG.g = ch => FG.glyphs[ch] || (FG.glyphs[ch] = (() => {
    const c = document.createElement('canvas'); c.width = c.height = W;
    return { c, adv: 600, undo: [], redo: [], cache: null, dirty: true };
  })());
  FG.touch = g => { g.dirty = true; g.cache = null; };
  FG.bounds = g => {
    const d = g.c.getContext('2d').getImageData(0, 0, W, W).data;
    let x0 = W, y0 = W, x1 = -1, y1 = -1;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 127) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  };
  FG.has = g => { if (g.dirty) { g.hasV = !!FG.bounds(g); g.dirty = false; } return g.hasV; };
  FG.hasCh = ch => { const g = FG.glyphs[ch]; return !!g && FG.has(g); };

  // ---------- undo / redo ----------
  FG.snap = g => { g.undo.push(g.c.toDataURL()); if (g.undo.length > 30) g.undo.shift(); g.redo = []; };
  FG.restore = (g, url, cb) => {
    const i = new Image();
    i.onload = () => { const x = g.c.getContext('2d'); x.clearRect(0, 0, W, W); x.drawImage(i, 0, 0); FG.touch(g); cb && cb(); };
    i.src = url;
  };
  FG.undoG = (g, cb) => { if (!g.undo.length) return; g.redo.push(g.c.toDataURL()); FG.restore(g, g.undo.pop(), cb); };
  FG.redoG = (g, cb) => { if (!g.redo.length) return; g.undo.push(g.c.toDataURL()); FG.restore(g, g.redo.pop(), cb); };

  // ---------- transformasi ----------
  FG.xform = (g, fn) => {
    FG.snap(g);
    const t = document.createElement('canvas'); t.width = t.height = W;
    t.getContext('2d').drawImage(g.c, 0, 0);
    const x = g.c.getContext('2d'); x.clearRect(0, 0, W, W);
    x.save(); fn(x); x.drawImage(t, 0, 0); x.restore(); FG.touch(g);
  };
  FG.importImage = (g, img) => {
    FG.snap(g);
    const t = document.createElement('canvas'); t.width = t.height = W;
    const x = t.getContext('2d'), bx = 20, by = FG.L.asc, bw = W - 40, bh = FG.L.desc - FG.L.asc;
    const r = Math.min(bw / img.width, bh / img.height), w = img.width * r, h = img.height * r;
    x.drawImage(img, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
    const d = x.getImageData(0, 0, W, W), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const a = p[i + 3], l = (0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]) * a / 255 + 255 * (255 - a) / 255;
      p[i] = p[i + 1] = p[i + 2] = 0; p[i + 3] = l < 140 ? 255 : 0;
    }
    x.putImageData(d, 0, 0);
    const gx = g.c.getContext('2d'); gx.clearRect(0, 0, W, W); gx.drawImage(t, 0, 0); FG.touch(g);
  };

  // ---------- tracing: piksel -> loop tepi (isi di sisi kanan => outer searah jarum jam) ----------
  function trace(d) {
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < W && d[(y * W + x) * 4 + 3] > 127, E = new Map();
    const add = (a, b, c, e) => { const k = a * 1024 + b; let l = E.get(k); if (!l) E.set(k, l = []); l.push(c * 1024 + e); };
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (on(x, y)) {
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
    const out = [];
    for (const [k, l] of E) while (l.length) {
      let c = l.pop(); const p = [[k >> 10, k & 1023]];
      while (c !== k) { p.push([c >> 10, c & 1023]); const n = E.get(c); if (!n || !n.length) break; c = n.pop(); }
      out.push(p);
    }
    return out;
  }
  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const smooth = (p, k) => {
    if (!k) return p; const n = p.length;
    return p.map((_, i) => { let x = 0, y = 0; for (let j = -k; j <= k; j++) { const q = p[(((i + j) % n) + n) % n]; x += q[0]; y += q[1]; } return [x / (2 * k + 1), y / (2 * k + 1)]; });
  };
  function dp(p, e) {
    if (p.length < 3) return p;
    const a = p[0], b = p[p.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let m = 0, k = 0;
    for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * (p[i][0] - a[0]) - dx * (p[i][1] - a[1])) / L; if (d > m) { m = d; k = i; } }
    return m > e ? dp(p.slice(0, k + 1), e).slice(0, -1).concat(dp(p.slice(k), e)) : [a, b];
  }
  function closedDP(p, e) {
    let f = 0, m = 0;
    for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > m) { m = d; f = i; } }
    return dp(p.slice(0, f + 1), e).slice(0, -1).concat(dp(p.slice(f).concat([p[0]]), e).slice(0, -1));
  }

  // Kontur dalam unit font: [{x,y,on}] ; on=false => titik kontrol kuadratik (TrueType)
  FG.contours = g => {
    const o = FG.opt, key = [o.smooth, o.detail, o.corner, o.slant].join();
    if (g.cache && g.cache.key === key) return g.cache.v;
    const d = g.c.getContext('2d').getImageData(0, 0, W, W).data, tn = Math.tan(o.slant * Math.PI / 180), v = [];
    trace(d).forEach(l => {
      if (l.length < 8 || Math.abs(area(l)) < 12) return;
      const p = closedDP(smooth(l, Math.round(o.smooth)), o.detail), n = p.length;
      if (n < 3) return;
      v.push(p.map((q, i) => {
        const a = p[(i + n - 1) % n], b = p[(i + 1) % n], u = [q[0] - a[0], q[1] - a[1]], w = [b[0] - q[0], b[1] - q[1]];
        const t = Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / ((Math.hypot(...u) * Math.hypot(...w)) || 1)))) * 180 / Math.PI;
        const y = (BASE - q[1]) * S;
        return { x: q[0] * S + y * tn, y, on: t > o.corner };
      }));
    });
    g.cache = { key, v };
    return v;
  };

  // ---------- proyek ----------
  FG.save = () => JSON.stringify({
    v: 1, meta: FG.meta, opt: FG.opt,
    glyphs: Object.fromEntries(Object.entries(FG.glyphs).filter(([, g]) => FG.has(g)).map(([k, g]) => [k, { adv: g.adv, png: g.c.toDataURL() }]))
  });
  FG.load = (txt, cb) => {
    const j = JSON.parse(txt);
    Object.assign(FG.meta, j.meta); Object.assign(FG.opt, j.opt); FG.glyphs = {};
    const es = Object.entries(j.glyphs || {}); let n = es.length;
    if (!n) return cb();
    es.forEach(([k, v]) => { const g = FG.g(k); g.adv = v.adv; FG.restore(g, v.png, () => { if (!--n) cb(); }); });
  };
})();
