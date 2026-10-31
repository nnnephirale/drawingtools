/* ════════════════════════════════════════════════════════════════════
   input: pen, mouse, finger, Force Touch
   ════════════════════════════════════════════════════════════════════ */
let drawing = null, gesture = null, panDrag = null, tapInfo = null;
let penSeen = false, spaceDown = false, forceP = -1;
const touches = new Map();
const PALM = 90;
const ring = $('#ring');
const isTouchUI = matchMedia('(pointer:coarse)').matches;

// Safari on a Force Touch trackpad reports real press force on mouse events. Claim it before macOS turns it into Look Up.
board.addEventListener('webkitmouseforcewillbegin', e => e.preventDefault());
board.addEventListener('webkitmouseforcedown', e => e.preventDefault());
board.addEventListener('webkitmouseforcechanged', e => { forceP = clamp((e.webkitForce - 1) / 2, 0, 1); });
board.addEventListener('mouseup', () => { forceP = forceP >= 0 ? 0 : -1; });
document.addEventListener('gesturestart', e => e.preventDefault());
// Safari's trackpad twist (GestureEvent; the pinch half already arrives as ⌃-wheel): turns about the cursor
{
  let g = null;
  stage.addEventListener('gesturestart', e => { if (!three.on) g = { r0: view.r, turning: false, a0: 0 }; });
  stage.addEventListener('gesturechange', e => {
    if (!g || three.on) return;
    e.preventDefault();
    let da = e.rotation * Math.PI / 180 - g.a0;
    if (!g.turning) { if (Math.abs(da) <= TURN_WAKE) return; g.turning = true; g.a0 = Math.sign(da) * TURN_WAKE; da = e.rotation * Math.PI / 180 - g.a0; }
    const r = snapTurn(g.r0 + da), t = r - view.r, [cx, cy] = untransformedCentre();
    const dx = e.clientX - cx - view.x, dy = e.clientY - cy - view.y, co = Math.cos(t), sn = Math.sin(t);
    view.x = e.clientX - cx - (dx * co - dy * sn); view.y = e.clientY - cy - (dx * sn + dy * co); view.r = r;
    applyView();
  });
  stage.addEventListener('gestureend', () => { if (g && g.turning) endTurn(); g = null; });
}
stage.addEventListener('contextmenu', e => e.preventDefault());

function pushSample(ev) {
  const [x, y] = screenToDoc(ev.clientX, ev.clientY);
  let p = .5, al = 1;
  if (ev.pointerType === 'pen') {
    p = ev.pressure;
    if (typeof ev.altitudeAngle === 'number') al = ev.altitudeAngle / (Math.PI / 2);
    else if (ev.tiltX || ev.tiltY) {
      const tx = Math.tan(ev.tiltX * Math.PI / 180), ty = Math.tan(ev.tiltY * Math.PI / 180);
      al = (Math.PI / 2 - Math.atan(Math.hypot(tx, ty))) / (Math.PI / 2);
    }
  } else if (ev.pointerType === 'mouse') {
    if (forceP >= 0) p = .42 + .58 * forceP;
    else if (ev.pressure > 0 && ev.pressure !== .5) p = ev.pressure;
  }
  drawing.st.pts.push(x, y, p, Math.max(0, ev.timeStamp - drawing.t0), clamp(al, 0, 1));
  if (drawing.st.hasP) liveP = { kind: ev.pointerType === 'pen' ? 'pen' : 'force', p, tilt: ev.pointerType === 'pen' ? Math.round(90 - al * 90) : null };
}
function addSamples(e) {
  const d = drawing;
  if (d.shape) { adjustShape(e); return; }
  const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
  for (const ev of (list.length ? list : [e])) pushSample(ev);
  d.lastMove = performance.now();
  const s = d.still;      // where the pen last came to rest, for hold to snap
  if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > SNAP_STILL) Object.assign(s, { x: e.clientX, y: e.clientY, t: d.lastMove, n: d.st.pts.length / 5, tried: false });
}
function startStroke(e) {
  const snap = snapshot();
  let L = activeLayer();
  if (!L) { L = newLayer(ui.brush); doc.layers.push(L); doc.active = L.id; renderLayers(); }
  if (!L.visible) { L.visible = true; renderLayers(); toast(`${L.name} shown`); }
  const erase = ui.tool === 'erase';
  const hasP = e.pointerType === 'pen' || (e.pointerType === 'mouse' && (forceP >= 0 || (e.pressure > 0 && e.pressure !== .5)));
  const st = { id: uid(), seed: Math.random() * 1000, sym: ui.sym, erase, hasP, hasT: e.pointerType === 'pen', pts: [] };
  if (erase) st.size = ui.eraser;
  drawing = { id: e.pointerId, L, st, snap, t0: e.timeStamp, lastMove: performance.now(), touch: e.pointerType === 'touch',
    still: { x: e.clientX, y: e.clientY, t: performance.now(), n: 1, tried: false }, shape: null };
  addSamples(e);
  $('#empty').classList.add('off');
  request();
}
function endStroke() {
  const { L, st, snap } = drawing;
  drawing = null;
  if (!st.pts.length || (st.erase && !L.strokes.length)) { request(); return; }
  L.strokes.push(st);
  commitStroke(L, st);
  commit(snap);
  renderLayers();
  request();
}
function cancelStroke() { drawing = null; request(); }

