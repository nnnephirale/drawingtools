/* ════════════════════════════════════════════════════════════════════
   scene light: one key light for the board, real shadows, occlusion, bounce
   ════════════════════════════════════════════════════════════════════ */
/* The board is lit like a photograph of clay on paper: a soft key light (Direction, Height, Softness), the sky
   (Fill), and light bounced off whatever stands nearby. Three buffers at half the field's resolution hold what
   one layer can't know alone (FS_SCENE and FS_LIGHT in js/shaders.js): every layer's height summed, the colours
   of what's there over the backdrop, and the light that gets through. On screen they're rebuilt only when a
   height field, a layer's form or colour, the backdrop or the light changes, so panning and zooming cost
   nothing extra. Export builds its own at export resolution. Clay is shaded by this light alone; the other
   materials keep their own shading and are only darkened where the scene blocks it. */
const SC = { w: 0, h: 0, hT: null, aT: null, lb: null, ok: true, sig: '' };
// what the drawing in progress reads: the scene buffers, how to use them (0 none, 1 shadow + occlusion,
// 2 occlusion only, for the 3D view) and the light
let SCN = { S: null, mode: 0, li: null };
const PAPER = { plain: 0, paper: 1, folded: 2 };
const withLight = d => { d.light = { ...LIGHT_OLD, ...(d.light || {}) }; return d; };

const imgIds = new WeakMap(); let imgSeq = 0;
const imgId = c => { if (!c) return 0; let i = imgIds.get(c); if (!i) { i = ++imgSeq; imgIds.set(c, i); } return i; };
const bgSrgb = () => doc.bg === 'none' ? [1, 1, 1] : hexRgb(doc.bg);
const albedoOf = L => lin(hexRgb(L.brush === 'metal' ? L.params.c1 : L.params.color));

function lightOf(d = doc) {
  const Lt = d.light || LIGHT_OLD;
  const dir = lightDir(Lt.angle, Lt.height * Math.PI / 180);
  const key = [1, .972, .935].map(v => v * (1.1 - .45 * Lt.fill));      // a warm key, a cooler sky
  const sky = [.93, .96, 1].map(v => v * (.16 + .92 * Lt.fill));
  return { Lt, dir, key, sky, open: key.map((v, i) => v * dir[2] + sky[i]), soft: Math.tan((1.5 + 22 * Lt.soft) * Math.PI / 180) };
}

// a mipmapped render target: blurred heights and colours are then one textureLod away
function mipTarget(w, hgt, internal) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(w, hgt))) + 1, internal, w, hgt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h: hgt, ok };
}
function sceneTargets(S, w, hgt) {
  if (S.hT && S.w === w && S.h === hgt) return S;
  freeScene(S);
  S.w = w; S.h = hgt;
  S.hT = mipTarget(w, hgt, gl.RGBA16F); S.aT = mipTarget(w, hgt, gl.RGBA8); S.lb = makeTarget(w, hgt, FIELD);
  S.ok = FIELD.scale === 1 && S.hT.ok && S.aT.ok && S.lb.ok;      // no float targets, no scene light
  return S;
}
function freeScene(S) { [S.hT, S.aT, S.lb, ...(S.base || [])].forEach(freeTarget); S.hT = S.aT = S.lb = null; S.base = []; S.w = S.h = 0; }

/* Building: begin (clear the heights, lay the backdrop), add each visible layer bottom to top, end (blur,
   then the light). Split so export can build each layer's field just before adding it. Units 0 and 1 are
   re-bound on every pass, so no sampler can still hold the target being drawn into. */
function sceneBegin(S, n) {
  // what each layer stands on, four layers to a target (one channel each), so stacked strokes know their height
  S.base = S.base || [];
  while (S.base.length < Math.ceil(n / 4)) S.base.push(makeTarget(S.w, S.h, FIELD));
  S.baseOf = new Map();
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, S.hT.fb); gl.viewport(0, 0, S.w, S.h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  ensureImgTex();
  fullscreen(PR.scene, S.aT, u => {
    bindTex(0, null); bindTex(1, doc.bgImage ? imgTex : null); bindTex(2, null);
    gl.uniform1i(u.uField, 0); gl.uniform1i(u.uTex, 1); gl.uniform1i(u.uBase, 2); gl.uniform1i(u.uMode, 2);
    gl.uniform3f(u.uCol, ...bgSrgb()); gl.uniform1i(u.uImg, doc.bgImage ? 1 : 0);
  });
}
function sceneAdd(S, L, tex, k) {
  // what it stands on: the heights so far, blurred over about its radius, into its channel of a base target
  const bt = S.base[k >> 2], c = k & 3, ch = [0, 1, 2, 3].map(i => i === c ? 1 : 0);
  if (k) { gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, S.hT.tex); gl.generateMipmap(gl.TEXTURE_2D); gl.bindTexture(gl.TEXTURE_2D, null); }
  gl.disable(gl.BLEND); gl.colorMask(c === 0, c === 1, c === 2, c === 3);
  fullscreen(PR.scene, bt, u => {
    bindTex(0, null); bindTex(1, S.hT.tex); bindTex(2, null);
    gl.uniform1i(u.uField, 0); gl.uniform1i(u.uTex, 1); gl.uniform1i(u.uBase, 2); gl.uniform1i(u.uMode, 3);
    gl.uniform1f(u.uLod, k ? Math.max(0, Math.log2(L.params.size * .9 * L.params.vol / (doc.w / S.w))) : 0);
  });
  gl.colorMask(true, true, true, true);
  S.baseOf.set(L.id, [bt, c]);
  // its surface, laid over the heights so far
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  fullscreen(PR.scene, S.hT, u => {
    hUniforms(u, L, tex); bindTex(1, null); bindTex(2, bt.tex);
    gl.uniform1i(u.uTex, 1); gl.uniform1i(u.uBase, 2); gl.uniform4f(u.uBaseCh, ...ch); gl.uniform1i(u.uMode, 0);
    gl.uniform1f(u.uK, L.params.vol); gl.uniform1f(u.uLift, L.brush === 'clay' ? 1 : 0);
  });
  fullscreen(PR.scene, S.aT, u => { hUniforms(u, L, tex); bindTex(1, null); bindTex(2, null); gl.uniform1i(u.uTex, 1); gl.uniform1i(u.uBase, 2); gl.uniform1i(u.uMode, 1); gl.uniform3f(u.uCol, ...albedoOf(L)); });
  gl.disable(gl.BLEND);
}
function sceneEnd(S, layers, li, steps) {
  gl.activeTexture(gl.TEXTURE7);
  for (const t of [S.hT, S.aT]) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.generateMipmap(gl.TEXTURE_2D); }
  gl.bindTexture(gl.TEXTURE_2D, null);
  // how far a shadow can fall: the tallest likely stack over the tangent of the light's height
  let hmax = 0;
  for (const L of layers) { const P = L.params; hmax = Math.max(hmax, Math.min(P.size * .85 * (1 + P.pool * .6), (P.edge ?? 40) * 1.5) * P.vol * (L.brush === 'clay' ? 2 : 1)); }
  S.reach = clamp(hmax * 1.4 / Math.tan(li.Lt.height * Math.PI / 180), 24, 900); S.steps = steps;
  fullscreen(PR.light, S.lb, u => { gl.uniform2f(u.uDoc, doc.w, doc.h); marchUniforms(u, S, li, 6); });
}

