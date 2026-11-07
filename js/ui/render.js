/* RENDERING: semua yang digambar ke layar (editor, thumbnail, preview, spesimen) */
(() => {
  const FG = window.FG, R = FG.R = {}, $ = s => document.querySelector(s);

  R.init = () => { R.v = $('#view'); R.vx = R.v.getContext('2d'); R.pv = $('#pv'); };

  // ---------- daftar glyph ----------
  R.chars = () => {
    const u = FG.ui;
    const s = u.tab === 'Semua' ? FG.all() : u.tab === 'Terisi' ? [...FG.all()].filter(FG.hasCh).join('') : FG.sets[u.tab];
    return [...s].filter(c => !u.q || u.q.includes(c));
  };
  R.tabs = () => {
    const T = $('#tabs'); T.innerHTML = '';
    ['Semua', ...Object.keys(FG.sets), 'Terisi'].forEach(t => {
      const b = document.createElement('button'); b.textContent = t; b.dataset.v = t; T.append(b);
    });
    R.tabMark();
  };
  R.tabMark = () => document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === FG.ui.tab));
  R.grid = () => {
    const G = $('#grid'); G.innerHTML = ''; R.btn = {};
    R.chars().forEach(c => {
      const b = document.createElement('button'); b.className = 'cell'; b.dataset.c = c;
      b.innerHTML = '<canvas width="56" height="56"></canvas><span></span>'; b.lastChild.textContent = c;
      G.append(b); R.btn[c] = b; R.thumb(c);
    });
    R.mark();
  };
  R.thumb = c => {
    const b = R.btn && R.btn[c]; if (!b) return;
    const x = b.firstChild.getContext('2d'), g = FG.glyphs[c]; x.clearRect(0, 0, 56, 56);
    if (g && FG.has(g)) { x.drawImage(g.c, 0, 0, 56, 56); b.classList.add('done'); } else b.classList.remove('done');
  };
  R.mark = () => {
    document.querySelectorAll('.cell.on').forEach(e => e.classList.remove('on'));
    if (R.btn && R.btn[FG.cur]) R.btn[FG.cur].classList.add('on');
  };
  R.progress = () => {
    const all = [...FG.all()], n = all.filter(FG.hasCh).length;
    $('#bar').style.width = (n / all.length * 100) + '%';
    $('#ptext').textContent = `${n} dari ${all.length} karakter selesai`;
  };

  // ---------- editor ----------
  R.editor = (live) => {
    const g = FG.g(FG.cur), x = R.vx, W = FG.W, L = FG.L, u = FG.ui, ap = g.adv / FG.S;
    x.clearRect(0, 0, W, W); x.fillStyle = '#fbfbf9'; x.fillRect(0, 0, W, W);
    if (u.grid) {
      x.strokeStyle = 'rgba(0,0,0,.07)'; x.lineWidth = 1; x.beginPath();
      for (let i = 0; i <= W; i += 25) { x.moveTo(i, 0); x.lineTo(i, W); x.moveTo(0, i); x.lineTo(W, i); }
      x.stroke();
    }
    x.fillStyle = 'rgba(0,0,0,.035)'; x.fillRect(ap, 0, W - ap, W);
    if (u.ghost) {
      x.fillStyle = 'rgba(0,122,255,.15)'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      x.font = `${(L.base - L.cap) / 0.72}px ${u.ghostFont}`; x.fillText(FG.cur, ap / 2, L.base);
    }
    if (u.guides) {
      const ln = [['asc', 'Ascender', '#8e8e93'], ['cap', 'Tinggi kapital', '#5ac8fa'], ['x', 'Tinggi x', '#5ac8fa'], ['base', 'Baseline', '#ff3b30'], ['desc', 'Descender', '#8e8e93']];
      x.font = '11px -apple-system, system-ui, sans-serif'; x.textAlign = 'left';
      ln.forEach(([k, t, c]) => {
        x.strokeStyle = c; x.fillStyle = c; x.lineWidth = k === 'base' ? 1.5 : 1; x.setLineDash(k === 'base' ? [] : [5, 4]);
        x.beginPath(); x.moveTo(0, L[k] + .5); x.lineTo(W, L[k] + .5); x.stroke(); x.fillText(t, 6, L[k] - 4);
      });
      x.strokeStyle = '#34c759'; x.lineWidth = 1.5; x.setLineDash([2, 4]);
      x.beginPath(); x.moveTo(ap, 0); x.lineTo(ap, W); x.stroke(); x.setLineDash([]);
    }
    x.drawImage(g.c, 0, 0);
    if (u.outline && !live) R.outline(x, g);
  };
  R.outline = (x, g) => {
    const cs = FG.contours(g);
    x.save(); x.translate(0, FG.BASE); x.scale(1 / FG.S, -1 / FG.S);
    const p = new Path2D();
    FG.cmds(cs).forEach(c => { if (c[0] === 'M') p.moveTo(c[1], c[2]); else if (c[0] === 'L') p.lineTo(c[1], c[2]); else if (c[0] === 'Q') p.quadraticCurveTo(c[1], c[2], c[3], c[4]); else p.closePath(); });
    x.strokeStyle = '#ff2d55'; x.lineWidth = 3; x.stroke(p);
    cs.flat().forEach(q => { x.fillStyle = q.on ? '#007aff' : '#ff9500'; x.beginPath(); x.arc(q.x, q.y, q.on ? 5 : 4, 0, 7); x.fill(); });
    x.restore();
  };

  // ---------- gambar glyph vektor ----------
  R.path = g => {
    FG.contours(g);
    if (!g.cache.p2d) {
      const p = new Path2D();
      FG.cmds(g.cache.v).forEach(c => { if (c[0] === 'M') p.moveTo(c[1], c[2]); else if (c[0] === 'L') p.lineTo(c[1], c[2]); else if (c[0] === 'Q') p.quadraticCurveTo(c[1], c[2], c[3], c[4]); else p.closePath(); });
      g.cache.p2d = p;
    }
    return g.cache.p2d;
  };
  const adv = ch => { const g = FG.glyphs[ch]; return g && FG.has(g) ? g.adv : ch === ' ' ? 300 : 500; };
  const drawG = (x, ch, px, py, s) => {
    const g = FG.glyphs[ch]; if (!g || !FG.has(g)) return;
    x.save(); x.translate(px, py); x.scale(s, -s); x.fill(R.path(g)); x.restore();
  };

  R.preview = () => {
    const c = R.pv, x = c.getContext('2d'), dpr = devicePixelRatio || 1, w = c.clientWidth || 600, u = FG.ui, sz = u.pvSize, s = sz / 1000, sp = u.pvSp;
    const txt = $('#pvText').value, lines = [];
    txt.split('\n').forEach(par => {
      let cur = '', cw = 0;
      (par.match(/\S+\s*|\s+/g) || ['']).forEach(t => {
        const tw = [...t].reduce((a, ch) => a + (adv(ch) + sp) * s, 0);
        if (cw + tw > w - 24 && cur) { lines.push(cur); cur = ''; cw = 0; }
        cur += t; cw += tw;
      });
      lines.push(cur);
    });
    const lh = sz * 1.3, h = Math.ceil(lines.length * lh + sz * .3);
    c.width = w * dpr; c.height = h * dpr; c.style.height = h + 'px';
    x.scale(dpr, dpr); x.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#000';
    lines.forEach((ln, i) => { let px = 12; [...ln].forEach(ch => { drawG(x, ch, px, (i + 1) * lh - sz * .1 - sz * .2, s); px += (adv(ch) + sp) * s; }); });
  };

  // ---------- spesimen PNG ----------
  R.specimen = cb => {
    const cs = [...FG.all()].filter(FG.hasCh), cols = 8, cw = 150, rows = Math.max(1, Math.ceil(cs.length / cols));
    const c = document.createElement('canvas'); c.width = cols * cw + 80; c.height = 200 + rows * cw + 40;
    const x = c.getContext('2d'); x.fillStyle = '#fbfbf9'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#1c1c1e'; x.font = '600 44px -apple-system, system-ui, sans-serif'; x.fillText(FG.meta.family + ' ' + FG.meta.style, 40, 80);
    x.fillStyle = '#8e8e93'; x.font = '20px -apple-system, system-ui, sans-serif'; x.fillText(`${cs.length} karakter  •  dibuat dengan Glyphsmith`, 40, 116);
    x.fillStyle = '#1c1c1e';
    cs.forEach((ch, i) => {
      const cx = 40 + (i % cols) * cw, cy = 160 + Math.floor(i / cols) * cw;
      x.strokeStyle = 'rgba(0,0,0,.12)'; x.strokeRect(cx, cy, cw - 10, cw - 10);
      drawG(x, ch, cx + 12, cy + 105, .1);
      x.fillStyle = '#8e8e93'; x.font = '13px -apple-system, system-ui, sans-serif'; x.fillText(ch, cx + 8, cy + cw - 22); x.fillStyle = '#1c1c1e';
    });
    c.toBlob(cb, 'image/png');
  };
})();