/* Hold to snap (Procreate's QuickShape). Hold the pen still for a moment: a stroke that ran nearly straight
   becomes a straight line, one that bowed evenly becomes an arc, a loop that closed on itself becomes a circle.
   Anything else is left alone (and pools as usual). Keep the pen down to adjust it: a line's end follows the pen
   and settles onto 45° steps of the screen when close, an arc keeps its bend as its end moves, a circle grows
   and turns about its centre. Every sample keeps its pressure, time and tilt, placed by how far along the stroke
   it came, so the shape still has the hand's weight in it. The hand-drawn stroke slides into the shape. */
const SNAP_HOLD = 500, SNAP_STILL = 6, SNAP_MORPH = 180;     // ms held, screen px of allowed drift, ms to slide in
function fitShape(X, Y, k) {
  const n = X.length, sx = X[0], sy = Y[0], ex = X[n - 1], ey = Y[n - 1];
  let len = 0;
  for (let i = 1; i < n; i++) len += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  if (len * k < 24) return null;
  const D = Math.hypot(ex - sx, ey - sy);
  if (D > len * .8) {                                   // every sample close to the chord: a line
    const ux = (ex - sx) / D, uy = (ey - sy) / D;
    let mx = 0, ss = 0;
    for (let i = 0; i < n; i++) { const dv = Math.abs((X[i] - sx) * uy - (Y[i] - sy) * ux); mx = Math.max(mx, dv); ss += dv * dv; }
    if (Math.sqrt(ss / n) < .025 * D + 1.5 / k && mx < .07 * D + 4 / k) return { kind: 'line', sx, sy, ex, ey };
  }
  // least-squares circle (Kåsa), centred on the samples' mean so it stays well conditioned
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += X[i]; my += Y[i]; }
  mx /= n; my /= n;
  let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
  for (let i = 0; i < n; i++) {
    const u = X[i] - mx, v = Y[i] - my;
    Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
  }
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = (Suuu + Suvv) / 2, bv = (Svvv + Svuu) / 2;
  const uc = (bu * Svv - bv * Suv) / det, vc = (bv * Suu - bu * Suv) / det;
  const cx = mx + uc, cy = my + vc, R = Math.sqrt(uc * uc + vc * vc + (Suu + Svv) / n);
  let rs = 0, rm = 0, th = 0;
  for (let i = 0; i < n; i++) {
    const e = Math.abs(Math.hypot(X[i] - cx, Y[i] - cy) - R) / R; rs += e * e; rm = Math.max(rm, e);
    if (i) {
      const ax = X[i - 1] - cx, ay = Y[i - 1] - cy, bx = X[i] - cx, by = Y[i] - cy;
      th += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    }
  }
  rs = Math.sqrt(rs / n);
  const at = Math.abs(th);
  if (at > 1.7 * Math.PI) {                             // came round on itself: a circle
    if (rs > .07 || rm > .18) return null;
    return { kind: 'circle', cx, cy, r: R, a: Math.atan2(sy - cy, sx - cx), th: Math.sign(th) * 2 * Math.PI };
  }
  if (rs > .045 || rm > .12 || at < .2) return null;
  return { kind: 'arc', sx, sy, ex, ey, th };
}
// the shape as a point at u ∈ [0, 1] along it, and its length
function shapeGeom(sh) {
  if (sh.kind === 'line') return { len: Math.hypot(sh.ex - sh.sx, sh.ey - sh.sy), at: u => [lerp(sh.sx, sh.ex, u), lerp(sh.sy, sh.ey, u)] };
  let cx = sh.cx, cy = sh.cy, r = sh.r, a = sh.a;
  if (sh.kind === 'arc') {                              // the circle through both ends that turns by th between them
    const D = Math.hypot(sh.ex - sh.sx, sh.ey - sh.sy);
    if (D < 1e-3) return { len: 0, at: () => [sh.sx, sh.sy] };
    const wx = (sh.ex - sh.sx) / D, wy = (sh.ey - sh.sy) / D, h = D / (2 * Math.tan(sh.th / 2));
    cx = (sh.sx + sh.ex) / 2 - h * wy; cy = (sh.sy + sh.ey) / 2 + h * wx;
    r = D / (2 * Math.abs(Math.sin(sh.th / 2))); a = Math.atan2(sh.sy - cy, sh.sx - cx);
  }
  return { len: r * Math.abs(sh.th), at: u => [cx + r * Math.cos(a + sh.th * u), cy + r * Math.sin(a + sh.th * u)] };
}
// a line within 3° of a 45° step on screen lands on it (the screen, not the board: the board may be turned)
function settleLine(sh) {
  const dx = sh.ex - sh.sx, dy = sh.ey - sh.sy, D = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + view.r;
  const q = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
  if (D > 0 && Math.abs(a - q) < 3 * Math.PI / 180) { sh.ex = sh.sx + D * Math.cos(q - view.r); sh.ey = sh.sy + D * Math.sin(q - view.r); }
}
function trySnap() {
  const d = drawing, p = d.st.pts, n = Math.min(d.still.n, p.length / 5);
  if (n < 4) return;
  const X = [], Y = [];
  for (let i = 0; i < n; i++) { X.push(p[i * 5]); Y.push(p[i * 5 + 1]); }
  const sh = fitShape(X, Y, cssW * view.z / doc.w);
  if (!sh) return;
  if (sh.kind === 'line') settleLine(sh);
  const U = [0];
  for (let i = 1; i < n; i++) U.push(U[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]));
  const L = U[n - 1];
  d.src = { U: U.map(u => u / L), X, Y, pts: p.slice(0, n * 5) };       // the hold's samples are dropped: no pool at the end
  d.shape = sh; d.base = { ...sh }; d.pen0 = screenToDoc(d.still.x, d.still.y);
  d.morph = performance.now();
  d.st.shape = sh.kind;
  layShape(d, 0);
  toast({ line: 'Line', arc: 'Arc', circle: 'Circle' }[sh.kind]);
}
// rebuild the stroke's samples along the shape; m < 1 is part way from the hand-drawn path into it
function layShape(d, m) {
  const g = shapeGeom(d.shape), s = d.src, N = clamp(Math.ceil(g.len / 5), 8, 4000), out = [];
  const ease = 1 - Math.pow(1 - clamp(m, 0, 1), 4);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    while (j < s.U.length - 2 && s.U[j + 1] < u) j++;
    const u0 = s.U[j], u1 = s.U[j + 1], f = u1 > u0 ? clamp((u - u0) / (u1 - u0), 0, 1) : 0, o = j * 5;
    let [x, y] = g.at(u);
    if (ease < 1) { x = lerp(lerp(s.X[j], s.X[j + 1], f), x, ease); y = lerp(lerp(s.Y[j], s.Y[j + 1], f), y, ease); }
    out.push(x, y, lerp(s.pts[o + 2], s.pts[o + 7], f), lerp(s.pts[o + 3], s.pts[o + 8], f), lerp(s.pts[o + 4], s.pts[o + 9], f));
  }
  d.st.pts = out;
}
// pen still down after the snap: reshape from where the pen went since
function adjustShape(e) {
  const d = drawing, b = d.base, sh = d.shape, [x, y] = screenToDoc(e.clientX, e.clientY);
  if (sh.kind === 'circle') {
    const r0 = Math.hypot(d.pen0[0] - b.cx, d.pen0[1] - b.cy), r1 = Math.hypot(x - b.cx, y - b.cy);
    sh.r = b.r * r1 / Math.max(r0, 1e-3);
    sh.a = b.a + Math.atan2(y - b.cy, x - b.cx) - Math.atan2(d.pen0[1] - b.cy, d.pen0[0] - b.cx);
  } else {
    sh.ex = b.ex + x - d.pen0[0]; sh.ey = b.ey + y - d.pen0[1];
    if (sh.kind === 'line') settleLine(sh);
  }
  if (!d.morph) layShape(d, 1);
}

