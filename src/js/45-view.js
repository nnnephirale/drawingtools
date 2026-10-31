/* ════════════════════════════════════════════════════════════════════
   view: fit / zoom / pan (creative-tool-ui canvas view, adapted for drawing)
   ════════════════════════════════════════════════════════════════════ */
const view = { z: 1, x: 0, y: 0, r: 0 };      // r: the board's turn, radians (two fingers twist it, R steps it)
const zoomBar = $('#zoombar');
const zq = s => zoomBar.querySelector(`[data-z="${s}"]`);
let cssW = 0, cssH = 0;
const pctOf = z => cssW ? cssW * z / doc.w * 100 : 100;
const zOfPct = p => p / 100 * doc.w / Math.max(1, cssW);
const atFit = () => Math.abs(view.z - 1) < .001;
function fit() {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (!sw || !sh) return;
  const k = Math.min(sw / doc.w, sh / doc.h);
  cssW = Math.round(doc.w * k); cssH = Math.round(doc.h * k);
  board.style.width = cssW + 'px'; board.style.height = cssH + 'px';
  applyView(); scheduleRes();
  if (three.on) size3D();
}
function clampView() {
  if (view.z <= 1) { view.x = 0; view.y = 0; return; }
  const c = Math.abs(Math.cos(view.r)), sn = Math.abs(Math.sin(view.r));
  const bw = cssW * c + cssH * sn, bh = cssW * sn + cssH * c;      // the turned board's footprint
  const mx = (bw * view.z - cssW) / 2 + cssW * .25, my = (bh * view.z - cssH) / 2 + cssH * .25;
  view.x = clamp(view.x, -mx, mx); view.y = clamp(view.y, -my, my);
}
function applyView() {
  clampView();
  board.style.transform = `translate(${view.x}px, ${view.y}px) rotate(${view.r}rad) scale(${view.z})`;
  zq('pct').textContent = Math.round(pctOf(three.on ? three.zoom : view.z)) + '%';
  zq('fit').setAttribute('aria-pressed', String(!three.on && atFit() && Math.cos(view.r) > 1 - 1e-9));     // upright, too
  placeCanvas();
  if (T.w) scheduleRes();
  updateGlass();
}
const untransformedCentre = () => { const r = board.getBoundingClientRect(); return [r.left + r.width / 2 - view.x, r.top + r.height / 2 - view.y]; };
function zoomAt(px, py, factor) {
  const [cx, cy] = untransformedCentre();
  const z = clamp(view.z * factor, Math.min(1, zOfPct(5)), zOfPct(3200));
  const ix = (px - cx - view.x) / view.z, iy = (py - cy - view.y) / view.z;
  view.x = px - cx - z * ix; view.y = py - cy - z * iy; view.z = z;
  applyView();
}
let easeT;
function eased(fn) {
  const from = { ...view };
  board.classList.add('easing'); fn();
  if (closeup.on) placeCanvas(winRect(from));       // close-up covers where the glide starts too, then just the view
  clearTimeout(easeT); easeT = setTimeout(() => { board.classList.remove('easing'); placeCanvas(); }, 460);
}
const stageCentre = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
// in 3D the same controls glide the camera instead; Fit returns to the starting angle
const zoomToPct = p => three.on ? animate3D({ zoom: clamp(zOfPct(p), .25, 8) }, null, 500) : eased(() => { const [x, y] = stageCentre(); zoomAt(x, y, zOfPct(p) / view.z); });
const zoomStep = d => three.on ? animate3D({ zoom: clamp(three.zoom * (d > 0 ? 1.5 : 1 / 1.5), .25, 8) }, null, 500) : eased(() => { const [x, y] = stageCentre(); zoomAt(x, y, d > 0 ? 1.5 : 1 / 1.5); });
const fitView = () => three.on ? animate3D(POSE) : eased(() => { view.z = 1; view.x = 0; view.y = 0; view.r = Math.round(view.r / (2 * Math.PI)) * 2 * Math.PI; applyView(); });   // upright, the short way round
// a screen point → doc px, through the board's pan, turn and zoom
function screenToDoc(px, py) {
  const [cx, cy] = untransformedCentre();
  const dx = px - cx - view.x, dy = py - cy - view.y, c = Math.cos(-view.r), sn = Math.sin(-view.r);
  const bx = (dx * c - dy * sn) / view.z, by = (dx * sn + dy * c) / view.z;
  return [(bx / cssW + .5) * doc.w, (by / cssH + .5) * doc.h];
}
/* Turning. Two fingers twist the board like paper on a desk. A pinch rarely twists on purpose, so the turn
   only wakes past 7° of twist; then within 8° of upright or a quarter turn it holds there exactly (the
   magnet a twist has to pull past), and letting go near one settles onto it. R / ⇧R step a quarter turn. */
