/* CONTROLLER: menghubungkan input pengguna ke logika (FG) dan rendering (FG.R) */
(() => {
  const FG = window.FG, R = FG.R, u = FG.ui, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const cur = () => FG.g(FG.cur);
  const toast = t => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), 2400); };
  const out = el => { const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.value; };
  let saveT;
  const autosave = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('fg-project', FG.save()); } catch (e) { } }, 800); };
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const syncAdv = () => { const a = $('#adv'); a.value = cur().adv; out(a); };
  const after = () => { R.editor(); R.thumb(FG.cur); R.progress(); R.preview(); syncAdv(); autosave(); };

  const select = ch => {
    FG.cur = ch; R.mark(); $('#curCh').textContent = ch; syncAdv(); R.editor();
    if (R.btn[ch]) R.btn[ch].scrollIntoView({ block: 'nearest' });
  };
  const step = d => { const l = R.chars(), i = l.indexOf(FG.cur); if (l.length) select(l[(i + d + l.length) % l.length]); };

  // ---------- menggambar ----------
  let down = false, last = null;
  const pt = e => { const r = R.v.getBoundingClientRect(); return [(e.clientX - r.left) * FG.W / r.width, (e.clientY - r.top) * FG.W / r.height]; };
  const stroke = (g, a, b, e) => {
    const x = g.c.getContext('2d'), p = u.pressure && e.pointerType === 'pen' ? Math.max(.15, e.pressure * 1.8) : 1, w = u.size * p;
    const seg = (A, B) => {
      x.globalCompositeOperation = u.tool === 'eraser' ? 'destination-out' : 'source-over';
      x.strokeStyle = x.fillStyle = '#000'; x.lineWidth = w; x.lineCap = u.shape; x.lineJoin = 'round';
      if (A[0] === B[0] && A[1] === B[1]) { if (u.shape === 'round') { x.beginPath(); x.arc(A[0], A[1], w / 2, 0, 7); x.fill(); } else x.fillRect(A[0] - w / 2, A[1] - w / 2, w, w); }
      else { x.beginPath(); x.moveTo(...A); x.lineTo(...B); x.stroke(); }
    };
    seg(a, b);
    if (u.sym) { const m = g.adv / FG.S; seg([m - a[0], a[1]], [m - b[0], b[1]]); }
    x.globalCompositeOperation = 'source-over';
  };
  const bindCanvas = () => {
    R.v.addEventListener('pointerdown', e => { R.v.setPointerCapture(e.pointerId); const g = cur(); FG.snap(g); down = true; last = pt(e); stroke(g, last, last, e); R.editor(true); });
    R.v.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); stroke(cur(), last, p, e); last = p; R.editor(true); });
    const end = () => { if (!down) return; down = false; FG.touch(cur()); after(); };
    R.v.addEventListener('pointerup', end); R.v.addEventListener('pointercancel', end);
  };

  // ---------- kontrol ----------
  const setSeg = (k, v) => { u[k] = v; $$(`[data-seg="${k}"] button`).forEach(b => b.classList.toggle('on', b.dataset.v === v)); };
  const sync = () => {
    $$('[data-ui],[data-opt],[data-meta]').forEach(el => {
      const bag = el.dataset.ui ? u : el.dataset.opt ? FG.opt : FG.meta, k = el.dataset.ui || el.dataset.opt || el.dataset.meta;
      if (el.type === 'checkbox') el.checked = bag[k]; else el.value = bag[k];
      if (el.type === 'range') out(el);
    });
    ['tool', 'shape', 'fmt'].forEach(k => setSeg(k, u[k]));
  };
  const refresh = () => { sync(); R.tabs(); R.grid(); R.progress(); select(FG.cur); R.preview(); };

  const bindControls = () => {
    $$('[data-ui],[data-opt],[data-meta]').forEach(el => {
      const bag = el.dataset.ui ? u : el.dataset.opt ? FG.opt : FG.meta, k = el.dataset.ui || el.dataset.opt || el.dataset.meta;
      el.addEventListener('input', () => {
        bag[k] = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.hasAttribute('data-num')) ? +el.value : el.value;
        if (el.type === 'range') out(el);
        if (k === 'ghostFont' || el.dataset.ui === 'ghost' || el.type === 'checkbox' || el.dataset.opt) R.editor();
        R.preview(); autosave();
      });
    });
    $$('[data-seg]').forEach(box => box.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSeg(box.dataset.seg, b.dataset.v); }));
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; u.tab = b.dataset.v; R.tabMark(); R.grid(); });
    $('#grid').addEventListener('click', e => { const b = e.target.closest('.cell'); if (b) select(b.dataset.c); });
    $('#search').addEventListener('input', e => { u.q = e.target.value; R.grid(); });
    $('#pvText').addEventListener('input', R.preview);
    $('#adv').addEventListener('input', e => { cur().adv = +e.target.value; out(e.target); R.editor(); R.preview(); autosave(); });
    addEventListener('resize', R.preview);

    const act = {
      undo: () => FG.undoG(cur(), after), redo: () => FG.redoG(cur(), after),
      clear: () => { const g = cur(); FG.snap(g); g.c.getContext('2d').clearRect(0, 0, FG.W, FG.W); FG.touch(g); after(); },
      flipH: () => { const g = cur(); FG.xform(g, x => { x.translate(g.adv / FG.S, 0); x.scale(-1, 1); }); after(); },
      flipV: () => { FG.xform(cur(), x => { x.translate(0, FG.L.base + FG.L.cap); x.scale(1, -1); }); after(); },
      auto: () => {
        const g = cur(), b = FG.bounds(g); if (!b) return toast('Karakter masih kosong');
        const dx = FG.opt.sb / FG.S - b.x0; FG.xform(g, x => x.translate(dx, 0));
        g.adv = Math.min(1000, Math.round((b.x1 - b.x0) * FG.S + 2 * FG.opt.sb)); after();
      },
      copy: () => {
        const s = prompt('Salin gambar dari karakter apa? (contoh: O)'); if (!s || !FG.hasCh(s[0])) return toast('Karakter sumber belum digambar');
        const g = cur(), f = FG.glyphs[s[0]]; FG.snap(g); const x = g.c.getContext('2d'); x.clearRect(0, 0, FG.W, FG.W); x.drawImage(f.c, 0, 0); g.adv = f.adv; FG.touch(g); after();
      },
      img: () => $('#imgFile').click(),
      saveP: () => download(new Blob([FG.save()], { type: 'application/json' }), (FG.meta.family || 'font') + '.fontproject.json'),
      loadP: () => $('#projFile').click(),
      spec: () => R.specimen(b => download(b, (FG.meta.family || 'font') + '-spesimen.png')),
      reset: () => { if (confirm('Hapus semua gambar dan mulai dari awal?')) { FG.glyphs = {}; try { localStorage.removeItem('fg-project'); } catch (e) { } refresh(); } },
      theme: () => { const d = document.body.dataset.theme === 'dark'; document.body.dataset.theme = d ? 'light' : 'dark'; try { localStorage.setItem('fg-theme', d ? 'light' : 'dark'); } catch (e) { } R.preview(); },
      export: () => {
        if (![...FG.all()].some(FG.hasCh)) return toast('Gambar minimal satu karakter dulu');
        try { download(u.fmt === 'otf' ? FG.buildOTF() : FG.buildTTF(), `${FG.meta.family}-${FG.meta.style}.${u.fmt}`.replace(/\s+/g, '')); toast(`Font ${u.fmt.toUpperCase()} berhasil dibuat`); }
        catch (e) { toast(e.message); }
      }
    };
    $$('[data-act]').forEach(b => b.addEventListener('click', () => act[b.dataset.act]()));
    $$('[data-nudge]').forEach(b => b.addEventListener('click', () => { const [dx, dy] = b.dataset.nudge.split(',').map(Number); FG.xform(cur(), x => x.translate(dx * 5, dy * 5)); after(); }));

    $('#imgFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return; const i = new Image();
      i.onload = () => { FG.importImage(cur(), i); after(); URL.revokeObjectURL(i.src); toast('Gambar diubah menjadi glyph'); };
      i.src = URL.createObjectURL(f); e.target.value = '';
    });
    $('#projFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => FG.load(t, () => { refresh(); toast('Proyek dimuat'); })).catch(() => toast('File proyek tidak valid')); e.target.value = '';
    });

    addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); (e.shiftKey ? act.redo : act.undo)(); }
      else if (mod && k === 's') { e.preventDefault(); act.saveP(); }
      else if (k === 'p') setSeg('tool', 'pen'); else if (k === 'e') setSeg('tool', 'eraser');
      else if (k === '[' || k === ']') { u.size = Math.max(2, Math.min(80, u.size + (k === ']' ? 4 : -4))); sync(); }
      else if (k.startsWith('arrow')) { e.preventDefault(); const s = e.shiftKey ? 1 : 5, d = { arrowleft: [-s, 0], arrowright: [s, 0], arrowup: [0, -s], arrowdown: [0, s] }[k]; FG.xform(cur(), x => x.translate(...d)); after(); }
      else if (k === 'pagedown') step(1); else if (k === 'pageup') step(-1);
    });
  };

  // ---------- mulai ----------
  addEventListener('DOMContentLoaded', () => {
    R.init(); bindCanvas(); bindControls();
    try { document.body.dataset.theme = localStorage.getItem('fg-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { }
    let saved = null; try { saved = localStorage.getItem('fg-project'); } catch (e) { }
    if (saved) { try { FG.load(saved, refresh); return; } catch (e) { } }
    refresh();
  });
})();
