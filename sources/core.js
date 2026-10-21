// ===== Moteur DXF : lecture, éclatement, nettoyage, écriture R12 =====
const DXF = (() => {
  const UNIT_NAMES = {0:'non défini',1:'pouce',2:'pied',4:'mm',5:'cm',6:'m',14:'dm'};
  const UNIT_TO_M = {1:0.0254,2:0.3048,4:0.001,5:0.01,6:1,14:0.1};

  // ---------- Lecture des paires code/valeur ----------
  function decode(buf) {
    const u8 = new Uint8Array(buf);
    const head = new TextDecoder('latin1').decode(u8.subarray(0, 64));
    if (head.startsWith('AutoCAD Binary DXF')) throw new Error("Ce DXF est enregistré en binaire. Demande un DXF « ASCII » (texte) ou ré-enregistre-le en ASCII.");
    if (/^AC10\d\d/.test(head)) throw new Error("C'est un fichier DWG renommé, pas un DXF. Il faut l'exporter en DXF depuis AutoCAD/Revit.");
    let txt = new TextDecoder('utf-8').decode(u8);
    const m = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(txt.slice(0, 4000));
    const ver = m ? m[1] : '';
    if (ver && ver < 'AC1021' && txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(u8);
    return txt;
  }

  function parse(buf) {
    const txt = typeof buf === 'string' ? buf : decode(buf);
    const lines = txt.split(/\r?\n/);
    const n = lines.length - 1;
    let i = 0;
    const next = () => { if (i >= n) return null; const c = parseInt(lines[i], 10); const v = lines[i + 1]; i += 2; return [c, v === undefined ? '' : v.trim()]; };

    const doc = { header: {}, layers: new Map(), blocks: new Map(), ents: [], version: '' };
    let pair = next();
    // lit une entité à partir de "0 TYPE" courant ; renvoie la liste de paires
    function readEnt() {
      const type = pair[1]; const p = [];
      pair = next();
      while (pair && pair[0] !== 0) { p.push(pair); pair = next(); }
      return { type, p };
    }
    function readEntityList(stopTypes) {
      const out = [];
      while (pair && !(pair[0] === 0 && stopTypes.includes(pair[1]))) {
        if (pair[0] !== 0) { pair = next(); continue; }
        const e = readEnt();
        if (e.type === 'POLYLINE') {
          e.verts = [];
          while (pair && pair[0] === 0 && pair[1] === 'VERTEX') e.verts.push(readEnt());
          if (pair && pair[0] === 0 && pair[1] === 'SEQEND') readEnt();
        } else if (e.type === 'INSERT') {
          while (pair && pair[0] === 0 && (pair[1] === 'ATTRIB')) { const a = readEnt(); (e.attribs || (e.attribs = [])).push({ tag: getP(a.p, 2, ''), val: getP(a.p, 1, '') }); }
          if (pair && pair[0] === 0 && pair[1] === 'SEQEND') readEnt();
        }
        out.push(e);
      }
      return out;
    }

    while (pair) {
      if (pair[0] === 0 && pair[1] === 'SECTION') {
        pair = next(); const sec = pair ? pair[1] : ''; pair = next();
        if (sec === 'HEADER') {
          let key = null;
          while (pair && !(pair[0] === 0 && pair[1] === 'ENDSEC')) {
            if (pair[0] === 9) key = pair[1];
            else if (key && !(key in doc.header)) doc.header[key] = pair[1];
            else if (key && (pair[0] === 20 || pair[0] === 30)) doc.header[key] += ',' + pair[1];
            pair = next();
          }
        } else if (sec === 'TABLES') {
          while (pair && !(pair[0] === 0 && pair[1] === 'ENDSEC')) {
            if (pair[0] === 0 && pair[1] === 'LAYER') {
              const e = readEnt(); let name = '', color = 7, flags = 0;
              for (const [c, v] of e.p) { if (c === 2) name = v; else if (c === 62) color = parseInt(v, 10); else if (c === 70) flags = parseInt(v, 10); }
              if (name) doc.layers.set(name, { color: Math.abs(color) || 7, off: color < 0, frozen: !!(flags & 1) });
            } else pair = next();
          }
        } else if (sec === 'BLOCKS') {
          while (pair && !(pair[0] === 0 && pair[1] === 'ENDSEC')) {
            if (pair[0] === 0 && pair[1] === 'BLOCK') {
              const b = readEnt(); let name = '', bx = 0, by = 0;
              for (const [c, v] of b.p) { if (c === 2) name = v; else if (c === 10) bx = +v; else if (c === 20) by = +v; }
              const ents = readEntityList(['ENDBLK']);
              if (pair && pair[1] === 'ENDBLK') readEnt();
              doc.blocks.set(name, { bx, by, ents });
            } else pair = next();
          }
        } else if (sec === 'ENTITIES') {
          doc.ents = readEntityList(['ENDSEC']);
        } else {
          while (pair && !(pair[0] === 0 && pair[1] === 'ENDSEC')) pair = next();
        }
      } else pair = next();
    }
    doc.version = doc.header.$ACADVER || '';
    doc.insunits = parseInt(doc.header.$INSUNITS || '0', 10) || 0;
    return doc;
  }

  // ---------- Géométrie ----------
  // matrice affine [a,b,c,d,e,f] : x' = a x + c y + e ; y' = b x + d y + f
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  const ap = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
  const det = m => m[0]*m[3] - m[1]*m[2];
  function simScale(m) { // facteur d'échelle si similitude, sinon 0
    const s1 = Math.hypot(m[0], m[1]), s2 = Math.hypot(m[2], m[3]);
    if (Math.abs(s1 - s2) > 1e-9 * Math.max(s1, s2) || Math.abs(m[0]*m[2] + m[1]*m[3]) > 1e-9 * s1 * s2) return 0;
    return s1;
  }
  const getP = (p, code, def) => { for (const [c, v] of p) if (c === code) return v; return def; };
  const num = (p, code, def = 0) => { const v = getP(p, code, null); return v === null ? def : parseFloat(v); };
  const ocs = p => (num(p, 230, 1) < 0 ? [-1, 0, 0, 1, 0, 0] : I);

  // Catégories pour les statistiques
  const CAT = {
    LINE: 'geo', ARC: 'geo', CIRCLE: 'geo', LWPOLYLINE: 'geo', POLYLINE: 'geo', ELLIPSE: 'geo', SPLINE: 'geo', POINT: 'point',
    TEXT: 'texte', MTEXT: 'texte', ATTDEF: 'texte', ATTRIB: 'texte',
    DIMENSION: 'cote', ARC_DIMENSION: 'cote', LARGE_RADIAL_DIMENSION: 'cote', LEADER: 'cote', MULTILEADER: 'cote', MLEADER: 'cote', TOLERANCE: 'cote',
    HATCH: 'hachure', SOLID: 'hachure', TRACE: 'hachure', WIPEOUT: 'hachure', MPOLYGON: 'hachure',
  };

  // attributs de bloc qui donnent le nom et l'altitude d'un point
  const NAME_TAG = /^(NOM|NAME|MATRICULE|MAT|NUM|NUMERO|NUMÉRO|NO|N°|ID|PT|POINT|PNT|REPERE|REPÈRE|REF|CIBLE|STATION)$/i, Z_TAG = /^(Z|ALT|ALTI|ALTITUDE|H|NGF|COTE|NIV|NIVEAU|ELEV|ELEVATION|HAUTEUR)$/i;
  function ptAttribs(list) {
    let name = '', z = null;
    for (const { tag, val } of list) {
      const v = (val || '').trim(); if (!v) continue;
      if (z === null && Z_TAG.test(tag.trim())) { const n = parseFloat(v.replace(',', '.').replace(/[^0-9.+-]/g, '')); if (isFinite(n)) z = n; }
      else if (!name && NAME_TAG.test(tag.trim())) name = v.slice(0, 40);
    }
    return { name, z };
  }
  // Éclate tout le dessin en primitives simples, en coordonnées du fichier (unités source)
  // prim : {k:'L'|'A'|'C'|'P'|'T', layer, ...}
  function explode(doc, opt) {
    const prims = [], stats = { geo: 0, point: 0, texte: 0, cote: 0, hachure: 0, autre: 0, inserts: 0 };
    const usedBlocks = new Set();
    const perLayerDropped = new Map();
    const SEG = opt.arcSeg || 48;

    function pushPoly(layer, pts, closed) { if (pts.length >= 2) prims.push({ k: 'P', layer, pts, closed }); }
    function arcPts(cx, cy, r, a0, a1) { // degrés, sens trigo
      let sweep = a1 - a0; while (sweep <= 0) sweep += 360;
      const n = Math.max(4, Math.ceil(SEG * sweep / 360)); const out = [];
      for (let k = 0; k <= n; k++) { const a = (a0 + sweep * k / n) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      return out;
    }
    function bulgeSeg(x0, y0, x1, y1, b) { // renvoie points intermédiaires (hors extrémités)
      const th = 4 * Math.atan(b), d = Math.hypot(x1 - x0, y1 - y0); if (d < 1e-12) return [];
      const r = d / (2 * Math.sin(th / 2)); const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const h = r * Math.cos(th / 2); const ux = -(y1 - y0) / d, uy = (x1 - x0) / d;
      const cx = mx + ux * h, cy = my + uy * h; const a0 = Math.atan2(y0 - cy, x0 - cx);
      const n = Math.max(2, Math.ceil(SEG * Math.abs(th) / (2 * Math.PI))); const out = [];
      for (let k = 1; k < n; k++) { const a = a0 + th * k / n; out.push([cx + Math.abs(r) * Math.cos(a), cy + Math.abs(r) * Math.sin(a)]); }
      return out;
    }
    function emitArc(layer, m, cx, cy, r, a0, a1, full) {
      const s = simScale(m);
      if (s) {
        const [nx, ny] = ap(m, cx, cy);
        if (full) { prims.push({ k: 'C', layer, x: nx, y: ny, r: r * s }); return; }
        const p0 = ap(m, cx + r * Math.cos(a0 * Math.PI / 180), cy + r * Math.sin(a0 * Math.PI / 180));
        const p1 = ap(m, cx + r * Math.cos(a1 * Math.PI / 180), cy + r * Math.sin(a1 * Math.PI / 180));
        let s0 = Math.atan2(p0[1] - ny, p0[0] - nx) * 180 / Math.PI, s1 = Math.atan2(p1[1] - ny, p1[0] - nx) * 180 / Math.PI;
        if (det(m) < 0) [s0, s1] = [s1, s0];
        prims.push({ k: 'A', layer, x: nx, y: ny, r: r * s, a0: (s0 + 360) % 360, a1: (s1 + 360) % 360 });
      } else {
        const pts = full ? arcPts(cx, cy, r, 0, 360) : arcPts(cx, cy, r, a0, a1);
        pushPoly(layer, pts.map(p => ap(m, p[0], p[1])), full);
      }
    }
    function polyWithBulges(layer, m, verts, closed) { // verts: [x,y,bulge]
      const s = simScale(m), flip = det(m) < 0;
      const hasBulge = verts.some(v => Math.abs(v[2]) > 1e-9);
      if (!hasBulge) { pushPoly(layer, verts.map(v => ap(m, v[0], v[1])), closed); return; }
      if (s) { // conserve les arrondis exacts
        prims.push({ k: 'P', layer, closed, pts: verts.map(v => { const q = ap(m, v[0], v[1]); return [q[0], q[1], flip ? -v[2] : v[2]]; }) });
        return;
      }
      const pts = []; const nv = verts.length;
      for (let k = 0; k < nv; k++) {
        const v = verts[k]; pts.push([v[0], v[1]]);
        const w = verts[(k + 1) % nv];
        if ((k < nv - 1 || closed) && Math.abs(v[2]) > 1e-9) pts.push(...bulgeSeg(v[0], v[1], w[0], w[1], v[2]));
      }
      pushPoly(layer, pts.map(p => ap(m, p[0], p[1])), closed);
    }
    function splinePts(p) {
      const deg = num(p, 71, 3); const knots = [], ctrl = [], fit = [], w = [];
      for (const [c, v] of p) { if (c === 40) knots.push(+v); else if (c === 41) w.push(+v); else if (c === 10) ctrl.push([+v, 0]); else if (c === 20) ctrl[ctrl.length - 1][1] = +v; else if (c === 11) fit.push([+v, 0]); else if (c === 21) fit[fit.length - 1][1] = +v; }
      if (ctrl.length < deg + 1 || knots.length !== ctrl.length + deg + 1) return fit.length >= 2 ? fit : ctrl;
      const W = w.length === ctrl.length ? w : ctrl.map(() => 1);
      const t0 = knots[deg], t1 = knots[ctrl.length]; const N = Math.max(16, ctrl.length * 8); const out = [];
      for (let k = 0; k <= N; k++) {
        const t = Math.min(t0 + (t1 - t0) * k / N, t1 - 1e-12 * Math.abs(t1 || 1));
        let s = deg; while (s < ctrl.length - 1 && knots[s + 1] <= t) s++;
        const d = []; for (let j = 0; j <= deg; j++) { const P = ctrl[s - deg + j], ww = W[s - deg + j]; d.push([P[0] * ww, P[1] * ww, ww]); }
        for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
          const ii = s - deg + j; const den = knots[ii + deg - r + 1] - knots[ii]; const a = den ? (t - knots[ii]) / den : 0;
          d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1], (1 - a) * d[j - 1][2] + a * d[j][2]];
        }
        out.push([d[deg][0] / d[deg][2], d[deg][1] / d[deg][2]]);
      }
      return out;
    }

    function walk(ents, m, parentLayer, depth, parentColor, zo) {
      for (const e of ents) {
        if (depth === 0 && getP(e.p, 67, '0') === '1') continue; // espace papier
        let layer = getP(e.p, 8, '0');
        if (layer === '0' && parentLayer !== null) layer = parentLayer;
        let ec = parseInt(getP(e.p, 62, '256'), 10); if (ec === 0) ec = parentColor; else if (!(ec >= 1 && ec <= 255)) ec = null;
        const n0 = prims.length;
        const t = e.type, cat = CAT[t] || (t === 'INSERT' ? 'insert' : 'autre');
        if (t === 'ATTDEF' && opt.keepPoints && parentLayer !== null) continue; // définition d'attribut d'un bloc : sert au nom des points, rien à retirer
        if (cat !== 'geo' && cat !== 'insert' && !(cat === 'point' && opt.keepPoints)) {
          stats[cat] = (stats[cat] || 0) + 1;
          perLayerDropped.set(layer, (perLayerDropped.get(layer) || 0) + 1);
          continue;
        }
        const p = e.p;
        switch (t) {
          case 'LINE': {
            const a = ap(m, num(p, 10), num(p, 20)), b = ap(m, num(p, 11), num(p, 21));
            prims.push({ k: 'L', layer, x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); stats.geo++; break;
          }
          case 'POINT': { const a = ap(m, num(p, 10), num(p, 20)), z = num(p, 30) + (zo || 0); const q = { k: 'T', layer, x: a[0], y: a[1] }; if (z) q.z = z; prims.push(q); stats.point++; break; }
          case 'CIRCLE': case 'ARC': {
            const mm = mul(m, ocs(p));
            emitArc(layer, mm, num(p, 10), num(p, 20), num(p, 40), num(p, 50), num(p, 51), t === 'CIRCLE'); stats.geo++; break;
          }
          case 'LWPOLYLINE': {
            const mm = mul(m, ocs(p)); const verts = [];
            for (const [c, v] of p) { if (c === 10) verts.push([+v, 0, 0]); else if (c === 20 && verts.length) verts[verts.length - 1][1] = +v; else if (c === 42 && verts.length) verts[verts.length - 1][2] = +v; }
            polyWithBulges(layer, mm, verts, (num(p, 70) & 1) === 1); stats.geo++; break;
          }
          case 'POLYLINE': {
            const fl = num(p, 70); if (fl & (16 | 64)) { stats.autre++; break; } // maillages
            const mm = (fl & 8) ? m : mul(m, ocs(p));
            const verts = (e.verts || []).filter(v => !(num(v.p, 70) & 16)).map(v => [num(v.p, 10), num(v.p, 20), num(v.p, 42)]);
            polyWithBulges(layer, mm, verts, (fl & 1) === 1); stats.geo++; break;
          }
          case 'ELLIPSE': {
            const cx = num(p, 10), cy = num(p, 20), mx = num(p, 11), my = num(p, 21), ratio = num(p, 40, 1);
            let t0 = num(p, 41, 0), t1 = num(p, 42, 2 * Math.PI); if (num(p, 230, 1) < 0) { /* rare */ }
            while (t1 <= t0) t1 += 2 * Math.PI;
            const n = Math.max(8, Math.ceil(SEG * (t1 - t0) / (2 * Math.PI))); const pts = [];
            for (let k = 0; k <= n; k++) { const a = t0 + (t1 - t0) * k / n; const c = Math.cos(a), s = Math.sin(a); pts.push(ap(m, cx + mx * c - my * ratio * s, cy + my * c + mx * ratio * s)); }
            pushPoly(layer, pts, false); stats.geo++; break;
          }
          case 'SPLINE': { pushPoly(layer, splinePts(p).map(q => ap(m, q[0], q[1])), (num(p, 70) & 1) === 1); stats.geo++; break; }
          case 'INSERT': {
            const name = getP(p, 2, ''); const blk = doc.blocks.get(name); if (!blk || depth > 20) break;
            if (name.startsWith('*D') || name.startsWith('*d')) { stats.cote++; break; }
            usedBlocks.add(name); stats.inserts++;
            const sx = num(p, 41, 1), sy = num(p, 42, 1), rot = num(p, 50, 0) * Math.PI / 180;
            const cols = Math.max(1, num(p, 70, 1)), rows = Math.max(1, num(p, 71, 1)), dc = num(p, 44, 0), dr = num(p, 45, 0);
            const c = Math.cos(rot), s = Math.sin(rot);
            const color0 = getP(p, 62, null);
            for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
              const ox = q * dc, oy = r * dr;
              const ix = num(p, 10) + c * ox - s * oy, iy = num(p, 20) + s * ox + c * oy;
              let loc = [c * sx, s * sx, -s * sy, c * sy, ix, iy];
              loc = mul(loc, [1, 0, 0, 1, -blk.bx, -blk.by]);
              const nb = prims.length;
              walk(blk.ents, mul(m, mul(ocs(p), loc)), layer, depth + 1, ec, (zo || 0) + num(p, 30));
              if (e.attribs && opt.keepPoints) { // nom / altitude d'un point portés par les attributs du bloc (cible de géomètre, point exporté par l'outil)
                const at = ptAttribs(e.attribs);
                if (at.name || at.z !== null) {
                  let pts = 0;
                  for (let k = nb; k < prims.length; k++) if (prims[k].k === 'T') { pts++; if (at.name) prims[k].name = at.name; if (at.z !== null) prims[k].zm = at.z; }
                  if (!pts && at.z !== null && r === 0 && q === 0) { const a = ap(m, num(p, 10), num(p, 20)); const pt = { k: 'T', layer, x: a[0], y: a[1], zm: at.z }; if (at.name) pt.name = at.name; prims.push(pt); stats.point++; }
                }
              }
            }
            break;
          }
        }
        if (ec && t !== 'INSERT') for (let k = n0; k < prims.length; k++) prims[k].c = ec;
      }
    }
    walk(doc.ents, opt.matrix || I, null, 0, null, 0);
    return { prims, stats, usedBlocks, perLayerDropped };
  }

  // ---------- Écriture DXF R12 ----------
  function cleanName(name) {
    let s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9_\-$]/g, '_');
    return s.slice(0, 31) || 'CALQUE';
  }
  function layerNameMap(names) {
    const map = new Map(), used = new Set(['0']);
    for (const n of names) {
      if (n === '0') { map.set(n, '0'); continue; }
      let base = cleanName(n), s = base, k = 2;
      while (used.has(s)) { const suf = '_' + k++; s = base.slice(0, 31 - suf.length) + suf; }
      used.add(s); map.set(n, s);
    }
    return map;
  }

  // prims en unités source ; scale -> mètres
  function write(prims, layersInfo, o) {
    const sc = o.scale, dec = o.decimals ?? 4, explodePoly = o.explodePoly;
    const f = v => { let s = (v * sc).toFixed(dec); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; };
    const fa = v => { let s = v.toFixed(4); s = s.replace(/0+$/, '').replace(/\.$/, ''); return s; };
    const usedLayers = [...new Set(prims.map(p => p.layer))];
    const lmap = layerNameMap(usedLayers);
    const out = [];
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const ext = (x, y) => { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; };
    const seen = o.dedupe ? new Set() : null;
    const tol = Math.pow(10, -dec) / 2;
    let count = 0, dups = 0, tiny = 0;

    const line = (L, a, b, c, d) => {
      const x1 = f(a), y1 = f(b), x2 = f(c), y2 = f(d);
      if (x1 === x2 && y1 === y2) { tiny++; return; }
      if (seen) { const k1 = x1 + ',' + y1 + ',' + x2 + ',' + y2, k2 = x2 + ',' + y2 + ',' + x1 + ',' + y1; if (seen.has(k1) || seen.has(k2)) { dups++; return; } seen.add(k1); }
      out.push('0\nLINE\n8\n' + L + '\n10\n' + x1 + '\n20\n' + y1 + '\n30\n0\n11\n' + x2 + '\n21\n' + y2 + '\n31\n0\n' + CS); count++;
      ext(a, b); ext(c, d);
    };
    const arc = (L, x, y, r, a0, a1) => {
      if (r * sc < tol) { tiny++; return; }
      const X = f(x), Y = f(y), R = f(r);
      if (seen) { const k = 'A' + X + ',' + Y + ',' + R + ',' + fa(a0) + ',' + fa(a1); if (seen.has(k)) { dups++; return; } seen.add(k); }
      out.push('0\nARC\n8\n' + L + '\n10\n' + X + '\n20\n' + Y + '\n30\n0\n40\n' + R + '\n50\n' + fa(a0) + '\n51\n' + fa(a1) + '\n' + CS); count++;
      ext(x - r, y - r); ext(x + r, y + r);
    };
    let CS = '', usePt = false;
    const fz = v => { let s = v.toFixed(Math.max(3, dec)); s = s.replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; };
    const txt = v => String(v).replace(/[\r\n]+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').slice(0, 40);
    for (const p of prims) {
      const L = lmap.get(p.layer); CS = p.c && !(o.override && o.override.has(p.layer)) ? '62\n' + p.c + '\n' : '';
      if (p.k === 'L') line(L, p.x1, p.y1, p.x2, p.y2);
      else if (p.k === 'A') arc(L, p.x, p.y, p.r, p.a0, p.a1);
      else if (p.k === 'C') {
        if (p.r * sc < tol) { tiny++; continue; }
        const X = f(p.x), Y = f(p.y), R = f(p.r);
        if (seen) { const k = 'C' + X + ',' + Y + ',' + R; if (seen.has(k)) { dups++; continue; } seen.add(k); }
        out.push('0\nCIRCLE\n8\n' + L + '\n10\n' + X + '\n20\n' + Y + '\n30\n0\n40\n' + R + '\n' + CS); count++; ext(p.x - p.r, p.y - p.r); ext(p.x + p.r, p.y + p.r);
      } else if (p.k === 'T') {
        const nm = o.ptName ? o.ptName(p) : (p.name || ''), z = o.ptZ ? o.ptZ(p) : (p.zm ?? (p.z ? p.z * sc : null)), Z = z === null || !isFinite(z) ? '0' : fz(z);
        if (nm || z !== null) { // point nommé : bloc PT_STATION (un POINT) + attributs NOM et ALT, invisibles
          usePt = true;
          const att = (tag, v) => '0\nATTRIB\n8\n' + L + '\n10\n' + f(p.x) + '\n20\n' + f(p.y) + '\n30\n' + Z + '\n40\n0.2\n1\n' + v + '\n2\n' + tag + '\n70\n1\n';
          out.push('0\nINSERT\n8\n' + L + '\n' + CS + '66\n1\n2\nPT_STATION\n10\n' + f(p.x) + '\n20\n' + f(p.y) + '\n30\n' + Z + '\n' +
            att('NOM', txt(nm)) + att('ALT', z === null ? '' : Z) + '0\nSEQEND\n8\n' + L + '\n');
        } else out.push('0\nPOINT\n8\n' + L + '\n10\n' + f(p.x) + '\n20\n' + f(p.y) + '\n30\n0\n' + CS);
        count++; ext(p.x, p.y);
      } else if (p.k === 'P') {
        const pts = p.pts, n = pts.length, segs = p.closed ? n : n - 1;
        if (explodePoly) {
          for (let k = 0; k < segs; k++) {
            const a = pts[k], b = pts[(k + 1) % n], bu = a[2] || 0;
            if (Math.abs(bu) < 1e-9) line(L, a[0], a[1], b[0], b[1]);
            else { // arc depuis bulge
              const th = 4 * Math.atan(bu), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1e-12) continue;
              const r = d / (2 * Math.sin(Math.abs(th) / 2)); const h = r * Math.cos(Math.abs(th) / 2) * Math.sign(bu);
              const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ux = -(b[1] - a[1]) / d, uy = (b[0] - a[0]) / d;
              const cx = mx + ux * h, cy = my + uy * h;
              let s0 = Math.atan2(a[1] - cy, a[0] - cx) * 180 / Math.PI, s1 = Math.atan2(b[1] - cy, b[0] - cx) * 180 / Math.PI;
              if (bu < 0) [s0, s1] = [s1, s0];
              arc(L, cx, cy, r, (s0 + 360) % 360, (s1 + 360) % 360);
            }
          }
        } else {
          let s = '0\nPOLYLINE\n8\n' + L + '\n' + CS + '66\n1\n10\n0\n20\n0\n30\n0\n70\n' + (p.closed ? 1 : 0) + '\n';
          for (const q of pts) { s += '0\nVERTEX\n8\n' + L + '\n10\n' + f(q[0]) + '\n20\n' + f(q[1]) + '\n30\n0\n'; if (q[2]) s += '42\n' + q[2].toFixed(6) + '\n'; ext(q[0], q[1]); }
          s += '0\nSEQEND\n8\n' + L + '\n'; out.push(s); count++;
        }
      }
    }
    if (!isFinite(minx)) { minx = miny = maxx = maxy = 0; }
    const names = [...lmap.values()];
    let h = '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSBASE\n10\n0\n20\n0\n30\n0\n9\n$EXTMIN\n10\n' + f(minx) + '\n20\n' + f(miny) + '\n30\n0\n9\n$EXTMAX\n10\n' + f(maxx) + '\n20\n' + f(maxy) + '\n30\n0\n9\n$LUNITS\n70\n2\n9\n$LUPREC\n70\n' + dec + '\n0\nENDSEC\n';
    h += '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB\n';
    h += '0\nTABLE\n2\nLAYER\n70\n' + (names.length + 1) + '\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n';
    for (const [orig, nm] of lmap) { if (nm === '0') continue; const c = (layersInfo.get(orig) || {}).color || 7; h += '0\nLAYER\n2\n' + nm + '\n70\n0\n62\n' + (o.layerColor ? (o.layerColor.get(orig) || c) : c) + '\n6\nCONTINUOUS\n'; }
    const attdef = (tag, prompt) => '0\nATTDEF\n8\n0\n10\n0\n20\n0\n30\n0\n40\n0.2\n1\n\n3\n' + prompt + '\n2\n' + tag + '\n70\n1\n';
    const blocks = usePt ? '0\nBLOCK\n8\n0\n2\nPT_STATION\n70\n2\n10\n0\n20\n0\n30\n0\n3\nPT_STATION\n0\nPOINT\n8\n0\n10\n0\n20\n0\n30\n0\n' + attdef('NOM', 'Nom du point') + attdef('ALT', 'Altitude') + '0\nENDBLK\n8\n0\n' : '';
    h += '0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nBLOCKS\n' + blocks + '0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
    const text = h + out.join('') + '0\nENDSEC\n0\nEOF\n';
    return { text: text.replace(/\n/g, '\r\n'), count, dups, tiny, layers: names.length, lmap, ext: [minx * sc, miny * sc, maxx * sc, maxy * sc] };
  }

  return { parse, explode, write, cleanName, UNIT_NAMES, UNIT_TO_M, CAT };
})();
if (typeof module !== 'undefined') module.exports = DXF;