const TURN_WAKE = 7 * Math.PI / 180, TURN_SNAP = 8 * Math.PI / 180, QUARTER = Math.PI / 2;
const nearestTurn = r => Math.round(r / QUARTER) * QUARTER;
const snapTurn = r => Math.abs(r - nearestTurn(r)) < TURN_SNAP ? nearestTurn(r) : r;
const turnBy = d => eased(() => { view.r = nearestTurn(view.r) + d; applyView(); });
let resT = 0;
function scheduleRes() { clearTimeout(resT); resT = setTimeout(updateResolution, T.w ? 140 : 0); }
function updateResolution() {
  if (drawing) { scheduleRes(); return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let S = clamp(cssW * dpr * Math.max(1, view.z) / doc.w, .35, 3);   // follow zoom so close-ups stay crisp
  const maxPx = isTouchUI ? 4.2e6 : 6e6;
  if (doc.w * doc.h * S * S > maxPx) S = Math.sqrt(maxPx / (doc.w * doc.h));
  const tw = Math.round(doc.w * S), th = Math.round(doc.h * S);
  if (tw === T.w && th === T.h) return;
  if (T.w && Math.abs(tw / T.w - 1) < .12 && tw < T.w) return;          // small zoom-outs keep the sharper field
  T.S = tw / doc.w;
  if (!three.on && !closeup.on) { canvas.width = tw; canvas.height = th; }     // in 3D (and close-up) the canvas follows the window instead
  resizeTargets(tw, th);
  placeCanvas();
  request();
}
/* Close-up. Past what a whole-board canvas can hold (T.S, capped by memory), magnifying that bitmap goes soft
   and blocky at 200%. So the canvas leaves the board's size and covers the window at the screen's own
   resolution, and the material shader draws just the part of the board in view (uView). The fields keep their
   resolution; edges, grain, speckle and glints are shaded per screen pixel. A pan or zoom re-shades the view,
   which never rebuilds a field. At fit nothing changes. */
const WHOLE = [0, 0, 1, 1];
const closeup = { on: false, uv: WHOLE };
// the window in the board's own (untransformed) px, for a given view
function winRect(v) {
  const [cx, cy] = stageCentre(), c = Math.cos(-(v.r || 0)), sn = Math.sin(-(v.r || 0));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, py] of [[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]]) {   // turned, it's the box around the corners
    const dx = px - cx - v.x, dy = py - cy - v.y, bx = (dx * c - dy * sn) / v.z + cssW / 2, by = (dx * sn + dy * c) / v.z + cssH / 2;
    x0 = Math.min(x0, bx); y0 = Math.min(y0, by); x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
  }
  return [x0, y0, x1 - x0, y1 - y0];
}
// also = a rect to keep covered as well (the view an eased zoom starts from), so the glide never shows a bare edge
function placeCanvas(also) {
  if (three.on || !T.w || !cssW) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const need = cssW * dpr * view.z / doc.w;                 // screen px per doc px
  if (need <= T.S * (closeup.on ? 1.04 : 1.12)) {          // the whole-board canvas is already sharp enough
    if (closeup.on) { closeup.on = false; closeup.uv = WHOLE; canvas.removeAttribute('style'); canvas.width = T.w; canvas.height = T.h; request(); }
    return;
  }
  let [x, y, w, hh] = winRect(view);
  if (also) {
    const x1 = Math.max(x + w, also[0] + also[2]), y1 = Math.max(y + hh, also[1] + also[3]);
    x = Math.min(x, also[0]); y = Math.min(y, also[1]); w = x1 - x; hh = y1 - y;
  }
  // bitmap = the box at screen density (a turned or gliding box is bigger than the window, so k gives way)
  const sw = w * view.z, sh = hh * view.z;
  const k = Math.min(dpr, Math.sqrt((isTouchUI ? 4.5e6 : 6e6) / (sw * sh)));
  const W = Math.round(sw * k), H = Math.round(sh * k);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  closeup.on = true;
  closeup.uv = [x / cssW, 1 - (y + hh) / cssH, w / cssW, hh / cssH];
  const s = canvas.style;
  s.position = 'absolute'; s.left = x + 'px'; s.top = y + 'px'; s.width = w + 'px'; s.height = hh + 'px';
  s.borderRadius = '0'; s.pointerEvents = 'none';
  request();
}
new ResizeObserver(fit).observe(stage);
addEventListener('wheel', e => {
  if (!stage.contains(e.target)) return;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
  if (three.on) {                                   // scroll turns the drawing, pinch / ⌘-scroll zooms
    e.preventDefault();
    if (three.leaving) return;
    three.touched = performance.now();
    if (e.metaKey || e.ctrlKey) zoom3D(Math.exp(-e.deltaY * unit * (e.ctrlKey && !e.metaKey ? .01 : .0025)));
    else {
      three.anim = null; three.vrx = three.vry = 0;
      three.ry -= e.deltaX * unit * .004; three.rx = clamp(three.rx - e.deltaY * unit * .004, -TILT, TILT);
      request();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    const pinch = e.ctrlKey && !e.metaKey;
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * unit * (pinch ? .01 : .0025)));
  } else if (view.z > 1) {
    e.preventDefault();
    view.x -= e.deltaX * unit; view.y -= e.deltaY * unit; applyView();
  }
}, { passive: false });
{
  const menu = zq('menu');
  zq('pct').onclick = e => {
    e.stopPropagation();
    menu.replaceChildren();
    const cur = Math.round(pctOf(three.on ? three.zoom : view.z));
    for (const [label, p] of [['Fit', null], ...[25, 50, 100, 200, 400].map(p => [p + '%', p])]) {
      menu.append(h('button', { type: 'button', 'aria-current': String(p === null ? atFit() : cur === p),
        onclick: () => { menu.classList.remove('on'); p === null ? fitView() : zoomToPct(p); } }, label));
    }
    menu.classList.toggle('on');
  };
  addEventListener('pointerdown', e => { if (!zoomBar.contains(e.target)) menu.classList.remove('on'); });
  zq('in').onclick = () => zoomStep(1);
  zq('out').onclick = () => zoomStep(-1);
  zq('fit').onclick = fitView;
}