/* Two-finger tap undoes, three-finger tap redoes, in 2D and 3D alike. The fingers of a tap never land or lift
   quite together: it counts every finger that came down during the tap (not just the most held at once), and
   three fingers get a little longer and a little more slack, since a hand rolls as they lift. */
function tapDown(e, held) {
  if (held === 1) tapInfo = { t0: e.timeStamp, n: 1, moved: 0 };
  else if (tapInfo) tapInfo.n++;
}
function tapMove(p) { if (tapInfo) tapInfo.moved = Math.max(tapInfo.moved, Math.hypot(p.x - p.sx, p.y - p.sy)); }
function tapEnd(e) {
  const t = tapInfo; tapInfo = null;
  if (!t || t.n < 2) return;
  const n3 = t.n >= 3;
  if (e.timeStamp - t.t0 > (n3 ? 480 : 320) || t.moved > (n3 ? 20 : 12)) return;
  if (n3) { if (hist.redo.length) { redo(); toast('Redo'); } else toast('Nothing to redo'); }
  else if (hist.undo.length) { undo(); toast('Undo'); } else toast('Nothing to undo');
}

const centroid = ps => [ps.reduce((s, p) => s + p.x, 0) / ps.length, ps.reduce((s, p) => s + p.y, 0) / ps.length];
const spread = ps => ps.length < 2 ? 1 : Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
const twist = ps => Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
function startGesture() {
  const ps = [...touches.values()];
  gesture = { n: ps.length, z0: view.z, x0: view.x, y0: view.y, r0: view.r, a0: ps.length >= 2 ? twist(ps) : 0,
    turning: gesture ? gesture.turning : false, c0: centroid(ps), d0: spread(ps), C: untransformedCentre() };
}
function updateGesture() {
  const ps = [...touches.values()];
  if (ps.length !== gesture.n) { startGesture(); return; }
  const g = gesture, c = centroid(ps);
  const z = g.n >= 2 ? clamp(g.z0 * spread(ps) / Math.max(g.d0, 1), Math.min(1, zOfPct(5)), zOfPct(3200)) : g.z0;
  let r = g.r0;
  if (g.n >= 2) {
    const da = Math.atan2(Math.sin(twist(ps) - g.a0), Math.cos(twist(ps) - g.a0));
    if (!g.turning && Math.abs(da) > TURN_WAKE) { g.turning = true; g.a0 += Math.sign(da) * TURN_WAKE; }   // no jump as it wakes
    if (g.turning) r = snapTurn(g.r0 + Math.atan2(Math.sin(twist(ps) - g.a0), Math.cos(twist(ps) - g.a0)));
  }
  // keep the board point that was under the fingers' centre under it, through the zoom and the turn
  const dx = g.c0[0] - g.C[0] - g.x0, dy = g.c0[1] - g.C[1] - g.y0, k = z / g.z0, t = r - g.r0, co = Math.cos(t), sn = Math.sin(t);
  view.z = z; view.r = r;
  view.x = c[0] - g.C[0] - k * (dx * co - dy * sn); view.y = c[1] - g.C[1] - k * (dx * sn + dy * co);
  applyView();
}
// letting go near upright or a quarter turn settles onto it
function endTurn() { const n = nearestTurn(view.r); if (n !== view.r && Math.abs(view.r - n) < TURN_SNAP * 1.6) eased(() => { view.r = n; applyView(); }); }

