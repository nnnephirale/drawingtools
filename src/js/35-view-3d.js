/* ════════════════════════════════════════════════════════════════════
   3D view: the height field as a relief you can turn
   ════════════════════════════════════════════════════════════════════ */
// Object space is doc px (x right, y down) with z towards the viewer; the camera sees it through a y flip.
// At rx = ry = 0 the board lands exactly where the 2D board sits, so entering and leaving can glide.
const three = { on: false, leaving: false, rx: 0, ry: 0, zoom: 1, panX: 0, panY: 0, vrx: 0, vry: 0, anim: null, t: 0, touched: 0 };
const POSE = { rx: -.62, ry: .38, zoom: .8, panX: 0, panY: 0 };
const POSE_KEYS = Object.keys(POSE);
const TILT = 1.45;          // tilt stops short of straight overhead; the turn (ry) goes all the way round
const SLAB = .025;          // slab thickness, as a fraction of the board's width (also the printed base)
const FOV = .5;
const M4 = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); },
  tr(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  sc(x, y, z) { return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); },
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
};
function camera3D(w, hgt) {
  const vw = innerWidth, vh = innerHeight, sr = stage.getBoundingClientRect();
  const dist = doc.h * vh / Math.max(1, cssH) / (2 * Math.tan(FOV / 2)) / three.zoom;
  const ext = Math.hypot(doc.w, doc.h) * .6 + doc.w * .1;
  const near = Math.max(dist * .05, dist - ext), far = dist + ext;
  const ox = (sr.left + sr.width / 2 + three.panX - vw / 2) * 2 / vw, oy = -(sr.top + sr.height / 2 + three.panY - vh / 2) * 2 / vh;
  let m = M4.tr(-doc.w / 2, -doc.h / 2, 0);
  for (const n of [M4.sc(1, -1, 1), M4.ry(three.ry), M4.rx(three.rx), M4.tr(0, 0, -dist), M4.persp(FOV, w / hgt, near, far), M4.tr(ox, oy, 0)]) m = M4.mul(n, m);
  // (R = Rx·Ry)ᵀ takes a camera-space direction back into the drawing's frame
  const cx = Math.cos(three.rx), sx = Math.sin(three.rx), cy = Math.cos(three.ry), sy = Math.sin(three.ry);
  const rotT = ([x, y, z]) => { const y1 = cx * y + sx * z, z1 = -sx * y + cx * z; return [cy * x - sy * z1, y1, sy * x + cy * z1]; };
  const toObj = v => { const r = rotT([v[0], -v[1], v[2]]); return [r[0], -r[1], r[2]]; };
  const e = rotT([0, 0, dist]), R = M4.mul(M4.rx(three.rx), M4.ry(three.ry)), rot = new Float32Array(9);
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) rot[c * 3 + r] = R[c * 4 + r] * ((r === 1) !== (c === 1) ? -1 : 1);
  // device px per doc px at the board's centre: how fine the mesh needs to be
  const ppd = hgt / (2 * Math.tan(FOV / 2) * dist);
  return { mvp: m, eye: [e[0] + doc.w / 2, -e[1] + doc.h / 2, e[2]], toObj, rot, ppd };
}

/* One grid shared by every layer, about 7 screen px per cell. Finer is wasted: a GPU shades pixels in 2×2
   blocks per triangle, so pixel-sized triangles cost several times the pixels they cover. Steps keep a
   zoom from rebuilding it every frame. */
