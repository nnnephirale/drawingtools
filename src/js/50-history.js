/* ════════════════════════════════════════════════════════════════════
   history + persistence
   ════════════════════════════════════════════════════════════════════ */
const hist = { undo: [], redo: [] };
const cloneLayers = ls => ls.map(L => ({ ...L, params: { ...L.params }, strokes: L.strokes.slice(), ops: (L.ops || []).map(o => ({ ...o })) }));
const snapshot = () => ({ w: doc.w, h: doc.h, bg: doc.bg, bgImage: doc.bgImage, active: doc.active, layers: cloneLayers(doc.layers) });
function commit(snap) {
  hist.undo.push(snap); if (hist.undo.length > 150) hist.undo.shift();
  hist.redo.length = 0; updUndo(); docDirty = true; save();
}
function mutate(fn) { const s = snapshot(); fn(); commit(s); }
let editSnap = null;
const beginEdit = () => { if (!editSnap) editSnap = snapshot(); };
const endEdit = () => { if (editSnap) { commit(editSnap); editSnap = null; } };
const beginEditDoc = beginEdit, endEditDoc = endEdit;
function restore(s) {
  dropSel();
  const sized = s.w !== doc.w || s.h !== doc.h;
  doc = { w: s.w, h: s.h, bg: s.bg, bgImage: s.bgImage, active: s.active, layers: cloneLayers(s.layers) };
  gcTargets();
  for (const L of doc.layers) dirty.add(L.id);
  if (sized) { view.z = 1; fit(); updateResolution(); }
  const L = activeLayer();
  if (L) { ui.brush = L.brush; if (brushTool()) ui.tool = L.brush; }
  afterChange();
}
function undo() { if (drawing) return; const s = hist.undo.pop(); if (!s) return; hist.redo.push(snapshot()); restore(s); updUndo(); docDirty = true; save(); }
function redo() { if (drawing) return; const s = hist.redo.pop(); if (!s) return; hist.undo.push(snapshot()); restore(s); updUndo(); docDirty = true; save(); }
function updUndo() { $('#undo').disabled = !hist.undo.length; $('#redo').disabled = !hist.redo.length; }

/* Sessions. Every drawing is a session in IndexedDB: 'meta' holds the list (name, dates, thumbnail),
   'docs' the drawing itself (raw strokes + params, background image as a Blob). localStorage keeps only
   small prefs and which session is open. Strokes are stored raw, so a saved session re-renders with the
   current shaders; RENDERER records which look it was made with, should an old look ever need keeping. */
const KEY = 'slip-metal.v3';
const SESSION_V = 1;      // record / file format
const RENDERER = 3;       // bump when a shader change alters how saved drawings look (3 = stone)
const isLab = /[?&](lab=|test\b)/.test(location.search);   // ?lab= and ?test open the demo and never touch saved sessions or prefs
let session = null;       // meta of the open session: { id, name, created, updated, strokes, thumb }
let sessions = [];        // every session's meta, newest first
let docDirty = false, saveT = 0, thumbT = 0, saving = Promise.resolve();
let prefsReady = false;    // never overwrite stored prefs (or an unmigrated drawing) before boot has read them
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
function packPts(p) { const o = new Array(p.length); for (let i = 0; i < p.length; i += 5) { o[i] = r1(p[i]); o[i + 1] = r1(p[i + 1]); o[i + 2] = r3(p[i + 2]); o[i + 3] = Math.round(p[i + 3]); o[i + 4] = Math.round(p[i + 4] * 100) / 100; } return o; }

const DB = {
  ok: false, db: null,
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('slip-metal', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('docs', { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
      });
      this.ok = true;
    } catch (e) { this.ok = false; }
    return this.ok;
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode), q = fn(t.objectStore(store));
      t.oncomplete = () => res(q.result); t.onerror = t.onabort = () => rej(t.error);
    });
  },
  get(s, k) { return this.req(s, 'readonly', o => o.get(k)); },
  all(s) { return this.req(s, 'readonly', o => o.getAll()); },
  put(s, v) { return this.req(s, 'readwrite', o => o.put(v)); },
  del(s, k) { return this.req(s, 'readwrite', o => o.delete(k)); },
};

