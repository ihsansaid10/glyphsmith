/* LOGIKA EKSPOR: TTF ditulis manual (tabel sfnt), OTF (CFF) lewat opentype.js */
(() => {
  const FG = window.FG;
  class B {
    constructor() { this.a = []; }
    u8(v) { this.a.push(v & 255); return this; }
    u16(v) { return this.u8(v >> 8).u8(v); }
    i16(v) { return this.u16(v & 65535); }
    u32(v) { return this.u16(v >>> 16).u16(v & 65535); }
    str(s) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
    u16s(s) { for (let i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)); return this; }
  }
  const sum = a => { let s = 0; for (let i = 0; i < a.length; i += 4) s = (s + (((a[i] << 24) | (a[i + 1] << 16) | (a[i + 2] << 8) | a[i + 3]) >>> 0)) >>> 0; return s; };

  // daftar glyph final (.notdef, space, lalu semua yang digambar)
  FG.glyphList = () => {
    const sq = a => a.map(([x, y]) => ({ x, y, on: true }));
    const gl = [
      { name: '.notdef', code: null, adv: 600, contours: [sq([[50, 0], [50, 700], [550, 700], [550, 0]]), sq([[100, 50], [500, 50], [500, 650], [100, 650]])] },
      { name: 'space', code: 32, adv: 300, contours: [] }
    ];
    [...FG.all()].forEach(ch => {
      const g = FG.glyphs[ch]; if (!g || !FG.has(g)) return;
      const cs = FG.contours(g).map(c => c.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), on: p.on }))).filter(c => c.length > 2);
      const code = ch.codePointAt(0);
      gl.push({ name: 'uni' + code.toString(16).toUpperCase().padStart(4, '0'), code, adv: Math.round(g.adv), contours: cs });
    });
    return gl;
  };

  // kontur on/off-curve -> perintah M/L/Q/Z (dipakai preview & OTF)
  const contourCmds = c => {
    const n = c.length, s = c.findIndex(p => p.on); let start, seq;
    if (s < 0) { start = { x: (c[n - 1].x + c[0].x) / 2, y: (c[n - 1].y + c[0].y) / 2 }; seq = c; }
    else { start = c[s]; seq = c.slice(s + 1).concat(c.slice(0, s)); }
    const cm = [['M', start.x, start.y]]; let ctl = null;
    const q = (a, x, y) => cm.push(['Q', a.x, a.y, x, y]);
    for (const p of seq) {
      if (p.on) { if (ctl) { q(ctl, p.x, p.y); ctl = null; } else cm.push(['L', p.x, p.y]); }
      else { if (ctl) q(ctl, (ctl.x + p.x) / 2, (ctl.y + p.y) / 2); ctl = p; }
    }
    if (ctl) q(ctl, start.x, start.y);
    cm.push(['Z']); return cm;
  };
  FG.cmds = cs => cs.flatMap(contourCmds);

  FG.buildTTF = () => {
    const m = FG.meta, o = FG.opt, gl = FG.glyphList(), n = gl.length;
    const chunks = [], loca = new B(); let off = 0, maxP = 0, maxC = 0, X0 = 1e9, Y0 = 1e9, X1 = -1e9, Y1 = -1e9;
    gl.forEach(g => {
      const pts = g.contours.flat(); loca.u32(off);
      if (!pts.length) { g.bb = [0, 0, 0, 0]; return; }
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y), bb = g.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      maxP = Math.max(maxP, pts.length); maxC = Math.max(maxC, g.contours.length);
      X0 = Math.min(X0, bb[0]); Y0 = Math.min(Y0, bb[1]); X1 = Math.max(X1, bb[2]); Y1 = Math.max(Y1, bb[3]);
      const b = new B(); b.i16(g.contours.length); bb.forEach(v => b.i16(v));
      let e = -1; g.contours.forEach(c => { e += c.length; b.u16(e); }); b.u16(0);
      pts.forEach(p => b.u8(p.on ? 1 : 0));
      let q = 0; pts.forEach(p => { b.i16(p.x - q); q = p.x; });
      q = 0; pts.forEach(p => { b.i16(p.y - q); q = p.y; });
      while (b.a.length % 4) b.u8(0);
      chunks.push(b.a); off += b.a.length;
    });
    loca.u32(off);
    const glyf = chunks.flat();

    // cmap format 4 (satu segmen per karakter)
    const cm = gl.map((g, i) => [g.code, i]).filter(e => e[0] != null).sort((a, b) => a[0] - b[0]);
    const sc = cm.length + 1, f = new B(), sr = 2 * 2 ** Math.floor(Math.log2(sc));
    f.u16(4).u16(16 + sc * 8).u16(0).u16(sc * 2).u16(sr).u16(Math.log2(sr / 2)).u16(sc * 2 - sr);
    cm.forEach(e => f.u16(e[0])); f.u16(0xFFFF); f.u16(0);
    cm.forEach(e => f.u16(e[0])); f.u16(0xFFFF);
    cm.forEach(e => f.u16((e[1] - e[0]) & 65535)); f.u16(1);
    cm.forEach(() => f.u16(0)); f.u16(0);
    const cmap = new B().u16(0).u16(1).u16(3).u16(1).u32(12); cmap.a.push(...f.a);

    // name
    const fam = m.family || 'Font', sty = m.style || 'Regular', ps = (fam + '-' + sty).replace(/[^A-Za-z0-9-]/g, '');
    const nm = [[0, m.copyright], [1, fam], [2, sty], [3, `${fam} ${sty} ${m.version}`], [4, `${fam} ${sty}`], [5, 'Version ' + m.version], [6, ps]].filter(e => e[1]);
    const name = new B().u16(0).u16(nm.length).u16(6 + 12 * nm.length); let so = 0;
    nm.forEach(([id, s]) => { name.u16(3).u16(1).u16(0x409).u16(id).u16(s.length * 2).u16(so); so += s.length * 2; });
    nm.forEach(([, s]) => name.u16s(s));

    const italic = /italic|oblique/i.test(sty) || o.slant > 0, bold = m.weight >= 600;
    const now = Math.floor(Date.now() / 1000) + 2082844800;
    const head = new B().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5F0F3CF5).u16(3).u16(1000)
      .u32(0).u32(now).u32(0).u32(now).i16(X0).i16(Y0).i16(X1).i16(Y1).u16((bold ? 1 : 0) | (italic ? 2 : 0)).u16(8).i16(2).i16(1).i16(0);
    const advMax = Math.max(...gl.map(g => g.adv)), avg = Math.round(gl.reduce((s, g) => s + g.adv, 0) / n);
    const hhea = new B().u32(0x00010000).i16(FG.ASC).i16(FG.DESC).i16(0).u16(advMax).i16(0).i16(0).i16(X1).i16(1).i16(0).i16(0)
      .i16(0).i16(0).i16(0).i16(0).i16(0).u16(n);
    const hmtx = new B(); gl.forEach(g => hmtx.u16(g.adv).i16(g.bb[0]));
    const maxp = new B().u32(0x00010000).u16(n).u16(maxP).u16(maxC).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
    const codes = cm.map(e => e[0]);
    const os2 = new B().u16(4).i16(avg).u16(m.weight).u16(5).u16(0);
    [50, 50, 0, 0, 50, 50, 0, 0, 50, 250].forEach(v => os2.i16(v)); os2.i16(0);
    for (let i = 0; i < 10; i++) os2.u8(0);
    os2.u32(3).u32(0).u32(0).u32(0).str('FGEN').u16(italic ? 1 : bold ? 32 : 64).u16(codes[0] || 32).u16(Math.min(65535, codes[codes.length - 1] || 32))
      .i16(FG.ASC).i16(FG.DESC).i16(0).u16(Math.max(FG.ASC, Y1)).u16(Math.max(-FG.DESC, -Y0))
      .u32(1).u32(0).i16((FG.BASE - FG.L.x) * FG.S).i16((FG.BASE - FG.L.cap) * FG.S).u16(32).u16(32).u16(1);
    const post = new B().u32(0x00030000).u32(Math.round(-o.slant * 65536) >>> 0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

    const T = { 'OS/2': os2.a, cmap: cmap.a, glyf, head: head.a, hhea: hhea.a, hmtx: hmtx.a, loca: loca.a, maxp: maxp.a, name: name.a, post: post.a };
    const tags = Object.keys(T).sort(), nt = tags.length, dir = new B();
    const dsr = 16 * 2 ** Math.floor(Math.log2(nt));
    dir.u32(0x00010000).u16(nt).u16(dsr).u16(Math.log2(dsr / 16)).u16(nt * 16 - dsr);
    let p = 12 + 16 * nt, headOff = 0;
    tags.forEach(t => {
      const a = T[t], len = a.length; while (a.length % 4) a.push(0);
      if (t === 'head') headOff = p;
      dir.str(t).u32(sum(a)).u32(p).u32(len); p += a.length;
    });
    const out = new Uint8Array(p); out.set(dir.a, 0);
    let q = 12 + 16 * nt; tags.forEach(t => { out.set(T[t], q); q += T[t].length; });
    new DataView(out.buffer).setUint32(headOff + 8, (0xB1B0AFBA - sum(out)) >>> 0);
    return new Blob([out], { type: 'font/ttf' });
  };

  FG.buildOTF = () => {
    if (!window.opentype) throw new Error('opentype.js belum termuat. OTF butuh koneksi internet untuk memuat pustaka.');
    const m = FG.meta, glyphs = FG.glyphList().map(g => {
      const p = new opentype.Path();
      FG.cmds(g.contours).forEach(c => {
        if (c[0] === 'M') p.moveTo(c[1], c[2]); else if (c[0] === 'L') p.lineTo(c[1], c[2]);
        else if (c[0] === 'Q') p.quadraticCurveTo(c[1], c[2], c[3], c[4]); else p.close();
      });
      return new opentype.Glyph({ name: g.name, unicode: g.code == null ? undefined : g.code, advanceWidth: g.adv, path: p });
    });
    const font = new opentype.Font({ familyName: m.family || 'Font', styleName: m.style || 'Regular', unitsPerEm: FG.UPM, ascender: FG.ASC, descender: FG.DESC, glyphs });
    return new Blob([font.toArrayBuffer()], { type: 'font/otf' });
  };
})();
