/* ════════════════════════════════════════════════════════════════════
   compositing
   ════════════════════════════════════════════════════════════════════ */
let imgTex = null, imgTexSrc = null;
function ensureImgTex() {
  if (doc.bgImage === imgTexSrc) return;
  if (imgTex) { gl.deleteTexture(imgTex); imgTex = null; }
  imgTexSrc = doc.bgImage;
  if (!doc.bgImage) return;
  imgTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imgTex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, doc.bgImage);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
function drawBg(target, transparent) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  if (transparent) return;
  ensureImgTex();
  if (!doc.bgImage && doc.bg === 'none') return;
  fullscreen(PR.bg, target, u => {
    gl.uniform4f(u.uView, ...(target ? WHOLE : closeup.uv));
    const c = doc.bg === 'none' ? [1, 1, 1] : hexRgb(doc.bg);
    gl.uniform3f(u.uBg, c[0], c[1], c[2]);
    gl.uniform1i(u.uImg, doc.bgImage ? 1 : 0);
    bindTex(0, imgTex); gl.uniform1i(u.uTex, 0);
  });
}
function lightDir(deg, el = .66) {
  const a = deg * Math.PI / 180;
  return [Math.cos(a) * Math.cos(el), -Math.sin(a) * Math.cos(el), Math.sin(el)];
}
// the uniforms of the shared height chunk (GL_H), with the layer's field on unit 0
function hUniforms(u, L, tex) {
  const P = L.params;
  bindTex(0, tex); gl.uniform1i(u.uField, 0);
  gl.uniform1f(u.uInv, 1 / FIELD.scale); gl.uniform2f(u.uDoc, doc.w, doc.h);
  gl.uniform1f(u.uA, mergeA(P.merge));
  gl.uniform1f(u.uBevel, P.edge ?? 40); gl.uniform1f(u.uBulge, L.brush === 'metal' ? 0 : L.brush === 'stone' ? .3 : .5);
}
function drawLayer(L, tex, target, tw, th) {
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  fullscreen(PR.comp, target, u => { layerUniforms(u, L, tex, tw, th); gl.uniform4f(u.uView, ...(target ? WHOLE : closeup.uv)); });
  gl.disable(gl.BLEND);
}
// every material uniform; returns the light direction so the 3D view can turn it into the drawing's frame
function layerUniforms(u, L, tex, tw, th) {
  const P = L.params;
  hUniforms(u, L, tex);
  gl.uniform2f(u.uRes, tw, th); gl.uniform2f(u.uDoc, doc.w, doc.h);
  gl.uniform1f(u.uVol, P.vol);
  const metal = L.brush === 'metal', stone = L.brush === 'stone';
  gl.uniform1f(u.uSky, P.sky ?? .3); gl.uniform1f(u.uRim, P.rim ?? .85);
  const Ld = lightDir(P.light, metal ? .44 : stone ? .6 : .66); gl.uniform3f(u.uL, Ld[0], Ld[1], Ld[2]);
  gl.uniform1i(u.uBrush, metal ? 1 : stone ? 2 : 0);
  gl.uniform1f(u.uPits, stone ? P.pits : 0); gl.uniform1f(u.uFacets, stone ? P.facets : 0);
  gl.uniform1f(u.uDScale, P.scale ?? 1); gl.uniform1f(u.uRelief, P.relief ?? 1);
  const c0 = lin(hexRgb(metal ? P.c0 : P.color)), c1 = metal ? lin(hexRgb(P.c1)) : [0, 0, 0], c2 = metal ? lin(hexRgb(P.c2)) : [0, 0, 0];
  gl.uniform3f(u.uC0, ...c0); gl.uniform3f(u.uC1, ...c1); gl.uniform3f(u.uC2, ...c2);
  gl.uniform1f(u.uGloss, P.gloss ?? 0); gl.uniform1f(u.uShine, P.shine ?? 1); gl.uniform1f(u.uBreak, P.brk ?? 0);
  gl.uniform1f(u.uSpeckle, P.speckle ?? 0); gl.uniform1f(u.uGrain, (stone ? P.grit : P.grain) ?? 0); gl.uniform1f(u.uRough, P.rough ?? 0);
  gl.uniform1f(u.uContrast, P.contrast ?? 1); gl.uniform1f(u.uIri, P.iri ?? 0);
  gl.uniform1f(u.uShadow, P.shadow); gl.uniform1f(u.uShadowDist, (P.size * .24 + 3) * P.vol);
  gl.uniform1f(u.uSeed, L.seed || 0);
  return Ld;
}
function compositeScreen() {
  drawBg(null, false);
  for (const L of doc.layers) {
    if (!L.visible) continue;
    const tex = drawing && drawing.L === L ? T.live.tex : layerTarget(L).tex;
    drawLayer(L, tex, null, T.w, T.h);
  }
}