// background images are canvases in memory and PNG Blobs on disk; encode each canvas once
const blobOf = new WeakMap();
const canvasBlob = cv => { let p = blobOf.get(cv); if (!p) { p = new Promise(r => cv.toBlob(r, 'image/png')); blobOf.set(cv, p); } return p; };
async function blobCanvas(b) {
  const img = await createImageBitmap(b);
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  cv.getContext('2d').drawImage(img, 0, 0); if (img.close) img.close();
  blobOf.set(cv, Promise.resolve(b));
  return cv;
}
async function docRecord(d, id) {
  const layers = d.layers.map(L => ({ id: L.id, brush: L.brush, name: L.name, visible: L.visible, seed: L.seed, params: { ...L.params },
    strokes: L.strokes.map(s => ({ ...s, pts: packPts(s.pts) })),
    ops: (L.ops || []).map(o => ({ ...o, poly: o.poly && o.poly.map(r1), dx: r1(o.dx || 0), dy: r1(o.dy || 0) })) }));
  return { id, v: SESSION_V, renderer: RENDERER, w: d.w, h: d.h, bg: d.bg, active: d.active, layers,
    bgImage: d.bgImage ? await canvasBlob(d.bgImage) : null };
}
async function docFromRecord(r) {
  const d = { w: r.w, h: r.h, bg: r.bg, active: r.active, bgImage: r.bgImage ? await blobCanvas(r.bgImage).catch(() => null) : null,
    layers: (r.layers || []).map(L => ({ ...L, params: { ...DEF[L.brush], ...L.params } })) };
  if (!d.layers.some(L => L.id === d.active)) d.active = d.layers.length ? d.layers[d.layers.length - 1].id : null;
  return d;
}
const strokeCount = d => d.layers.reduce((n, L) => n + L.strokes.length, 0);
function newMeta(name) { const t = Date.now(); return { id: uid(), name, created: t, updated: t, strokes: 0, thumb: null }; }
function nextName() {
  let n = 0;
  for (const s of sessions) { const m = /^Session (\d+)$/.exec(s.name); if (m) n = Math.max(n, +m[1]); }
  return `Session ${Math.max(n, sessions.length) + 1}`;
}
async function listSessions() { sessions = (await DB.all('meta')).sort((a, b) => b.updated - a.updated); adopt(); }
// the open session's meta is the very object in the list, so a rename or save shows up without a reload
function adopt() { if (session) sessions = sessions.map(m => m.id === session.id ? session : m); }

function savePrefs() {
  if (isLab || !prefsReady) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, cur: session ? session.id : null, last: lastParams,
      ui: { tool: ui.tool === 'view' ? ui.brush : ui.tool, brush: ui.brush, depth: ui.depth, canvas3d: ui.canvas3d, selAll: ui.selAll, snap: ui.snap, sym: ui.sym, eraser: ui.eraser, tab: ui.tab, exp: ui.exp, panel: !panel.hasAttribute('hidden-state') } }));
  } catch (e) {}
}
function save() {
  if (isLab) return;
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 600);
}
// writes are chained so a session switch never interleaves with a save of the one being left
function saveNow() {
  clearTimeout(saveT); saveT = 0;
  savePrefs();
  if (!docDirty || !session || !DB.ok) return saving;
  docDirty = false;
  const s = session, d = doc;
  saving = saving.then(async () => {
    const rec = await docRecord(d, s.id);
    s.updated = Date.now(); s.strokes = strokeCount(d);
    await DB.put('docs', rec); await DB.put('meta', { ...s });
    if (s === session) { sessions = [s, ...sessions.filter(m => m.id !== s.id)]; clearTimeout(thumbT); thumbT = setTimeout(saveThumb, 1500); }
  }).catch(e => { console.error(e); docDirty = true; toast("Couldn't save this session"); });
  return saving;
}
async function saveThumb() {
  clearTimeout(thumbT); thumbT = 0;
  if (!session || !DB.ok) return;
  if (drawing || exporting) { thumbT = setTimeout(saveThumb, 1000); return; }
  const s = session;
  try {
    const { cv } = renderCanvas(Math.min(1, 360 / Math.max(doc.w, doc.h)), false, false);
    s.thumb = await new Promise(r => cv.toBlob(r, 'image/png'));
    await (saving = saving.then(() => DB.put('meta', { ...s })));
    renderSessions();
  } catch (e) { console.error(e); }
  finally { request(); }
}
// before leaving a session: write what's pending and give it a fresh thumbnail
async function flush() {
  saveNow(); await saving;
  if (thumbT) await saveThumb();
}
function setDocument(d) {
  doc = d;
  hist.undo.length = 0; hist.redo.length = 0; updUndo();
  gcTargets();
  for (const L of doc.layers) dirty.add(L.id);
  view.z = 1; fit(); updateResolution();
  const L = activeLayer();
  if (L) { ui.brush = L.brush; if (brushTool()) ui.tool = L.brush; }
  afterChange();
}
let switching = false;
async function guarded(fn) { if (drawing || switching) return; switching = true; try { await fn(); } finally { switching = false; } }
const openSession = id => guarded(async () => {
  if (session && session.id === id) return;
  await flush();
  const [meta, rec] = await Promise.all([DB.get('meta', id), DB.get('docs', id)]);
  if (!meta || !rec) { toast("That session couldn't be opened"); return; }
  session = meta; adopt();
  setDocument(await docFromRecord(rec));
  savePrefs();
});
async function startSession(d, name) {
  session = newMeta(name || nextName());
  sessions = [session, ...sessions];
  setDocument(d);
  docDirty = true; await saveNow();
  thumbT = setTimeout(saveThumb, 300);
}
const newSession = () => guarded(async () => {
  await flush();
  await startSession({ w: doc.w, h: doc.h, bg: doc.bg, bgImage: null, layers: [], active: null });
  toast(`${session.name} started`);
});
const deleteSession = id => guarded(async () => {
  const meta = sessions.find(s => s.id === id);
  if (!meta) return;
  await flush();
  const rec = await DB.get('docs', id);
  await DB.del('meta', id); await DB.del('docs', id);
  sessions = sessions.filter(s => s.id !== id);
  if (session && session.id === id) {
    session = null;
    if (sessions.length) { const next = sessions[0]; session = next; setDocument(await docFromRecord(await DB.get('docs', next.id))); savePrefs(); }
    else await startSession({ w: doc.w, h: doc.h, bg: doc.bg, bgImage: null, layers: [], active: null });
  }
  renderSessions();
  toast(`${meta.name} deleted`, { label: 'Undo', fn: async () => {
    await DB.put('docs', rec); await DB.put('meta', meta);
    await listSessions(); renderSessions();
  } });
});
function renameSession(name) {
  name = name.trim();
  if (!session || !name || name === session.name) return;
  session.name = name;
  if (DB.ok) saving = saving.then(() => DB.put('meta', { ...session }));
  renderSessions();
}

