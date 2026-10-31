/* ════════════════════════════════════════════════════════════════════
   field building
   ════════════════════════════════════════════════════════════════════ */
const T = { S: 1, w: 0, h: 0, layers: new Map(), live: null, scratch: null, erase: null, group: null };
const dirty = new Set();
let needsDraw = true;

function drawStamps(target, buf, minSig) {
  fieldGen++;
  if (!buf.n) return;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
  gl.viewport(0, 0, target.w, target.h);
  gl.useProgram(PR.stamp.p);
  gl.uniform2f(PR.stamp.u.uDoc, doc.w, doc.h);
  gl.uniform1f(PR.stamp.u.uMinSigma, minSig);
  gl.uniform1f(PR.stamp.u.uScale, FIELD.scale);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindVertexArray(stampVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, buf.a.subarray(0, buf.n), gl.DYNAMIC_DRAW);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, buf.n / 5);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}
function copyInto(src, dst) {
  gl.disable(gl.BLEND);
  fullscreen(PR.copy, dst, u => { bindTex(0, src.tex); gl.uniform1i(u.uSrc, 0); });
}
function eraseInto(src, eTarget, dst) {
  fieldGen++;
  gl.disable(gl.BLEND);
  fullscreen(PR.erase, dst, u => { bindTex(0, src.tex); bindTex(1, eTarget.tex); gl.uniform1i(u.uSrc, 0); gl.uniform1i(u.uE, 1); gl.uniform1f(u.uInv, 1 / FIELD.scale); });
}
function addInto(src, dst) {
  fieldGen++;
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
  fullscreen(PR.copy, dst, u => { bindTex(0, src.tex); gl.uniform1i(u.uSrc, 0); });
  gl.disable(gl.BLEND);
}
// ctx = { field, scratch, erase, group, minSig } (group only needed once the layer has moves)
function buildLayer(L, ctx, bounds) {
  if (L.ops && L.ops.length) { buildMoved(L, ctx, bounds); return; }
  clearTarget(ctx.field);
  BUF.reset();
  for (const st of L.strokes) {
    if (st.erase) {
      drawStamps(ctx.field, BUF, ctx.minSig); BUF.reset();
      clearTarget(ctx.erase); EBUF.reset();
      strokeStamps(st, L.params, EBUF, doc.w, doc.h, ctx.minSig);
      drawStamps(ctx.erase, EBUF, ctx.minSig);
      eraseInto(ctx.field, ctx.erase, ctx.scratch);
      swapTarget(ctx.field, ctx.scratch);
    } else {
      const n0 = BUF.n;
      strokeStamps(st, L.params, BUF, doc.w, doc.h, ctx.minSig);
      if (bounds) growBounds(bounds, BUF, n0);
    }
  }
  drawStamps(ctx.field, BUF, ctx.minSig); BUF.reset();
}
/* Moves. A lasso move is an op on the layer, not an edit of its strokes: { at, poly, dx, dy, del }, where at
   is how many strokes existed when it was made, and it applies to their stamps only. A stamp inside poly
   (in that moment's coordinates, i.e. after the earlier ops) shifts by (dx, dy), or goes, with del. So every
   raw sample survives (off the board too: nothing is ever clipped), the sliders still retune moved strokes,
   and undo is just the op list. A stamp goes wholly to one side of the lasso, so a cut closes round, like
   the liquid it is.
   What a move took is rebuilt on its own (ctx.group) and laid on top at the moment of the move: erasures it
   carried only cut it, older erasures where it lands don't touch it, and anything drawn later sits above. */
const PIECE = new FBuf();
const polyBox = new WeakMap();
function inPoly(poly, x, y) {
  let b = polyBox.get(poly);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < poly.length; i += 2) { b[0] = Math.min(b[0], poly[i]); b[1] = Math.min(b[1], poly[i + 1]); b[2] = Math.max(b[2], poly[i]); b[3] = Math.max(b[3], poly[i + 1]); }
    polyBox.set(poly, b);
  }
  if (x < b[0] || y < b[1] || x > b[2] || y > b[3]) return false;
  let c = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// moves stroke i's stamps (buf from `from`) to where the layer's ops put them; per stamp, the last op that