// the screen's scene, rebuilt when what it depends on changed; false when there's no scene light to read
const SHADOW_STEPS = 40, SHADOW_STEPS_LIVE = 24;
function updateScene() {
  if (!doc.light.shadows || !SC.ok) return false;
  sceneTargets(SC, Math.max(1, Math.ceil(T.w / 2)), Math.max(1, Math.ceil(T.h / 2)));
  if (!SC.ok) { freeScene(SC); SC.ok = false; return false; }
  const Lt = doc.light, steps = ui.previewShadows ? (drawing ? SHADOW_STEPS_LIVE : SHADOW_STEPS) : 0;
  const layers = doc.layers.filter(L => L.visible);
  const sig = [fieldGen, SC.w, SC.h, doc.bg, imgId(doc.bgImage), Lt.angle, Lt.height, Lt.soft, steps, drawing ? drawing.L.id : '',
    ...layers.map(L => `${L.id}:${L.params.vol}:${L.params.merge}:${L.params.edge}:${L.params.color || L.params.c1}`)].join('|');
  if (sig === SC.sig) return true;
  SC.sig = sig;
  const li = lightOf();
  sceneBegin(SC, layers.length);
  layers.forEach((L, k) => sceneAdd(SC, L, drawing && drawing.L === L ? T.live.tex : layerTarget(L).tex, k));
  sceneEnd(SC, layers, li, steps);
  return true;
}
// what a shadow march needs (SCENE_GLSL), with the heights on texture unit `unit`
function marchUniforms(u, S, li, unit) {
  bindTex(unit, S.hT.tex); gl.uniform1i(u.uSH, unit);
  gl.uniform1f(u.uTexDoc, doc.w / S.w); gl.uniform3f(u.uSL, ...li.dir);
  gl.uniform1f(u.uSoft, li.soft); gl.uniform1f(u.uReach, S.reach); gl.uniform1i(u.uSteps, S.steps);
  gl.uniform2f(u.uLBTexel, 1 / S.w, 1 / S.h);
}
// the scene uniforms every receiver (ground, layers, the 3D mesh) shares
function sceneUniforms(u, L) {
  const { S, mode } = SCN, li = SCN.li || lightOf();
  const base = mode && L && S.baseOf && S.baseOf.get(L.id);
  bindTex(3, base ? base[0].tex : null); gl.uniform1i(u.uBase, 3);
  gl.uniform4f(u.uBaseCh, ...[0, 1, 2, 3].map(i => base && base[1] === i ? 1 : 0));
  gl.uniform1i(u.uLit, mode);
  if (mode) marchUniforms(u, S, li, 6); else { bindTex(6, null); gl.uniform1i(u.uSH, 6); }
  bindTex(4, mode ? S.lb.tex : null); gl.uniform1i(u.uLB, 4);
  bindTex(5, mode ? S.aT.tex : null); gl.uniform1i(u.uSA, 5);
  gl.uniform3f(u.uKeyC, ...li.key); gl.uniform3f(u.uSkyC, ...li.sky); gl.uniform3f(u.uOpenC, ...li.open);
  gl.uniform3f(u.uBgC, ...lin(bgSrgb())); gl.uniform3f(u.uSL, ...li.dir);
  gl.uniform1f(u.uShade, li.Lt.shade ?? 1);
  // what's around, for bounce: blurred over ~14 doc px of the scene (and twice that seen from the paper)
  const texDoc = S ? doc.w / S.w : 2;
  gl.uniform1f(u.uEnvLod, Math.max(0, Math.log2(14 / texDoc))); gl.uniform1f(u.uBleedLod, Math.max(0, Math.log2(22 / texDoc)));
}