// a session file: the same record as on disk, with the background image inlined, for the Files app
async function saveSessionFile() {
  if (!session) return;
  await flush();
  const rec = await docRecord(doc, session.id);
  const bgImage = rec.bgImage ? await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(rec.bgImage); }) : null;
  const out = { app: 'slip-metal', ...rec, bgImage, name: session.name, created: session.created };
  delete out.id;
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const slug = session.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'session';
  await deliverFile(blob, `${slug}.json`, 'application/json', `Saved ${session.name}`);
}
const openSessionFile = file => guarded(async () => {
  let rec;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'slip-metal' || !Array.isArray(d.layers)) throw new Error('not a session');
    rec = { ...d, bgImage: d.bgImage ? await (await fetch(d.bgImage)).blob() : null };
  } catch (e) { toast("That file isn't a saved session"); return; }
  await flush();
  const taken = new Set(sessions.map(s => s.name));
  let name = rec.name || file.name.replace(/\.json$/i, ''), k = 2;
  while (taken.has(name)) name = `${rec.name} ${k++}`;
  await startSession(await docFromRecord(rec), name);
  toast(`Opened ${name}`);
});

function loadPrefs() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!d) return {};
  if (d.last) for (const b of BRUSHES) Object.assign(lastParams[b], d.last[b] || {});
  // v1 prefs predate the shared brush defaults: carry them over once
  if (d.v === 1) for (const b of BRUSHES) for (const k of GEOM) if (k !== 'taper') lastParams[b][k] = DEF[b][k];
  if (d.ui) Object.assign(ui, d.ui, { exp: { ...ui.exp, ...(d.ui.exp || {}) } });
  if (!TOOLS.includes(ui.brush)) ui.brush = 'stone';
  ui.depth = clamp(+ui.depth || 3, 1, 3);
  if (ui.tool !== 'erase' && !TOOLS.includes(ui.tool)) ui.tool = ui.brush;
  if (d.ui && d.ui.panel === false) panel.setAttribute('hidden-state', '');
  // v1 kept the one drawing in localStorage; it becomes the first session
  const legacy = d.v === 1 && Array.isArray(d.layers) ? { w: d.w, h: d.h, bg: d.bg, active: d.active, bgImage: null, layers: d.layers } : null;
  return { cur: d.cur, legacy };
}