stage.addEventListener('pointerdown', e => {
  if (three.on) { orbitDown(e); return; }
  if (stage.setPointerCapture) try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  ring.classList.remove('on');
  if (e.pointerType === 'touch') {
    e.preventDefault();
    if (drawing && !drawing.touch) return;                         // palm on glass while the Pencil draws
    // broad contact = palm, not a finger. Safari on iPad reports a fingertip at ~40–60px, a palm well past 90
    lastTouch = Math.round(Math.max(e.width || 0, e.height || 0)); updateStat();
    if (penSeen && lastTouch > PALM) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    tapDown(e, touches.size);
    if (touches.size >= 2 || penSeen) {
      if (drawing && drawing.touch) cancelStroke();
      selCancel();
      startGesture(); return;
    }
    if (ui.tool === 'lasso') selDown(e);
    else if (!drawing) startStroke(e);
    return;
  }
  if (drawing) return;
  if ((e.pointerType === 'mouse' && e.button === 1) || spaceDown) {
    e.preventDefault();
    panDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    board.classList.add('grab');
    return;
  }
  if (e.button !== 0) return;
  if (e.pointerType === 'pen') { penSeen = true; touches.clear(); gesture = null; tapInfo = null; }
  if (ui.tool === 'lasso') selDown(e); else startStroke(e);
});
stage.addEventListener('pointermove', e => {
  if (three.on) { orbitMove(e); return; }
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const t = touches.get(e.pointerId);
    t.x = e.clientX; t.y = e.clientY;
    tapMove(t);
    if (gesture) { updateGesture(); return; }
  }
  if (panDrag && panDrag.id === e.pointerId) {
    view.x = panDrag.vx + e.clientX - panDrag.x; view.y = panDrag.vy + e.clientY - panDrag.y; applyView(); return;
  }
  if (drawing && drawing.id === e.pointerId) { addSamples(e); request(); }
  if ((lasso && lasso.id === e.pointerId) || (selDrag && selDrag.id === e.pointerId)) selMove(e);
  if (e.pointerType !== 'touch') moveRing(e);
});
function pointerEnd(e) {
  if (orbit.ptrs.has(e.pointerId)) { orbitUp(e); return; }
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (touches.size === 0) { tapEnd(e); if (gesture && gesture.turning) endTurn(); gesture = null; }
    else if (gesture) startGesture();
  }
  if (panDrag && panDrag.id === e.pointerId) { panDrag = null; board.classList.remove('grab'); }
  if (drawing && drawing.id === e.pointerId) { if (e.type === 'pointercancel') cancelStroke(); else endStroke(); }
  if ((lasso && lasso.id === e.pointerId) || (selDrag && selDrag.id === e.pointerId)) selUp(e);
}
stage.addEventListener('pointerup', pointerEnd);
stage.addEventListener('pointercancel', pointerEnd);
stage.addEventListener('pointerleave', e => { if (!drawing) ring.classList.remove('on'); });
function moveRing(e) {
  if (ui.tool === 'lasso') {
    ring.classList.remove('on'); board.classList.remove('nocursor');
    board.classList.toggle('selmove', !!(sel.poly && inPoly(sel.poly, ...screenToDoc(e.clientX, e.clientY))));
    return;
  }
  if (spaceDown || panDrag) { ring.classList.remove('on'); return; }
  const L = activeLayer();
  const size = ui.tool === 'erase' ? ui.eraser : (L ? L.params.size : lastParams[ui.brush].size);
  const d = Math.max(4, size * cssW * view.z / doc.w);
  ring.style.width = ring.style.height = d + 'px';
  ring.style.transform = `translate(${e.clientX - d / 2}px, ${e.clientY - d / 2}px)`;
  ring.classList.toggle('erase', ui.tool === 'erase');
  ring.classList.add('on');
  board.classList.add('nocursor');
}

