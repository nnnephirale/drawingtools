/* Models. The visible layers' heights are read back on a grid (each layer packed into 16 bits of RGBA8,
   then summed, so they stack exactly as in the 3D view, Depth included) and turned into a mesh. */
function heightGrid(cells) {
  const cell = Math.max(doc.w, doc.h) / cells, nx = Math.ceil(doc.w / cell), ny = Math.ceil(doc.h / cell);
  const S = clamp(2 * nx / doc.w, .35, 2), fw = Math.round(doc.w * S), fh = Math.round(doc.h * S);
  const ctx = { field: makeTarget(fw, fh, FIELD), scratch: makeTarget(fw, fh, FIELD), erase: makeTarget(fw, fh, FIELD), group: makeTarget(fw, fh, FIELD), minSig: .7 * doc.w / fw };
  const out = makeTarget(nx + 1, ny + 1, FMT8), px = new Uint8Array((nx + 1) * (ny + 1) * 4);
  const hgt = new Float32Array((nx + 1) * (ny + 1));
  for (const L of doc.layers) {
    if (!L.visible || !L.strokes.length) continue;
    buildLayer(L, ctx);
    const P = L.params, K = P.vol * ui.depth, enc = (P.edge + P.size * 2) * K + 1;
    gl.disable(gl.BLEND);
    fullscreen(PR.hgt, out, u => { hUniforms(u, L, ctx.field.tex); gl.uniform1f(u.uK, K); gl.uniform1f(u.uEnc, enc); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
    gl.readPixels(0, 0, nx + 1, ny + 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const q = ((ny - j) * (nx + 1) + i) * 4;
      hgt[j * (nx + 1) + i] += (px[q] * 256 + px[q + 1]) / 65535 * enc;
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  [ctx.field, ctx.scratch, ctx.erase, ctx.group, out].forEach(freeTarget);
  return { nx, ny, hgt };
}
/* A mesh in any frame: map() places a doc point (x, y down, z up, in doc px) and dir() turns an outward
   direction the same way, so each face is wound outward whatever the format's axes. solid adds the
   slab's walls and a floor, making a closed tile; shade goes to vertex colour (top 1, walls, floor darker). */
function buildModel({ nx, ny, hgt }, map, dir, solid, base) {
  const pos = [], uv = [], shade = [], idx = [];
  const vert = (x, y, z, s) => { pos.push(...map(x, y, z)); uv.push(x / doc.w, y / doc.h); shade.push(s); return pos.length / 3 - 1; };
  const tri = (a, b, c, out) => {
    const o = dir(...out), P = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const A = P(a), B = P(b), C = P(c), u = B.map((v, i) => v - A[i]), v = C.map((w, i) => w - A[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const X = i => i / nx * doc.w, Y = j => j / ny * doc.h, Z = (i, j) => base + hgt[j * (nx + 1) + i];
  const top = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) top.push(vert(X(i), Y(j), Z(i, j), 1));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = top[j * (nx + 1) + i], b = a + 1, c = a + nx + 1, d = c + 1;
    tri(a, c, b, [0, 0, 1]); tri(b, c, d, [0, 0, 1]);
  }
  if (solid) {
    // perimeter clockwise from the top-left corner, as [i, j] grid points
    const ring = [];
    for (let i = 0; i < nx; i++) ring.push([i, 0]);
    for (let j = 0; j < ny; j++) ring.push([nx, j]);
    for (let i = nx; i > 0; i--) ring.push([i, ny]);
    for (let j = ny; j > 0; j--) ring.push([0, j]);
    const outOf = ([i, j], [i2, j2]) => j === 0 && j2 === 0 ? [0, -1, 0] : i === nx && i2 === nx ? [1, 0, 0] : j === ny && j2 === ny ? [0, 1, 0] : [-1, 0, 0];
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k], q = ring[(k + 1) % ring.length], o = outOf(p, q);
      const a = vert(X(p[0]), Y(p[1]), Z(p[0], p[1]), .78), b = vert(X(q[0]), Y(q[1]), Z(q[0], q[1]), .78);
      const c = vert(X(p[0]), Y(p[1]), 0, .78), d = vert(X(q[0]), Y(q[1]), 0, .78);
      tri(a, c, b, o); tri(b, c, d, o);
    }
    const mid = vert(doc.w / 2, doc.h / 2, 0, .6), floor = ring.map(([i, j]) => vert(X(i), Y(j), 0, .6));
    for (let k = 0; k < floor.length; k++) tri(mid, floor[k], floor[(k + 1) % floor.length], [0, 0, -1]);
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), shade, idx: new Uint32Array(idx) };
}
function triNormal(p, a, b, c) {
  const u = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
  const v = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
function stlBlob(m) {
  const nt = m.idx.length / 3, dv = new DataView(new ArrayBuffer(84 + nt * 50));
  const head = 'Slip & Metal relief';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, nt, true);
  for (let t = 0, o = 84; t < nt; t++, o += 50) {
    const a = m.idx[t * 3], b = m.idx[t * 3 + 1], c = m.idx[t * 3 + 2], n = triNormal(m.pos, a, b, c), l = Math.hypot(...n) || 1;
    for (let k = 0; k < 3; k++) dv.setFloat32(o + k * 4, n[k] / l, true);
    [a, b, c].forEach((v, r) => { for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + r * 12 + k * 4, m.pos[v * 3 + k], true); });
    dv.setUint16(o + 48, 0, true);
  }
  return new Blob([dv.buffer], { type: 'model/stl' });
}
// glTF binary: one mesh, the 2D render as an unlit texture (it already carries the material's light)
async function glbBlob(m, png, clear) {
  const nv = m.pos.length / 3, nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  for (let t = 0; t < m.idx.length; t += 3) {
    const n = triNormal(m.pos, m.idx[t], m.idx[t + 1], m.idx[t + 2]);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) nrm[m.idx[t + r] * 3 + k] += n[k];
  }
  for (let v = 0; v < nv; v++) {
    const l = Math.hypot(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) { nrm[v * 3 + k] /= l; col[v * 3 + k] = m.shade[v]; }
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.pos[v * 3 + k]); hi[k] = Math.max(hi[k], m.pos[v * 3 + k]); }
  const img = new Uint8Array(await png.arrayBuffer());
  const parts = [m.pos, nrm, m.uv, col, m.idx, img], views = [];
  let len = 0;
  for (const p of parts) { views.push({ buffer: 0, byteOffset: len, byteLength: p.byteLength }); len += Math.ceil(p.byteLength / 4) * 4; }
  views.forEach((v, i) => { if (i < 4) v.target = 34962; else if (i === 4) v.target = 34963; });
  const json = {
    asset: { version: '2.0', generator: 'Slip & Metal' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: session ? session.name : 'Relief' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 }] }],
    materials: [{ name: 'Drawing', doubleSided: clear, alphaMode: clear ? 'MASK' : 'OPAQUE', ...(clear ? { alphaCutoff: .5 } : {}),
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } }],
    textures: [{ source: 0, sampler: 0 }], samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
    images: [{ bufferView: 5, mimeType: 'image/png' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min: lo, max: hi },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' },
      { bufferView: 3, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 4, componentType: 5125, count: m.idx.length, type: 'SCALAR' },
    ],
    bufferViews: views, buffers: [{ byteLength: len }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jl = Math.ceil(js.length / 4) * 4, jp = new Uint8Array(jl).fill(0x20); jp.set(js);
  const bin = new Uint8Array(len);
  parts.forEach((p, i) => bin.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), views[i].byteOffset));
  const head = new DataView(new ArrayBuffer(20));
  head.setUint32(0, 0x46546C67, true); head.setUint32(4, 2, true); head.setUint32(8, 12 + 8 + jl + 8 + len, true);
  head.setUint32(12, jl, true); head.setUint32(16, 0x4E4F534A, true);
  const bh = new DataView(new ArrayBuffer(8)); bh.setUint32(0, len, true); bh.setUint32(4, 0x004E4942, true);
  return new Blob([head.buffer, jp, bh.buffer, bin], { type: 'model/gltf-binary' });
}
async function exportModel(kind) {
  if (exporting) return;
  if (!hasInk()) { toast('Nothing to export yet'); return; }
  exporting = true;
  toast('Building model…');
  await new Promise(r => setTimeout(r, 30));
  try {
    const g = heightGrid(kind === 'stl' ? 480 : 512), base = doc.w * SLAB;
    const clear = doc.bg === 'none' && !doc.bgImage;
    let blob;
    if (kind === 'stl') {
      const s = 120 / doc.w;                        // a 120 mm tile, z up, ready for a slicer
      blob = stlBlob(buildModel(g, (x, y, z) => [x * s, (doc.h - y) * s, z * s], (x, y, z) => [x, -y, z], true, base));
    } else {
      const s = .32 / Math.max(doc.w, doc.h);       // metres, y up, centred: 32 cm on the long side
      const m = buildModel(g, (x, y, z) => [(x - doc.w / 2) * s, z * s, (y - doc.h / 2) * s], (x, y, z) => [x, z, y], !clear, clear ? 0 : base);
      const { cv } = renderCanvas(Math.min(2, 4096 / Math.max(doc.w, doc.h)), false, false);
      blob = await glbBlob(m, await new Promise(r => cv.toBlob(r, 'image/png')), clear);
    }
    const mb = (blob.size / 1048576).toFixed(1);
    await deliverFile(blob, `slip-metal-${stamp()}.${kind}`, blob.type, `Saved ${kind.toUpperCase()} · ${mb} MB`);
  } catch (err) { console.error(err); toast('Export failed: ' + (err.message || err)); }
  finally { exporting = false; request(); }
}
function viewControls() {
  return [sec('3D view'),
    slider({ label: 'Depth', min: .3, max: 1.2, step: .05, suf: '×', hist: false, get: () => ui.depth, set: v => { ui.depth = v; request(); save(); } }),
    hint('Turn Canvas off (just above 3D) and each stroke becomes a whole object with an underside, so you can turn it right round. Depth 1× keeps ropes round.'),
    hint(isTouchUI
      ? 'Drag to turn the drawing, all the way round if you like. Pinch to zoom, two fingers to move it. Fit returns to the starting angle.'
      : 'Drag or scroll to turn, all the way round · right-drag or <kbd>Space</kbd>-drag to move · pinch or <kbd>⌘</kbd>+scroll to zoom · <kbd>0</kbd> starting angle · <kbd>3</kbd> back to drawing'),
    sec('Model'),
    h('div', { class: 'btnrow' },
      h('button', { type: 'button', class: 'btn', onclick: () => exportModel('stl') }, 'Export STL'),
      h('button', { type: 'button', class: 'btn', onclick: () => exportModel('glb') }, 'Export GLB')),
    hint('STL is a closed 120 mm tile for 3D printing. GLB keeps the colours, for Blender or any 3D viewer. Both use this Depth.')];
}

