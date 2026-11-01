/* ════════════════════════════════════════════════════════════════════
   strokes → stamps
   ════════════════════════════════════════════════════════════════════ */
class FBuf {
  constructor(cap = 1 << 15) { this.a = new Float32Array(cap); this.n = 0; }
  reset() { this.n = 0; }
  p(x, y, s, w, r) {
    if (this.n + 5 > this.a.length) { const b = new Float32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = s; a[n + 3] = w; a[n + 4] = r; this.n = n + 5;
  }
}
const BUF = new FBuf(), EBUF = new FBuf();
const SQ2PI = Math.sqrt(2 * Math.PI);
const hash1 = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function noise1(seed, x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i + seed * 17.3), hash1(i + 1 + seed * 17.3), u) * 2 - 1; }

function emitter(out, sym, W, H) {
  const cx = W / 2, cy = H / 2;
  if (sym === 'x') return (x, y, s, w, r) => { out.p(x, y, s, w, r); out.p(2 * cx - x, y, s, w, r); };
  if (sym === 'y') return (x, y, s, w, r) => { out.p(x, y, s, w, r); out.p(x, 2 * cy - y, s, w, r); };
  if (sym === 'xy') return (x, y, s, w, r) => { out.p(x, y, s, w, r); out.p(2 * cx - x, y, s, w, r); out.p(x, 2 * cy - y, s, w, r); out.p(2 * cx - x, 2 * cy - y, s, w, r); };
  if (sym === 'r6') {
    const cs = [], sn = [];
    for (let i = 0; i < 6; i++) { cs.push(Math.cos(i * Math.PI / 3)); sn.push(Math.sin(i * Math.PI / 3)); }
    return (x, y, s, w, r) => { const dx = x - cx, dy = y - cy; for (let i = 0; i < 6; i++) out.p(cx + dx * cs[i] - dy * sn[i], cy + dx * sn[i] + dy * cs[i], s, w, r); };
  }
  return (x, y, s, w, r) => out.p(x, y, s, w, r);
}

/* Raw samples are x, y, pressure, t(ms), altitude(0..1). Every slider is applied here, at build time,
   which is why the whole drawing can be retuned after the fact. */
