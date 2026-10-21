// ===== Interface =====
(() => {
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
  const fmt = (v, d = 2) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtInt = v => v.toLocaleString('fr-FR');
  const MO = 1048576, LIMIT = 3 * MO;
  const fmtSize = b => b >= MO ? fmt(b / MO, 2) + ' Mo' : fmt(b / 1024, 0) + ' ko';
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Couleurs AutoCAD (ACI) ----------
  const ACI_HEX = (() => {
    const t = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#808080', '#c0c0c0'];
    const vs = [1, 1, .65, .65, .5, .5, .3, .3, .15, .15];
    for (let i = 10; i < 250; i++) {
      const h = Math.floor((i - 10) / 10) * 15, k = (i - 10) % 10, v = vs[k], s = k % 2 ? .5 : 1;
      const f = n => { const kk = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1)); };
      t.push('#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''));
    }
    for (const g of [0x33, 0x50, 0x69, 0x82, 0xbe, 0xff]) t.push('#' + g.toString(16).padStart(2, '0').repeat(3));
    return t;
  })();
  const ACI = ACI_HEX.map(hex => { // éclaircir les couleurs trop sombres pour le fond noir
      let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      if (L < 0.35) { const k = L < 0.01 ? 1 : 0.35 / L; if (L < 0.01) { r = g = b = 140; } else { r = Math.min(255, r * k + 40); g = Math.min(255, g * k + 40); b = Math.min(255, b * k + 40); } }
      return 'rgb(' + [r, g, b].map(Math.round).join(',') + ')';
    });
  const ACI_L = ACI_HEX.map((hex, i) => { // fond blanc : le blanc devient noir, les couleurs trop claires sont foncées
    if (i === 7 || i === 255) return '#111111';
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const L = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    if (L > 0.5) { const k = 0.5 / L; r *= k; g *= k; b *= k; }
    return 'rgb(' + [r, g, b].map(Math.round).join(',') + ')';
  });
  let lightBg = false; try { lightBg = localStorage.getItem('dxfstation.lightbg') === '1'; } catch (e) {}

  // ---------- État ----------
  const S = {
    name: '', size: 0, doc: null, ex: null, layers: [], // {name, color, count, on, auto}
    factor: 1, ext: null, origin: [0, 0], paths: null, snap: null,
    view: { s: 1, tx: 0, ty: 0 }, ghost: false, measure: false, m1: null, m2: null, hover: null, hoverLayer: null,
    out: null, sample: false,
    dups: false, dupData: null, ref: null, refShow: true, mode: 'nav', showPts: true, info: null, created: [],
    erase: false, del: new Set(), sel: new Set(), undo: [], hoverPrim: null, rect: null,
  };
  const MEM_KEY = 'dxfstation.layers.v1';
  const memGet = () => { try { return JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); } catch (e) { return {}; } };
  const memSet = m => { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch (e) {} };
  const COL_KEY = 'dxfstation.colors.v1';
  const colGet = () => { try { return JSON.parse(localStorage.getItem(COL_KEY) || '{}'); } catch (e) { return {}; } };
  const colSet = m => { try { localStorage.setItem(COL_KEY, JSON.stringify(m)); } catch (e) {} };
  const REN_KEY = 'dxfstation.renames.v1';
  const renGet = () => { try { return JSON.parse(localStorage.getItem(REN_KEY) || '{}'); } catch (e) { return {}; } };
  const renSet = m => { try { localStorage.setItem(REN_KEY, JSON.stringify(m)); } catch (e) {} };
  const shown = l => l.rename || l.name;
  const NEW_LAYER = 'POINTS_CREES', NEW_COLOR = 30, LINE_LAYER = 'LIGNES_CREES', LINE_COLOR = 140; let uidSeq = 0;
  const PALETTE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 90, 110, 130, 150, 170, 190, 210, 230, 11, 31, 51, 91, 141, 171, 221, 250];
  const AUTO_OFF = /(cot(e|ation)|dim|text|txt|anno|hach|hatch|cartouche|title|legend|mobilier|furn|symb|nomenc|grille|grid)/i;

  // ---------- Plusieurs plans : un onglet par fichier ----------
  const PK = ['fh', 'fhOk', 'savedAt', 'ptMeta', 'ptList', 'xf', 'outBase', 'hist', 'histPos', 'moves', 'newLayers', 'name', 'size', 'doc', 'ex', 'layers', 'factor', 'unitReason', 'declared', 'ext', 'rext', 'origin', 'paths', 'snap', 'hit', 'del', 'undo', 'created', 'sel', 'info',
    'userView', 'out', 'outBytes', 'reused', 'sample', 'delGroup', 'selGroup', 'dupData', 'originDist'];
  const plans = []; let cur = -1;
  function savePlan() { if (cur < 0 || !plans[cur]) return; const st = plans[cur].st; for (const k of PK) st[k] = S[k]; st.view = Object.assign({}, S.view); }
  // modifications non enregistrées : l'étape d'historique courante n'est pas celle du dernier enregistrement
  const isDirty = st => !!(st && st.hist && st.hist.length && st.savedAt !== st.hist[st.histPos]);
  const anyDirty = () => plans.some((p, i) => !p.st.sample && isDirty(stOf(i)));
  function markSaved() { if (S.hist) S.savedAt = S.hist[S.histPos]; savePlan(); renderTabs(); updateSaveUI(); }
  function syncUnitUI() {
    const opt = [...$('unit').options].find(o => +o.value === S.factor);
    $('unit').value = opt ? opt.value : 'custom'; $('factor').hidden = !!opt; $('factor').value = S.factor;
  }
  function activate(i, quiet) {
    if (i === cur && !quiet) return;
    savePlan(); cur = i; const st = plans[i].st;
    for (const k of PK) S[k] = st[k]; S.view = Object.assign({}, st.view);
    S.hoverPrim = null; S.rect = null; S.m1 = S.m2 = S.hover = null;
    syncUnitUI(); autoRef();
    plans[i].badge = cur === 0 || !S.ref ? (cur === 0 && plans.length > 1 ? 'ref' : '') : (S.ref.verdict ? S.ref.verdict.kind : '');
    if (quiet) return;
    setMode('nav'); closeColorPop(); $('infoBox').hidden = true;
    renderLayers(); updateEraseBar(); updateAll(); renderTabs(); renderHist(); renderXf(); autoFolds(); updateSaveUI();
    if (!S.userView) fit(); else draw();
  }
  function autoRef() {
    if (S.ref && !S.ref.auto) { buildRef(true); return; }
    if (plans.length > 1 && cur > 0) {
      const p0 = plans[0].st, on0 = new Map(p0.layers.map(l => [l.name, l.on]));
      setRef(p0.name, p0.doc, p0.ex.prims.filter(p => p.k !== 'T' && on0.get(p.layer) && !p0.del.has(p.sig)), p0.factor, p0.xf);
      S.ref.auto = true;
    } else { S.ref = null; $('refInfo').hidden = true; }
  }
  const short = n => n.replace(/\.dxf$/i, '');
  // nom de l'onglet = nom du fichier exporté
  const stOf = i => i === cur ? S : plans[i].st;
  const defaultBase = st => (st.name || '').replace(/\.dxf$/i, '') || 'plan';
  const cleanFile = v => v.replace(/\.dxf$/i, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  const baseName = () => S.outBase || defaultBase(S);
  const tabLabel = i => stOf(i).outBase || short(stOf(i).name || '');
  const tabTitle = i => { const st = stOf(i); return (st.outBase ? 'Fichier reçu : ' + st.name + '\n' : '') + 'Exporté sous : ' + (st.outBase || defaultBase(st)) + '.dxf\nDouble-clic pour renommer'; };
  function renameTab(i) {
    if (i !== cur) activate(i);
    const tab = $('plans').querySelector('[data-tab="' + i + '"]'); if (!tab) return;
    const pn = tab.querySelector('.pn'), inp = document.createElement('input');
    inp.className = 'tabname'; inp.id = 'tabname'; inp.maxLength = 80; inp.value = S.outBase || short(S.name); inp.setAttribute('aria-label', 'Nom du plan et du fichier exporté');
    pn.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const end = save => {
      if (done) return; done = true;
      if (save) {
        const v = cleanFile(inp.value), before = baseName();
        S.outBase = v && v !== short(S.name) && v !== defaultBase(S) ? v : null;
        if (baseName() !== before) commit('Plan renommé : ' + baseName() + '.dxf');
      }
      renderTabs();
      $('dlMsg').textContent = 'Le plan sera exporté sous : ' + baseName() + '.dxf';
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } });
    inp.addEventListener('blur', () => end(true));
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('dblclick', e => e.stopPropagation());
  }
  const addBtn = document.createElement('button'); addBtn.className = 'padd'; addBtn.type = 'button'; addBtn.id = 'addPlan'; addBtn.textContent = '+ Ajouter un étage';
  addBtn.onclick = () => pickFiles();
  function renderTabs() {
    const real = plans.filter(p => !p.st.sample);
    if (!real.length) { $('plans').innerHTML = ''; $('applyAll').hidden = $('dlAllBtn').hidden = true; return; }
    const lbl = { ref: 'Référence', ok: 'Origine OK', bad: 'Origine décalée', warn: 'À vérifier' };
    if (addBtn.parentNode !== $('plans')) { $('plans').innerHTML = '<div id="tabList" style="display:contents"></div>'; $('plans').appendChild(addBtn); }
    $('tabList').innerHTML = plans.map((p, i) => '<div class="ptab' + (i === cur ? ' cur' : '') + '" data-tab="' + i + '" role="button" tabindex="0" title="' + esc(tabTitle(i)) + '"><span class="pn">' + esc(tabLabel(i)) + '</span>' + (isDirty(stOf(i)) ? '<span class="unsaved" title="Modifications non enregistrées"></span>' : '') +
      (p.badge && plans.length > 1 ? '<span class="bd ' + p.badge + '">' + (p.badge === 'ok' ? '✓ ' : p.badge === 'bad' ? '⚠ ' : '') + lbl[p.badge] + '</span>' : '') +
      '<button class="rn" type="button" data-rename="' + i + '" aria-label="Renommer ' + esc(tabLabel(i)) + '" title="Renommer (nom du fichier exporté)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button>' +
      '<button class="x" type="button" data-close="' + i + '" aria-label="Fermer ' + esc(tabLabel(i)) + '" title="Fermer ce plan">×</button></div>').join('');
    // le bouton « Ajouter » reste en place (hors de la liste redessinée) : sinon un clic pendant un redessin serait perdu
    $('applyAll').hidden = $('dlAllBtn').hidden = plans.length < 2;
    $('dlAllLabel').textContent = 'Tout télécharger (' + plans.length + ' plans, .zip)';
  }
  $('plans').addEventListener('click', e => {
    if (e.target.closest('input.tabname')) return;
    const x = e.target.closest('[data-close]'); if (x) { closePlan(+x.dataset.close); return; }
    const rn = e.target.closest('[data-rename]'); if (rn) { renameTab(+rn.dataset.rename); return; }
    const t = e.target.closest('[data-tab]'); if (t) activate(+t.dataset.tab);
  });
  $('plans').addEventListener('dblclick', e => { const t = e.target.closest('[data-tab]'); if (!t || e.target.closest('button, input')) return; renameTab(+t.dataset.tab); });
  $('plans').addEventListener('keydown', e => { if (e.target.closest('input')) return; if (e.key === 'F2') { e.preventDefault(); const t = e.target.closest('[data-tab]'); if (t) renameTab(+t.dataset.tab); return; } const t = e.target.closest('[data-tab]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); activate(+t.dataset.tab); } });
  function closePlan(i) {
    savePlan();
    if (isDirty(plans[i].st) && !confirm('« ' + tabLabel(i) + ' » a des modifications non enregistrées.\n\nFermer quand même et les perdre ?')) return; plans.splice(i, 1);
    if (!plans.length) { cur = -1; S.ref = null; loadFiles(null); return; }
    const next = Math.min(i, plans.length - 1); cur = -1;
    if (S.ref && S.ref.auto) S.ref = null;
    refreshBadges(); activate(next, true); cur = next; activate(next, true);
    setMode('nav'); renderLayers(); updateEraseBar(); updateAll(); renderTabs(); if (!S.userView) fit(); else draw();
  }
  function refreshBadges() {
    const keep = cur;
    for (let i = 0; i < plans.length; i++) activate(i, true);
    if (keep >= 0 && keep < plans.length) activate(keep, true);
  }
  // ordre des étages : sous-sols, RDC, R+1, R+2…
  function floorRank(n) {
    const s = n.toUpperCase(); let m;
    if ((m = /(?:R|N)-(\d+)/.exec(s)) || (m = /SS\s*(\d*)|SOUS.?SOL\s*(\d*)/.exec(s))) return -(+(m[1] || m[2] || 1));
    if (/RDC|REZ/.test(s)) return 0;
    if ((m = /R\+?\s*(\d+)|ETAGE\s*(\d+)|NIV(?:EAU)?\s*(\d+)/.exec(s))) return +(m[1] || m[2] || m[3]);
    return 999;
  }
  // volets repliables du panneau (choix retenus)
  const FOLD_KEY = 'dxfstation.folds.v1';
  const foldGet = () => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}'); } catch (e) { return {}; } };
  const foldSet = (k, v) => { const m = foldGet(); m[k] = v; try { localStorage.setItem(FOLD_KEY, JSON.stringify(m)); } catch (e) {} };
  // un seul volet ouvert à la fois : en ouvrir un referme les autres
  const FOLDS = [['scaleBox', 'scale'], ['refSec', 'origin'], ['optsBox', 'opts']];
  const setLay = open => { document.querySelector('.layers-sec').classList.toggle('closed', !open); $('layFold').setAttribute('aria-expanded', String(open)); };
  function openOnly(k) {
    for (const [id, key] of FOLDS) if (key !== k && $(id).open) $(id).open = false;
    setLay(k === 'layers');
  }
  {
    const m = foldGet(), only = typeof m.only === 'string' ? m.only : 'layers';
    for (const [id, key] of FOLDS) $(id).open = key === only;
    setLay(only === 'layers');
    for (const [id, key] of FOLDS) {
      $(id).addEventListener('toggle', () => { if ($(id).open) openOnly(key); });
      $(id).querySelector('summary').addEventListener('click', () => setTimeout(() => foldSet('only', $(id).open ? key : ''), 0));
    }
    const togLay = () => { const open = document.querySelector('.layers-sec').classList.contains('closed'); if (open) openOnly('layers'); else setLay(false); foldSet('only', open ? 'layers' : ''); };
    $('layFold').addEventListener('click', togLay);
    $('layFold').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togLay(); } });
  }
  // ouvre d'office un volet qui signale un problème sur le plan affiché (sans changer le choix retenu)
  function autoFolds() {
    updateScaleInfo();
    if (S.scaleWarn) $('scaleBox').open = true;
    if (S.ref && S.ref.verdict && S.ref.verdict.kind === 'bad') $('refSec').open = true;
  }
  // bandeau de statistiques repliable (choix retenu)
  const STATS_KEY = 'dxfstation.hidestats';
  let hideStats = false; try { hideStats = localStorage.getItem(STATS_KEY) === '1'; } catch (e) {}
  function renderStatsBtn() {
    document.querySelector('.app').classList.toggle('no-stats', hideStats);
    $('statsBtn').setAttribute('aria-pressed', String(!hideStats));
    $('statsLabel').innerHTML = hideStats ? 'Stats' + (S.outBytes ? ' · <b>' + fmtSize(S.outBytes) + '</b>' : '') : 'Masquer les stats';
  }
  $('statsBtn').onclick = () => { hideStats = !hideStats; try { localStorage.setItem(STATS_KEY, hideStats ? '1' : '0'); } catch (e) {} renderStatsBtn(); resize(); };
  function showHome(on) {
    $('statsBtn').hidden = on;
    $('home').hidden = !on; $('findings').hidden = on; document.querySelector('.work').hidden = on;
    document.querySelector('.app').classList.toggle('is-home', on);
    if (on) { $('fileinfo').innerHTML = ''; $('plans').innerHTML = ''; }
    else resize();
  }
  $('homeDrop').addEventListener('click', () => pickFiles());
  $('homeDrop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles(); } });
  async function loadFiles(files) {
    if (!files) { showHome(true); return; }
    const dwgs = [...files].filter(f => /\.dwg$/i.test(f.name));
    if (dwgs.length) { convertDwgs(dwgs); files = [...files].filter(f => !/\.dwg$/i.test(f.name)); if (!files.length) return; }
    files = [...files].filter(f => /\.dxf$/i.test(f.name));
    if (!files.length) { $('dlMsg').textContent = $('homeMsg').textContent = 'Seuls les fichiers .dxf (ou .dwg à convertir) sont acceptés.'; return; }
    $('homeMsg').textContent = '';
    const fresh = !plans.some(p => !p.st.sample);
    if (fresh) files.sort((a, b) => floorRank(a.name) - floorRank(b.name) || a.name.localeCompare(b.name, 'fr', { numeric: true }));
    const errors = []; let first = -1;
    for (let k = 0; k < files.length; k++) {
      const f = files[k];
      $('busy').hidden = false; $('busy').textContent = 'Lecture ' + (files.length > 1 ? (k + 1) + '/' + files.length + ' : ' : 'du plan : ') + f.name + ' (' + fmtSize(f.size) + ')';
      await new Promise(r => setTimeout(r, 30));
      try { const idx = await addPlan(await f.arrayBuffer(), f.name, false, HMAP.get(f)); if (first < 0) first = idx; }
      catch (e) { errors.push(f.name + ' : ' + (e.message || e)); }
    }
    $('busy').hidden = true;
    // retirer le plan d'exemple dès qu'un vrai plan est ouvert
    const si = plans.findIndex(p => p.st.sample);
    if (si >= 0 && plans.some(p => !p.st.sample)) { if (cur === si) cur = -1; else if (cur > si) cur--; plans.splice(si, 1); if (first > si) first--; }
    if (first >= 0) finishLoad(first);
    if (errors.length) $('dlMsg').textContent = $('homeMsg').textContent = 'Non lu : ' + errors.join(' · ');
  }
  // lien entre un fichier ouvert et son emplacement sur le disque (Chrome / Edge) pour pouvoir « Enregistrer » dessus
  const HMAP = new WeakMap();
  async function pickFiles() {
    if (window.showOpenFilePicker && !(window.claude && window.claude.use)) {
      try {
        const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Plans DXF', accept: { 'application/dxf': ['.dxf'] } }] });
        const fs = await Promise.all(hs.map(async hd => { const f = await hd.getFile(); HMAP.set(f, hd); return f; }));
        loadFiles(fs); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    $('file').click();
  }
  async function addPlan(buf, name, sample, fh) {
    const doc = DXF.parse(buf);
    savePlan(); const prev = cur; plans.push({ st: {}, badge: '' }); cur = plans.length - 1;
    try { return addPlanIn(buf, name, sample, fh, doc); }
    catch (e) { plans.pop(); cur = -1; if (prev >= 0) { activate(prev, true); cur = prev; } throw e; } // plan illisible : on le retire
  }
  function addPlanIn(buf, name, sample, fh, doc) {
    S.view = { s: 1, tx: 0, ty: 0 }; S.userView = false; S.info = null; S.xf = null;
    if (S.ref && S.ref.auto) S.ref = null;
    S.doc = doc; S.name = name; S.size = buf.byteLength; S.sample = !!sample; S.outBase = null; S.fh = fh || null; S.fhOk = !!(fh && OWNED.has(fh));
    rebuild(true); S.savedAt = S.hist ? S.hist[S.histPos] : null; savePlan();
    return cur;
  }
  function finishLoad(i) {
    if (S.ref && S.ref.auto) S.ref = null;
    cur = -1; for (let k = 0; k < plans.length; k++) activate(k, true);
    cur = -1; activate(i, true); cur = i;
    showHome(false);
    setMode('nav'); renderLayers(); updateEraseBar(); updateAll(); renderTabs(); renderXf(); fit(); autoFolds(); updateSaveUI();
  }
  // compatibilité : charger un seul plan
  const loadBuffer = (buf, name, sample) => sample ? loadFiles(null) : loadFiles([new File([buf], name)]);
  function showError(msg) {
    $('findings').innerHTML = '<div class="err"><b>Impossible de lire ce fichier.</b> ' + esc(msg) + '</div>';
  }

  // explode (dépend de l'option points)
  function rebuild(first) {
    const doc = S.doc;
    S.ex = DXF.explode(doc, { keepPoints: $('optPoints').checked });
    if (first) { S.ptMeta = new Map(); S.del = new Set(); S.hist = []; S.histPos = -1; S.created = []; S.info = null; S.moves = new Map(); S.newLayers = []; }
    S.ex.prims.push(...S.created);
    for (const p of S.ex.prims) {
      if (p._ol !== undefined) { p.layer = p._ol; p.c = p._oc; } else { p._ol = p.layer; p._oc = p.c; }
      p.sig = sigOf(p);
      const mv = S.moves.get(p.sig); if (mv) { p.layer = mv; p.c = undefined; }
    }
    S.sel = new Set(); S.hoverPrim = null;
    const counts = new Map();
    for (const p of S.ex.prims) counts.set(p.layer, (counts.get(p.layer) || 0) + 1);
    if (first) {
      const mem = memGet(), cmem = colGet(), rmem = renGet(); let reused = 0;
      S.layers = [...counts.entries()].map(([name, count]) => {
        const info = doc.layers.get(name) || { color: 7 };
        const col = cmem[name];
        let on = true, auto = false;
        if (name in mem) { on = mem[name]; reused++; }
        else if (AUTO_OFF.test(name)) { on = false; auto = true; }
        if (info.off || info.frozen) on = on && !(name in mem) ? false : on;
        return { name, rename: rmem[name] || '', color: col || info.color, orig: info.color, colorSet: !!col, count, on, auto, hidden: !!(info.off || info.frozen) };
      }).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
      S.reused = reused;
      computeExtents();
      detectUnit();
      buildSnap();
      fit();
    } else {
      mergeLayers(counts);
      buildSnap();
    }
    buildHit();
    buildPaths();
    renderLayers();
    updateEraseBar();
    updateAll();
    if (S.ref) buildRef(true);
    if (first) commit('Plan ouvert');
  }
  // ---------- Historique des actions ----------
  function snapState() {
    return { del: [...S.del], moves: [...S.moves], created: S.created.slice(), newLayers: S.newLayers.map(o => Object.assign({}, o)),
      ptMeta: [...(S.ptMeta || new Map())].map(([k, v]) => [k, Object.assign({}, v)]), layers: S.layers.map(l => [l.name, l.on, l.color, l.colorSet, l.rename]), factor: S.factor, unitReason: S.unitReason, outBase: S.outBase, xf: S.xf ? Object.assign({}, S.xf) : null };
  }
  function commit(label) {
    if (!S.hist) return;
    S.hist = S.hist.slice(0, S.histPos + 1);
    S.hist.push({ label, t: new Date(), snap: snapState() });
    if (S.hist.length > 300) S.hist.splice(1, S.hist.length - 300);
    S.histPos = S.hist.length - 1; renderHist(); updateEraseBar(); dirtyUI();
  }
  function restoreState(sn) {
    S.del = new Set(sn.del); S.moves = new Map(sn.moves); S.created = sn.created.slice(); S.newLayers = sn.newLayers.map(o => Object.assign({}, o)); S.ptMeta = new Map((sn.ptMeta || []).map(([k, v]) => [k, Object.assign({}, v)]));
    S.ex.prims = S.ex.prims.filter(p => !p.created).concat(S.created);
    for (const p of S.ex.prims) { if (p._ol !== undefined) { p.layer = p._ol; p.c = p._oc; } const mv = S.moves.get(p.sig); if (mv) { p.layer = mv; p.c = undefined; } }
    const xfChanged = JSON.stringify(S.xf || null) !== JSON.stringify(sn.xf || null);
    S.factor = sn.factor; S.unitReason = sn.unitReason; syncUnitUI(); S.outBase = sn.outBase || null; renderTabs();
    S.xf = sn.xf ? Object.assign({}, sn.xf) : null; renderXf(); if (xfChanged) { S.userView = false; setTimeout(fit, 0); }
    S.sel = new Set(); S.info = null; S.hoverPrim = null; $('infoBox').hidden = true; closeColorPop();
    const counts = new Map(); for (const p of S.ex.prims) counts.set(p.layer, (counts.get(p.layer) || 0) + 1);
    mergeLayers(counts);
    const st = new Map(sn.layers.map(a => [a[0], a]));
    for (const l of S.layers) { const a = st.get(l.name); if (a) { l.on = a[1]; l.color = a[2]; l.colorSet = a[3]; l.rename = a[4]; } }
    buildSnap(); buildHit(); buildPaths(); renderLayers(); updateEraseBar(); updateAll();
    if (S.mode === 'point') pointMsg();
  }
  function histGo(i) {
    if (!S.hist || i < 0 || i >= S.hist.length || i === S.histPos) return;
    const from = S.histPos; S.histPos = i; restoreState(S.hist[i].snap); renderHist(); dirtyUI();
    $('dlMsg').textContent = (i < from ? 'Retour à : ' : 'Rétabli : ') + S.hist[i].label + '.';
  }
  const histBack = () => histGo(S.histPos - 1), histFwd = () => histGo(S.histPos + 1);
  function renderHist() {
    const H = S.hist || [], n = H.length;
    $('histCount').textContent = n > 1 ? '(' + (n - 1) + ')' : '';
    $('histBack').disabled = S.histPos <= 0; $('histFwd').disabled = S.histPos >= n - 1;
    if ($('histBox').hidden) return;
    const hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    let html = '';
    for (let i = n - 1; i >= 0; i--) html += '<li data-h="' + i + '" class="' + (i === S.histPos ? 'cur' : i > S.histPos ? 'undone' : '') + '" tabindex="0"><span class="t">' + hm(H[i].t) + '</span><span class="l">' + esc(H[i].label) + '</span></li>';
    $('histList').innerHTML = html;
  }
  $('histBtn').onclick = () => { $('histBox').hidden = !$('histBox').hidden; $('histBtn').classList.toggle('on', !$('histBox').hidden); renderHist(); };
  $('histClose').onclick = () => { $('histBox').hidden = true; $('histBtn').classList.remove('on'); };
  $('histBack').onclick = histBack; $('histFwd').onclick = histFwd;
  let resetArm = 0;
  $('histReset').onclick = () => {
    const b = $('histReset');
    if (!S.hist || S.hist.length < 2) { $('histResetMsg').textContent = 'Aucune modification à annuler.'; return; }
    if (!b.classList.contains('armed')) {
      b.classList.add('armed'); b.textContent = 'Confirmer'; $('histResetMsg').textContent = 'Clique encore pour tout annuler (récupérable dans l\'historique).';
      clearTimeout(resetArm); resetArm = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Tout réinitialiser'; $('histResetMsg').textContent = 'Revenir au plan tel qu\'il était à l\'ouverture'; }, 5000);
      return;
    }
    clearTimeout(resetArm); b.classList.remove('armed'); b.textContent = 'Tout réinitialiser'; $('histResetMsg').textContent = 'Revenir au plan tel qu\'il était à l\'ouverture';
    restoreState(S.hist[0].snap); commit('Tout réinitialisé (retour au plan d\'origine)');
    $('dlMsg').textContent = 'Toutes les modifications ont été annulées. Ctrl+Z pour revenir avant la réinitialisation.';
  };
  $('histList').addEventListener('click', e => { const li = e.target.closest('[data-h]'); if (li) histGo(+li.dataset.h); });
  $('histList').addEventListener('keydown', e => { const li = e.target.closest('[data-h]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); histGo(+li.dataset.h); } });
  const plural = (n, w) => fmtInt(n) + ' ' + w + (n > 1 ? 's' : '');
  function mergeLayers(counts) {
    const prev = new Map(S.layers.map(l => [l.name, l]));
    for (const nl of S.newLayers || []) if (!counts.has(nl.name)) counts.set(nl.name, 0);
    S.layers = [...counts.entries()].map(([name, count]) => {
      if (prev.get(name)) return Object.assign(prev.get(name), { count });
      const nl = (S.newLayers || []).find(x => x.name === name);
      return nl ? { name, rename: '', color: nl.color, orig: nl.color, colorSet: true, count, on: true, auto: false, made: true } : newLayer(name, count);
    }).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }
  function newLayer(name, count) {
    const c = (S.doc.layers.get(name) || { color: name === NEW_LAYER ? NEW_COLOR : name === LINE_LAYER ? LINE_COLOR : 7 }).color, cm = colGet()[name];
    return { name, rename: renGet()[name] || '', color: cm || c, orig: c, colorSet: !!cm, count, on: true, auto: false };
  }
  function sigOf(p) {
    const r = v => Math.round(v * 1e4) / 1e4;
    if (p.k === 'L') return 'L' + p.layer + '|' + [p.x1, p.y1, p.x2, p.y2].map(r).join(',') + (p.uid ? '|#' + p.uid : '');
    if (p.k === 'A') return 'A' + p.layer + '|' + [p.x, p.y, p.r, p.a0, p.a1].map(r).join(',') + (p.uid ? '|#' + p.uid : '');
    if (p.k === 'C') return 'C' + p.layer + '|' + [p.x, p.y, p.r].map(r).join(',') + (p.uid ? '|#' + p.uid : '');
    if (p.k === 'T') return 'T' + p.layer + '|' + [p.x, p.y].map(r).join(',') + (p.name ? '|' + p.name : '');
    const a = p.pts[0], b = p.pts[p.pts.length - 1];
    return 'P' + p.layer + '|' + p.pts.length + '|' + [a[0], a[1], b[0], b[1]].map(r).join(',') + (p.uid ? '|#' + p.uid : '');
  }
  const alive = (p, on) => on.get(p.layer) && !S.del.has(p.sig);

  // ---------- Géométrie de sélection (polyligne approchée en repère local) ----------
  function polyOf(p) { if (p._poly) return p._poly; return (p._poly = polyAbs(p, S.origin[0], S.origin[1])); }
  function polyAbs(p, ox, oy) {
    const out = [];
    const arc = (cx, cy, r, a0, sweep) => { const n = Math.max(8, Math.ceil(Math.abs(sweep) / (2 * Math.PI) * 64)); for (let k = 0; k <= n; k++) { const a = a0 + sweep * k / n; out.push(cx - ox + r * Math.cos(a), cy - oy + r * Math.sin(a)); } };
    if (p.k === 'L') out.push(p.x1 - ox, p.y1 - oy, p.x2 - ox, p.y2 - oy);
    else if (p.k === 'T') out.push(p.x - ox, p.y - oy);
    else if (p.k === 'C') arc(p.x, p.y, p.r, 0, 2 * Math.PI);
    else if (p.k === 'A') { let sw = (p.a1 - p.a0) * Math.PI / 180; while (sw <= 0) sw += 2 * Math.PI; arc(p.x, p.y, p.r, p.a0 * Math.PI / 180, sw); }
    else {
      const pts = p.pts, n = pts.length, segs = p.closed ? n : n - 1;
      out.push(pts[0][0] - ox, pts[0][1] - oy);
      for (let k = 0; k < segs; k++) {
        const a = pts[k], b = pts[(k + 1) % n], bu = a[2] || 0;
        if (Math.abs(bu) < 1e-9) { out.push(b[0] - ox, b[1] - oy); continue; }
        const th = 4 * Math.atan(bu), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1e-12) continue;
        const r = d / (2 * Math.sin(Math.abs(th) / 2)), h = r * Math.cos(Math.abs(th) / 2) * Math.sign(bu);
        const ux = -(b[1] - a[1]) / d, uy = (b[0] - a[0]) / d, cx = (a[0] + b[0]) / 2 + ux * h, cy = (a[1] + b[1]) / 2 + uy * h;
        arc(cx, cy, r, Math.atan2(a[1] - cy, a[0] - cx), th);
      }
    }
    return out;
  }
  function buildHit() {
    S.ptList = S.ex.prims.filter(p => p.k === 'T');
    const w = Math.max(S.ext[2] - S.ext[0], S.ext[3] - S.ext[1], 1e-9), cell = w / 128, grid = new Map(), big = [];
    S.ex.prims.forEach((p, i) => {
      const q = polyOf(p); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < q.length; k += 2) { if (q[k] < x0) x0 = q[k]; if (q[k] > x1) x1 = q[k]; if (q[k + 1] < y0) y0 = q[k + 1]; if (q[k + 1] > y1) y1 = q[k + 1]; }
      p._bb = [x0, y0, x1, y1];
      const i0 = Math.floor(x0 / cell), i1 = Math.floor(x1 / cell), j0 = Math.floor(y0 / cell), j1 = Math.floor(y1 / cell);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 300) { big.push(i); return; }
      for (let a = i0; a <= i1; a++) for (let b = j0; b <= j1; b++) { const key = a + ',' + b; let arr = grid.get(key); if (!arr) grid.set(key, arr = []); arr.push(i); }
    });
    S.hit = { grid, cell, big };
  }
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t; const x = ax + t * dx - px, y = ay + t * dy - py; return x * x + y * y;
  }
  function primDist2(p, x, y) {
    const q = polyOf(p);
    if (q.length === 2) return (q[0] - x) ** 2 + (q[1] - y) ** 2;
    let best = Infinity; for (let k = 0; k + 3 < q.length; k += 2) { const d = segDist2(x, y, q[k], q[k + 1], q[k + 2], q[k + 3]); if (d < best) best = d; }
    return best;
  }
  function pick(wx, wy, tol) {
    const { grid, cell, big } = S.hit, on = layerOnMap(), r = Math.min(20, Math.ceil(tol / cell));
    const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell), seen = new Set(big);
    for (let a = cx - r; a <= cx + r; a++) for (let b = cy - r; b <= cy + r; b++) { const arr = grid.get(a + ',' + b); if (arr) for (const i of arr) seen.add(i); }
    let best = null, bd = tol * tol;
    for (const i of seen) {
      const p = S.ex.prims[i]; if (!alive(p, on)) continue;
      let d = primDist2(p, wx, wy); if (p.k === 'T') d *= 0.05; // priorité nette aux points (cible au milieu d'une croix)
      if (d < bd || (d === bd && !(best && best.k === 'T'))) { bd = d; best = p; }
    }
    return best;
  }
  function clipSeg(ax, ay, bx, by, r) { // Liang-Barsky : le segment touche-t-il le rectangle ?
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    for (const [pp, qq] of [[-dx, ax - r[0]], [dx, r[2] - ax], [-dy, ay - r[1]], [dy, r[3] - ay]]) {
      if (pp === 0) { if (qq < 0) return false; continue; }
      const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  }
  function rectSelect(r, crossing) { // r : rectangle dans le repère de l'écran
    const on = layerOnMap(), found = [], rot = !!S.xf;
    const rq = q => { if (!rot) return q; const o = new Array(q.length); for (let k = 0; k < q.length; k += 2) { const t = toF([q[k], q[k + 1]]); o[k] = t[0]; o[k + 1] = t[1]; } return o; };
    for (const p of S.ex.prims) {
      if (!alive(p, on)) continue; let b = p._bb;
      if (rot) { const q = rq(polyOf(p)); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let k = 0; k < q.length; k += 2) { x0 = Math.min(x0, q[k]); x1 = Math.max(x1, q[k]); y0 = Math.min(y0, q[k + 1]); y1 = Math.max(y1, q[k + 1]); } b = [x0, y0, x1, y1]; }
      if (b[2] < r[0] || b[0] > r[2] || b[3] < r[1] || b[1] > r[3]) continue;
      if (b[0] >= r[0] && b[2] <= r[2] && b[1] >= r[1] && b[3] <= r[3]) { found.push(p); continue; }
      if (!crossing) continue;
      const q = rq(polyOf(p));
      for (let k = 0; k + 3 < q.length; k += 2) if (clipSeg(q[k], q[k + 1], q[k + 2], q[k + 3], r)) { found.push(p); break; }
    }
    return found;
  }

  function computeExtents() {
    // emprise robuste : on ignore les 0,5 % de points les plus extrêmes (cartouche, objets égarés)
    const xs = [], ys = [];
    for (const p of S.ex.prims) {
      if (p.k === 'L') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
      else if (p.k === 'P') for (const q of p.pts) { xs.push(q[0]); ys.push(q[1]); }
      else { xs.push(p.x); ys.push(p.y); }
    }
    if (!xs.length) { S.ext = [0, 0, 1, 1]; S.rext = S.ext; S.origin = [0, 0]; return; }
    const fx = Float64Array.from(xs).sort(), fy = Float64Array.from(ys).sort();
    const q = (a, t) => a[Math.min(a.length - 1, Math.max(0, Math.round(t * (a.length - 1))))];
    S.ext = [fx[0], fy[0], fx[fx.length - 1], fy[fy.length - 1]];
    S.rext = [q(fx, .005), q(fy, .005), q(fx, .995), q(fy, .995)];
    S.origin = [(S.ext[0] + S.ext[2]) / 2, (S.ext[1] + S.ext[3]) / 2];
  }

  function detectUnit() {
    const span = Math.max(S.rext[2] - S.rext[0], S.rext[3] - S.rext[1]);
    const declared = DXF.UNIT_TO_M[S.doc.insunits];
    const cands = [1, 0.01, 0.001];
    const plausible = f => span * f >= 2 && span * f <= 1500;
    let f, reason;
    if (declared && plausible(declared)) { f = declared; reason = 'declared'; }
    else {
      f = cands.filter(plausible).sort((a, b) => Math.abs(Math.log(span * a / 40)) - Math.abs(Math.log(span * b / 40)))[0] || 1;
      reason = declared ? 'override' : 'guess';
    }
    S.factor = f; S.unitReason = reason; S.declared = declared;
    const opt = [...$('unit').options].find(o => +o.value === f);
    $('unit').value = opt ? opt.value : 'custom'; $('factor').hidden = !!opt; $('factor').value = f;
  }

  // ---------- Détection des traits superposés ----------
  function findDups() {
    const on = layerOnMap(), f = S.factor, dec = +$('optDec').value, P10 = Math.pow(10, dec), tol = 1 / P10;
    const [ox, oy] = S.origin, q = v => Math.round(v * f * P10);
    const exact = { path: new Path2D(), pts: null }, part = new Path2D();
    const seen = new Set(), lines = []; let nExact = 0, nPart = 0;
    const addSeg = (x1, y1, x2, y2) => {
      const a = q(x1) + ',' + q(y1), b = q(x2) + ',' + q(y2); if (a === b) return;
      const k = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(k)) { nExact++; exact.path.moveTo(x1 - ox, y1 - oy); exact.path.lineTo(x2 - ox, y2 - oy); return; }
      seen.add(k); lines.push([x1 * f, y1 * f, x2 * f, y2 * f]);
    };
    const keyDup = (k, add) => { if (seen.has(k)) { nExact++; add(); } else seen.add(k); };
    for (const p of S.ex.prims) {
      if (!alive(p, on)) continue;
      if (p.k === 'L') addSeg(p.x1, p.y1, p.x2, p.y2);
      else if (p.k === 'P') {
        const n = p.pts.length, segs = p.closed ? n : n - 1;
        for (let k = 0; k < segs; k++) { const a = p.pts[k], b = p.pts[(k + 1) % n]; if (!(Math.abs(a[2] || 0) > 1e-9)) addSeg(a[0], a[1], b[0], b[1]); }
      } else if (p.k === 'A') keyDup('A' + q(p.x) + ',' + q(p.y) + ',' + q(p.r) + ',' + Math.round(p.a0 * 100) + ',' + Math.round(p.a1 * 100), () => addToPath(exact, p));
      else if (p.k === 'C') keyDup('C' + q(p.x) + ',' + q(p.y) + ',' + q(p.r), () => addToPath(exact, p));
      else if (p.k === 'T') keyDup('T' + q(p.x) + ',' + q(p.y), () => addToPath(exact, p));
    }
    // chevauchements partiels : traits alignés sur la même droite dont les tronçons se recouvrent
    const groups = new Map();
    for (const L of lines) {
      let dx = L[2] - L[0], dy = L[3] - L[1]; const len = Math.hypot(dx, dy); if (len < tol) continue;
      dx /= len; dy /= len; if (dx < -1e-12 || (Math.abs(dx) <= 1e-12 && dy < 0)) { dx = -dx; dy = -dy; }
      let ak = Math.round(Math.atan2(dy, dx) * 2e4); if (ak === Math.round(Math.PI / 2 * 2e4) * -1) ak = -ak;
      const c = -dy * L[0] + dx * L[1], key = ak + '|' + Math.round(c * P10);
      let t0 = dx * L[0] + dy * L[1], t1 = dx * L[2] + dy * L[3]; if (t0 > t1) [t0, t1] = [t1, t0];
      let g = groups.get(key); if (!g) groups.set(key, g = { dx, dy, c, iv: [] }); g.iv.push([t0, t1]);
    }
    for (const g of groups.values()) {
      if (g.iv.length < 2) continue; g.iv.sort((a, b) => a[0] - b[0]);
      let end = g.iv[0][1];
      for (let k = 1; k < g.iv.length; k++) {
        const [s, e] = g.iv[k];
        if (s < end - tol) {
          nPart++; const ee = Math.min(e, end);
          const X = t => (t * g.dx - g.c * g.dy) / f - ox, Y = t => (t * g.dy + g.c * g.dx) / f - oy;
          part.moveTo(X(s), Y(s)); part.lineTo(X(ee), Y(ee));
        }
        if (e > end) end = e;
      }
    }
    S.dupData = { exact, part, nExact, nPart };
    const box = $('dupBox');
    box.innerHTML = '<p><span class="sw" style="background:#ff4d9d"></span><b>' + fmtInt(nExact) + '</b> en double exact</p>' +
      '<p><span class="sw" style="background:#ffd43b"></span><b>' + fmtInt(nPart) + '</b> chevauchements partiels</p>' +
      '<p class="note">' + ($('optDedupe').checked ? 'Les doubles exacts sont retirés à l\'export. ' : 'Coche « Supprimer les traits en double » dans Options pour retirer les doubles exacts. ') +
      (nPart ? 'Les chevauchements partiels restent dans le fichier : zoome dessus et efface le trait en trop avec Effacer si besoin.' : '') + '</p>';
  }

  // ---------- Chemins de dessin (repère local centré pour la précision) ----------
  function buildPaths() {
    const groups = new Map(); S.delGroup = { path: new Path2D(), pts: null };
    for (const p of S.ex.prims) {
      if (S.del.has(p.sig)) { addToPath(S.delGroup, p); continue; }
      const key = p.layer + '\u0000' + (p.c || 0);
      let g = groups.get(key); if (!g) { g = { layer: p.layer, c: p.c || 0, path: new Path2D(), pts: null }; groups.set(key, g); }
      addToPath(g, p);
    }
    S.paths = [...groups.values()];
    buildSelPath();
  }
  function buildSelPath() { S.selGroup = { path: new Path2D(), pts: null }; for (const p of S.sel) addToPath(S.selGroup, p); }
  function addToPath(g, p) {
    const [ox, oy] = S.origin; const P = g.path;
    {
      if (p.k === 'L') { P.moveTo(p.x1 - ox, p.y1 - oy); P.lineTo(p.x2 - ox, p.y2 - oy); }
      else if (p.k === 'A') { const a0 = p.a0 * Math.PI / 180, a1 = p.a1 * Math.PI / 180; P.moveTo(p.x - ox + p.r * Math.cos(a0), p.y - oy + p.r * Math.sin(a0)); P.arc(p.x - ox, p.y - oy, p.r, a0, a1, false); }
      else if (p.k === 'C') { P.moveTo(p.x - ox + p.r, p.y - oy); P.arc(p.x - ox, p.y - oy, p.r, 0, Math.PI * 2); }
      else if (p.k === 'T') { (g.pts = g.pts || []).push([p.x - ox, p.y - oy]); }
      else if (p.k === 'P') {
        const pts = p.pts, n = pts.length; P.moveTo(pts[0][0] - ox, pts[0][1] - oy);
        const segs = p.closed ? n : n - 1;
        for (let k = 0; k < segs; k++) {
          const a = pts[k], b = pts[(k + 1) % n], bu = a[2] || 0;
          if (Math.abs(bu) < 1e-9) P.lineTo(b[0] - ox, b[1] - oy);
          else {
            const th = 4 * Math.atan(bu), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1e-12) continue;
            const r = d / (2 * Math.sin(Math.abs(th) / 2)), h = r * Math.cos(Math.abs(th) / 2) * Math.sign(bu);
            const ux = -(b[1] - a[1]) / d, uy = (b[0] - a[0]) / d, cx = (a[0] + b[0]) / 2 + ux * h, cy = (a[1] + b[1]) / 2 + uy * h;
            P.arc(cx - ox, cy - oy, r, Math.atan2(a[1] - cy, a[0] - cx), Math.atan2(b[1] - cy, b[0] - cx), bu < 0);
          }
        }
      }
    }
  }

  // ---------- Accroche (extrémités, centres, sommets) ----------
  function buildSnap() {
    const [ox, oy] = S.origin; const pts = [];
    for (const p of S.ex.prims) {
      const n0 = pts.length;
      if (p.k === 'L') pts.push([p.x1 - ox, p.y1 - oy, p.layer], [p.x2 - ox, p.y2 - oy, p.layer]);
      else if (p.k === 'A') { pts.push([p.x - ox, p.y - oy, p.layer]); for (const a of [p.a0, p.a1]) pts.push([p.x - ox + p.r * Math.cos(a * Math.PI / 180), p.y - oy + p.r * Math.sin(a * Math.PI / 180), p.layer]); }
      else if (p.k === 'C' || p.k === 'T') pts.push([p.x - ox, p.y - oy, p.layer]);
      else if (p.k === 'P') for (const q of p.pts) pts.push([q[0] - ox, q[1] - oy, p.layer]);
      for (let k = n0; k < pts.length; k++) pts[k][3] = p.sig;
    }
    const w = Math.max(S.ext[2] - S.ext[0], S.ext[3] - S.ext[1], 1e-9); const cell = w / 256;
    const grid = new Map();
    for (const p of pts) { const k = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(p); }
    S.snap = { grid, cell };
  }
  function findSnap(wx, wy, radiusWorld) {
    const { grid, cell } = S.snap; const on = layerOnMap(); let best = null, bd = radiusWorld * radiusWorld;
    const r = Math.ceil(radiusWorld / cell); const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
    if (r > 40) return null;
    for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
      const a = grid.get(i + ',' + j); if (!a) continue;
      for (const p of a) { if (!on.get(p[2]) || S.del.has(p[3])) continue; const d = (p[0] - wx) ** 2 + (p[1] - wy) ** 2; if (d < bd) { bd = d; best = p; } }
    }
    return best;
  }
  const layerOnMap = () => new Map(S.layers.map(l => [l.name, l.on]));

  // ---------- Vue ----------
  let W = 0, H = 0, dpr = 1;
  function resize() {
    const r = stage.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height; cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    if (!S.userView) fit(); else draw();
  }
  // emprise de ce qui est gardé (calques cochés, traits non effacés) : sert au recadrage
  function keptExtents() {
    const on = new Map(S.layers.map(l => [l.name, l.on])), xs = [], ys = [];
    for (const p of S.ex.prims) {
      if (!on.get(p.layer) || S.del.has(p.sig)) continue;
      if (p.k === 'L') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
      else if (p.k === 'P') for (const q of p.pts) { xs.push(q[0]); ys.push(q[1]); }
      else if (p.r) { xs.push(p.x - p.r, p.x + p.r); ys.push(p.y - p.r, p.y + p.r); }
      else { xs.push(p.x); ys.push(p.y); }
    }
    if (!xs.length) return null;
    const fx = Float64Array.from(xs).sort(), fy = Float64Array.from(ys).sort();
    const q = (a, t) => a[Math.min(a.length - 1, Math.max(0, Math.round(t * (a.length - 1))))];
    return [q(fx, .005), q(fy, .005), q(fx, .995), q(fy, .995)];
  }
  function fit() {
    if (!S.ext) return;
    const e = (S.ex && keptExtents()) || S.rext, [ox, oy] = S.origin;
    const cs = [[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]]].map(p => toF([p[0] - ox, p[1] - oy]));
    const x0 = Math.min(...cs.map(p => p[0])), x1 = Math.max(...cs.map(p => p[0])), y0 = Math.min(...cs.map(p => p[1])), y1 = Math.max(...cs.map(p => p[1]));
    const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9);
    const s = Math.min((W || 800) / w, (H || 600) / h) * 0.9;
    S.userView = false; S.view.s = s; S.view.tx = (W || 800) / 2 - ((x0 + x1) / 2) * s; S.view.ty = (H || 600) / 2 + ((y0 + y1) / 2) * s;
    draw();
  }
  // repère : S.xf = { ox, oy (point choisi, en mètres dans le repère d'origine), th (direction de l'axe X), X0, Y0 (m) }
  const vrot = () => { const t = S.xf ? -S.xf.th : 0; return [Math.cos(t), Math.sin(t)]; };
  const toF = p => { const [c, s] = vrot(); return [c * p[0] - s * p[1], s * p[0] + c * p[1]]; };   // monde -> repère écran
  const fromF = p => { const [c, s] = vrot(); return [c * p[0] + s * p[1], -s * p[0] + c * p[1]]; };
  const toWorld = (sx, sy) => fromF([(sx - S.view.tx) / S.view.s, -(sy - S.view.ty) / S.view.s]);
  const toScreen = (wx, wy) => { const q = toF([wx, wy]); return [q[0] * S.view.s + S.view.tx, -q[1] * S.view.s + S.view.ty]; };
  function toRefMx(x, y, f, xf) { // coordonnées absolues du fichier -> mètres dans le repère choisi
    if (!xf) return [x * f, y * f];
    const c = Math.cos(xf.th), s = Math.sin(xf.th), dx = x * f - xf.ox, dy = y * f - xf.oy;
    return [c * dx + s * dy + xf.X0, -s * dx + c * dy + xf.Y0];
  }
  function fromRefMx(mx, my, f, xf) {
    if (!xf) return [mx / f, my / f];
    const c = Math.cos(xf.th), s = Math.sin(xf.th), rx = mx - xf.X0, ry = my - xf.Y0;
    return [(xf.ox + c * rx - s * ry) / f, (xf.oy + s * rx + c * ry) / f];
  }
  const toRefM = (x, y) => toRefMx(x, y, S.factor, S.xf);

  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawNow(); }); }
  function drawNow() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const K = lightBg ? { bg: '#ffffff', snap: '#c26a00', ghost: 'rgba(90,100,95,.35)', label: '#b4530a', halo: 'rgba(255,255,255,.9)', pv: '#0a7fc2', pv2: 'rgba(10,127,194,.55)', pal: ACI_L }
      : { bg: '#101513', snap: '#ffd43b', ghost: 'rgba(150,160,155,.28)', label: '#ffb07a', halo: 'rgba(16,21,19,.9)', pv: '#5ad1ff', pv2: 'rgba(90,209,255,.55)', pal: ACI };
    ctx.fillStyle = K.bg; ctx.fillRect(0, 0, cv.width, cv.height);
    if (!S.paths) return;
    const { s, tx, ty } = S.view;
    { const [c, sn] = vrot(); ctx.setTransform(s * c * dpr, -s * sn * dpr, -s * sn * dpr, -s * c * dpr, tx * dpr, ty * dpr); }
    const lw = 1 / s; const on = layerOnMap(); const lay = new Map(S.layers.map(l => [l.name, l]));
    if (S.ref && S.ref.path && S.refShow) { ctx.lineWidth = 2.2 * lw; ctx.strokeStyle = 'rgba(77,171,247,.55)'; ctx.stroke(S.ref.path); }
    if (S.ghost) {
      ctx.lineWidth = lw; ctx.strokeStyle = K.ghost; ctx.setLineDash([4 / s, 3 / s]);
      for (const g of S.paths) if (!on.get(g.layer)) ctx.stroke(g.path);
      ctx.setLineDash([]);
      if (S.delGroup) { ctx.strokeStyle = 'rgba(240,112,112,.55)'; ctx.setLineDash([4 / s, 3 / s]); ctx.stroke(S.delGroup.path); ctx.setLineDash([]); if (S.delGroup.pts) { ctx.fillStyle = ctx.strokeStyle; for (const p of S.delGroup.pts) ctx.fillRect(p[0] - 2 * lw, p[1] - 2 * lw, 4 * lw, 4 * lw); } }
    }
    for (const g of S.paths) {
      if (!on.get(g.layer)) continue;
      const isHover = S.hoverLayer === g.layer;
      ctx.lineWidth = (isHover ? 2.5 : 1) * lw;
      const L = lay.get(g.layer) || {};
      ctx.strokeStyle = isHover ? '#ff8a3d' : K.pal[(L.colorSet ? L.color : g.c || L.color) || 7] || K.pal[7];
      ctx.stroke(g.path);
      if (g.pts && S.showPts) {
        ctx.lineWidth = 1.4 * lw; const a = 6 * lw; ctx.beginPath();
        for (const p of g.pts) { ctx.moveTo(p[0] - a, p[1] - a); ctx.lineTo(p[0] + a, p[1] + a); ctx.moveTo(p[0] - a, p[1] + a); ctx.lineTo(p[0] + a, p[1] - a); ctx.moveTo(p[0] + 3.5 * lw, p[1]); ctx.arc(p[0], p[1], 3.5 * lw, 0, 2 * Math.PI); }
        ctx.stroke();
      }
    }
    const hl = (grp, col, wdt, dash) => {
      ctx.lineWidth = wdt * lw; ctx.strokeStyle = col; ctx.setLineDash(dash ? [6 / s, 4 / s] : []); ctx.stroke(grp.path); ctx.setLineDash([]);
      if (grp.pts) { ctx.lineWidth = 2 * lw; for (const p of grp.pts) ctx.strokeRect(p[0] - 5 * lw, p[1] - 5 * lw, 10 * lw, 10 * lw); }
    };
    if (S.erase && S.selGroup && S.sel.size) hl(S.selGroup, K.snap, 3, true);
    if (S.mode === 'nav' && S.info) { const g = { path: new Path2D(), pts: null }; addToPath(g, S.info); hl(g, '#ff8a3d', 3.5, false); }
    if (S.mode === 'nav' && S.hoverPrim && S.hoverPrim !== S.info) { const g = { path: new Path2D(), pts: null }; addToPath(g, S.hoverPrim); hl(g, 'rgba(255,138,61,.6)', 2.5, false); }
    if (S.erase && S.hoverPrim && !S.sel.has(S.hoverPrim)) { const g = { path: new Path2D(), pts: null }; addToPath(g, S.hoverPrim); hl(g, '#ff8a3d', 3, false); }
    if (S.dups && S.dupData) {
      ctx.lineWidth = 4 * lw; ctx.strokeStyle = 'rgba(255,212,59,.9)'; ctx.stroke(S.dupData.part);
      ctx.lineWidth = 3.5 * lw; ctx.strokeStyle = 'rgba(255,77,157,.9)'; ctx.stroke(S.dupData.exact.path);
      if (S.dupData.exact.pts) { ctx.fillStyle = '#ff4d9d'; for (const p of S.dupData.exact.pts) ctx.fillRect(p[0] - 4 * lw, p[1] - 4 * lw, 8 * lw, 8 * lw); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.rect) {
      const [a, b] = S.rect, crossing = b[0] < a[0];
      ctx.fillStyle = crossing ? 'rgba(80,200,120,.12)' : 'rgba(80,140,255,.12)'; ctx.strokeStyle = crossing ? '#5cc27e' : '#6ea0ff';
      ctx.lineWidth = 1; ctx.setLineDash(crossing ? [5, 4] : []);
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.strokeRect(Math.min(a[0], b[0]) + .5, Math.min(a[1], b[1]) + .5, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.setLineDash([]);
    }
    // origine 0,0
    {
      const o0 = fromRefMx(0, 0, S.factor, S.xf), [x, y] = toScreen(o0[0] - S.origin[0], o0[1] - S.origin[1]);
      ctx.font = '600 11px sans-serif'; ctx.textBaseline = 'middle';
      if (x > -10 && y > -10 && x < W + 10 && y < H + 10) {
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.stroke();
        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
        ctx.fillText('X', x + 38, y); ctx.fillText('Y', x - 3, y - 42); ctx.fillText('0,0', x + 7, y + 11);
      } else {
        const cx = W / 2, cy = H / 2, ang = Math.atan2(y - cy, x - cx), m = 28;
        const t = Math.min(Math.abs((W / 2 - m) / Math.cos(ang) || 1e9), Math.abs((H / 2 - m) / Math.sin(ang) || 1e9));
        const ax = cx + Math.cos(ang) * t, ay = cy + Math.sin(ang) * t;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.restore();
        const dist = S.originDist || 0, label = 'Origine 0,0 à ' + (dist >= 1000 ? fmt(dist / 1000, 2) + ' km' : fmt(dist, 1) + ' m');
        const tw = ctx.measureText(label).width, lx = Math.max(6, Math.min(W - tw - 6, ax - Math.cos(ang) * 22 - tw / 2)), ly = Math.max(12, Math.min(H - 12, ay - Math.sin(ang) * 18));
        ctx.fillStyle = 'rgba(16,21,19,.85)'; ctx.fillRect(lx - 4, ly - 9, tw + 8, 18); ctx.fillStyle = '#ff8f8f'; ctx.fillText(label, lx, ly);
      }
    }
    // nom et altitude des points
    if (S.showPts && S.ptList && S.ptList.length) {
      const on = layerOnMap(); ctx.font = '600 11px ' + getComputedStyle(document.body).getPropertyValue('--f-mono'); ctx.textBaseline = 'bottom';
      for (const p of S.ptList) {
        const nm = ptName(p), z = ptZ(p); if (!nm && z === null) continue;
        const [x, y] = toScreen(p.x - S.origin[0], p.y - S.origin[1]);
        if (x < -60 || y < -20 || x > W + 60 || y > H + 20 || !alive(p, on)) continue;
        const t = nm + (z !== null ? (nm ? ' · ' : 'Z ') + fmt(z, 3) : '');
        ctx.lineWidth = 3; ctx.strokeStyle = K.halo; ctx.strokeText(t, x + 7, y - 5); ctx.fillStyle = K.label; ctx.fillText(t, x + 7, y - 5);
      }
    }
    // tracé : aperçus
    if (S.mode === 'line') {
      const seg = (a, b, col, w, dash) => { const p = toScreen(a[0], a[1]), q = toScreen(b[0], b[1]); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]); };
      const t = S.lineTool, cur = S.hover || S.hoverFree || S.cur, PV = K.pv, DSH = [7, 5];
      if (t === 'trim') { if (S.trimPrev) drawCut(S.trimPrev); }
      else if (t === 'offset') {
        if (S.offBase) seg([S.offBase[0], S.offBase[1]], [S.offBase[2], S.offBase[3]], '#ff8a3d', 3.5);
        else if (S.offHover) seg([S.offHover[0], S.offHover[1]], [S.offHover[2], S.offHover[3]], 'rgba(255,138,61,.7)', 3);
        if (S.offPrev) seg([S.offPrev[0], S.offPrev[1]], [S.offPrev[2], S.offPrev[3]], PV, 2, DSH);
      } else {
        if (S.l1) { const [x, y] = toScreen(S.l1[0], S.l1[1]); ctx.fillStyle = PV; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); }
        if (t === 'chain' && S.chainStart && S.chainN >= 2) { const [x, y] = toScreen(S.chainStart[0], S.chainStart[1]); ctx.strokeStyle = PV; ctx.lineWidth = 1.5; ctx.strokeRect(x - 7, y - 7, 14, 14); }
        if ((t === 'join' || t === 'chain') && S.l1 && cur) seg(S.l1, cur, PV, 2, DSH);
        if (t === 'rect' && S.l1 && cur) { const q = rectPts(S.l1, cur).pts; for (let k = 0; k < 4; k++) seg(q[k], q[(k + 1) % 4], PV, 2, DSH); }
        if (t === 'circle' && cur && (S.l1 || isFinite(numIn('circR')))) {
          const c = S.l1 || cur, r = S.l1 ? circRadius(S.l1, cur) : numIn('circR') / S.factor, [x, y] = toScreen(c[0], c[1]);
          ctx.strokeStyle = PV; ctx.lineWidth = 2; ctx.setLineDash(DSH); ctx.beginPath(); ctx.arc(x, y, r * S.view.s, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
          if (S.l1) seg(S.l1, cur, K.pv2, 1, [3, 3]);
          if (!S.l1) { ctx.fillStyle = PV; ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill(); }
        }
        if (cur && !S.hover && t !== 'join') { const [x, y] = toScreen(cur[0], cur[1]); ctx.strokeStyle = K.pv2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke(); }
      }
    }
    // recalage : aperçu de l'axe X
    if (S.mode === 'xf' && S.xfP1) {
      const a = toScreen(S.xfP1[0], S.xfP1[1]); ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.arc(a[0], a[1], 5, 0, 2 * Math.PI); ctx.fill();
      if (S.cur) {
        const b = toScreen(S.cur[0], S.cur[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(ang); ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.font = '700 12px sans-serif'; ctx.fillStyle = '#ff8f8f'; ctx.textBaseline = 'bottom'; ctx.fillText('X', b[0] + 10, b[1] - 6);
      }
    }
    // accroche en mode point
    if ((S.mode === 'point' || S.mode === 'xf' || (S.mode === 'line' && S.lineTool !== 'offset')) && S.hover) {
      const [x, y] = toScreen(S.hover[0], S.hover[1]);
      if (S.hoverKind === 'int') { ctx.strokeStyle = K.snap; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x - 7, y + 7); ctx.lineTo(x + 7, y - 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.stroke(); }
      else if (S.hoverKind === 'end') { ctx.strokeStyle = K.snap; ctx.lineWidth = 2; ctx.strokeRect(x - 6, y - 6, 12, 12); }
      if (S.hoverKind) { ctx.font = '600 11px sans-serif'; ctx.fillStyle = K.snap; ctx.textBaseline = 'top'; ctx.fillText(S.hoverKind === 'int' ? 'Croisement' : 'Extrémité', x + 12, y + 8); }
    }
    // mesure
    const mk = (p, col) => { const [x, y] = toScreen(p[0], p[1]); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x - 5, y - 5, 10, 10); };
    if (S.measure && S.hover) { if (S.hoverKind === 'int') { const [x, y] = toScreen(S.hover[0], S.hover[1]); ctx.strokeStyle = K.snap; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 6, y - 6); ctx.stroke(); } else mk(S.hover, K.snap); }
    if (S.m1) {
      const end = S.m2 || S.hover;
      mk(S.m1, '#ff8a3d');
      if (end) {
        const a = toScreen(S.m1[0], S.m1[1]), b = toScreen(end[0], end[1]);
        ctx.strokeStyle = '#ff8a3d'; ctx.lineWidth = 2; ctx.setLineDash(S.m2 ? [] : [6, 4]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        if (S.m2) mk(S.m2, '#ff8a3d');
      }
    }
    drawScalebar();
  }
  function drawScalebar() {
    const mPerPx = 1 / (S.view.s) * S.factor; const target = 110 * mPerPx;
    const p = Math.pow(10, Math.floor(Math.log10(target))); const n = [1, 2, 5, 10].map(k => k * p).filter(v => v <= target).pop() || p;
    const px = n / mPerPx;
    $('scalebar').innerHTML = (n >= 1 ? fmt(n, n % 1 ? 1 : 0) + ' m' : fmt(n * 100, n * 100 % 1 ? 1 : 0) + ' cm') + '<i style="width:' + px.toFixed(1) + 'px"></i>';
  }

  // ---------- Interactions sur le plan ----------
  const pointers = new Map(); let pinch = null, dragStart = null, moved = false;
  cv.addEventListener('pointerdown', e => {
    const ae = document.activeElement; if (ae && ae !== document.body && ae.blur) ae.blur();
    cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.offsetX, e.offsetY]); moved = false;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: S.view.s, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], tx: S.view.tx, ty: S.view.ty }; dragStart = null; }
    else dragStart = { x: e.offsetX, y: e.offsetY, tx: S.view.tx, ty: S.view.ty, rect: S.erase && e.button === 0 };
    if (pointers.size === 2) S.rect = null;
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const k = d / pinch.d;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      S.userView = true; S.view.s = pinch.s * k; S.view.tx = mid[0] - (pinch.mid[0] - pinch.tx) * k; S.view.ty = mid[1] - (pinch.mid[1] - pinch.ty) * k; moved = true; draw(); return;
    }
    if (dragStart && pointers.size === 1) {
      const dx = e.offsetX - dragStart.x, dy = e.offsetY - dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; cv.classList.add('drag'); }
      if (moved && dragStart.rect) { S.rect = [[dragStart.x, dragStart.y], [e.offsetX, e.offsetY]]; draw(); }
      else if (moved) { S.userView = true; S.view.tx = dragStart.tx + dx; S.view.ty = dragStart.ty + dy; draw(); }
    }
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    const [ox, oy] = S.origin, f = S.factor;
    { const m = toRefM(wx + ox, wy + oy); $('readout').textContent = 'X ' + fmt(m[0], 3) + '   Y ' + fmt(m[1], 3) + ' m'; }
    if (S.mode === 'line' && S.snap && !moved) { S.shift = e.shiftKey; lineHover(wx, wy); draw(); }
    if (S.mode === 'xf' && S.snap && !moved) { const sp = snapAt(wx, wy, 12 / S.view.s); S.hover = sp ? [sp.x, sp.y] : null; S.hoverKind = sp ? sp.kind : null; S.cur = sp ? [sp.x, sp.y] : [wx, wy]; draw(); }
    if ((S.measure || S.mode === 'point') && S.snap && !moved) {
      const sp = snapAt(wx, wy, 12 / S.view.s); S.hover = sp ? [sp.x, sp.y] : (S.measure ? [wx, wy] : null); S.hoverKind = sp ? sp.kind : null;
      if (S.measure && S.m1 && !S.m2) showMeasure(S.m1, S.hover, true);
      draw();
    }
    if ((S.erase || S.mode === 'nav') && S.hit && !moved && !dragStart && e.pointerType === 'mouse') { const hp = pick(wx, wy, 8 / S.view.s); if (hp !== S.hoverPrim) { S.hoverPrim = hp; draw(); } }
  });
  cv.addEventListener('pointerleave', () => { if (S.hoverPrim) { S.hoverPrim = null; draw(); } });
  const endPtr = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    cv.classList.remove('drag');
    const tolPx = e.pointerType === 'touch' ? 22 : 12;
    if (!moved && pointers.size === 0 && dragStart && e.button === 0 && S.mode === 'nav') {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY); S.info = pick(wx, wy, (tolPx - 4) / S.view.s); showInfo(); draw();
    }
    if (!moved && pointers.size === 0 && dragStart && e.button === 2 && S.mode === 'line' && S.lineTool === 'chain' && S.l1) endChain('');
    if (!moved && pointers.size === 0 && dragStart && e.button === 0 && S.mode === 'line') {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY); lineClick(wx, wy, tolPx / S.view.s); draw();
    }
    if (!moved && pointers.size === 0 && dragStart && e.button === 0 && S.mode === 'xf') {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY); xfClick(wx, wy, tolPx / S.view.s); draw();
    }
    if (!moved && pointers.size === 0 && dragStart && e.button === 0 && S.mode === 'point') {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY), hitPt = pick(wx, wy, tolPx / S.view.s);
      if (hitPt && hitPt.k === 'T') { pointMsg('Point existant : donne-lui un nom et un Z.', hitPt); draw(); return; }
      const sp = snapAt(wx, wy, tolPx / S.view.s);
      if (sp) createPoint(sp.x, sp.y, sp.kind); else pointMsg('Pas de croisement ici. Approche le viseur d\'un croisement de traits : il devient jaune quand il accroche.');
    }
    if (!moved && S.measure && pointers.size === 0) {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY); const sp = snapAt(wx, wy, tolPx / S.view.s);
      const pt = sp ? [sp.x, sp.y] : [wx, wy];
      if (!S.m1 || S.m2) { S.m1 = pt; S.m2 = null; $('measureBox').hidden = true; } else { S.m2 = pt; showMeasure(S.m1, S.m2, false); }
      draw();
    }
    if (S.erase && pointers.size === 0 && dragStart) {
      if (S.rect) {
        const [a, b] = S.rect, wa = toF(toWorld(a[0], a[1])), wb = toF(toWorld(b[0], b[1]));
        const r = [Math.min(wa[0], wb[0]), Math.min(wa[1], wb[1]), Math.max(wa[0], wb[0]), Math.max(wa[1], wb[1])];
        for (const p of rectSelect(r, b[0] < a[0])) S.sel.add(p);
        S.rect = null; selChanged();
      } else if (!moved && dragStart.rect) {
        const [wx, wy] = toWorld(e.offsetX, e.offsetY); const p = pick(wx, wy, (e.pointerType === 'touch' ? 18 : 8) / S.view.s);
        if (p) { if (S.sel.has(p)) S.sel.delete(p); else S.sel.add(p); } else if (!e.shiftKey) S.sel.clear();
        selChanged();
      }
    }
    dragStart = null;
  };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', e => {
    e.preventDefault(); const k = Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015));
    S.view.tx = e.offsetX - (e.offsetX - S.view.tx) * k; S.view.ty = e.offsetY - (e.offsetY - S.view.ty) * k; S.view.s *= k; S.userView = true; draw();
  }, { passive: false });
  cv.addEventListener('dblclick', () => { if (S.mode === 'line') { if (S.lineTool === 'chain' && S.chainN) endChain(''); return; } fit(); });
  function showMeasure(a, b, live) {
    const f = S.factor, dv = toF([(b[0] - a[0]) * f, (b[1] - a[1]) * f]), dx = dv[0], dy = dv[1];
    const box = $('measureBox'); box.hidden = false;
    box.innerHTML = '<b>' + fmt(Math.hypot(dx, dy), 3) + ' m</b><br>ΔX ' + fmt(dx, 3) + '  ΔY ' + fmt(dy, 3) + (live ? '<br><span style="color:#9aa">clique le 2ᵉ point</span>' : '');
  }
  $('fitBtn').onclick = fit;
  function setMode(m) {
    if (S.mode === m) m = 'nav';
    S.mode = m; S.measure = m === 'measure'; S.erase = m === 'erase';
    $('measBtn').classList.toggle('on', m === 'measure'); $('eraseBtn').classList.toggle('on', m === 'erase'); $('pointBtn').classList.toggle('on', m === 'point'); $('lineBtn').classList.toggle('on', m === 'line');
    $('eraseBar').hidden = $('eraseHint').hidden = m !== 'erase'; $('pointBar').hidden = m !== 'point'; $('lineBar').hidden = m !== 'line';
    cv.classList.toggle('erase', m === 'erase'); cv.classList.toggle('measure', m === 'measure' || m === 'point' || m === 'line');
    if (S.lineTool === 'chain' && S.chainN && m !== 'line') endChain('');
    S.l1 = null; S.chainStart = null; S.chainN = 0; S.chainLen = 0; S.offBase = null; S.offHover = null; S.offPrev = null; S.hoverFree = null; S.cur = null;
    S.m1 = S.m2 = S.hover = null; S.hoverKind = null; S.hoverPrim = null; S.rect = null; $('measureBox').hidden = true;
    S.info = null; $('infoBox').hidden = true;
    if (m !== 'erase') { S.sel.clear(); buildSelPath(); updateEraseBar(); }
    if (m === 'point') pointMsg(); else $('pointBox').hidden = true;
    if (m === 'line') { fillLineLayers(); lineMsg(); } else $('lineBox').hidden = true;
    S.xfP1 = null; cv.classList.toggle('measure', m === 'measure' || m === 'point' || m === 'line' || m === 'xf');
    if (m === 'xf') xfMsg(); else $('xfMsg').hidden = true;
    $('xfStart').classList.toggle('primary', m === 'xf');
    draw();
  }
  const setErase = v => setMode(v ? 'erase' : 'nav');
  function selChanged() { buildSelPath(); updateEraseBar(); draw(); }
  function updateEraseBar() {
    $('delBtn').textContent = 'Supprimer la sélection (' + fmtInt(S.sel.size) + ')'; $('delBtn').disabled = !S.sel.size;
    $('undoBtn').disabled = !(S.histPos > 0); $('restoreBtn').disabled = !S.del.size; $('ptUndoBtn').disabled = !(S.histPos > 0); $('lnUndoBtn').disabled = !(S.histPos > 0);
    $('moveBtn').textContent = 'Changer de calque (' + fmtInt(S.sel.size) + ')'; $('moveBtn').disabled = !S.sel.size;
  }
  // ---------- Calques créés et changement de calque ----------
  const NEW_COLORS = [30, 140, 210, 50, 110, 190, 10, 170, 70, 230];
  function createLayer(raw) {
    const name = DXF.cleanName((raw || '').trim()); if (!(raw || '').trim()) return null;
    const ex = S.layers.find(l => l.name === name || shown(l) === name); if (ex) return ex.name;
    S.newLayers.push({ name, color: NEW_COLORS[S.newLayers.length % NEW_COLORS.length] });
    refreshGeometry(); return name;
  }
  function moveTo(name, items) {
    const sigs = new Set([...items].map(p => p.sig)); if (!sigs.size) return;
    for (const p of S.ex.prims) if (sigs.has(p.sig)) { p.layer = name; p.c = undefined; }
    sigs.forEach(s => S.moves.set(s, name));
    const L = S.layers.find(l => l.name === name); if (L) L.on = true;
    S.sel.clear(); S.info = null; $('infoBox').hidden = true; S.hoverPrim = null;
    refreshGeometry();
    const Ln = S.layers.find(l => l.name === name);
    const nb = items.size;
    commit(plural(nb, 'objet') + ' → calque ' + (Ln ? shown(Ln) : name));
    updateEraseBar();
    $('dlMsg').textContent = fmtInt(nb) + ' objet' + (nb > 1 ? 's' : '') + ' déplacé' + (nb > 1 ? 's' : '') + ' vers ' + (Ln ? shown(Ln) : name) + '. Ctrl+Z pour annuler.';
  }
  function openMovePop(anchor, items) {
    closeColorPop(); if (!items.size) return;
    pop = document.createElement('div'); pop.className = 'color-pop layer-pop';
    const n = items.size;
    pop.innerHTML = '<div class="t">Déplacer <b>' + fmtInt(n) + ' objet' + (n > 1 ? 's' : '') + '</b> vers le calque :</div>' +
      '<div class="nl"><input type="text" id="mpNew" maxlength="31" placeholder="Nouveau calque…" autocomplete="off" aria-label="Nom du nouveau calque"><button class="btn primary" type="button" id="mpCreate">Créer</button></div>' +
      '<div class="lst">' + (lcm => S.layers.map((l, i) => [l, i]).filter(([l]) => listed(l, lcm)).sort((a, b) => byShown(a[0], b[0])).map(([l, i]) => '<button type="button" data-mv="' + i + '"><i style="background:' + ACI[l.color] + '"></i><span>' + esc(shown(l)) + '</span><em>' + fmtInt(lcm.get(l.name) || 0) + '</em></button>').join(''))(liveCounts()) + '</div>';
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + 'px';
    pop.style.top = (r.bottom + ph + 8 > window.innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
    const go = () => { const nm = createLayer($('mpNew').value); if (nm) moveTo(nm, items); closeColorPop(); };
    $('mpCreate').onclick = go;
    $('mpNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    pop.querySelector('.lst').addEventListener('click', e => { const b = e.target.closest('[data-mv]'); if (!b) return; const L = S.layers[+b.dataset.mv]; closeColorPop(); moveTo(L.name, items); });
    setTimeout(() => $('mpNew') && $('mpNew').focus(), 0);
  }
  $('moveBtn').onclick = e => openMovePop(e.currentTarget, new Set(S.sel));
  $('newLayerBtn').onclick = () => { $('newLayerForm').hidden = false; $('nlName').value = ''; $('nlName').focus(); };
  const nlCreate = () => { const before = S.newLayers.length; const nm = createLayer($('nlName').value); $('newLayerForm').hidden = true; if (nm && S.newLayers.length > before) commit('Calque ' + nm + ' créé'); if (nm) { $('dlMsg').textContent = 'Calque ' + nm + ' prêt. Sélectionne des traits puis « Changer de calque ».'; const i = S.layers.findIndex(l => l.name === nm); const row = $('layers').querySelector('[data-i="' + i + '"]'); if (row) row.scrollIntoView({ block: 'nearest' }); } };
  $('nlOk').onclick = nlCreate;
  $('nlCancel').onclick = () => { $('newLayerForm').hidden = true; };
  $('nlName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nlCreate(); } else if (e.key === 'Escape') { $('newLayerForm').hidden = true; } });
  function deleteSel() {
    if (!S.sel.size) return;
    const sigs = [...new Set([...S.sel].map(p => p.sig))].filter(s => !S.del.has(s));
    const nb = S.sel.size, one = nb === 1 ? [...S.sel][0] : null;
    sigs.forEach(s => S.del.add(s)); S.sel.clear(); S.hoverPrim = null;
    buildPaths(); updateEraseBar(); updateAll();
    commit(one ? 'Suppression : ' + ({ L: 'ligne', A: 'arc', C: 'cercle', P: 'polyligne', T: 'point' }[one.k] || 'objet') + ' (' + (shown(S.layers.find(l => l.name === one.layer) || { name: one.layer })) + ')' : 'Suppression de ' + plural(nb, 'objet'));
  }
  function deleteInfo() {
    if (!S.info) return; S.sel = new Set([S.info]); S.info = null; $('infoBox').hidden = true;
    deleteSel(); S.sel = new Set(); buildSelPath();
    $('dlMsg').textContent = 'Objet supprimé. Ctrl+Z pour annuler.';
  }
  const undoDel = () => histBack();
  $('eraseBtn').onclick = () => setErase(!S.erase);
  $('dupBtn').onclick = () => { S.dups = !S.dups; $('dupBtn').classList.toggle('on', S.dups); $('dupBox').hidden = !S.dups; if (S.dups) findDups(); draw(); };
  $('delBtn').onclick = deleteSel;
  $('undoBtn').onclick = undoDel;
  $('restoreBtn').onclick = () => { if (!S.del.size) return; const n = S.del.size; S.del.clear(); buildPaths(); updateAll(); commit('Toutes les suppressions annulées (' + fmtInt(n) + ')'); };
  $('measBtn').onclick = () => setMode('measure');
  $('pointBtn').onclick = () => setMode('point');
  $('lineBtn').onclick = () => setMode('line');
  function applyBg() { $('bgBtn').classList.toggle('on', lightBg); $('bgLabel').textContent = lightBg ? 'Fond noir' : 'Fond blanc'; stage.classList.toggle('light', lightBg); draw(); }
  $('bgBtn').onclick = () => { lightBg = !lightBg; try { localStorage.setItem('dxfstation.lightbg', lightBg ? '1' : '0'); } catch (e) {} applyBg(); };
  applyBg();
  $('ptsBtn').onclick = () => { S.showPts = !S.showPts; $('ptsBtn').classList.toggle('on', S.showPts); draw(); };
  $('ptUndoBtn').onclick = histBack;
  $('ghostBtn').onclick = () => { S.ghost = !S.ghost; $('ghostBtn').classList.toggle('on', S.ghost); draw(); };
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') { // même dans un champ : sinon le navigateur enregistre la page web
      e.preventDefault(); if (!S.ex || !$('home').hidden || $('saveDlg').open || $('dwgDlg').open) return;
      if (document.activeElement && document.activeElement.matches('input, select, textarea')) document.activeElement.blur();
      if (e.shiftKey || inArtifact) $('dlBtn').click(); else saveSame(); return;
    }
    if (e.target.matches && e.target.matches('input[type=text], input[type=number], input[type=search], input:not([type]), select, textarea')) return;
    if (e.key === 'Escape' && S.mode === 'xf') { setMode('nav'); return; }
    if (e.key === 'Escape' && S.mode === 'line') { if (S.lineTool === 'chain' && S.chainN) endChain(''); else { S.l1 = null; S.chainStart = null; S.offBase = null; S.offPrev = null; lineMsg(); } draw(); }
    if (e.key === 'Escape') { closeColorPop(); S.m1 = S.m2 = null; $('measureBox').hidden = true; S.info = null; $('infoBox').hidden = true; if (S.erase) { S.sel.clear(); S.rect = null; selChanged(); } draw(); }
    else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); histFwd(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); histBack(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (S.erase && S.sel.size) { e.preventDefault(); deleteSel(); }
      else if (S.mode === 'nav' && S.info) { e.preventDefault(); deleteInfo(); }
    }

  });
  new ResizeObserver(resize).observe(stage);

  // ---------- Calques ----------
  // nombre d'objets restants par calque ; un calque vide (supprimé) n'est plus listé
  function liveCounts() { const m = new Map(); if (S.ex) for (const p of S.ex.prims) if (!S.del.has(p.sig)) m.set(p.layer, (m.get(p.layer) || 0) + 1); return m; }
  const byShown = (a, b) => shown(a).localeCompare(shown(b), 'fr', { numeric: true, sensitivity: 'base' });
  const listed = (l, lc) => (lc.get(l.name) || 0) > 0 || (l.made && (S.newLayers || []).some(n => n.name === l.name));
  function deleteLayer(i) {
    const L = S.layers[i]; if (!L) return;
    const sigs = S.ex.prims.filter(p => p.layer === L.name && !S.del.has(p.sig)).map(p => p.sig);
    sigs.forEach(s => S.del.add(s));
    if (L.made) S.newLayers = S.newLayers.filter(n => n.name !== L.name);
    S.sel = new Set([...S.sel].filter(p => p.layer !== L.name)); if (S.info && S.info.layer === L.name) { S.info = null; $('infoBox').hidden = true; }
    refreshGeometry(); updateEraseBar();
    commit('Calque supprimé : ' + shown(L) + ' (' + plural(sigs.length, 'objet') + ')');
    $('dlMsg').textContent = 'Calque ' + shown(L) + ' supprimé avec ses ' + plural(sigs.length, 'objet') + '. Ctrl+Z pour annuler.';
  }
  function renderLayers() {
    const q = $('layerFilter').value.trim().toLowerCase(), lc = liveCounts();
    const sameName = new Map(); for (const l of S.layers) if (listed(l, lc)) sameName.set(shown(l), (sameName.get(shown(l)) || 0) + 1);
    const html = S.layers.filter(l => listed(l, lc) && (!q || l.name.toLowerCase().includes(q) || (l.rename || '').toLowerCase().includes(q))).sort(byShown).map(l => {
      const i = S.layers.indexOf(l);
      return '<div class="lay' + (l.on ? '' : ' off') + '" data-i="' + i + '"><input type="checkbox" id="lay' + i + '" ' + (l.on ? 'checked' : '') + ' aria-label="Garder ' + esc(l.name) + '">' +
        '<button type="button" class="sw" data-color="' + i + '" title="Changer la couleur" aria-label="Couleur de ' + esc(l.name) + '" style="background:' + ACI[l.color] + '"></button><span class="nm" title="' + esc(l.rename ? l.rename + ' (origine : ' + l.name + ')' : l.name) + '">' + esc(shown(l)) + (l.auto ? '<span class="tag">auto</span>' : '') + (l.made ? '<span class="tag new">nouveau</span>' : '') + (sameName.get(shown(l)) > 1 ? '<span class="tag merge" title="Plusieurs calques portent ce nom : ils seront fusionnés en un seul dans le DXF exporté">fusionné</span>' : '') + (l.rename ? '<span class="was">← ' + esc(l.name) + '</span>' : '') + '</span>' +
        '<span class="n">' + fmtInt(lc.get(l.name) || 0) + '</span><button class="del" type="button" data-del="' + i + '" title="Supprimer ce calque et son contenu" aria-label="Supprimer le calque ' + esc(shown(l)) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg></button><button class="ren" type="button" data-ren="' + i + '" title="Renommer le calque" aria-label="Renommer ' + esc(l.name) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg></button><button class="solo" type="button" data-solo="' + i + '" title="Garder uniquement ce calque">SEUL</button></div>';
    }).join('');
    $('layers').innerHTML = html || '<div class="hint" style="padding:8px">Aucun calque ne correspond.</div>';
    const vis = S.layers.filter(l => listed(l, lc));
    $('layCount').textContent = vis.filter(l => l.on).length + ' gardés / ' + vis.length;
  }
  $('layers').addEventListener('click', e => {
    if (e.target.closest('input.rn')) return;
    const db = e.target.closest('[data-del]');
    if (db) {
      if (!db.classList.contains('armed')) {
        $('layers').querySelectorAll('.del.armed').forEach(b => b.classList.remove('armed'));
        db.classList.add('armed'); db.title = 'Cliquer encore pour confirmer la suppression';
        clearTimeout(db._t); db._t = setTimeout(() => { db.classList.remove('armed'); db.title = 'Supprimer ce calque et son contenu'; }, 3000);
        $('dlMsg').textContent = 'Clique une 2ᵉ fois sur la corbeille pour supprimer le calque ' + shown(S.layers[+db.dataset.del]) + '.';
        return;
      }
      deleteLayer(+db.dataset.del); return;
    }
    const rb = e.target.closest('[data-ren]');
    if (rb) { startRename(+rb.dataset.ren); return; }
    const sw = e.target.closest('[data-color]');
    if (sw) { openColorPop(+sw.dataset.color, sw); return; }
    const solo = e.target.closest('[data-solo]');
    if (solo) { const i = +solo.dataset.solo; S.layers.forEach((l, k) => { l.on = k === i; }); changed('Seul calque affiché : ' + shown(S.layers[i])); return; }
    const row = e.target.closest('.lay'); if (!row) return;
    const l = S.layers[+row.dataset.i];
    if (e.target.tagName === 'INPUT') l.on = e.target.checked; else l.on = !l.on;
    l.auto = false; changed((l.on ? 'Calque gardé : ' : 'Calque retiré : ') + shown(l));
  });
  $('layers').addEventListener('pointerover', e => { const row = e.target.closest('.lay'); const n = row ? S.layers[+row.dataset.i].name : null; if (n !== S.hoverLayer) { S.hoverLayer = n; draw(); } });
  $('layers').addEventListener('pointerleave', () => { S.hoverLayer = null; draw(); });
  $('layerFilter').addEventListener('input', renderLayers);
  const visibleLayers = () => { const q = $('layerFilter').value.trim().toLowerCase(); return S.layers.filter(l => !q || l.name.toLowerCase().includes(q)); };
  $('allOn').onclick = () => { visibleLayers().forEach(l => l.on = true); changed('Tous les calques gardés'); };
  $('allOff').onclick = () => { visibleLayers().forEach(l => l.on = false); changed('Tous les calques retirés'); };
  $('invert').onclick = () => { visibleLayers().forEach(l => l.on = !l.on); changed('Sélection des calques inversée'); };
  $('applyAll').onclick = () => {
    savePlan(); const src = new Map(S.layers.map(l => [l.name, l])); let n = 0;
    plans.forEach((p, i) => { if (i === cur) return; for (const l of p.st.layers) { const s = src.get(l.name); if (!s) continue; l.on = s.on; l.color = s.color; l.colorSet = s.colorSet; l.rename = s.rename; l.auto = false; n++; } });
    refreshBadges(); renderTabs();
    $('dlMsg').textContent = n ? 'Réglages de ' + n + ' calques copiés vers les ' + (plans.length - 1) + ' autres plans (même nom de calque).' : 'Aucun calque de même nom dans les autres plans.';
  };
  function startRename(i) {
    const L = S.layers[i]; if (!L) return;
    if ($('layerFilter').value) { $('layerFilter').value = ''; renderLayers(); }
    const row = $('layers').querySelector('[data-i="' + i + '"]'); if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    const nm = row.querySelector('.nm'), inp = document.createElement('input');
    inp.className = 'rn'; inp.id = 'rn' + i; inp.value = shown(L); inp.maxLength = 31; inp.setAttribute('aria-label', 'Nouveau nom du calque');
    nm.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = save => {
      if (done) return; done = true;
      const was = shown(L);
      if (save) {
        const v = DXF.cleanName(inp.value.trim());
        L.rename = (!inp.value.trim() || v === DXF.cleanName(L.name)) ? '' : v;
        if (shown(L) !== was) setTimeout(() => commit('Calque ' + was + ' renommé en ' + shown(L)), 0);
        const rm = renGet(); if (L.rename) rm[L.name] = L.rename; else delete rm[L.name]; if (!S.sample) renSet(rm);
      }
      renderLayers(); if (S.info) showInfo(); updateAll();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); commit(false); } });
    inp.addEventListener('blur', () => commit(true));
    inp.addEventListener('click', e => e.stopPropagation());
  }
  function changed(label) {
    const on = layerOnMap(); for (const p of [...S.sel]) if (!on.get(p.layer)) S.sel.delete(p); buildSelPath(); updateEraseBar();
    if (!S.sample) { const m = memGet(); for (const l of S.layers) m[l.name] = l.on; memSet(m); }
    renderLayers(); updateAll(); if (label) commit(label);
  }

  // ---------- Échelle ----------
  $('unit').addEventListener('change', () => {
    const v = $('unit').value; $('factor').hidden = v !== 'custom';
    if (v !== 'custom') { S.factor = +v; $('factor').value = v; } else S.factor = +$('factor').value || 1;
    S.unitReason = 'user'; updateAll();
    if (v !== 'custom') commit('Unité du plan : ' + $('unit').selectedOptions[0].text);
  });
  $('factor').addEventListener('input', () => { S.factor = +$('factor').value || 1; S.unitReason = 'user'; updateAll(); });
  $('factor').addEventListener('change', () => commit('Facteur d\'échelle : ×' + S.factor));
  for (const id of ['optExplode', 'optDedupe', 'optDec']) $(id).addEventListener('change', updateAll);
  $('optPoints').addEventListener('change', () => S.doc && rebuild(false));

  // ---------- Calcul de la sortie + constat ----------
  let tmr = 0;
  function updateAll() { clearTimeout(tmr); tmr = setTimeout(() => { computeOut(); if (S.ref) buildRef(false); }, 60); updateScaleInfo(); renderOrigin(); draw(); }
  function updateScaleInfo() {
    if (!S.rext) return;
    const ke = (S.ex && keptExtents()) || S.rext;
    const f = S.factor, w = (ke[2] - ke[0]) * f, h = (ke[3] - ke[1]) * f;
    $('dims').textContent = 'Emprise du plan : ' + fmt(w, 2) + ' × ' + fmt(h, 2) + ' m';
    const un = DXF.UNIT_NAMES[S.doc.insunits] || 'non défini';
    let hint = '', cls = 'hint';
    if (S.unitReason === 'declared') hint = f === 1 ? 'Unité déclarée dans le fichier : m. Rien à convertir.' : 'Unité déclarée dans le fichier : ' + un + '. Conversion en mètres appliquée.';
    else if (S.unitReason === 'override') { hint = 'Le fichier se déclare en ' + un + ', mais les dimensions ne collent pas. Unité corrigée d\'après la taille du bâtiment : vérifie avec l\'outil Mesurer.'; cls = 'hint warn'; }
    else if (S.unitReason === 'guess') { hint = 'Aucune unité déclarée dans le fichier. Unité déduite de la taille du bâtiment : vérifie une cote connue avec l\'outil Mesurer.'; cls = 'hint warn'; }
    else hint = 'Unité choisie à la main.';
    if (w > 1500 || Math.max(w, h) < 2) { hint = 'Emprise de ' + fmt(Math.max(w, h), 1) + ' m : l\'échelle paraît fausse. Change l\'unité ci-dessus.'; cls = 'hint warn'; }
    $('unitHint').textContent = hint; $('unitHint').className = cls;
    const ss = $('scaleSum'); ss.textContent = (f === 1 ? 'm' : unitLabel(f) + ' → m') + ' · ' + fmt(w, 1) + ' × ' + fmt(h, 1) + ' m'; ss.className = 'count' + (cls === 'hint warn' ? ' warn' : '');
    S.scaleWarn = cls === 'hint warn';
  }
  function computeOut() {
    if (!S.ex) return;
    const on = layerOnMap();
    const kept = S.ex.prims.filter(p => alive(p, on));
    if (S.dups) findDups();
    const ren = new Map(S.layers.filter(l => l.rename).map(l => [l.name, l.rename]));
    let outPrims = ren.size ? kept.map(p => ren.has(p.layer) ? Object.assign({}, p, { layer: ren.get(p.layer) }) : p) : kept;
    if (S.xf) { // recalage : coordonnées exprimées dans le repère choisi
      const f = S.factor, T = (x, y) => { const m = toRefM(x, y); return [m[0] / f, m[1] / f]; }, da = -S.xf.th * 180 / Math.PI, A = a => ((a + da) % 360 + 360) % 360;
      outPrims = outPrims.map(p => {
        if (p.k === 'L') { const a = T(p.x1, p.y1), b = T(p.x2, p.y2); return Object.assign({}, p, { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); }
        if (p.k === 'P') return Object.assign({}, p, { pts: p.pts.map(q => { const a = T(q[0], q[1]); return [a[0], a[1], q[2] || 0]; }) });
        const a = T(p.x, p.y), o = Object.assign({}, p, { x: a[0], y: a[1] });
        if (p.k === 'A') { o.a0 = A(p.a0); o.a1 = A(p.a1); }
        return o;
      });
    }
    const lc = new Map(), ov = new Set();
    for (const l of S.layers) { const n = shown(l); if (!lc.has(n) || l.on) lc.set(n, l.color); if (l.colorSet) ov.add(n); }
    S.out = DXF.write(outPrims, S.doc.layers, { ptName, ptZ, scale: S.factor, decimals: +$('optDec').value, explodePoly: $('optExplode').checked, dedupe: $('optDedupe').checked, layerColor: lc, override: ov });
    const nPts = kept.filter(p => p.k === 'T').length; $('csvBtn').hidden = !nPts; $('csvLabel').textContent = 'Exporter les ' + fmtInt(nPts) + ' point' + (nPts > 1 ? 's' : '') + ' (.csv)';
    const size = new Blob([S.out.text]).size; S.outBytes = size;
    $('outSize').textContent = fmtSize(size);
    const g = $('gauge'); g.classList.toggle('over', size > LIMIT); g.firstElementChild.style.width = Math.min(100, size / LIMIT * 100) + '%';
    $('outMeta').textContent = fmtInt(S.out.count) + ' objets · ' + S.out.layers + ' calques · DXF R12 en m' + (S.out.dups ? ' · ' + fmtInt(S.out.dups) + ' doublons retirés' : '');
    $('dlBtn').disabled = !S.out.count;
    $('optSum').textContent = [$('optExplode').checked ? 'lignes/arcs' : 'polylignes', $('optDedupe').checked ? 'sans doublons' : '', $('optDec').selectedOptions[0].text].filter(Boolean).join(' · ');
    renderFindings();
  }
  function renderFindings() {
    const d = S.doc, ex = S.ex, st = ex.stats;
    const usedB = [...d.blocks.keys()].filter(n => !n.startsWith('*')).length, unusedB = Math.max(0, usedB - ex.usedBlocks.size);
    const removedAnno = st.texte + st.cote + st.hachure;
    const layersIn = d.layers.size, layersOut = S.out ? S.out.layers : 0;
    const unitIn = DXF.UNIT_NAMES[d.insunits] || 'non défini';
    const f = S.factor, unitFix = f !== 1;
    const items = [
      ['Fichier reçu', fmtSize(S.size) + (d.version ? ' · ' + verName(d.version) : ''), S.size > LIMIT ? 'bad' : 'ok'],
      ['Unité', unitFix ? (unitLabel(f) + ' → m') : 'm, correct', unitFix ? 'fix' : 'ok'],
      ['Blocs inutilisés purgés', fmtInt(unusedB) + ' sur ' + fmtInt(usedB), unusedB ? 'fix' : 'ok'],
      ['Textes, cotes, hachures', fmtInt(removedAnno) + ' retirés', removedAnno ? 'fix' : 'ok'],
      ['Calques', layersIn + ' → ' + layersOut, 'fix'],
      ['Origine X / Y', S.ref && S.ref.verdict ? (S.ref.verdict.kind === 'ok' ? 'identique à la réf.' : S.ref.verdict.kind === 'bad' ? 'décalée / réf.' : 'à vérifier') : (S.originDist ? 'à ' + (S.originDist >= 1000 ? fmt(S.originDist / 1000, 1) + ' km' : fmt(S.originDist, 0) + ' m') + ' du plan' : 'dans le plan'), S.ref && S.ref.verdict ? (S.ref.verdict.kind === 'ok' ? 'ok' : S.ref.verdict.kind === 'bad' ? 'bad' : 'fix') : 'ok'],
      ...(S.layers.some(l => l.rename) ? [['Calques renommés', fmtInt(S.layers.filter(l => l.rename).length), 'fix']] : []),
      ...(S.created.some(p => p.k === 'T') ? [['Points créés', fmtInt(S.created.filter(p => p.k === 'T').length), 'fix']] : []),
      ...(S.created.some(p => p.k !== 'T') ? [['Tracés ajoutés', fmtInt(S.created.filter(p => p.k !== 'T').length), 'fix']] : []),
      ...(S.del.size ? [['Effacés à la main', fmtInt(S.ex.prims.filter(p => S.del.has(p.sig)).length) + ' objets', 'fix']] : []),
      ['Fichier station', S.out ? fmtSize(S.outBytes) : '–', S.outBytes > LIMIT ? 'bad' : 'ok'],
    ];
    renderStatsBtn();
    $('findings').innerHTML = items.map(([k, v, c]) => '<div class="find ' + c + '"><span class="k">' + k + '</span><span class="v">' + esc(v) + '</span></div>').join('');
    $('fileinfo').innerHTML = (S.sample ? '<span class="sample-tag">Plan d\'exemple</span> ' : '') + (plans.length > 1 ? '' : '<b>' + esc(S.name) + '</b>') + (S.reused ? ' · choix de calques repris pour ' + S.reused + ' calques déjà vus' : '');
  }
  const verName = v => ({ AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' }[v] ? 'DXF ' + { AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' }[v] : v);
  const unitLabel = f => ({ 1: 'm', 0.1: 'dm', 0.01: 'cm', 0.001: 'mm', 0.0254: 'pouce', 0.3048: 'pied' }[f] || '×' + f);

  // ---------- Origine et comparaison entre étages ----------
  function unitFor(doc, prims) {
    const xs = [], ys = [];
    for (const p of prims) { if (p.k === 'L') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); } else if (p.k === 'P') for (const q of p.pts) { xs.push(q[0]); ys.push(q[1]); } else { xs.push(p.x); ys.push(p.y); } }
    if (!xs.length) return 1;
    const fx = Float64Array.from(xs).sort(), fy = Float64Array.from(ys).sort(), q = (a, t) => a[Math.round(t * (a.length - 1))];
    const span = Math.max(q(fx, .995) - q(fx, .005), q(fy, .995) - q(fy, .005)), declared = DXF.UNIT_TO_M[doc.insunits];
    const ok = f => span * f >= 2 && span * f <= 1500;
    if (declared && ok(declared)) return declared;
    return [1, 0.01, 0.001].filter(ok).sort((a, b) => Math.abs(Math.log(span * a / 40)) - Math.abs(Math.log(span * b / 40)))[0] || 1;
  }
  // points caractéristiques en mètres (extrémités, sommets, centres)
  function keyPoints(prims, f, xf) {
    const out = [], put = (x, y) => { const m = toRefMx(x, y, f, xf); out.push(m[0], m[1]); };
    for (const p of prims) {
      if (p.k === 'L') { put(p.x1, p.y1); put(p.x2, p.y2); }
      else if (p.k === 'P') for (const q of p.pts) put(q[0], q[1]);
      else put(p.x, p.y);
    }
    return out;
  }
  function setRef(name, doc, prims, f, xf) {
    S.ref = { name, doc, prims, f, xf: xf ? Object.assign({}, xf) : null, key: '' };
    buildRef(true);
  }
  function buildRef(force) {
    const R0 = S.ref; if (!R0 || !S.ex) { $('refInfo').hidden = true; return; }
    const key = S.factor + '|' + R0.f + '|' + S.origin + '|' + S.ex.prims.length + '|' + S.del.size + '|' + JSON.stringify(S.xf) + '|' + JSON.stringify(R0.xf);
    if (!force && key === R0.key) return; R0.key = key;
    // tracé de la référence dans le repère local du plan courant
    const ox = S.origin[0], oy = S.origin[1], path = new Path2D();
    const P = (x, y) => { const m = toRefMx(x, y, R0.f, R0.xf), a = fromRefMx(m[0], m[1], S.factor, S.xf); return [a[0] - ox, a[1] - oy]; };
    for (const p of R0.prims) {
      const q = polyAbs(p, 0, 0); if (q.length < 4) continue;
      let a = P(q[0], q[1]); path.moveTo(a[0], a[1]); for (let i = 2; i < q.length; i += 2) { a = P(q[i], q[i + 1]); path.lineTo(a[0], a[1]); }
    }
    R0.path = path;
    R0.verdict = compareRef();
    renderRef(); draw();
  }
  function compareRef() {
    const R0 = S.ref, on = layerOnMap();
    const A = keyPoints(R0.prims, R0.f, R0.xf), B = keyPoints(S.ex.prims.filter(p => p.k !== 'T' && alive(p, on)), S.factor, S.xf);
    if (A.length < 20 || B.length < 20) return { kind: 'warn', n: 0 };
    const cell = 0.02, keyOf = (x, y) => Math.round(x / cell) + ',' + Math.round(y / cell);
    const set = new Set(); for (let i = 0; i < A.length; i += 2) set.add(keyOf(A[i], A[i + 1]));
    const matchAt = (dx, dy) => { // part des points du plan courant qui tombent sur un point de la référence
      let m = 0, n = 0; const step = Math.max(2, 2 * Math.floor(B.length / 2 / 4000));
      for (let i = 0; i < B.length; i += step) { n++; const x = Math.round((B[i] + dx) / cell), y = Math.round((B[i + 1] + dy) / cell);
        for (let a = -1; a <= 1 && true; a++) { let hit = false; for (let b = -1; b <= 1; b++) if (set.has((x + a) + ',' + (y + b))) { hit = true; break; } if (hit) { m++; break; } } }
      return m / n;
    };
    const s0 = matchAt(0, 0);
    // vote des translations entre échantillons de points (recherche d'un décalage)
    const sample = (arr, n) => { const out = [], st = Math.max(1, Math.floor(arr.length / 2 / n)); for (let i = 0; i < arr.length / 2; i += st) out.push(arr[2 * i], arr[2 * i + 1]); return out; };
    const a = sample(A, 500), b = sample(B, 500), votes = new Map();
    for (let i = 0; i < a.length; i += 2) for (let j = 0; j < b.length; j += 2) {
      const kk = Math.round((a[i] - b[j]) / 0.05) + ',' + Math.round((a[i + 1] - b[j + 1]) / 0.05); votes.set(kk, (votes.get(kk) || 0) + 1);
    }
    const top = [...votes.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12);
    let best = { s: s0, dx: 0, dy: 0 };
    for (const [kk] of top) {
      const [i, j] = kk.split(',').map(Number); let dx = i * 0.05, dy = j * 0.05;
      // affinage au centimètre
      for (let r = 0; r < 2; r++) { const st = r ? 0.005 : 0.02; let bb = { s: -1 }; for (let u = -2; u <= 2; u++) for (let v = -2; v <= 2; v++) { const s = matchAt(dx + u * st, dy + v * st); if (s > bb.s) bb = { s, dx: dx + u * st, dy: dy + v * st }; } dx = bb.dx; dy = bb.dy; if (bb.s > best.s) best = bb; }
    }
    // affinage au millimètre : médiane des écarts entre chaque point et son voisin le plus proche dans la référence
    const bc = 0.05, buckets = new Map();
    for (let i = 0; i < A.length; i += 2) { const kk = Math.round(A[i] / bc) + ',' + Math.round(A[i + 1] / bc); let arr = buckets.get(kk); if (!arr) buckets.set(kk, arr = []); arr.push(A[i], A[i + 1]); }
    const med = v => { v.sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const refine = (dx, dy) => {
      for (let it = 0; it < 3; it++) {
        const ex = [], ey = [], step = Math.max(2, 2 * Math.floor(B.length / 2 / 6000));
        for (let i = 0; i < B.length; i += step) {
          const x = B[i] + dx, y = B[i + 1] + dy, ix = Math.round(x / bc), iy = Math.round(y / bc); let bd = (0.04) ** 2, bx = 0, by = 0, hit = false;
          for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) { const arr = buckets.get((ix + a) + ',' + (iy + b2)); if (!arr) continue; for (let k = 0; k < arr.length; k += 2) { const d = (arr[k] - x) ** 2 + (arr[k + 1] - y) ** 2; if (d < bd) { bd = d; bx = arr[k] - x; by = arr[k + 1] - y; hit = true; } } }
          if (hit) { ex.push(bx); ey.push(by); }
        }
        if (ex.length < 10) break; dx += med(ex); dy += med(ey);
      }
      return [dx, dy];
    };
    if (s0 >= 0.12 && s0 >= best.s * 0.8) {
      const [dx, dy] = refine(0, 0);
      if (Math.hypot(dx, dy) <= 0.002) return { kind: 'ok', s: s0 };
      return { kind: 'bad', s: s0, dx, dy };
    }
    if (best.s >= 0.12) { const [dx, dy] = refine(best.dx, best.dy); if (Math.hypot(dx, dy) > 0.002) return { kind: 'bad', s: best.s, dx, dy }; return { kind: 'ok', s: best.s }; }
    return { kind: 'warn', s: s0 };
  }
  function renderRef() {
    const R0 = S.ref, box = $('refInfo'); if (!R0) { box.hidden = true; return; }
    const v = R0.verdict || {}, unitOpts = [[1, 'm'], [0.1, 'dm'], [0.01, 'cm'], [0.001, 'mm']];
    let vh = '';
    if (v.kind === 'ok') vh = '<div class="verdict ok"><b>Même origine X / Y.</b> Écart inférieur à 2 mm ; ' + Math.round(v.s * 100) + ' % des points du plan tombent sur la référence.</div>';
    else if (v.kind === 'bad') vh = '<div class="verdict bad"><b>Origine différente.</b> Le plan est décalé par rapport à la référence de :<br><span class="mono">ΔX ' + fmt(-v.dx, 3) + ' m   ΔY ' + fmt(-v.dy, 3) + ' m</span><br>Avec ce décalage, ' + Math.round(v.s * 100) + ' % des points coïncident. À signaler au BET.</div>';
    else vh = '<div class="verdict warn"><b>Pas assez de points communs pour conclure.</b> Vérifie à l\'œil que les axes et les poteaux se superposent au tracé bleu.</div>';
    box.innerHTML = '<div class="refline"><span class="sw"></span>Référence : <b title="' + esc(R0.name) + '">' + esc(R0.name) + '</b>' +
      '<select id="refUnit" aria-label="Unité de la référence">' + unitOpts.map(([f, n]) => '<option value="' + f + '"' + (f === R0.f ? ' selected' : '') + '>' + n + '</option>').join('') + (unitOpts.some(o => o[0] === R0.f) ? '' : '<option selected value="' + R0.f + '">×' + R0.f + '</option>') + '</select>' +
      '<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="refShowCb"' + (S.refShow ? ' checked' : '') + '> afficher</label><button class="lnk" type="button" id="refDrop">retirer</button></div>' + vh;
    box.hidden = false;
    $('refUnit').onchange = () => { R0.f = +$('refUnit').value; buildRef(true); };
    $('refShowCb').onchange = () => { S.refShow = $('refShowCb').checked; draw(); };
    $('refDrop').onclick = () => { S.ref = null; box.hidden = true; draw(); renderFindings(); renderOriginSum(); };
    renderFindings(); renderOriginSum();
  }
  function renderOriginSum() {
    const os = $('originSum'), v = S.ref && S.ref.verdict;
    if (v && S.ref) { os.textContent = v.kind === 'ok' ? '✓ identique à ' + short(S.ref.name) : v.kind === 'bad' ? '⚠ décalée / ' + short(S.ref.name) : 'à vérifier'; os.className = 'count ' + (v.kind === 'ok' ? 'ok' : v.kind === 'bad' ? 'bad' : 'warn'); }
    else { os.textContent = S.originDist ? '0,0 à ' + (S.originDist >= 1000 ? fmt(S.originDist / 1000, 1) + ' km' : fmt(S.originDist, 0) + ' m') + ' du plan' : '0,0 dans le plan'; os.className = 'count'; }
  }
  function renderOrigin() {
    if (!S.rext) return;
    const e = S.ext, cs = [[e[0], e[1]], [e[2], e[1]], [e[2], e[3]], [e[0], e[3]]].map(p => toRefM(p[0], p[1]));
    const x0 = Math.min(...cs.map(p => p[0])), x1 = Math.max(...cs.map(p => p[0])), y0 = Math.min(...cs.map(p => p[1])), y1 = Math.max(...cs.map(p => p[1]));
    const inside = x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0;
    const dx = Math.max(x0, 0, -x1), dy = Math.max(y0, 0, -y1);
    S.originDist = inside ? 0 : Math.hypot(dx, dy);
    renderOriginSum();
    $('originInfo').innerHTML = 'Coordonnées du plan :<br>X ' + fmt(x0, 2) + ' → ' + fmt(x1, 2) + ' m<br>Y ' + fmt(y0, 2) + ' → ' + fmt(y1, 2) + ' m';
  }
  $('refOpen').onclick = () => $('refFile').click();
  $('refFile').addEventListener('change', async () => {
    const file = $('refFile').files[0]; $('refFile').value = ''; if (!file) return;
    $('busy').hidden = false; $('busy').textContent = 'Lecture de la référence…'; await new Promise(r => setTimeout(r, 30));
    try { const doc = DXF.parse(await file.arrayBuffer()); const ex = DXF.explode(doc, {}); setRef(file.name, doc, ex.prims, unitFor(doc, ex.prims)); }
    catch (err) { $('refInfo').hidden = false; $('refInfo').innerHTML = '<div class="verdict bad">Impossible de lire ce fichier : ' + esc(err.message || String(err)) + '</div>'; }
    finally { $('busy').hidden = true; }
  });
  $('refKeep').onclick = () => {
    if (!S.ex) return; const on = layerOnMap();
    setRef(S.name, S.doc, S.ex.prims.filter(p => p.k !== 'T' && alive(p, on)), S.factor, S.xf); S.ref.auto = false;
    $('dlMsg').textContent = S.name + ' gardé en référence. Ouvre maintenant le DXF d\'un autre étage pour comparer.';
  };

  // ---------- Recalage : origine et axe X choisis sur le plan ----------
  const xfNum = id => { const v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) ? v : 0; };
  function xfMsg(html) {
    const box = $('xfMsg'); box.hidden = false;
    const help = !S.xfP1 ? '<b>1.</b> Clique le point qui deviendra l\'origine (X ' + fmt(xfNum('xfX'), 3) + ' ; Y ' + fmt(xfNum('xfY'), 3) + '). Le viseur jaune accroche les croisements et extrémités.'
      : '<b>2.</b> Clique un point dans la direction de l\'axe X (par exemple l\'autre bout d\'un axe du bâtiment).';
    box.innerHTML = (html ? '<div>' + html + '</div>' : '') + '<div>' + help + '</div>' +
      (S.xfP1 ? '<div class="acts"><button class="tb" type="button" id="xfNoRot">Garder l\'orientation actuelle</button></div>' : '') + '<div class="muted">Échap pour abandonner.</div>';
    if (S.xfP1) $('xfNoRot').onclick = () => applyXf(S.xfP1, null);
  }
  function xfClick(wx, wy, tol) {
    const sp = snapAt(wx, wy, tol);
    if (!S.xfP1) { if (!sp) { xfMsg('Pas d\'accroche ici : l\'origine doit tomber sur un croisement, une extrémité ou un point.'); return; } S.xfP1 = [sp.x, sp.y]; xfMsg(); return; }
    const p = sp ? [sp.x, sp.y] : [wx, wy];
    if (Math.hypot(p[0] - S.xfP1[0], p[1] - S.xfP1[1]) * S.factor < 0.01) { xfMsg('Ce point est trop près de l\'origine.'); return; }
    applyXf(S.xfP1, p);
  }
  function applyXf(p1, p2) {
    const [ox, oy] = S.origin, a = [p1[0] + ox, p1[1] + oy];
    const th = p2 ? Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) : (S.xf ? S.xf.th : 0);
    S.xf = { ox: a[0] * S.factor, oy: a[1] * S.factor, th, X0: xfNum('xfX'), Y0: xfNum('xfY') };
    setMode('nav'); S.userView = false; fit(); renderXf(); updateAll();
    commit('Plan recalé : origine (' + fmt(S.xf.X0, 3) + ' ; ' + fmt(S.xf.Y0, 3) + '), rotation ' + fmt(-th * 180 / Math.PI, 2) + '°');
    $('dlMsg').textContent = 'Plan recalé. L\'export, les coordonnées et les points sont maintenant dans ce repère.';
    if (S.ref) buildRef(true);
  }
  function renderXf() {
    const x = S.xf;
    $('xfClear').hidden = !x; $('xfAll').hidden = !x || plans.length < 2;
    if (x) { $('xfX').value = fmt(x.X0, 3).replace(/\s/g, ''); $('xfY').value = fmt(x.Y0, 3).replace(/\s/g, ''); }
    const deg = x ? -x.th * 180 / Math.PI : 0;
    $('xfInfo').textContent = x ? 'Recalé : le point choisi vaut X ' + fmt(x.X0, 3) + ' ; Y ' + fmt(x.Y0, 3) + ' m' + (Math.abs(deg) > 1e-9 ? ', plan tourné de ' + fmt(deg, 3) + '°.' : ', sans rotation.') : 'Plan dans son repère d\'origine.';
    $('xfInfo').classList.toggle('on', !!x);
  }
  $('xfStart').onclick = () => { $('refSec').open = true; setMode('xf'); };
  $('xfClear').onclick = () => { if (!S.xf) return; S.xf = null; S.userView = false; fit(); renderXf(); updateAll(); commit('Recalage annulé'); if (S.ref) buildRef(true); };
  const xfCoordChange = () => { if (!S.xf) { if (S.mode === 'xf') xfMsg(); return; } S.xf = Object.assign({}, S.xf, { X0: xfNum('xfX'), Y0: xfNum('xfY') }); renderXf(); updateAll(); commit('Coordonnées de l\'origine : ' + fmt(S.xf.X0, 3) + ' ; ' + fmt(S.xf.Y0, 3)); if (S.ref) buildRef(true); };
  $('xfX').addEventListener('change', xfCoordChange); $('xfY').addEventListener('change', xfCoordChange);
  $('xfAll').onclick = () => {
    if (!S.xf) return; const xf = Object.assign({}, S.xf), keep = cur, from = baseName(); savePlan();
    for (let i = 0; i < plans.length; i++) { if (i === keep) continue; activate(i, true); S.xf = Object.assign({}, xf); S.userView = false; commit('Recalage copié depuis ' + from); savePlan(); }
    cur = -1; activate(keep, true); cur = keep; refreshBadges(); renderTabs(); updateAll();
    $('dlMsg').textContent = 'Recalage appliqué aux ' + (plans.length - 1) + ' autres étages (même origine et même rotation).';
  };

  // ---------- Accroche : extrémités et croisements ----------
  function geomNear(wx, wy, tol) {
    const { grid, cell, big } = S.hit, on = layerOnMap(), r = Math.min(20, Math.ceil(tol / cell));
    const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell), ids = new Set(big);
    for (let a = cx - r; a <= cx + r; a++) for (let b = cy - r; b <= cy + r; b++) { const arr = grid.get(a + ',' + b); if (arr) for (const i of arr) ids.add(i); }
    const [ox, oy] = S.origin, out = [], t2 = tol * tol * 2.25;
    for (const i of ids) {
      const p = S.ex.prims[i]; if (p.k === 'T' || !alive(p, on) || primDist2(p, wx, wy) > t2) continue;
      if (p.k === 'C' || p.k === 'A') { out.push({ id: i, c: [p.x - ox, p.y - oy, p.r], a: p.k === 'A' ? [p.a0, p.a1] : null }); continue; }
      if (p.k === 'L') { out.push({ id: i, s: [p.x1 - ox, p.y1 - oy, p.x2 - ox, p.y2 - oy] }); continue; }
      const q = polyOf(p);
      for (let k = 0; k + 3 < q.length; k += 2) if (segDist2(wx, wy, q[k], q[k + 1], q[k + 2], q[k + 3]) <= t2) out.push({ id: i, s: [q[k], q[k + 1], q[k + 2], q[k + 3]] });
      if (out.length > 300) break;
    }
    return out;
  }
  const inArc = (g, x, y) => { if (!g.a) return true; let a = Math.atan2(y - g.c[1], x - g.c[0]) * 180 / Math.PI; a = (a + 360) % 360; const a0 = (g.a[0] + 360) % 360, a1 = (g.a[1] + 360) % 360; return a0 <= a1 ? a >= a0 - 1e-6 && a <= a1 + 1e-6 : a >= a0 - 1e-6 || a <= a1 + 1e-6; };
  function intersect(g, h) {
    const res = [];
    if (g.s && h.s) {
      const [ax, ay, bx, by] = g.s, [cx, cy, dx, dy] = h.s, rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12 * (rx * rx + ry * ry + sx * sx + sy * sy)) return res;
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den, v = ((cx - ax) * ry - (cy - ay) * rx) / den, e = 1e-9;
      if (t >= -e && t <= 1 + e && v >= -e && v <= 1 + e) res.push([ax + t * rx, ay + t * ry]);
    } else if (g.s || h.s) {
      const S0 = g.s ? g : h, C = g.s ? h : g, [ax, ay, bx, by] = S0.s, [cx, cy, r] = C.c;
      const dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy, A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), Cc = fx * fx + fy * fy - r * r, D = B * B - 4 * A * Cc;
      if (A < 1e-18 || D < 0) return res; const sq = Math.sqrt(D);
      for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (t >= -1e-9 && t <= 1 + 1e-9) { const x = ax + t * dx, y = ay + t * dy; if (inArc(C, x, y)) res.push([x, y]); }
    } else {
      const [x1, y1, r1] = g.c, [x2, y2, r2] = h.c, d = Math.hypot(x2 - x1, y2 - y1);
      if (d < 1e-12 || d > r1 + r2 || d < Math.abs(r1 - r2)) return res;
      const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, r1 * r1 - a * a)), mx = x1 + a * (x2 - x1) / d, my = y1 + a * (y2 - y1) / d;
      for (const sgn of [1, -1]) { const x = mx + sgn * hh * (y2 - y1) / d, y = my - sgn * hh * (x2 - x1) / d; if (inArc(g, x, y) && inArc(h, x, y)) res.push([x, y]); }
    }
    return res;
  }
  function snapAt(wx, wy, tol) {
    let best = null, bd = tol * tol;
    const geo = geomNear(wx, wy, tol);
    for (let i = 0; i < geo.length; i++) for (let j = i + 1; j < geo.length; j++) {
      if (geo[i].id === geo[j].id) continue;
      for (const [x, y] of intersect(geo[i], geo[j])) { const d = (x - wx) ** 2 + (y - wy) ** 2; if (d <= bd) { bd = d; best = { x, y, kind: 'int' }; } }
    }
    const ep = findSnap(wx, wy, tol);
    if (ep) { const d = (ep[0] - wx) ** 2 + (ep[1] - wy) ** 2; if (!best || d < bd * 0.25) best = { x: ep[0], y: ep[1], kind: 'end' }; }
    return best;
  }

  // ---------- Points créés ----------
  function refreshGeometry() {
    const counts = new Map(); for (const p of S.ex.prims) counts.set(p.layer, (counts.get(p.layer) || 0) + 1);
    mergeLayers(counts);
    buildSnap(); buildHit(); buildPaths(); renderLayers(); updateAll();
  }
  // nom et altitude (Z, en m) d'un point : saisie de l'utilisateur, sinon ce que porte le fichier
  function ptName(p) { const m = S.ptMeta && S.ptMeta.get(p.sig); return m && m.name !== undefined ? m.name : (p.name || ''); }
  function ptZ(p) {
    const m = S.ptMeta && S.ptMeta.get(p.sig); if (m && m.z !== undefined) return m.z;
    if (p.zm !== undefined && p.zm !== null) return p.zm;
    return p.z ? p.z * S.factor : null;
  }
  const zTxt = z => z === null ? '' : String(+z.toFixed(4)).replace('.', ',');
  function ptForm(p, id) {
    return '<div class="ptform"><label>Nom<input id="' + id + 'Name" maxlength="40" autocomplete="off" spellcheck="false" value="' + esc(ptName(p)) + '"></label>' +
      '<label>Z (m)<input id="' + id + 'Z" inputmode="decimal" autocomplete="off" placeholder="—" value="' + esc(zTxt(ptZ(p))) + '"></label>' +
      '<button class="tb" type="button" id="' + id + 'Ok">OK</button></div><div class="pterr" id="' + id + 'Err"></div>';
  }
  function bindPtForm(p, id, after) {
    const go = () => {
      const name = $(id + 'Name').value.replace(/\s+/g, ' ').trim().slice(0, 40), zs = $(id + 'Z').value.trim();
      const z = zs === '' ? null : parseFloat(zs.replace(/\s/g, '').replace(',', '.'));
      if (zs !== '' && !isFinite(z)) { $(id + 'Err').textContent = 'Z doit être un nombre en mètres (ex. 12,350).'; $(id + 'Z').focus(); return; }
      if (name === ptName(p) && (z === null ? ptZ(p) === null : ptZ(p) !== null && Math.abs(z - ptZ(p)) < 1e-9)) { if (after) after(true); return; }
      S.ptMeta.set(p.sig, { name, z });
      commit('Point ' + (name || 'sans nom') + (z !== null ? ' · Z ' + fmt(z, 3) : '') + ' modifié');
      updateAll(); if (after) after(false);
    };
    $(id + 'Ok').onclick = go;
    for (const k of ['Name', 'Z']) $(id + k).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } else if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); } });
  }
  function createPoint(x, y, kind) { createPointAbs(x + S.origin[0], y + S.origin[1], kind); }
  function createPointAbs(X, Y, kind, name, z) {
    const tol = 0.0005 / S.factor, on = layerOnMap();
    const twin = (S.ptList || []).find(p => Math.abs(p.x - X) < tol && Math.abs(p.y - Y) < tol && alive(p, on));
    if (twin) { pointMsg('Il y a déjà un point à cet endroit' + (ptName(twin) ? ' : <b>' + esc(ptName(twin)) + '</b>' : '') + '. Tu peux le nommer ici.', twin); return; }
    const n = S.created.reduce((m, p) => p.k === 'T' ? Math.max(m, +String(p.name).slice(1) || 0) : m, 0) + 1;
    const p = { k: 'T', layer: NEW_LAYER, x: X, y: Y, name: 'P' + n, created: true }; p.sig = sigOf(p);
    if (name || (z !== undefined && z !== null)) S.ptMeta.set(p.sig, { name: name || p.name, z: z === undefined ? null : z });
    S.created.push(p); S.ex.prims.push(p);
    const L = S.layers.find(l => l.name === NEW_LAYER); if (L) L.on = true;
    refreshGeometry();
    commit('Point ' + ptName(p) + ' créé');
    const q = toRefM(X, Y);
    pointMsg('<b>' + esc(ptName(p)) + '</b> créé ' + (kind === 'int' ? 'sur un croisement' : kind === 'xy' ? 'aux coordonnées' : 'sur une extrémité') + '<br><span class="mono">X ' + fmt(q[0], 3) + '   Y ' + fmt(q[1], 3) + ' m</span>', p, kind !== 'xy');
  }
  const undoPoint = () => histBack();
  function pointMsg(html, p, focusName) {
    const box = $('pointBox'); box.hidden = false; $('ptUndoBtn').disabled = !(S.histPos > 0);
    const nC = S.created.filter(q => q.k === 'T').length;
    box.innerHTML = (html ? '<div>' + html + '</div>' : '') + (p ? ptForm(p, 'pm') : '') +
      '<details class="ptxy"' + (S.ptxyOpen ? ' open' : '') + '><summary>Créer par coordonnées</summary><div class="ptform">' +
      '<label>X (m)<input id="pxX" inputmode="decimal" autocomplete="off"></label><label>Y (m)<input id="pxY" inputmode="decimal" autocomplete="off"></label>' +
      '<label>Z (m)<input id="pxZ" inputmode="decimal" autocomplete="off" placeholder="—"></label><label>Nom<input id="pxN" maxlength="40" autocomplete="off" spellcheck="false"></label>' +
      '<button class="tb" type="button" id="pxOk">Créer</button></div><div class="pterr" id="pxErr"></div><div class="muted">X / Y par rapport à l\'origine 0,0 du plan' + (S.xf ? ' (repère recalé)' : '') + '.</div></details>' +
      '<div class="muted">Clic sur un croisement de traits (viseur jaune ✕) ou une extrémité (carré) pour créer un point ; clic sur un point existant pour le nommer. ' + fmtInt(nC) + ' créé' + (nC > 1 ? 's' : '') + ', calque ' + NEW_LAYER + '.</div>';
    if (p) { bindPtForm(p, 'pm', same => { pointMsg(same ? '' : '<b>' + esc(ptName(p) || 'Point') + '</b> enregistré.'); }); if (focusName !== false) { const i = $('pmName'); i.focus(); i.select(); } }
    box.querySelector('.ptxy').addEventListener('toggle', e => { S.ptxyOpen = e.target.open; });
    const mk = () => {
      const v = id => { const t = $(id).value.trim(); return t === '' ? null : parseFloat(t.replace(/\s/g, '').replace(',', '.')); };
      const X = v('pxX'), Y = v('pxY'), Z = v('pxZ');
      if (X === null || Y === null || !isFinite(X) || !isFinite(Y) || (Z !== null && !isFinite(Z))) { $('pxErr').textContent = 'Entre X et Y en mètres (ex. 12,500). Z est facultatif.'; return; }
      const a = fromRefMx(X, Y, S.factor, S.xf);
      createPointAbs(a[0], a[1], 'xy', $('pxN').value.replace(/\s+/g, ' ').trim().slice(0, 40), Z);
    };
    $('pxOk').onclick = mk;
    for (const id of ['pxX', 'pxY', 'pxZ', 'pxN']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mk(); } });
  }

  // ---------- Couper (ajuster) aux intersections ----------
  const nrm = a => ((a % 360) + 360) % 360;
  function polySegs(p) { // segments d'une polyligne, en coordonnées absolues
    const out = [], n = p.pts.length, segs = p.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = p.pts[k], b = p.pts[(k + 1) % n], bu = a[2] || 0;
      if (Math.abs(bu) < 1e-9) { out.push({ k: 'L', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }); continue; }
      const th = 4 * Math.atan(bu), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 1e-12) continue;
      const r = d / (2 * Math.sin(Math.abs(th) / 2)), h = r * Math.cos(Math.abs(th) / 2) * Math.sign(bu);
      const ux = -(b[1] - a[1]) / d, uy = (b[0] - a[0]) / d, cx = (a[0] + b[0]) / 2 + ux * h, cy = (a[1] + b[1]) / 2 + uy * h;
      const aa = nrm(Math.atan2(a[1] - cy, a[0] - cx) * 180 / Math.PI), ab = nrm(Math.atan2(b[1] - cy, b[0] - cx) * 180 / Math.PI);
      out.push(bu > 0 ? { k: 'A', x: cx, y: cy, r, a0: aa, a1: ab } : { k: 'A', x: cx, y: cy, r, a0: ab, a1: aa });
    }
    return out;
  }
  function geoOf(q) { // géométrie d'un élément simple (L, A, C) en repère local, pour intersect()
    const [ox, oy] = S.origin;
    if (q.k === 'L') return { s: [q.x1 - ox, q.y1 - oy, q.x2 - ox, q.y2 - oy] };
    if (q.k === 'A') return { c: [q.x - ox, q.y - oy, q.r], a: [q.a0, q.a1] };
    if (q.k === 'C') return { c: [q.x - ox, q.y - oy, q.r], a: null };
    return null;
  }
  const simpleOf = q => q.k === 'P' ? polySegs(q) : (q.k === 'L' || q.k === 'A' || q.k === 'C') ? [q] : [];
  function elemDist(e, wx, wy) {
    const g = geoOf(e);
    if (g.s) return Math.sqrt(segDist2(wx, wy, g.s[0], g.s[1], g.s[2], g.s[3]));
    const d = Math.abs(Math.hypot(wx - g.c[0], wy - g.c[1]) - g.c[2]);
    if (!g.a || inArc(g, g.c[0] + (wx - g.c[0]), g.c[1] + (wy - g.c[1]))) return d;
    const p0 = [g.c[0] + g.c[2] * Math.cos(g.a[0] * Math.PI / 180), g.c[1] + g.c[2] * Math.sin(g.a[0] * Math.PI / 180)], p1 = [g.c[0] + g.c[2] * Math.cos(g.a[1] * Math.PI / 180), g.c[1] + g.c[2] * Math.sin(g.a[1] * Math.PI / 180)];
    return Math.min(Math.hypot(wx - p0[0], wy - p0[1]), Math.hypot(wx - p1[0], wy - p1[1]));
  }
  // calcule la coupe : quel morceau retirer et ce qui reste
  function computeTrim(wx, wy, tol) {
    const p = pick(wx, wy, tol); if (!p || p.k === 'T') return null;
    const parts = simpleOf(p); if (!parts.length) return null;
    let ti = 0; if (parts.length > 1) { let bd = Infinity; parts.forEach((e, i) => { const d = elemDist(e, wx, wy); if (d < bd) { bd = d; ti = i; } }); }
    const tgt = parts[ti], G = geoOf(tgt), on = layerOnMap(), [ox, oy] = S.origin;
    // paramètre d'un point sur l'élément visé : t (0..1) pour une ligne, angle relatif (degrés) pour un arc ou cercle
    const span = tgt.k === 'A' ? (nrm(tgt.a1 - tgt.a0) || 360) : 360;
    const par = (x, y) => G.s ? ((x - G.s[0]) * (G.s[2] - G.s[0]) + (y - G.s[1]) * (G.s[3] - G.s[1])) / ((G.s[2] - G.s[0]) ** 2 + (G.s[3] - G.s[1]) ** 2)
      : tgt.k === 'A' ? nrm(Math.atan2(y - G.c[1], x - G.c[0]) * 180 / Math.PI - tgt.a0) : nrm(Math.atan2(y - G.c[1], x - G.c[0]) * 180 / Math.PI);
    const lo0 = 0, hi0 = G.s ? 1 : span, eps = G.s ? 1e-7 : 1e-5;
    // boîte de l'élément visé pour limiter la recherche
    const bb = G.s ? [Math.min(G.s[0], G.s[2]), Math.min(G.s[1], G.s[3]), Math.max(G.s[0], G.s[2]), Math.max(G.s[1], G.s[3])] : [G.c[0] - G.c[2], G.c[1] - G.c[2], G.c[0] + G.c[2], G.c[1] + G.c[2]];
    const ts = [];
    for (const q of S.ex.prims) {
      if (q.k === 'T' || !alive(q, on)) continue; const b = q._bb;
      if (b[2] < bb[0] - 1e-9 || b[0] > bb[2] + 1e-9 || b[3] < bb[1] - 1e-9 || b[1] > bb[3] + 1e-9) continue;
      const els = simpleOf(q);
      els.forEach((e, i) => {
        if (q === p && i === ti) return;
        for (const [x, y] of intersect(G, geoOf(e))) { const t = par(x, y); if (tgt.k === 'C' || (t > lo0 + eps && t < hi0 - eps)) ts.push(t); }
      });
    }
    const tc = par(wx, wy);
    if (!ts.length) return { p, fail: 'Ce trait ne croise aucun autre trait affiché : rien à couper.' };
    ts.sort((a, b) => a - b);
    const uniq = ts.filter((t, i) => (i === 0 || t - ts[i - 1] > eps) && !(tgt.k === 'C' && i === ts.length - 1 && i > 0 && 360 - t + ts[0] <= eps));
    let lo = null, hi = null;
    for (const t of uniq) { if (t < tc) lo = t; else if (t > tc && hi === null) hi = t; }
    const keep = [], cut = [];
    const P = t => G.s ? [G.s[0] + (G.s[2] - G.s[0]) * t + ox, G.s[1] + (G.s[3] - G.s[1]) * t + oy] : null;
    if (G.s) {
      const a = lo === null ? 0 : lo, b = hi === null ? 1 : hi;
      if (lo !== null) { const A = P(0), B = P(lo); keep.push({ k: 'L', x1: A[0], y1: A[1], x2: B[0], y2: B[1] }); }
      if (hi !== null) { const A = P(hi), B = P(1); keep.push({ k: 'L', x1: A[0], y1: A[1], x2: B[0], y2: B[1] }); }
      const A = P(a), B = P(b); cut.push({ k: 'L', x1: A[0], y1: A[1], x2: B[0], y2: B[1] });
    } else if (tgt.k === 'A') {
      const ab = rel => nrm(tgt.a0 + rel), arc = (r0, r1) => ({ k: 'A', x: tgt.x, y: tgt.y, r: tgt.r, a0: ab(r0), a1: ab(r1) });
      if (lo !== null) keep.push(arc(0, lo)); if (hi !== null) keep.push(arc(hi, span));
      cut.push(arc(lo === null ? 0 : lo, hi === null ? span : hi));
    } else { // cercle : il faut deux intersections
      if (uniq.length < 2) return { p, fail: 'Pour couper un cercle, il faut qu\'il croise au moins 2 fois d\'autres traits.' };
      const L = lo !== null ? lo : uniq[uniq.length - 1], Hh = hi !== null ? hi : uniq[0];
      keep.push({ k: 'A', x: tgt.x, y: tgt.y, r: tgt.r, a0: nrm(Hh), a1: nrm(L) });
      cut.push({ k: 'A', x: tgt.x, y: tgt.y, r: tgt.r, a0: nrm(L), a1: nrm(Hh) });
    }
    const others = parts.filter((e, i) => i !== ti).map(e => Object.assign({}, e));
    return { p, keep: keep.concat(others), cut, tgt };
  }
  function applyTrim(res) {
    const p = res.p; S.del.add(p.sig);
    for (const e of res.keep) {
      const q = Object.assign(e, { layer: p.layer, c: p.c, created: true, uid: Date.now().toString(36) + (uidSeq++) });
      q.sig = sigOf(q); S.created.push(q); S.ex.prims.push(q);
    }
    refreshGeometry();
    const L = S.layers.find(l => l.name === p.layer);
    commit('Coupe : ' + ({ L: 'ligne', A: 'arc', C: 'cercle', P: 'polyligne' }[p.k] || 'trait') + ' (' + (L ? shown(L) : p.layer) + ')');
  }
  function drawCut(cut) { // morceau qui va être retiré, en rouge
    const [ox, oy] = S.origin; ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 3.5; ctx.setLineDash([6, 4]); ctx.beginPath();
    for (const e of cut) {
      if (e.k === 'L') { const a = toScreen(e.x1 - ox, e.y1 - oy), b = toScreen(e.x2 - ox, e.y2 - oy); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      else { const sw = nrm(e.a1 - e.a0) || 360, n = Math.max(8, Math.ceil(sw / 6)); for (let k = 0; k <= n; k++) { const an = (e.a0 + sw * k / n) * Math.PI / 180, s = toScreen(e.x - ox + e.r * Math.cos(an), e.y - oy + e.r * Math.sin(an)); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); } }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // ---------- Tracer : lignes, lignes en continu, rectangles, cercles, parallèles ----------
  S.lineTool = 'join'; S.lineLayer = LINE_LAYER;
  const TOOLS = [['ltJoin', 'join'], ['ltChain', 'chain'], ['ltRect', 'rect'], ['ltCircle', 'circle'], ['ltOff', 'offset'], ['ltTrim', 'trim']];
  function fillLineLayers() {
    const lc = liveCounts(), sel = $('lineLayer'), names = S.layers.filter(l => listed(l, lc)).sort(byShown).map(l => [l.name, shown(l)]);
    if (!names.some(n => n[0] === LINE_LAYER)) names.unshift([LINE_LAYER, LINE_LAYER + ' (nouveau)']);
    if (!names.some(n => n[0] === S.lineLayer)) S.lineLayer = LINE_LAYER;
    sel.innerHTML = names.map(([v, t]) => '<option value="' + esc(v) + '"' + (v === S.lineLayer ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  }
  $('lineLayer').addEventListener('change', () => { S.lineLayer = $('lineLayer').value; });
  function resetDraw() { S.trimPrev = null; S.l1 = null; S.chainStart = null; S.chainN = 0; S.chainLen = 0; S.offBase = null; S.offHover = null; S.offPrev = null; S.hover = null; S.hoverKind = null; S.hoverFree = null; S.cur = null; }
  function setLineTool(t) {
    if (S.lineTool === 'chain' && S.chainN) endChain('');
    S.lineTool = t; for (const [id, k] of TOOLS) $(id).classList.toggle('on', t === k);
    $('offWrap').hidden = t !== 'offset'; $('circWrap').hidden = t !== 'circle'; $('rectWrap').hidden = t !== 'rect';
    resetDraw(); lineMsg(); draw();
  }
  for (const [id, k] of TOOLS) $(id).onclick = () => setLineTool(k);
  $('lnUndoBtn').onclick = () => histBack();
  const numIn = id => { const v = parseFloat(String($(id).value).replace(',', '.')); return isFinite(v) && v > 0 ? v : NaN; };
  const offDist = () => numIn('offDist');
  $('offDist').addEventListener('input', () => { if (S.offBase && S.offCursor) { S.offPrev = offsetSeg(S.offBase, S.offCursor[0], S.offCursor[1]); draw(); } lineMsg(); });
  for (const id of ['circR', 'rectW', 'rectH']) $(id).addEventListener('input', () => { lineMsg(); draw(); });
  function endChain(pre) {
    if (S.chainN) lineMsg((pre || '') + 'Tracé terminé : ' + plural(S.chainN, 'segment') + ', ' + fmt(S.chainLen, 3) + ' m au total.');
    S.l1 = null; S.chainStart = null; S.chainN = 0; S.chainLen = 0; draw();
  }
  function lineMsg(html) {
    const box = $('lineBox'); box.hidden = false; const t = S.lineTool;
    const acc = ' (le viseur devient jaune quand il accroche une extrémité, un croisement ou un point ; sinon le point est libre)';
    let help;
    if (t === 'join') help = S.l1 ? 'Clique le 2ᵉ point. Échap pour annuler le 1ᵉʳ.' : 'Clique un 1ᵉʳ point : extrémité, croisement ou point créé (le viseur devient jaune quand il accroche).';
    else if (t === 'chain') help = !S.l1 ? 'Clique le point de départ' + acc + '.' : 'Clique le point suivant : chaque clic ajoute un segment. Maj enfoncée : segment horizontal ou vertical. Reclique le départ pour fermer. Fin : Échap, double-clic ou clic droit.';
    else if (t === 'rect') {
      const W = numIn('rectW'), H = numIn('rectH');
      help = !S.l1 ? 'Clique un 1ᵉʳ coin' + acc + '.' + (isFinite(W) || isFinite(H) ? ' Dimensions imposées : ' + (isFinite(W) ? fmt(W, 3) : 'libre') + ' × ' + (isFinite(H) ? fmt(H, 3) : 'libre') + ' m.' : ' Tu peux aussi taper les dimensions dans la barre.') :
        (isFinite(W) && isFinite(H) ? 'Clique du côté où doit partir le rectangle.' : 'Clique le coin opposé.') + ' Échap pour annuler.';
    } else if (t === 'trim') {
      help = 'Clique la partie du trait à retirer : elle est coupée aux intersections les plus proches (en rouge au survol). Marche sur les lignes, polylignes, arcs et cercles (un cercle doit être croisé au moins 2 fois).';
    } else if (t === 'circle') {
      const R0 = numIn('circR');
      help = isFinite(R0) ? 'Rayon imposé ' + fmt(R0, 3) + ' m : clique le centre' + acc + '.' : !S.l1 ? 'Clique le centre' + acc + ', ou tape un rayon dans la barre.' : 'Clique un point du cercle pour fixer le rayon. Échap pour annuler.';
    } else {
      const d = offDist();
      help = !isFinite(d) ? 'Tape un décalage en mètres (ex. 0,50) dans la barre en haut.' :
        S.offBase ? 'Place la souris du côté voulu et clique : file à ' + fmt(d, 3) + ' m. Tu peux cliquer de l\'autre côté pour une 2ᵉ file. Échap : choisir une autre ligne.' : 'Clique la ligne de référence (une ligne droite).';
    }
    box.innerHTML = (html ? '<div>' + html + '</div>' : '') + '<div class="muted">' + help + '</div>';
  }
  function nearestSeg(p, wx, wy) {
    const [ox, oy] = S.origin;
    if (p.k === 'L') return [p.x1 - ox, p.y1 - oy, p.x2 - ox, p.y2 - oy];
    if (p.k !== 'P') return null;
    let best = null, bd = Infinity; const n = p.pts.length, segs = p.closed ? n : n - 1;
    for (let k = 0; k < segs; k++) {
      const a = p.pts[k], b = p.pts[(k + 1) % n]; if (Math.abs(a[2] || 0) > 1e-9) continue;
      const s = [a[0] - ox, a[1] - oy, b[0] - ox, b[1] - oy], d = segDist2(wx, wy, s[0], s[1], s[2], s[3]);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function offsetSeg(b, cx, cy) {
    const d = offDist(); if (!isFinite(d)) return null;
    const dx = b[2] - b[0], dy = b[3] - b[1], L = Math.hypot(dx, dy); if (L < 1e-12) return null;
    const nx = -dy / L, ny = dx / L, side = ((cx - b[0]) * nx + (cy - b[1]) * ny) >= 0 ? 1 : -1, o = d / S.factor * side;
    return [b[0] + nx * o, b[1] + ny * o, b[2] + nx * o, b[3] + ny * o];
  }
  const ortho = (a, p) => { if (!S.shift || !a) return p; const A = toF(a), Pp = toF(p), dx = Pp[0] - A[0], dy = Pp[1] - A[1]; return fromF(Math.abs(dx) >= Math.abs(dy) ? [Pp[0], A[1]] : [A[0], Pp[1]]); };
  function rectCorner(a, c) { // coin opposé, dans le repère affiché (axes X / Y du plan ou du recalage)
    const A = toF(a), C = toF(c), W = numIn('rectW'), H = numIn('rectH'); let x = C[0], y = C[1];
    if (isFinite(W)) x = A[0] + (Math.sign(C[0] - A[0]) || 1) * W / S.factor;
    if (isFinite(H)) y = A[1] + (Math.sign(C[1] - A[1]) || 1) * H / S.factor;
    return fromF([x, y]);
  }
  function rectPts(a, p) { const A = toF(a), C = toF(rectCorner(a, p)); return { pts: [[A[0], A[1]], [C[0], A[1]], [C[0], C[1]], [A[0], C[1]]].map(fromF), w: Math.abs(C[0] - A[0]) * S.factor, h: Math.abs(C[1] - A[1]) * S.factor }; }
  const circRadius = (c, p) => { const R0 = numIn('circR'); return isFinite(R0) ? R0 / S.factor : Math.hypot(p[0] - c[0], p[1] - c[1]); };
  function lineHover(wx, wy) {
    const t = S.lineTool, f = S.factor;
    if (t === 'trim') { const r = computeTrim(wx, wy, 8 / S.view.s); S.trimPrev = r && !r.fail ? r.cut : null; S.hover = null; S.hoverFree = null; S.cur = null; return; }
    if (t === 'offset') {
      if (!S.offBase) { const p = pick(wx, wy, 8 / S.view.s); S.offHover = p ? nearestSeg(p, wx, wy) : null; }
      else { S.offCursor = [wx, wy]; S.offPrev = offsetSeg(S.offBase, wx, wy); }
      return;
    }
    const sp = snapAt(wx, wy, 12 / S.view.s);
    let p = sp ? [sp.x, sp.y] : [wx, wy];
    if (t === 'chain' && S.l1 && !sp) p = ortho(S.l1, p);
    S.hover = sp ? p : null; S.hoverKind = sp ? sp.kind : null; S.hoverFree = sp ? null : p; S.cur = p;
    if ((t === 'join' || t === 'chain') && S.l1) {
      const l = Math.hypot(p[0] - S.l1[0], p[1] - S.l1[1]) * f;
      lineMsg('Segment <b class="mono">' + fmt(l, 3) + ' m</b>' + (t === 'chain' && S.chainN ? ' · total <b class="mono">' + fmt(S.chainLen + l, 3) + ' m</b>' : ''));
    } else if (t === 'rect' && S.l1) {
      const rp = rectPts(S.l1, p); lineMsg('<b class="mono">' + fmt(rp.w, 3) + ' × ' + fmt(rp.h, 3) + ' m</b>');
    } else if (t === 'circle' && (S.l1 || isFinite(numIn('circR')))) {
      const r = S.l1 ? circRadius(S.l1, p) : numIn('circR') / f; lineMsg('Rayon <b class="mono">' + fmt(r * f, 3) + ' m</b> · Ø <b class="mono">' + fmt(2 * r * f, 3) + ' m</b>');
    }
  }
  function addCreated(prim, label) {
    Object.assign(prim, { layer: S.lineLayer || LINE_LAYER, created: true, uid: Date.now().toString(36) + (uidSeq++) });
    prim.sig = sigOf(prim); S.created.push(prim); S.ex.prims.push(prim);
    refreshGeometry();
    const L = S.layers.find(l => l.name === prim.layer); if (L && !L.on) { L.on = true; renderLayers(); updateAll(); }
    commit(label); fillLineLayers();
  }
  function addLine(x1, y1, x2, y2, label) { const [ox, oy] = S.origin; addCreated({ k: 'L', x1: x1 + ox, y1: y1 + oy, x2: x2 + ox, y2: y2 + oy }, label); }
  function lineClick(wx, wy, tol) {
    const t = S.lineTool, f = S.factor, [ox, oy] = S.origin, lay = esc(S.lineLayer);
    if (t === 'trim') {
      const r = computeTrim(wx, wy, tol);
      if (!r) { lineMsg('Aucun trait ici.'); return; }
      if (r.fail) { lineMsg(r.fail); return; }
      applyTrim(r); S.trimPrev = null; lineMsg('Morceau retiré. Ctrl+Z pour annuler.'); return;
    }
    if (t === 'offset') {
      const d = offDist(); if (!isFinite(d)) { lineMsg(); return; }
      if (!S.offBase) {
        const p = pick(wx, wy, tol); if (!p) { lineMsg('Aucune ligne ici.'); return; }
        const s = nearestSeg(p, wx, wy); if (!s) { lineMsg('Choisis une ligne droite : les arcs et cercles ne sont pas pris en charge.'); return; }
        S.offBase = s; S.offHover = null; S.offCursor = [wx, wy]; S.offPrev = offsetSeg(s, wx, wy); lineMsg(); return;
      }
      const o = offsetSeg(S.offBase, wx, wy); if (!o) return;
      addLine(o[0], o[1], o[2], o[3], 'File parallèle à ' + fmt(d, 3) + ' m');
      lineMsg('File à <b class="mono">' + fmt(d, 3) + ' m</b> créée sur ' + lay + '.'); return;
    }
    const sp = snapAt(wx, wy, tol);
    if (t === 'join') {
      if (!sp) { lineMsg('Pas d\'accroche ici : approche le viseur d\'une extrémité, d\'un croisement ou d\'un point.'); return; }
      if (!S.l1) { S.l1 = [sp.x, sp.y]; lineMsg(); return; }
      const len = Math.hypot(sp.x - S.l1[0], sp.y - S.l1[1]) * f;
      if (len < 0.0005) { lineMsg('Le 2ᵉ point est confondu avec le 1ᵉʳ.'); return; }
      addLine(S.l1[0], S.l1[1], sp.x, sp.y, 'Ligne tracée (' + fmt(len, 3) + ' m)');
      S.l1 = null; S.hover = null; lineMsg('Ligne de <b class="mono">' + fmt(len, 3) + ' m</b> créée sur ' + lay + '.'); return;
    }
    let p = sp ? [sp.x, sp.y] : [wx, wy];
    if (t === 'chain') {
      if (!S.l1) { S.l1 = p; S.chainStart = p; S.chainN = 0; S.chainLen = 0; lineMsg(); return; }
      if (!sp) p = ortho(S.l1, p);
      let closing = false;
      if (S.chainN >= 2 && Math.hypot(p[0] - S.chainStart[0], p[1] - S.chainStart[1]) <= tol) { p = S.chainStart; closing = true; }
      const len = Math.hypot(p[0] - S.l1[0], p[1] - S.l1[1]) * f; if (len < 0.0005) return;
      addLine(S.l1[0], S.l1[1], p[0], p[1], 'Segment (' + fmt(len, 3) + ' m)');
      S.chainN++; S.chainLen += len; S.l1 = p;
      if (closing) { endChain('Contour fermé. '); return; }
      lineMsg('Segment de <b class="mono">' + fmt(len, 3) + ' m</b> ajouté · total <b class="mono">' + fmt(S.chainLen, 3) + ' m</b>'); return;
    }
    if (t === 'rect') {
      if (!S.l1) { S.l1 = p; lineMsg(); return; }
      const rp = rectPts(S.l1, p), w = rp.w, h = rp.h;
      if (w < 0.001 || h < 0.001) { lineMsg('Rectangle trop petit : éloigne le 2ᵉ coin.'); return; }
      addCreated({ k: 'P', closed: true, pts: rp.pts.map(q => [q[0] + ox, q[1] + oy, 0]) }, 'Rectangle ' + fmt(w, 3) + ' × ' + fmt(h, 3) + ' m');
      S.l1 = null; lineMsg('Rectangle <b class="mono">' + fmt(w, 3) + ' × ' + fmt(h, 3) + ' m</b> créé sur ' + lay + '.'); return;
    }
    if (t === 'circle') {
      const R0 = numIn('circR');
      if (!S.l1 && !isFinite(R0)) { S.l1 = p; lineMsg(); return; }
      const c = S.l1 || p, r = S.l1 ? circRadius(S.l1, p) : R0 / f;
      if (r * f < 0.0005) { lineMsg('Rayon trop petit.'); return; }
      addCreated({ k: 'C', x: c[0] + ox, y: c[1] + oy, r }, 'Cercle R ' + fmt(r * f, 3) + ' m');
      S.l1 = null; lineMsg('Cercle de rayon <b class="mono">' + fmt(r * f, 3) + ' m</b> (Ø ' + fmt(2 * r * f, 3) + ' m) créé sur ' + lay + '.');
    }
  }

  // ---------- Info sur un objet ----------
  const TYPE = { L: 'Ligne', A: 'Arc', C: 'Cercle', P: 'Polyligne', T: 'Point' };
  function primLength(p) {
    if (p.k === 'L') return Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
    if (p.k === 'C') return 2 * Math.PI * p.r;
    if (p.k === 'A') { let sw = p.a1 - p.a0; while (sw <= 0) sw += 360; return p.r * sw * Math.PI / 180; }
    if (p.k === 'P') { let s = 0; const n = p.pts.length, segs = p.closed ? n : n - 1; for (let k = 0; k < segs; k++) { const a = p.pts[k], b = p.pts[(k + 1) % n], d = Math.hypot(b[0] - a[0], b[1] - a[1]), bu = a[2] || 0; s += Math.abs(bu) > 1e-9 ? d / (2 * Math.sin(Math.abs(2 * Math.atan(bu)))) * Math.abs(4 * Math.atan(bu)) : d; } return s; }
    return 0;
  }
  function showInfo() {
    const box = $('infoBox'), p = S.info; if (!p) { box.hidden = true; return; }
    const L = S.layers.find(l => l.name === p.layer) || { color: 7 }, f = S.factor, m = v => fmt(v * f, 3);
    let det = '';
    if (p.k === 'T') { const q = toRefM(p.x, p.y), z = ptZ(p); det = 'X ' + fmt(q[0], 3) + '   Y ' + fmt(q[1], 3) + (z !== null ? '   Z ' + fmt(z, 3) : '') + ' m'; }
    else if (p.k === 'C') det = 'Rayon ' + m(p.r) + ' m · Ø ' + m(2 * p.r) + ' m';
    else if (p.k === 'A') det = 'Rayon ' + m(p.r) + ' m · longueur ' + m(primLength(p)) + ' m';
    else if (p.k === 'P') det = p.pts.length + ' sommets' + (p.closed ? ', fermée' : '') + ' · longueur ' + m(primLength(p)) + ' m';
    else det = 'Longueur ' + m(primLength(p)) + ' m';
    box.innerHTML = '<div class="lname"><i style="background:' + ACI[L.color] + '"></i>' + esc(L.rename || p.layer) + '</div>' + (L.rename ? '<div class="muted">nom d\'origine : ' + esc(p.layer) + '</div>' : '') +
      '<div>' + TYPE[p.k] + (p.k === 'T' ? (ptName(p) ? ' ' + esc(ptName(p)) : '') : p.name ? ' ' + esc(p.name) : '') + '</div><div class="mono">' + det + '</div>' + (p.k === 'T' ? ptForm(p, 'inf') : '') +
      '<div class="acts"><button class="tb" type="button" id="infHide">Masquer ce calque</button><button class="tb" type="button" id="infColor">Couleur</button><button class="tb" type="button" id="infDel" title="Touche Suppr">Supprimer</button><button class="tb" type="button" id="infMove">Changer de calque</button><button class="tb" type="button" id="infRen">Renommer</button><button class="tb" type="button" id="infFind">Voir dans la liste</button></div>';
    box.hidden = false;
    $('infHide').onclick = () => { L.on = false; L.auto = false; S.info = null; box.hidden = true; changed('Calque retiré : ' + shown(L)); };
    $('infColor').onclick = ev => openColorPop(S.layers.indexOf(L), ev.currentTarget);
    $('infRen').onclick = () => startRename(S.layers.indexOf(L));
    $('infDel').onclick = deleteInfo;
    if (p.k === 'T') bindPtForm(p, 'inf', () => showInfo());
    $('infMove').onclick = ev => openMovePop(ev.currentTarget, new Set([p]));
    $('infFind').onclick = () => {
      $('layerFilter').value = ''; renderLayers();
      const row = $('layers').querySelector('[data-i="' + S.layers.indexOf(L) + '"]');
      if (row) { row.scrollIntoView({ block: 'center' }); row.style.background = 'color-mix(in srgb, var(--accent) 22%, transparent)'; setTimeout(() => { row.style.background = ''; }, 1600); }
    };
  }

  // ---------- Couleur d'un calque ----------
  let pop = null;
  function closeColorPop() { if (pop) { pop.remove(); pop = null; } }
  function openColorPop(i, anchor) {
    closeColorPop(); const L = S.layers[i]; if (!L) return;
    pop = document.createElement('div'); pop.className = 'color-pop';
    pop.innerHTML = '<div class="t">Couleur de <b>' + esc(shown(L)) + '</b></div><div class="grid">' +
      PALETTE.map(c => '<button type="button" data-c="' + c + '" class="' + (c === L.color ? 'cur' : '') + '" style="background:' + ACI[c] + '" title="Couleur ' + c + '" aria-label="Couleur ' + c + '"></button>').join('') +
      '</div>' + (L.colorSet ? '<button class="btn" type="button" data-reset="1">Revenir à la couleur d\'origine</button>' : '');
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)) + 'px';
    pop.style.top = (r.bottom + ph + 8 > window.innerHeight ? Math.max(8, r.top - ph - 6) : r.bottom + 6) + 'px';
    pop.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const cm = colGet();
      if (b.dataset.reset) { L.color = L.orig || 7; L.colorSet = false; delete cm[L.name]; }
      else { L.color = +b.dataset.c; L.colorSet = true; cm[L.name] = L.color; }
      if (!S.sample) colSet(cm);
      closeColorPop(); renderLayers(); if (S.info) showInfo(); updateAll();
      commit('Couleur du calque ' + shown(L) + (b.dataset.reset ? ' remise d\'origine' : ' changée'));
    });
  }
  document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('[data-color]') && e.target.id !== 'infColor') closeColorPop(); });

  // ---------- Export des points ----------
  async function exportCsv() {
    const on = layerOnMap(), dec = +$('optDec').value, f = S.factor; let k = 0;
    const rows = S.ex.prims.filter(p => p.k === 'T' && alive(p, on)).map(p => { const z = ptZ(p), q = toRefM(p.x, p.y); return (ptName(p).replace(/,/g, ' ') || 'PT' + (++k)) + ',' + q[0].toFixed(dec) + ',' + q[1].toFixed(dec) + ',' + (z === null ? '0' : z.toFixed(Math.max(3, dec))); });
    const text = rows.join('\r\n') + '\r\n', name = baseName() + '_points.csv', msg = $('dlMsg');
    if (downloads) {
      try { await downloads.save({ filename: name, data: text }); msg.textContent = 'Points enregistrés : ' + name + ' (Nom, X, Y, Z).'; }
      catch (e) { msg.textContent = e && e.code === 'declined' ? 'Téléchargement annulé.' : 'Le téléchargement n\'est pas disponible ici. Utilise la version de la page enregistrée sur ton PC.'; }
      return;
    }
    const r = await saveLocal(new Blob([text], { type: 'text/csv' }), name, 'Points CSV', 'csv'); msg.textContent = saveMsg(r, name, ' (Nom, X, Y, Z).');
  }
  $('csvBtn').onclick = exportCsv;
  // enregistrement : fenêtre « Enregistrer sous » (choix du dossier, clé USB…) quand le navigateur le permet, sinon Téléchargements
  let lastSaveHandle = null;
  async function saveLocal(blob, name, desc, ext) {
    lastSaveHandle = null;
    if (window.showSaveFilePicker && !(window.claude && window.claude.use)) {
      try {
        const hd = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: { 'application/octet-stream': ['.' + ext] } }] });
        const w = await hd.createWritable(); await w.write(blob); await w.close(); lastSaveHandle = hd; return 'saved:' + hd.name;
      } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return 'download';
  }
  const saveMsg = (r, name, extra) => r === 'cancel' ? 'Enregistrement annulé.' : r.startsWith('saved:') ? 'Enregistré : ' + r.slice(6) + (extra || '') : name + ' enregistré dans tes téléchargements' + (extra || '');

  // ---------- Téléchargement ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function makeZip(name, u8) { return makeZipMulti([{ name, u8 }]); }
  async function makeZipMulti(entries) {
    const parts = [], central = []; let off = 0;
    for (const en of entries) {
      const z = await zipEntry(en.name, en.u8, off); parts.push(...z.local); central.push(...z.central); off += z.localSize;
    }
    const cdSize = central.reduce((s, b) => s + b.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, end]);
  }
  async function zipEntry(name, u8, offset) {
    let data = u8, method = 0;
    if (typeof CompressionStream !== 'undefined') {
      try { const cs = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw')); data = new Uint8Array(await new Response(cs).arrayBuffer()); method = 8; } catch (e) { data = u8; method = 0; }
    }
    const nm = new TextEncoder().encode(name), crc = crc32(u8), d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, u8.length, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, u8.length, true); ch.setUint16(28, nm.length, true);
    ch.setUint32(42, offset, true);
    return { local: [lh, nm, data], central: [ch, nm], localSize: 30 + nm.length + data.length };
  }
  const outName = () => baseName() + '.dxf';
  let downloads = null; const inArtifact = !!(window.claude && window.claude.use);
  if (inArtifact) {
    $('dlLabel').textContent = 'Télécharger (.zip contenant le DXF)'; $('saveBtn').hidden = true; $('dlBtn').classList.add('primary');
    window.claude.use('downloads').then(d => { downloads = d; }).catch(() => {});
  }
  $('dlBtn').onclick = async () => {
    clearTimeout(tmr); computeOut();
    if (!S.out) return; const msg = $('dlMsg'); msg.textContent = '';
    const bytes = new TextEncoder().encode(S.out.text);
    if (downloads) {
      try {
        const zip = await makeZip(outName(), bytes);
        await downloads.save({ filename: outName().replace(/\.dxf$/, '') + '.zip', data: zip });
        msg.textContent = 'Fichier enregistré. Dézippe-le et copie le .dxf sur la clé USB de la station.';
      } catch (e) {
        msg.textContent = e && e.code === 'declined' ? 'Téléchargement annulé.' : 'Le téléchargement n\'est pas disponible ici. Utilise la version de la page enregistrée sur ton PC.';
      }
      return;
    }
    const r = await saveLocal(new Blob([bytes], { type: 'application/dxf' }), outName(), 'Plan DXF', 'dxf');
    if (lastSaveHandle) { S.fh = lastSaveHandle; S.fhOk = true; savePlan(); }
    msg.textContent = inArtifact ? 'Si rien ne se télécharge, utilise la version de la page enregistrée sur ton PC.' : saveMsg(r, outName(), '.');
    if (r !== 'cancel') { markSaved(); toast('✓ ' + msg.textContent); }
    updateSaveUI();
  };
  // « Enregistrer » : écrit dans le fichier ouvert (ou celui choisi au dernier « Enregistrer sous »)
  let toastT = 0;
  function toast(text, bad) {
    $('toastMsg').textContent = text; $('toast').classList.toggle('bad', !!bad); $('toast').hidden = false;
    clearTimeout(toastT); if (!bad) toastT = setTimeout(() => { $('toast').hidden = true; }, 5000);
  }
  $('toastX').onclick = () => { $('toast').hidden = true; };
  // plan renommé dans son onglet : « Enregistrer » crée le fichier au nouveau nom au lieu d'écraser l'ancien
  const sameName = () => !S.fh || !S.outBase || S.fh.name.replace(/\.dxf$/i, '').toLowerCase() === baseName().toLowerCase();
  function dirtyUI() {
    if (inArtifact || cur < 0) return;
    const d = isDirty(S);
    $('saveBtn').classList.toggle('dirty', d);
    $('saveBtn').title = (d ? 'Modifications non enregistrées. ' : '') + 'Enregistrer (Ctrl+S)';
    const t = $('plans').querySelector('.ptab.cur');
    if (t && !!t.querySelector('.unsaved') !== d) renderTabs();
    let txt = S.fh && sameName() ? 'Enregistrer → ' + S.fh.name + (S.fhOk ? '' : ' (fichier reçu)')
      : S.fh ? 'Enregistrer demandera où ranger « ' + outName() + ' » (plan renommé).'
      : window.showSaveFilePicker ? 'Enregistrer demandera où ranger le fichier.' : 'Enregistrer → dossier Téléchargements (' + outName() + ')';
    if (d) txt = 'Modifications non enregistrées · ' + txt;
    $('saveTarget').textContent = txt; $('saveTarget').classList.toggle('dirty', d);
  }
  function updateSaveUI() {
    if (inArtifact) { $('saveTarget').textContent = ''; return; }
    dirtyUI();
  }
  async function writeHandle() {
    const msg = $('dlMsg'), fh = S.fh, planIdx = cur;
    const bytes = new TextEncoder().encode(S.out.text), at = S.hist ? S.hist[S.histPos] : null;
    try {
      if (fh.queryPermission && (await fh.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await fh.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        msg.textContent = 'NON enregistré : le navigateur a refusé l\'écriture. Utilise « Enregistrer sous… ».'; toast(msg.textContent, true); updateSaveUI(); return;
      }
      const w = await fh.createWritable(); await w.write(new Blob([bytes], { type: 'application/dxf' })); await w.close();
      // relecture : le fichier sur le disque doit avoir exactement la taille de ce qu'on vient d'écrire
      if (fh.getFile) { const f = await fh.getFile(); if (f.size !== bytes.length) throw new Error('le fichier relu fait ' + f.size + ' octets au lieu de ' + bytes.length); }
      const target = cur === planIdx ? S : plans[planIdx] && plans[planIdx].st;
      if (target) { target.fhOk = true; target.savedAt = at; }
      if (cur === planIdx) savePlan();
      renderTabs();
      const t = new Date(); msg.textContent = 'Enregistré dans ' + fh.name + ' à ' + String(t.getHours()).padStart(2, '0') + 'h' + String(t.getMinutes()).padStart(2, '0') + ' (' + fmtSize(bytes.length) + ').';
      toast('✓ ' + msg.textContent);
    } catch (e) {
      msg.textContent = 'NON enregistré : impossible d\'écrire dans ' + fh.name + ' (' + (e && e.message || e) + '). Le fichier est peut-être ouvert dans un autre logiciel, ou sur une clé retirée. Utilise « Enregistrer sous… ».';
      toast(msg.textContent, true);
    }
    updateSaveUI();
  }
  async function saveSame() {
    clearTimeout(tmr); computeOut(); if (!S.out) return;
    if (!S.fh || !sameName()) { $('dlBtn').click(); return; }
    if (!S.fhOk) {
      $('saveDlgTxt').textContent = '« ' + S.fh.name + ' » sera remplacé par la version nettoyée. Pour garder l\'original du bureau d\'études, choisis « Enregistrer sous… ».';
      $('saveDlg').showModal(); $('saveDlgOk').focus(); return;
    }
    await writeHandle();
  }
  $('saveDlgCancel').onclick = () => $('saveDlg').close();
  $('saveDlgOk').onclick = () => { $('saveDlg').close(); writeHandle(); };
  $('saveDlgAs').onclick = () => { $('saveDlg').close(); $('dlBtn').click(); };
  // fermeture de la page avec des modifications non enregistrées : le navigateur demande confirmation
  window.addEventListener('beforeunload', e => { savePlan(); if (anyDirty()) { e.preventDefault(); e.returnValue = ''; } });
  $('saveBtn').onclick = saveSame;

  // ---------- Conversion DWG → DXF (LibreDWG en WebAssembly, chargé au premier DWG) ----------
  // Le DWG n'est jamais affiché : on le convertit, on enregistre le DXF obtenu, puis on ouvre ce DXF.
  const OWNED = new WeakSet(); // fichiers créés par l'outil : « Enregistrer » les écrase sans demander
  const DWG_VER = { AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' };
  let dwgMod = null;
  async function loadDwg() {
    if (dwgMod) return dwgMod;
    if (inArtifact || !/^https?:$/.test(location.protocol)) throw new Error('offline-file');
    const mod = await import(new URL('dwg/libredwg-web.js', location.href).href);
    dwgMod = await mod.default({ print: () => {}, printErr: () => {} });
    return dwgMod;
  }
  function dwgToDxf(m, u8) {
    const fin = 'in.dwg', fout = 'out.dxf', rm = f => { try { if (m.FS.analyzePath(f, false).exists) m.FS.unlink(f); } catch (e) {} };
    try {
      m.FS.writeFile(fin, u8);
      const err = m.dwg_write_dxf(fin, fout);
      if (!m.FS.analyzePath(fout, false).exists || err >= 128) throw new Error('code ' + err);
      return m.FS.readFile(fout);
    } finally { rm(fin); rm(fout); }
  }
  const dwgDlg = (title, txt, state) => {
    $('dwgDlgTitle').textContent = title; $('dwgDlgTxt').textContent = txt;
    $('dwgProg').hidden = state !== 'busy'; $('dwgDlgBtns').hidden = state !== 'done'; $('dwgDlgErr').hidden = state !== 'error';
    if (!$('dwgDlg').open) $('dwgDlg').showModal();
  };
  const dwgChoice = () => new Promise(res => { $('dwgDlgSave').onclick = () => res('save'); $('dwgDlgOpen').onclick = () => res('open'); $('dwgDlg').oncancel = e => { e.preventDefault(); res('open'); }; });
  $('dwgDlgClose').onclick = () => $('dwgDlg').close();
  async function convertDwgs(files) {
    const out = [], errors = [];
    for (let k = 0; k < files.length; k++) {
      const f = files[k], dxfName = f.name.replace(/\.dwg$/i, '') + '.dxf', n = files.length > 1 ? ' (' + (k + 1) + '/' + files.length + ')' : '';
      try {
        dwgDlg('Conversion DWG → DXF' + n, dwgMod ? 'Conversion de « ' + f.name + ' » (' + fmtSize(f.size) + ')…' : 'Chargement du convertisseur DWG (la première fois, environ 4 Mo à télécharger)…', 'busy');
        await new Promise(r => setTimeout(r, 40));
        const m = await loadDwg();
        dwgDlg('Conversion DWG → DXF' + n, 'Conversion de « ' + f.name + ' » (' + fmtSize(f.size) + ')…', 'busy');
        await new Promise(r => setTimeout(r, 40));
        const u8 = new Uint8Array(await f.arrayBuffer());
        const ver = DWG_VER[String.fromCharCode(...u8.slice(0, 6))];
        const dxf = dwgToDxf(m, u8);
        DXF.parse(dxf.buffer.slice(dxf.byteOffset, dxf.byteOffset + dxf.byteLength)); // contrôle : le DXF obtenu doit se relire
        const blob = new Blob([dxf], { type: 'application/dxf' }), canPick = !!window.showSaveFilePicker;
        $('dwgDlgSave').textContent = canPick ? 'Enregistrer le DXF à côté du DWG' : 'Télécharger le DXF';
        dwgDlg('DWG converti' + n, '« ' + f.name + ' »' + (ver ? ' (DWG ' + ver + ')' : '') + ' a été converti en « ' + dxfName + ' » (' + fmtSize(dxf.byteLength) + '). Le DWG d\'origine n\'est pas modifié.', 'done');
        $('dwgDlgSave').focus();
        const choice = await dwgChoice();
        let file = new File([blob], dxfName, { type: 'application/dxf' });
        if (choice === 'save') {
          if (canPick) {
            try {
              const src = HMAP.get(f), opts = { suggestedName: dxfName, types: [{ description: 'Plan DXF', accept: { 'application/dxf': ['.dxf'] } }] };
              if (src) opts.startIn = src;
              let hd; try { hd = await window.showSaveFilePicker(opts); } catch (e) { if (e && e.name === 'AbortError') throw e; delete opts.startIn; hd = await window.showSaveFilePicker(opts); }
              const w = await hd.createWritable(); await w.write(blob); await w.close();
              file = new File([blob], hd.name, { type: 'application/dxf' }); HMAP.set(file, hd); OWNED.add(hd);
            } catch (e) { if (!(e && e.name === 'AbortError')) errors.push(dxfName + ' non enregistré (' + (e && e.message || e) + ')'); }
          } else {
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = dxfName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          }
        }
        out.push(file);
      } catch (e) {
        const why = e && e.message === 'offline-file' ? 'la conversion DWG fonctionne dans la version en ligne ou installée de l\'outil (thomas-llt.github.io/dxf-station), pas dans le fichier HTML ouvert en double-clic.'
          : /fetch|import|network|Failed/i.test(e && e.message || '') && !dwgMod ? 'le convertisseur n\'a pas pu être téléchargé. Ouvre l\'outil une fois avec internet pour l\'avoir ensuite hors ligne.'
          : 'ce DWG n\'a pas pu être lu (version trop récente ou fichier abîmé). Demande un DXF au bureau d\'études.';
        errors.push(f.name + ' : ' + why);
      }
    }
    if (errors.length) dwgDlg('Conversion DWG', errors.join('\n'), 'error'); else if ($('dwgDlg').open) $('dwgDlg').close();
    if (out.length) loadFiles(out);
  }
  async function pickDwg() {
    if (window.showOpenFilePicker && !inArtifact) {
      try {
        const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Plans DWG', accept: { 'application/acad': ['.dwg'] } }] });
        const fs = await Promise.all(hs.map(async hd => { const f = await hd.getFile(); HMAP.set(f, hd); return f; }));
        convertDwgs(fs); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    $('dwgFile').click();
  }
  $('dwgBtn').onclick = pickDwg;
  $('dwgDrop').onclick = e => { e.stopPropagation(); pickDwg(); };
  $('dwgDrop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDwg(); } });
  $('dwgFile').addEventListener('change', () => { const fs = [...$('dwgFile').files]; $('dwgFile').value = ''; if (fs.length) convertDwgs(fs); });

  $('dlAllBtn').onclick = async () => {
    const msg = $('dlMsg'); msg.textContent = 'Préparation des ' + plans.length + ' plans…';
    await new Promise(r => setTimeout(r, 20));
    savePlan(); const keep = cur, entries = [], names = new Set();
    for (let i = 0; i < plans.length; i++) {
      activate(i, true); computeOut();
      let n = outName(), k = 2; while (names.has(n)) n = outName().replace(/\.dxf$/, '_' + k++ + '.dxf'); names.add(n);
      entries.push({ name: n, u8: new TextEncoder().encode(S.out.text) });
    }
    cur = -1; activate(keep, true); cur = keep; computeOut(); renderTabs();
    const zip = await makeZipMulti(entries), zname = 'plans.zip';
    if (downloads) {
      try { await downloads.save({ filename: zname, data: zip }); msg.textContent = entries.length + ' plans enregistrés dans ' + zname + '. Dézippe-le et copie les .dxf sur la clé USB de la station.'; }
      catch (e) { msg.textContent = e && e.code === 'declined' ? 'Téléchargement annulé.' : 'Le téléchargement n\'est pas disponible ici. Utilise la version de la page enregistrée sur ton PC.'; }
      return;
    }
    const r = await saveLocal(zip, zname, 'Archive zip', 'zip'); msg.textContent = saveMsg(r, zname, ' (' + entries.length + ' plans).');
    if (r !== 'cancel') { savePlan(); for (const p of plans) if (p.st.hist) p.st.savedAt = p.st.hist[p.st.histPos]; S.savedAt = plans[cur].st.savedAt; renderTabs(); updateSaveUI(); toast('✓ ' + msg.textContent); }
  };

  // ---------- Ouverture depuis Windows (application installée : double-clic sur un .dxf) ----------
  if ('launchQueue' in window && window.launchQueue) {
    window.launchQueue.setConsumer(async params => { if (!params.files || !params.files.length) return; const fs = await Promise.all(params.files.map(async hd => { const f = await hd.getFile(); HMAP.set(f, hd); return f; })); loadFiles(fs); });
  }

  // ---------- Ouverture de fichier ----------
  $('openBtn').onclick = pickFiles;
  $('file').addEventListener('change', () => { const fs = [...$('file').files]; $('file').value = ''; if (fs.length) loadFiles(fs); });
  let dragDepth = 0;
  window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; if ($('home').hidden) $('drop').hidden = false; else $('homeDrop').classList.add('over'); e.preventDefault(); } });
  window.addEventListener('dragover', e => { e.preventDefault(); if (!$('home').hidden) { const d = !!(e.target.closest && e.target.closest('#dwgDrop')); $('dwgDrop').classList.toggle('over', d); $('homeDrop').classList.toggle('over', !d); } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { $('drop').hidden = true; $('homeDrop').classList.remove('over'); $('dwgDrop').classList.remove('over'); } });
  window.addEventListener('drop', async e => { e.preventDefault(); dragDepth = 0; $('drop').hidden = true; $('homeDrop').classList.remove('over'); $('dwgDrop').classList.remove('over');
    const items = [...(e.dataTransfer.items || [])].filter(it => it.kind === 'file');
    const hp = items.map(it => it.getAsFileSystemHandle ? it.getAsFileSystemHandle().catch(() => null) : Promise.resolve(null)); // à demander avant tout « await »
    const fs = [...e.dataTransfer.files]; if (!fs.length) return;
    const hs = await Promise.all(hp);
    for (const f of fs) { const hd = hs.find(x => x && x.kind === 'file' && x.name === f.name); if (hd) HMAP.set(f, hd); }
    loadFiles(fs); });

  resize();
  loadFiles(null);
})();
