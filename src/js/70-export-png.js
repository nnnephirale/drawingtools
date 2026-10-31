/* ════════════════════════════════════════════════════════════════════
   export: rebuild every layer at k× and composite off-screen
   ════════════════════════════════════════════════════════════════════ */
let exporting = false;
// render the whole document at scale S into a 2D canvas (also used for session thumbnails)
function renderCanvas(S, transparent, crop) {
  const w = Math.max(1, Math.round(doc.w * S)), hgt = Math.max(1, Math.round(doc.h * S));
  S = w / doc.w;
  const ctx = { field: makeTarget(w, hgt, FIELD), scratch: makeTarget(w, hgt, FIELD), erase: makeTarget(w, hgt, FIELD), group: makeTarget(w, hgt, FIELD), minSig: .7 / S };
  const out = makeTarget(w, hgt, FMT8);
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const layers = doc.layers.filter(L => L.visible && L.strokes.length), prev = SCN;
  // scene light at this resolution: every layer's height and colour first, then the light, then the picture
  let scn = null;
  if (doc.light.shadows) {
    scn = sceneTargets({}, Math.ceil(w / 2), Math.ceil(hgt / 2));
    if (scn.ok) {
      const li = lightOf();
      sceneBegin(scn, layers.length);
      layers.forEach((L, k) => { buildLayer(L, ctx); sceneAdd(scn, L, ctx.field.tex, k); });
      sceneEnd(scn, layers, li, SHADOW_STEPS + 16);
      SCN = { S: scn, mode: 1, li };
    }
  }
  const sh = SCN.mode === 1 ? 1 / Math.tan(doc.light.height * Math.PI / 180) : 0;   // shadows reach past the strokes
  drawBg(out, transparent);
  for (const L of layers) {
    const lb = [Infinity, Infinity, -Infinity, -Infinity];
    buildLayer(L, ctx, lb);
    const pad = (L.params.size * .24 + 3) * L.params.vol * 1.6 + 6 + L.params.size * .9 * L.params.vol * sh;
    bounds[0] = Math.min(bounds[0], lb[0] - pad); bounds[1] = Math.min(bounds[1], lb[1] - pad);
    bounds[2] = Math.max(bounds[2], lb[2] + pad); bounds[3] = Math.max(bounds[3], lb[3] + pad);
    drawLayer(L, ctx.field.tex, out, w, hgt);
  }
  let x0 = 0, y0 = 0, x1 = w, y1 = hgt;
  if (crop && isFinite(bounds[0])) {
    x0 = clamp(Math.floor(bounds[0] * S), 0, w); y0 = clamp(Math.floor(bounds[1] * S), 0, hgt);
    x1 = clamp(Math.ceil(bounds[2] * S), 0, w); y1 = clamp(Math.ceil(bounds[3] * S), 0, hgt);
  }
  const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
  const px = new Uint8Array(cw * ch * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
  gl.readPixels(x0, hgt - y1, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, px);
  [ctx.field, ctx.scratch, ctx.erase, ctx.group, out].forEach(freeTarget);
  if (scn) freeScene(scn);
  SCN = prev;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.BLEND);
  return { cv: pixelCanvas(px, cw, ch), cw, ch };
}
// premultiplied, bottom-up GL pixels → a straight-alpha 2D canvas
function pixelCanvas(px, cw, ch) {
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c2 = cv.getContext('2d');
  const id = c2.createImageData(cw, ch), d = id.data;
  for (let y = 0; y < ch; y++) {
    const src = (ch - 1 - y) * cw * 4, dst = y * cw * 4;
    for (let x = 0; x < cw * 4; x += 4) {
      const a = px[src + x + 3];
      const k = a ? 255 / a : 0;
      d[dst + x] = Math.min(255, px[src + x] * k); d[dst + x + 1] = Math.min(255, px[src + x + 1] * k);
      d[dst + x + 2] = Math.min(255, px[src + x + 2] * k); d[dst + x + 3] = a;
    }
  }
  c2.putImageData(id, 0, 0);
  return cv;
}
// hand a file to the user: the share sheet on touch (Save to Files / Photos), a download elsewhere
async function deliverFile(blob, name, type, done) {
  if (window.claude && window.claude.use) {          // inside a claude.ai artifact: the viewer owns saving
    const dl = await window.claude.use('downloads');
    if (!dl) { toast('Saving is not available in this view'); return; }
    try { await dl.save({ filename: name, data: blob }); toast(done); }
    catch (err) { toast(err && err.code === 'declined' ? 'Cancelled' : 'Saving is not available in this view'); }
    return;
  }
  const file = new File([blob], name, { type });
  let shared = false;
  if (isTouchUI && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); shared = true; } catch (e) { shared = e && e.name === 'AbortError'; }
  }
  if (!shared) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  toast(done);
}
async function exportPNG() {
  if (exporting) return;
  if (!doc.layers.some(L => L.visible && L.strokes.length)) { toast('Nothing to export yet'); return; }
  exporting = true;
  toast('Rendering…');
  await new Promise(r => setTimeout(r, 30));
  try {
    const lim = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 8192);
    let S = Math.min(ui.exp.scale, lim / doc.w, lim / doc.h);
    const cap = isTouchUI ? 16e6 : 36e6;
    if (doc.w * doc.h * S * S > cap) S = Math.sqrt(cap / (doc.w * doc.h));
    const { cv, cw, ch } = renderCanvas(S, ui.exp.transparent, ui.exp.crop);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    const now = new Date(), pad = n => String(n).padStart(2, '0');
    const name = `slip-metal-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;
    await deliverFile(blob, name, 'image/png', `Saved PNG · ${cw}×${ch}`);
  } catch (err) {
    console.error(err);
    toast('Export failed: ' + (err.message || err));
  } finally {
    exporting = false;
    for (const L of doc.layers) dirty.add(L.id);   // targets were reused; make sure screen fields are intact
    request();
  }
}
$('#btnExport').onclick = () => three.on ? export3DPNG() : exportPNG();
const stamp = () => { const n = new Date(), p = v => String(v).padStart(2, '0'); return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}-${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`; };
const hasInk = () => doc.layers.some(L => L.visible && L.strokes.length);

// the 3D view as it stands, at screen resolution, with a transparent surround
async function export3DPNG() {
  if (exporting) return;
  exporting = true;
  try {
    const out = makeTarget(canvas.width, canvas.height, FMT8), px = new Uint8Array(out.w * out.h * 4);
    render3D(out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    gl.readPixels(0, 0, out.w, out.h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    freeTarget(out);
    const blob = await new Promise(r => pixelCanvas(px, out.w, out.h).toBlob(r, 'image/png'));
    await deliverFile(blob, `slip-metal-3d-${stamp()}.png`, 'image/png', `Saved PNG · ${out.w}×${out.h}`);
  } catch (err) { console.error(err); toast('Export failed: ' + (err.message || err)); }
  finally { exporting = false; request(); }
}