/* Lasso: select and move. Circle something to select it (marching ants), drag inside to move it. A tap with
   nothing selected takes everything in scope (off the board too); a tap elsewhere lets go. Scope is every
   visible layer or just the active one (the chip over the tool). Each drag is one undo step; while the same
   selection is held, drags keep refining one move op per layer instead of stacking new ones. */
const selg = $('#selg');
const sel = { poly: null, layers: [], ops: new Map() };
let lasso = null, selDrag = null;
const polyD = (p, close) => p.length < 4 ? '' : 'M' + p.map((v, i) => (i % 2 ? ',' : i ? ' L' : '') + v.toFixed(1)).join('') + (close ? 'Z' : '');
function drawSel(dx = 0, dy = 0) {
  let out = '';
  if (lasso) { const d = polyD(lasso.pts, false); out = `<path class="halo" d="${d}"/><path class="ants" d="${d}"/>`; }
  else if (sel.poly) {
    const d = polyD(sel.poly, true);
    out = `<g transform="translate(${dx} ${dy})"><path class="tint" d="${d}"/><path class="halo" d="${d}"/><path class="ants" d="${d}"/></g>`;
  }
  selg.innerHTML = out;
}
const scopeLayers = () => doc.layers.filter(L => L.visible && L.strokes.length && (ui.selAll || L.id === doc.active));
function hasInside(L, poly) {
  let hit = false;
  eachPlaced(L, (x, y, r, erase) => { if (!hit && !erase && inPoly(poly, x, y)) hit = true; });
  return hit;
}
function dropSel() {
  if (!sel.poly && !lasso && !selDrag) return;
  sel.poly = null; sel.layers = []; sel.ops.clear(); lasso = null; selDrag = null;
  drawSel(); board.classList.remove('selmove');
  updatePill();
}
function setSel(poly, layers) { sel.poly = poly; sel.layers = layers.map(L => L.id); sel.ops.clear(); drawSel(); updatePill(); }
function selectAll(ls = scopeLayers()) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const L of ls) eachPlaced(L, (x, y, r, erase) => {
    if (erase) return;
    const e = r * 2.2 + 6; b[0] = Math.min(b[0], x - e); b[1] = Math.min(b[1], y - e); b[2] = Math.max(b[2], x + e); b[3] = Math.max(b[3], y + e);
  });
  if (!isFinite(b[0])) { toast('Nothing to select'); return; }
  setSel([b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3]], ls);
}
// a lasso path → at most ~200 points
function simplify(p) {
  const n = p.length / 2, step = Math.max(1, Math.ceil(n / 200)), out = [];
  for (let i = 0; i < n; i += step) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}
