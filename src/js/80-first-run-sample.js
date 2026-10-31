/* ════════════════════════════════════════════════════════════════════
   first-run sample: a few synthetic gestures so the tool opens showing what it does
   ════════════════════════════════════════════════════════════════════ */
function synth(path, { dur = 1600, speed = () => 1, pressure = () => .5, N = 700, hold = 0 } = {}) {
  const P = [];
  for (let i = 0; i <= N; i++) P.push(path(i / N));
  const segT = [];
  let tot = 0;
  for (let i = 1; i <= N; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) / speed(i / N); segT.push(l); tot += l; }
  const pts = [];
  let t = 0;
  for (let i = 0; i <= N; i++) {
    if (i) t += segT[i - 1] / tot * dur;
    pts.push(P[i][0], P[i][1], pressure(i / N), t, 1);
  }
  for (let k = 1; k <= hold; k++) pts.push(P[N][0], P[N][1], pressure(1), t + k * 16, 1);
  return { id: uid(), seed: Math.random() * 1000, sym: 'off', erase: false, hasP: true, hasT: false, pts };
}
function seedDemo() {
  doc = { w: 1600, h: 1200, bg: '#E2DFD8', bgImage: null, layers: [], active: null };
  const slip = newLayer('slip');
  slip.strokes.push(synth(u => {
    const a = u * Math.PI * 2 * 3.3;
    return [250 + 1080 * u - 120 * Math.sin(a), 690 + 190 * Math.cos(a) * (1 - .25 * u) - 120 * Math.sin(u * Math.PI)];
  }, { dur: 2300, speed: u => .55 + .9 * Math.abs(Math.sin(u * Math.PI * 2 * 3.3 + .4)), pressure: u => .35 + .35 * Math.sin(u * Math.PI) }));
  slip.strokes.push(synth(u => [292 + u * .5, 360 + u * .5], { dur: 60, N: 4, hold: 40, pressure: () => .5 }));
  const stone = newLayer('stone');
  stone.strokes.push(synth(u => {
    const x = 340 + 980 * u;
    return [x, 300 + 150 * Math.sin(u * Math.PI * 1.6 + .3) + 60 * Math.sin(u * Math.PI * 5)];
  }, { dur: 1500, speed: u => .5 + 1.1 * Math.abs(Math.cos(u * Math.PI * 5)), pressure: u => .3 + .45 * Math.sin(u * Math.PI) }));
  stone.strokes.push(synth(u => {
    const a = u * Math.PI * 2 * 1.15;
    return [1180 + 150 * Math.cos(a) * (1 - .45 * u), 930 + 120 * Math.sin(a) * (1 - .45 * u)];
  }, { dur: 1100, speed: u => .6 + .6 * u, pressure: u => .5 + .3 * Math.sin(u * Math.PI) }));
  doc.layers.push(slip, stone);
  doc.active = stone.id;
  ui.tool = ui.brush = 'stone';
}

