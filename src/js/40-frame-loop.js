/* ════════════════════════════════════════════════════════════════════
   frame loop
   ════════════════════════════════════════════════════════════════════ */
let raf = 0, lastMs = 0, liveP = null, lastTouch = 0;
const request = () => { needsDraw = true; if (!raf) raf = requestAnimationFrame(frame); };
function frame() {
  raf = 0;
  const t0 = performance.now();
  if (drawing && ui.snap && !drawing.shape && !drawing.still.tried && t0 - drawing.still.t > SNAP_HOLD) { drawing.still.tried = true; trySnap(); }
  if (drawing && drawing.morph) {
    const m = (t0 - drawing.morph) / SNAP_MORPH;
    if (m >= 1) drawing.morph = 0;
    layShape(drawing, m);
  }
  if (drawing && !drawing.shape && !drawing.st.erase && drawing.L.params.pool > 0 && t0 - drawing.lastMove > 24) {
    const p = drawing.st.pts, n = p.length;
    if (n) p.push(p[n - 5], p[n - 4], p[n - 3], t0 - drawing.t0, p[n - 1]);    // still pen: let the slip pool
  }
  for (const id of dirty) { const L = layerById(id); if (L) rebuild(L); }
  dirty.clear();
  if (drawing) renderLive(drawing.L, drawing.st);
  const moving = three.on && step3D(t0);       // may finish leaving 3D, so check again before drawing
  if (three.on) {
    const busy = moving || t0 - three.touched < 140;
    SCN = { S: SC, mode: updateScene() ? 2 : 0, li: lightOf() };    // occlusion only: the room's light turns with the view
    render3D(null, busy ? .6 : 1);
    clearTimeout(three.settle);
    if (busy && !moving) three.settle = setTimeout(request, 160);   // the sharp frame once hands come off
  } else compositeScreen();
  needsDraw = false;
  lastMs = lastMs ? lerp(lastMs, performance.now() - t0, .2) : performance.now() - t0;
  updateStat();
  if (drawing || moving) raf = requestAnimationFrame(frame);
}
const statEl = $('#stat');
function updateStat() {
  let s = `${doc.w}×${doc.h} · ${lastMs.toFixed(1)} ms`;
  if (liveP) s += ` · ${liveP.kind} ${liveP.p.toFixed(2)}${liveP.tilt != null ? ' · tilt ' + liveP.tilt + '°' : ''}`;
  if (lastTouch) s += ` · touch ${lastTouch}px`;
  statEl.textContent = s;
}