const liveOp = (L, op) => op && L.ops && L.ops[L.ops.length - 1] === op && op.at === L.strokes.length;
function selDown(e) {
  const [x, y] = screenToDoc(e.clientX, e.clientY);
  if (sel.poly && inPoly(sel.poly, x, y)) {
    selDrag = { id: e.pointerId, x0: x, y0: y, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, snap: null, base: null };
    return;
  }
  const had = !!sel.poly;
  dropSel();
  lasso = { id: e.pointerId, pts: [x, y], sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, far: 0, had };
}
function selMove(e) {
  if (lasso) {
    lasso.far = Math.max(lasso.far, Math.hypot(e.clientX - lasso.sx, e.clientY - lasso.sy));
    if (Math.hypot(e.clientX - lasso.lx, e.clientY - lasso.ly) < 3) return;
    lasso.lx = e.clientX; lasso.ly = e.clientY;
    lasso.pts.push(...screenToDoc(e.clientX, e.clientY));
    drawSel();
    return;
  }
  const g = selDrag;
  if (!g.moved) {
    if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    g.moved = true; g.snap = snapshot(); g.base = new Map();
    for (const id of sel.layers) {
      const L = layerById(id);
      if (!L) continue;
      let op = sel.ops.get(id);
      if (!liveOp(L, op)) { op = { at: L.strokes.length, poly: sel.poly.slice(), dx: 0, dy: 0 }; L.ops = [...(L.ops || []), op]; sel.ops.set(id, op); }
      g.base.set(op, [op.dx, op.dy]);
    }
  }
  const [x, y] = screenToDoc(e.clientX, e.clientY);
  g.dx = x - g.x0; g.dy = y - g.y0;
  for (const [op, [bx, by]] of g.base) { op.dx = bx + g.dx; op.dy = by + g.dy; }
  for (const id of sel.layers) dirty.add(id);
  drawSel(g.dx, g.dy); request();
}
function selUp() {
  if (lasso) {
    const l = lasso; lasso = null;
    if (l.far < 6) { drawSel(); if (!l.had) selectAll(); return; }       // a tap
    const poly = simplify(l.pts);
    const ls = poly.length >= 6 ? scopeLayers().filter(L => hasInside(L, poly)) : [];
    if (!ls.length) { drawSel(); toast(ui.selAll ? 'Nothing inside the lasso' : `Nothing of ${activeLayer()?.name || 'this layer'} inside`); return; }
    setSel(poly, ls);
    return;
  }
  const g = selDrag; selDrag = null;
  if (!g || !g.moved) return;
  sel.poly = sel.poly.map((v, i) => v + (i % 2 ? g.dy : g.dx));
  drawSel();
  commit(g.snap); renderLayers();
}
function selCancel() {
  if (lasso) { lasso = null; drawSel(); }
  if (selDrag) selUp();
}
function deleteSel() {
  if (!sel.poly) return;
  mutate(() => {
    for (const id of sel.layers) {
      const L = layerById(id);
      if (!L) continue;
      const op = sel.ops.get(id);
      if (liveOp(L, op)) op.del = true;     // the op's own lasso already holds exactly what was selected
      else L.ops = [...(L.ops || []), { at: L.strokes.length, poly: sel.poly.slice(), dx: 0, dy: 0, del: true }];
      dirty.add(id);
    }
  });
  dropSel(); request();
  toast('Selection deleted', { label: 'Undo', fn: undo });
}

