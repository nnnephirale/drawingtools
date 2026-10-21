/* Local A/B lab: open index.html?lab=metal or ?lab=ceramic.
   Rebuilds the reference image's stroke (hand-traced centreline + radius) at 2× and overlays the
   reference so the material can be matched directly. Not part of the published tool. */
(() => {
  const kind = new URLSearchParams(location.search).get('lab') || 'metal';
  const K = 2, BASE = 40;
  const REF = {
    metal: {
      img: 'dev/ref/brush-metal.png', w: 820, h: 465, bg: '#E2DED6', brush: 'metal',
      strokes: [
        [[160,262,14],[140,252,22],[110,262,26],[80,262,22],[55,272,16],[35,295,14],[18,335,12],[22,375,11],[45,400,11],[85,410,11],
         [130,400,11],[185,365,13],[235,330,12],[280,300,13],[320,275,14],[350,250,16],[375,220,19],[405,195,22],[440,175,16],[480,158,12],
         [520,135,13],[555,110,15],[590,85,19],[625,70,16],[670,55,14],[720,42,14],[770,32,15],[795,38,14],[795,62,12],[765,90,10],
         [720,130,9],[670,170,8],[620,210,8],[570,250,9],[520,300,9],[470,350,10],[430,395,11],[410,430,12],[425,450,11],[465,440,11],
         [520,400,10],[570,355,10],[620,318,11],[665,300,12],[700,305,12],[712,330,11],[690,352,10],[668,375,13],[665,398,13]],
        [[192,177,20]],
      ],
    },
    ceramic: {
      img: 'dev/ref/brush-ceramic.png', w: 820, h: 523, bg: '#141417', brush: 'slip',
      strokes: [
        [[125,228,9],[100,212,11],[60,222,13],[30,262,14],[18,320,13],[30,385,15],[55,430,16],[95,452,15],[150,435,13],[210,395,11],
         [270,345,11],[330,293,11],[390,238,13],[450,183,15],[515,125,16],[580,77,16],[640,45,16],[700,25,17],[738,22,18],[752,50,15],
         [730,92,12],[680,135,10],[630,165,10],[585,195,12],[530,232,15],[470,275,16],[420,315,14],[375,352,15],[335,398,18],[312,448,20],
         [335,488,18],[385,485,15],[445,445,13],[520,380,12],[590,315,13],[660,262,14],[730,232,15],[785,235,14],[805,275,13],[785,320,13],
         [745,360,14],[710,390,16],[690,400,17]],
        [[185,183,26]],
      ],
    },
  }[kind];

  const pFor = r => Math.min(1, Math.max(0, Math.pow(Math.max(0, (r * K / BASE - .15) / 1.6), 1 / .85)));
  function stroke(cp) {
    const pts = [];
    if (cp.length === 1) { const [x, y, r] = cp[0]; pts.push(x * K, y * K, pFor(r / 1.15), 0, 1); }
    else {
      let t = 0;
      for (let i = 0; i < cp.length - 1; i++) {
        const p0 = cp[Math.max(0, i - 1)], p1 = cp[i], p2 = cp[i + 1], p3 = cp[Math.min(cp.length - 1, i + 2)];
        const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * K / 3));
        for (let j = i ? 1 : 0; j <= n; j++) {
          const s = j / n, s2 = s * s, s3 = s2 * s;
          const cr = k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * s + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * s2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * s3);
          pts.push(cr(0) * K, cr(1) * K, pFor(p1[2] + (p2[2] - p1[2]) * s), t += 8, 1);
        }
      }
    }
    return { id: Math.random().toString(36).slice(2), seed: 3.7, sym: 'off', erase: false, hasP: true, hasT: false, pts };
  }

  function start() {
    const sm = window.__sm;
    if (!sm) return setTimeout(start, 50);
    const brush = REF.brush;
    const base = JSON.parse(JSON.stringify(sm.doc().layers.find(l => l.brush === brush)?.params || {}));
    const params = Object.assign(base, { size: BASE * 2, pressure: 1, speed: 0, tilt: 0, vary: 0, pool: 0, smooth: 0, end: 'drop' });
    const L = { id: 'lab', brush, name: 'Lab', visible: true, seed: 3.7, params, strokes: REF.strokes.map(stroke) };
    sm.setDoc({ w: REF.w * K, h: REF.h * K, bg: REF.bg, bgImage: null, layers: [L], active: 'lab' });

    const board = document.getElementById('board');
    const img = document.createElement('img');
    img.src = REF.img;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:inherit;clip-path:inset(0 0 0 50%)';
    board.append(img);
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:50;display:flex;gap:4px;padding:4px;border-radius:12px;background:rgba(255,255,255,.9);box-shadow:0 6px 20px -8px rgba(0,0,0,.3);font:11px "IBM Plex Mono",monospace';
    const modes = { ours: 'inset(0 0 0 100%)', ref: 'inset(0 0 0 0)', split: 'inset(0 0 0 50%)' };
    for (const m of Object.keys(modes)) {
      const b = document.createElement('button');
      b.textContent = m; b.style.cssText = 'border:0;background:#f1efeb;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit';
      b.onclick = () => { img.style.clipPath = modes[m]; };
      bar.append(b);
    }
    document.body.append(bar);
    window.labMode = m => { img.style.clipPath = modes[m]; };
    window.labLayer = () => L;
    // look(pct, docX, docY): centre the view on a doc point at a zoom %; cmp also picks the overlay mode
    window.look = (pct, dx, dy) => {
      const W = sm.doc().w, H = sm.doc().h, cw = board.offsetWidth, ch = board.offsetHeight, z = pct / 100 * W / cw;
      sm.view.z = z; sm.view.x = -(dx / W - .5) * cw * z; sm.view.y = -(dy / H - .5) * ch * z; sm.applyView();
    };
    window.cmp = async (pct, x, y, mode) => { look(pct, x, y); labMode(mode); await new Promise(r => setTimeout(r, 450)); };
    window.setP = (k, v) => { L.params[k] = v; sm.dirty.add(L.id); sm.request(); };
    document.getElementById('panel').setAttribute('hidden-state', '');
  }
  start();
})();