function strokeStamps(st, P, out, W, H, minSig) {
  const pts = st.pts, n = pts.length / 5;
  if (!n) return;
  const erase = !!st.erase;
  const A = erase ? ERASE_A : mergeA(P.merge);
  const base = (erase ? st.size : P.size) * .5;
  const prI = erase ? .5 : P.pressure, spI = erase ? 0 : P.speed, tiI = erase ? 0 : P.tilt;
  const smoothK = st.shape ? 0 : erase ? .15 : P.smooth, poolK = erase ? 0 : P.pool, vary = erase ? 0 : P.vary;
  const pipe = erase ? 0 : P.pipe || 0;          // clay: a held pen keeps piping material out (see dome() in shaders.js)
  const end = erase ? 'none' : P.end;
  const vref = 1.1 * W / 1600;
  const emit = emitter(out, st.sym, W, H);
  const sigK = 1 / Math.sqrt(2 * Math.log(A));
  const dot = (x, y, r, wf) => { const sg = Math.max(r * sigK, minSig); emit(x, y, sg, A * wf, r); };

  // 1. per-sample radius from pressure, speed and tilt; lazy-point smoothing of the path; pooling when still
  const a = 1 - smoothK * .86;
  const X = [], Y = [], Rr = [], pools = [];
  let sx = pts[0], sy = pts[1], vs = 0, rs = -1;
  let ax = pts[0], ay = pts[1], at = pts[3], poolR = 0, poolW = 1, poolX = 0, poolY = 0;
  const still = Math.max(2, base * (pipe ? .4 : .15));   // piping: the hand's drift keeps feeding one pool, not a row of them
  for (let i = 0; i < n; i++) {
    const o = i * 5, x = pts[o], y = pts[o + 1], p = pts[o + 2], t = pts[o + 3], al = pts[o + 4];
    if (i) {
      const dt = Math.max(1, t - pts[o - 2]);
      const v = Math.hypot(x - pts[o - 5], y - pts[o - 4]) / dt;
      vs += (v - vs) * Math.min(1, dt / 40);
      sx += (x - sx) * a; sy += (y - sy) * a;
    }
    const pf = st.hasP ? lerp(1, .15 + 1.6 * Math.pow(clamp(p, 0, 1), .85), prI) : 1;
    const sf = lerp(1, .5 + 1.3 * Math.exp(-vs / (1.6 * vref)), spI);     // ~1 at a relaxed pace, swells when slow
    const tf = st.hasT ? lerp(1, 1 + 1.5 * Math.pow(1 - clamp(al, 0, 1), 1.5), tiI) : 1;
    const r = base * pf * sf * tf;
    rs = rs < 0 ? r : rs + (r - rs) * .35;
    if (Math.hypot(x - ax, y - ay) > Math.max(2, base * .15)) {
      if (poolR) { pools.push(poolX, poolY, poolR, poolW); poolR = 0; }
      ax = x; ay = y; at = t;
    } else if (poolK > 0 && t - at > 90) {
      const g = 1 - Math.exp(-(t - at - 90) / 650), held = Math.min((t - at - 90) / 1000, 8);
      // piped material keeps coming while the pen is held: the bead swells wider and taller, slowing but not stopping
      poolR = rs * (1 + poolK * .9 * g + pipe * poolK * .3 * Math.pow(held, .7)); poolX = ax; poolY = ay;
      poolW = 1 + pipe * poolK * (2.2 * g + .5 * held);
    }
    X.push(sx); Y.push(sy); Rr.push(rs);
  }
  if (poolR) pools.push(poolX, poolY, poolR, poolW);
  if (n > 1 && a < 1) {
    const lx = pts[(n - 1) * 5], ly = pts[(n - 1) * 5 + 1];
    for (let k = 0; k < 40 && Math.hypot(lx - sx, ly - sy) > .3; k++) { sx += (lx - sx) * a; sy += (ly - sy) * a; X.push(sx); Y.push(sy); Rr.push(rs); }
  }

  // 2. dense Catmull-Rom polyline
  const m = X.length;
  const DX = [X[0]], DY = [Y[0]], DR = [Rr[0]];
  for (let i = 0; i < m - 1; i++) {
    const x1 = X[i], y1 = Y[i], x2 = X[i + 1], y2 = Y[i + 1];
    const ch = Math.hypot(x2 - x1, y2 - y1);
    if (ch < 1e-3) continue;
    const i0 = Math.max(0, i - 1), i3 = Math.min(m - 1, i + 2);
    const x0 = X[i0], y0 = Y[i0], x3 = X[i3], y3 = Y[i3];
    const steps = Math.max(1, Math.ceil(ch / 1.5));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      DX.push(.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3));
      DY.push(.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3));
      DR.push(lerp(Rr[i], Rr[i + 1], t));
    }
  }
  const k = DX.length;
  const S = new Float32Array(k);
  let L = 0;
  for (let i = 1; i < k; i++) { L += Math.hypot(DX[i] - DX[i - 1], DY[i] - DY[i - 1]); S[i] = L; }

  // 3. walk the line, spacing stamps by their own sigma; weight so a straight run sums to exactly A
  if (L < .75) {
    let r = DR[0] * 1.15;
    if (pools.length) r = Math.max(r, pools[2] * 1.05);
    dot(DX[0], DY[0], r, 1);
    return;
  }
  const seed = st.seed || 0;
  const ns1 = 1 / (base * 3 + 10), ns2 = 1 / (base * 1.1 + 4);
  const closed = st.shape === 'circle';
  const wl = end === 'wedge' ? Math.min(P.taper * base * 3.2, L * .5) : 0;
  let next = 0, seg = 1;
  while (next <= L) {
    while (seg < k - 1 && S[seg] < next) seg++;
    const s0 = S[seg - 1], s1 = S[seg], t = s1 > s0 ? clamp((next - s0) / (s1 - s0), 0, 1) : 0;
    const x = lerp(DX[seg - 1], DX[seg], t), y = lerp(DY[seg - 1], DY[seg], t);
    let r = lerp(DR[seg - 1], DR[seg], t);
    if (vary) r *= 1 + vary * (.5 * noise1(seed, next * ns1) + .22 * noise1(seed + 7.3, next * ns2));
    if (wl) r *= .04 + .96 * Math.min(sstep(0, 1, next / (wl * .7)), sstep(0, 1, (L - next) / wl));
    r = Math.max(.05, r);
    const sg = Math.max(r * sigK, minSig);
    const sp = Math.max(.3, .7 * sg);
    if (closed && next > 0 && next + sp * .5 > L) break;     // a circle's last stamp would sit on its first
    emit(x, y, sg, A * sp / (SQ2PI * sg), r);
    next += sp;
  }
  if (end === 'drop' && !closed) {
    dot(DX[0], DY[0], DR[0] * 1.04, .55);
    dot(DX[k - 1], DY[k - 1], DR[k - 1] * 1.06, .6);
  }
  for (let i = 0; i < pools.length; i += 4) dot(pools[i], pools[i + 1], pools[i + 2], pools[i + 3]);
}