addEventListener('keydown', e => {
  if (e.target instanceof Element && e.target.matches('input[type=text], textarea, [contenteditable]')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod || e.altKey) return;
  if (e.key === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; board.classList.add('grab'); ring.classList.remove('on'); } return; }
  const k = e.key.toLowerCase();
  if (k === '[' || k === ']') {
    const f = k === ']' ? 1.15 : 1 / 1.15;
    if (ui.tool === 'erase') ui.eraser = clamp(Math.round(ui.eraser * f), 4, 240);
    else { const L = activeLayer(); if (L) setParam(L, 'size', clamp(Math.round(L.params.size * f), 2, 140)); }
    refreshControls(); return;
  }
  if (k === 'b') setTool(!brushTool() ? ui.brush : TOOLS[(TOOLS.indexOf(ui.tool) + 1) % TOOLS.length]);
  else if (k === 'e') setTool(ui.tool === 'erase' ? ui.brush : 'erase');
  else if (k === '3') setTool(ui.tool === 'view' ? ui.brush : 'view');
  else if (k === 'c' && ui.tool === 'view') setCanvas3d(!ui.canvas3d);
  else if (k === 's') togglePanel();
  else if (k === 'escape') { if (sel.poly) dropSel(); else togglePanel(false); }
  else if (k === 'l') setTool(ui.tool === 'lasso' ? ui.brush : 'lasso');
  else if ((k === 'backspace' || k === 'delete') && sel.poly) { e.preventDefault(); deleteSel(); }
  else if (k === '0') fitView();
  else if (k === 'r' && !three.on) turnBy(e.shiftKey ? -QUARTER : QUARTER);
  else if (k === '1') zoomToPct(100);
  else if (k === '=' || k === '+') zoomStep(1);
  else if (k === '-') zoomStep(-1);
});
addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; board.classList.remove('grab'); } });
addEventListener('blur', () => { spaceDown = false; board.classList.remove('grab'); });