let grid = null;
const GRID_STEPS = [96, 128, 192, 256, 384, 512];
function ensureGrid(ppd) {
  const want = Math.max(doc.w, doc.h) * ppd / 7, cells = GRID_STEPS.find(n => n >= want) || 512;
  const cell = Math.max(doc.w, doc.h) / cells, nx = Math.ceil(doc.w / cell), ny = Math.ceil(doc.h / cell);
  if (grid && grid.nx === nx && grid.ny === ny) return grid;
  if (grid) { gl.deleteVertexArray(grid.vao); gl.deleteBuffer(grid.vb); gl.deleteBuffer(grid.ib); }
  const uv = new Float32Array((nx + 1) * (ny + 1) * 2), idx = new Uint32Array(nx * ny * 6);
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { uv[k++] = i / nx; uv[k++] = 1 - j / ny; }
  for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const vao = gl.createVertexArray(), vb = gl.createBuffer(), ib = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return grid = { nx, ny, vao, vb, ib, n: idx.length };
}
// the rows of the grid a layer's strokes can reach (rows are contiguous in the index buffer, so one draw
// covers them); cached until the layer's strokes or size change
const rowSpan = new WeakMap();
function layerRows(L, g) {
  const key = L.strokes.length + ':' + L.params.size + ':' + g.ny + ':' + doc.h + ':' + (L.ops ? L.ops.length : 0);
  let c = rowSpan.get(L);
  if (c && c.key === key) return c;
  let y0 = Infinity, y1 = -Infinity, all = !!(L.ops && L.ops.length);   // moved content can sit anywhere
  for (const st of L.strokes) {
    if (st.erase) continue;
    if (st.sym && st.sym !== 'off' && st.sym !== 'x') { all = true; break; }
    for (let i = 1; i < st.pts.length; i += 5) { const y = st.pts[i]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const pad = L.params.size * 2.5 + (L.params.edge ?? 40) + 20;   // swelling, pools, drops and the bevel
  const j0 = all ? 0 : clamp(Math.floor((y0 - pad) / doc.h * g.ny), 0, g.ny), j1 = all ? g.ny : clamp(Math.ceil((y1 + pad) / doc.h * g.ny), j0, g.ny);
  c = { key, count: (j1 - j0) * g.nx * 6, offset: j0 * g.nx * 6 * 4 };
  rowSpan.set(L, c);
  return c;
}
// the board as a box: top face at z = 0, four sides down to the slab's thickness
let slab = null;
function ensureSlab() {
  const W = doc.w, Hh = doc.h, D = -doc.w * SLAB;
  if (slab && slab.w === W && slab.h === Hh) return slab;
  if (slab) { gl.deleteVertexArray(slab.vao); gl.deleteBuffer(slab.vb); }
  const v = [];
  const quad = (p, n, uv) => { for (const i of [0, 1, 2, 0, 2, 3]) v.push(...p[i], ...n, ...uv[i]); };
  quad([[0, 0, 0], [W, 0, 0], [W, Hh, 0], [0, Hh, 0]], [0, 0, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  quad([[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D]], [0, -1, 0], [[0, 0], [1, 0], [1, 0], [0, 0]]);
  quad([[0, Hh, 0], [W, Hh, 0], [W, Hh, D], [0, Hh, D]], [0, 1, 0], [[0, 1], [1, 1], [1, 1], [0, 1]]);
  quad([[0, 0, 0], [0, Hh, 0], [0, Hh, D], [0, 0, D]], [-1, 0, 0], [[0, 0], [0, 1], [0, 1], [0, 0]]);
  quad([[W, 0, 0], [W, Hh, 0], [W, Hh, D], [W, 0, D]], [1, 0, 0], [[1, 0], [1, 1], [1, 1], [1, 0]]);
  quad([[0, 0, D], [W, 0, D], [W, Hh, D], [0, Hh, D]], [0, 0, -1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  const vao = gl.createVertexArray(), vb = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  gl.bindVertexArray(null);
  return slab = { w: W, h: Hh, vao, vb, n: v.length / 8 };
}
// multisampled colour + depth (the canvas itself has neither), resolved onto the canvas each frame
let MS = null, stackTs = [];
function ensureMS(w, hgt) {
  if (MS && MS.w === w && MS.h === hgt) return MS;
  freeMS();
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  const fb = gl.createFramebuffer(), c = gl.createRenderbuffer(), d = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, c); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, hgt);
  gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, hgt);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return MS = { fb, c, d, w, h: hgt, lo: makeTarget(w, hgt, FMT8) };
}
function freeMS() {
  if (MS) { gl.deleteFramebuffer(MS.fb); gl.deleteRenderbuffer(MS.c); gl.deleteRenderbuffer(MS.d); freeTarget(MS.lo); MS = null; }
  stackTs.forEach(freeTarget); stackTs = [];
}
/* What each visible layer stands on: stacks[k] = the summed heights of layers 0..k-1. All built before the
   3D pass, because switching framebuffers in the middle of it makes a tiled GPU (every Apple device) write
   the whole multisampled colour and depth out and read them back each time. Needs a float field; on
   8-bit-only GPUs layers all start from the board. */
function buildStacks(layers) {
  if (FIELD.scale !== 1 || layers.length < 2) return null;
  if (stackTs.length && (stackTs[0].w !== T.w || stackTs[0].h !== T.h)) { stackTs.forEach(freeTarget); stackTs = []; }
  while (stackTs.length < layers.length) stackTs.push(makeTarget(T.w, T.h, FIELD));
  clearTarget(stackTs[0]);
  for (let k = 1; k < layers.length; k++) {
    const L = layers[k - 1];
    copyInto(stackTs[k - 1], stackTs[k]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    fullscreen(PR.hgt, stackTs[k], u => { hUniforms(u, L, layerTarget(L).tex); gl.uniform1f(u.uK, L.params.vol * ui.depth); gl.uniform1f(u.uEnc, 0); });
    gl.disable(gl.BLEND);
  }
  return stackTs;
}

// scale < 1 renders fewer pixels and stretches them onto the canvas: used while the drawing is moving
function render3D(out, scale = 1) {
  const W = out ? out.w : canvas.width, Hh = out ? out.h : canvas.height;
  const w = Math.round(W * scale), hgt = Math.round(Hh * scale);
  const layers = doc.layers.filter(L => L.visible && L.strokes.length);
  const ms = ensureMS(W, Hh), cam = camera3D(W, Hh), g = ensureGrid(cam.ppd), stacks = buildStacks(layers);
  gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fb); gl.viewport(0, 0, w, hgt);
  gl.colorMask(true, true, true, true); gl.depthMask(true);
  gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
  const key = cam.toObj(lightDir(120));
  if (ui.canvas3d && (doc.bgImage || doc.bg !== 'none')) {
    ensureImgTex();
    const s = ensureSlab(), u = PR.slab.u, c = doc.bg === 'none' ? [1, 1, 1] : hexRgb(doc.bg);
    gl.useProgram(PR.slab.p);
    gl.uniformMatrix4fv(u.uMVP, false, cam.mvp);
    gl.uniform3f(u.uBg, c[0], c[1], c[2]); gl.uniform3f(u.uL, ...key);
    gl.uniform1i(u.uImg, doc.bgImage ? 1 : 0); bindTex(0, imgTex); gl.uniform1i(u.uTex, 0);
    gl.bindVertexArray(s.vao); gl.drawArrays(gl.TRIANGLES, 0, s.n);
  }
  /* Depth for every layer and side first, then colour: only the surface in front gets shaded, which matters
     once the canvas is off and each stroke has two halves overlapping on screen. Depth comes from the solid
     part only, so soft edges blend over what's behind them without punching holes. */
  const u = PR.mesh.u, sides = ui.canvas3d ? [1] : [1, -1];   // off the canvas each stroke gets its mirrored underside
  gl.useProgram(PR.mesh.p);
  gl.uniformMatrix3fv(u.uRot, false, cam.rot);
  gl.uniform3f(u.uCam, ...cam.eye);
  gl.uniformMatrix4fv(u.uMVP, false, cam.mvp);
  gl.uniform1f(u.uDepth, ui.depth);
  gl.uniform1f(u.uRound, ui.canvas3d ? 0 : 1); gl.uniform1f(u.uCell, doc.w / g.nx);
  gl.bindVertexArray(g.vao);
  for (const pass of [0, 1]) {
    gl.uniform1i(u.uPass, pass);
    if (pass) { gl.colorMask(true, true, true, true); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
    else { gl.colorMask(false, false, false, false); gl.depthMask(true); gl.disable(gl.BLEND); }
    for (const [i, L] of layers.entries()) {
      layerUniforms(u, L, layerTarget(L).tex, T.w, T.h);      // the light stays put in the room while the drawing turns
      bindTex(1, stacks ? stacks[i].tex : null); gl.uniform1i(u.uStack, 1); gl.uniform1i(u.uHasStack, stacks ? 1 : 0);
      // on the canvas, soft edges are lifted clear of what's under them; off it, the two halves meet at the rim
      gl.uniform1f(u.uLift, ui.canvas3d ? .6 + .3 * (i + 1) : .03 * (i + 1));
      const rows = layerRows(L, g);
      if (rows.count) for (const side of sides) { gl.uniform1f(u.uSide, side); gl.drawElements(gl.TRIANGLES, rows.count, gl.UNSIGNED_INT, rows.offset); }
    }
  }
  gl.disable(gl.BLEND); gl.colorMask(true, true, true, true); gl.depthMask(true);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fb);
  if (scale === 1) {
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, out ? out.fb : null);
    gl.blitFramebuffer(0, 0, w, hgt, 0, 0, w, hgt, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  } else {
    // a multisampled resolve can't scale, so resolve at the small size first, then stretch
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, ms.lo.fb);
    gl.blitFramebuffer(0, 0, w, hgt, 0, 0, w, hgt, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.lo.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, out ? out.fb : null);
    gl.blitFramebuffer(0, 0, w, hgt, 0, 0, W, Hh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// glides (enter, leave, reset, zoom steps) and the drift after a flick; true while something still moves
const pose = () => Object.fromEntries(POSE_KEYS.map(k => [k, three[k]]));
function animate3D(to, done, dur = 850) {
  if (to.ry != null) { const d = three.ry - to.ry; three.ry = to.ry + d - 2 * Math.PI * Math.round(d / (2 * Math.PI)); }   // the short way round
  three.anim = { t0: performance.now(), dur, from: pose(), to: { ...pose(), ...to }, done };
  three.vrx = three.vry = 0;
  request();
}
function step3D(now) {
  const dt = Math.min(64, now - (three.t || now)); three.t = now;
  let moving = false;
  const a = three.anim;
  if (a) {
    const t = clamp((now - a.t0) / a.dur, 0, 1), e = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    for (const k of POSE_KEYS) three[k] = lerp(a.from[k], a.to[k], e);
    if (t >= 1) { three.anim = null; if (a.done) a.done(); } else moving = true;
  } else if (three.vrx || three.vry) {
    three.rx = clamp(three.rx + three.vrx * dt, -TILT, TILT); three.ry += three.vry * dt;
    const f = Math.exp(-dt / 260); three.vrx *= f; three.vry *= f;
    if (Math.hypot(three.vrx, three.vry) < 2e-5) three.vrx = three.vry = 0; else moving = true;
  }
  if (three.on) zq('pct').textContent = Math.round(pctOf(three.zoom)) + '%';
  return moving;
}
function size3D() {
  const vw = innerWidth, vh = innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = Math.min(dpr, Math.sqrt((isTouchUI ? 4.5e6 : 6e6) / (vw * vh)));
  canvas.width = Math.round(vw * k); canvas.height = Math.round(vh * k);
  request();
}
function enter3D() {
  if (three.on) return;
  if (closeup.on) { closeup.on = false; closeup.uv = WHOLE; canvas.removeAttribute('style'); }
  if (view.r) { view.r = 0; applyView(); }      // the 3D camera starts from the upright board
  Object.assign(three, { on: true, leaving: false, rx: 0, ry: 0, zoom: view.z, panX: view.x, panY: view.y, vrx: 0, vry: 0 });
  board.classList.add('three'); board.classList.remove('nocursor', 'grab'); ring.classList.remove('on');
  zq('fit').setAttribute('aria-pressed', 'false');
  size3D();
  animate3D(POSE);
}
function exit3D() {
  if (!three.on || three.leaving) return;
  three.leaving = true;
  orbit.ptrs.clear();
  animate3D({ rx: 0, ry: 0, zoom: view.z, panX: view.x, panY: view.y }, () => {
    three.on = three.leaving = false;
    board.classList.remove('three', 'grabbing');
    freeMS();
    canvas.width = T.w; canvas.height = T.h;
    fit(); request();
  }, 650);
}
const zoom3D = f => { three.anim = null; three.zoom = clamp(three.zoom * f, .25, 8); request(); };

// turning: drag rotates, two fingers pinch and move, Space / right / middle drag moves
const orbit = { ptrs: new Map(), pan: false };
function orbitStart() {
  const ps = [...orbit.ptrs.values()];
  Object.assign(orbit, { n: ps.length, c0: centroid(ps), d0: spread(ps), z0: three.zoom, px0: three.panX, py0: three.panY,
    rx0: three.rx, ry0: three.ry, lt: performance.now(), lrx: three.rx, lry: three.ry, vrx: 0, vry: 0 });
}
function orbitDown(e) {
  e.preventDefault();
  if (three.leaving) return;
  if (stage.setPointerCapture) try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  orbit.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  if (e.pointerType === 'touch') tapDown(e, orbit.ptrs.size);
  orbit.pan =e.pointerType === 'mouse' && e.button !== 0 || spaceDown;
  three.anim = null; three.vrx = three.vry = 0;
  orbitStart();
  board.classList.add('grabbing');
}
function orbitMove(e) {
  const p = orbit.ptrs.get(e.pointerId);
  if (!p) return;
  three.touched = performance.now();
  p.x = e.clientX; p.y = e.clientY;
  if (e.pointerType === 'touch') tapMove(p);
  const ps = [...orbit.ptrs.values()], c = centroid(ps);
  if (ps.length !== orbit.n) { orbitStart(); return; }
  const dx = c[0] - orbit.c0[0], dy = c[1] - orbit.c0[1];
  if (ps.length >= 2) {
    three.zoom = clamp(orbit.z0 * spread(ps) / Math.max(orbit.d0, 1), .25, 8);
    three.panX = orbit.px0 + dx; three.panY = orbit.py0 + dy;
  } else if (orbit.pan) {
    three.panX = orbit.px0 + dx; three.panY = orbit.py0 + dy;
  } else {
    three.ry = orbit.ry0 + dx * .006; three.rx = clamp(orbit.rx0 + dy * .006, -TILT, TILT);
    const now = e.timeStamp, dt = now - orbit.lt;
    if (dt > 0) {
      orbit.vrx = lerp(orbit.vrx, (three.rx - orbit.lrx) / dt, .6); orbit.vry = lerp(orbit.vry, (three.ry - orbit.lry) / dt, .6);
      orbit.lt = now; orbit.lrx = three.rx; orbit.lry = three.ry;
    }
  }
  request();
}
function orbitUp(e) {
  if (!orbit.ptrs.delete(e.pointerId)) return;
  if (orbit.ptrs.size) { orbitStart(); return; }
  board.classList.remove('grabbing');
  if (e.pointerType === 'touch') tapEnd(e);
  // a flick keeps turning and settles; a drag that stopped before letting go stays put
  if (orbit.n === 1 && !orbit.pan && e.timeStamp - orbit.lt < 70) {
    const v = Math.hypot(orbit.vrx, orbit.vry), k = v > .003 ? .003 / v : 1;   // a hard flick drifts, never spins
    three.vrx = orbit.vrx * k; three.vry = orbit.vry * k; three.t = performance.now(); request();
  }
}