// moved it (-1: never moved, -2: deleted)
function placeStamps(L, i, buf, from) {
  const a = buf.a, lab = new Int16Array((buf.n - from) / 5).fill(-1);
  L.ops.forEach((op, j) => {
    if (op.at <= i) return;
    for (let k = from, q = 0; k < buf.n; k += 5, q++) {
      if (lab[q] === -2 || (op.poly && !inPoly(op.poly, a[k], a[k + 1]))) continue;
      if (op.del) lab[q] = -2;
      else { a[k] += op.dx; a[k + 1] += op.dy; lab[q] = j; }
    }
  });
  return lab;
}
function buildMoved(L, ctx, bounds) {
  const ops = L.ops, groups = ops.map(() => []);
  clearTarget(ctx.field); BUF.reset();
  const flush = () => { drawStamps(ctx.field, BUF, ctx.minSig); BUF.reset(); };
  const eraseWith = (t, stamps) => {
    clearTarget(ctx.erase); drawStamps(ctx.erase, stamps, ctx.minSig);
    eraseInto(t, ctx.erase, ctx.scratch); swapTarget(t, ctx.scratch);
  };
  const place = j => {
    const g = groups[j];
    if (!g.length) return;
    flush(); clearTarget(ctx.group);
    for (const p of g) p.erase ? eraseWith(ctx.group, p) : drawStamps(ctx.group, p, ctx.minSig);
    addInto(ctx.group, ctx.field);
  };
  let oi = 0;
  for (let i = 0; i <= L.strokes.length; i++) {
    while (oi < ops.length && ops[oi].at <= i) place(oi++);
    if (i === L.strokes.length) break;
    const st = L.strokes[i], erase = !!st.erase;
    PIECE.reset(); strokeStamps(st, L.params, PIECE, doc.w, doc.h, ctx.minSig);
    const lab = placeStamps(L, i, PIECE, 0), a = PIECE.a;
    if (erase) { flush(); EBUF.reset(); }
    const stay = erase ? EBUF : BUF, n0 = stay.n;
    for (let k = 0, q = 0; k < PIECE.n; k += 5, q++) {
      const j = lab[q];
      if (j === -2) continue;
      let out = stay;
      if (j >= 0) {
        const g = groups[j];
        out = g[g.length - 1];
        if (!out || erase || out.erase) { out = new FBuf(1024); out.erase = erase; g.push(out); }   // draws pool; erasures keep their place
      }
      out.p(a[k], a[k + 1], a[k + 2], a[k + 3], a[k + 4]);
      if (bounds && !erase && j >= 0) growBounds(bounds, out, out.n - 5);
    }
    if (erase) { if (EBUF.n) eraseWith(ctx.field, EBUF); }
    else if (bounds) growBounds(bounds, BUF, n0);
  }
  flush();
}
// every stamp of the layer where it now sits: fn(x, y, r, erase)
function eachPlaced(L, fn) {
  for (let i = 0; i < L.strokes.length; i++) {
    const st = L.strokes[i];
    PIECE.reset(); strokeStamps(st, L.params, PIECE, doc.w, doc.h, .7 / (T.S || 1));
    const lab = L.ops && L.ops.length ? placeStamps(L, i, PIECE, 0) : null;
    for (let k = 0, q = 0; k < PIECE.n; k += 5, q++) if (!lab || lab[q] !== -2) fn(PIECE.a[k], PIECE.a[k + 1], PIECE.a[k + 4], !!st.erase);
  }
}
function growBounds(b, buf, from) {
  const a = buf.a;
  for (let i = from; i < buf.n; i += 5) {
    const e = a[i + 2] * 2.2;
    if (a[i] - e < b[0]) b[0] = a[i] - e; if (a[i + 1] - e < b[1]) b[1] = a[i + 1] - e;
    if (a[i] + e > b[2]) b[2] = a[i] + e; if (a[i + 1] + e > b[3]) b[3] = a[i + 1] + e;
  }
}
function liveCtx(L) { return { field: layerTarget(L), scratch: T.scratch, erase: T.erase, group: T.group, minSig: .7 / T.S }; }
function layerTarget(L) {
  let t = T.layers.get(L.id);
  if (!t) { t = makeTarget(T.w, T.h, FIELD); clearTarget(t); T.layers.set(L.id, t); dirty.add(L.id); request(); }   // a target born mid-composite still needs its build frame
  return t;
}
function rebuild(L) { buildLayer(L, liveCtx(L)); }
function renderLive(L, st) {
  const src = layerTarget(L);
  const minSig = .7 / T.S;
  if (st.erase) {
    clearTarget(T.erase); EBUF.reset();
    strokeStamps(st, L.params, EBUF, doc.w, doc.h, minSig);
    drawStamps(T.erase, EBUF, minSig);
    eraseInto(src, T.erase, T.live);
  } else {
    copyInto(src, T.live);
    BUF.reset(); strokeStamps(st, L.params, BUF, doc.w, doc.h, minSig);
    drawStamps(T.live, BUF, minSig); BUF.reset();
  }
}
function commitStroke(L, st) {
  if (dirty.has(L.id)) return;              // a pending rebuild will include it
  const src = layerTarget(L), minSig = .7 / T.S;
  if (st.erase) {
    clearTarget(T.erase); EBUF.reset();
    strokeStamps(st, L.params, EBUF, doc.w, doc.h, minSig);
    drawStamps(T.erase, EBUF, minSig);
    eraseInto(src, T.erase, T.scratch);
    swapTarget(src, T.scratch);
  } else {
    BUF.reset(); strokeStamps(st, L.params, BUF, doc.w, doc.h, minSig);
    drawStamps(src, BUF, minSig); BUF.reset();
  }
}
function resizeTargets(w, hgt) {
  for (const t of T.layers.values()) freeTarget(t);
  T.layers.clear();
  freeTarget(T.live); freeTarget(T.scratch); freeTarget(T.erase); freeTarget(T.group);
  T.w = w; T.h = hgt;
  T.live = makeTarget(w, hgt, FIELD); T.scratch = makeTarget(w, hgt, FIELD); T.erase = makeTarget(w, hgt, FIELD); T.group = makeTarget(w, hgt, FIELD);
  for (const L of doc.layers) dirty.add(L.id);
}
function gcTargets() {
  for (const [id, t] of T.layers) if (!layerById(id)) { freeTarget(t); T.layers.delete(id); }
}

