/* ════════════════════════════════════════════════════════════════════
   UI
   ════════════════════════════════════════════════════════════════════ */
const panel = $('#panel'), pbody = $('#pbody');
const pane = n => $(`[data-pane="${n}"]`, pbody);
const toastEl = $('#toast');
let toastT = 0;
function toast(msg, action) {
  toastEl.replaceChildren(h('span', null, msg));
  if (action) toastEl.append(h('button', { type: 'button', onclick: () => { action.fn(); toastEl.classList.remove('on'); } }, action.label));
  toastEl.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), action ? 4000 : 1800);
}
function togglePanel(force) {
  const open = force ?? panel.hasAttribute('hidden-state');
  panel.toggleAttribute('hidden-state', !open);
  if (open) requestAnimationFrame(refreshSegs);
  save();
}
$('#btnPanel').onclick = () => togglePanel();
$('#closePanel').onclick = () => togglePanel(false);
$$('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));
function showTab(name) {
  ui.tab = name;
  $$('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  $$('.pane', pbody).forEach(p => p.classList.toggle('on', p.dataset.pane === name));
  pbody.scrollTop = 0;
  requestAnimationFrame(refreshSegs);
  save();
}

const ballCss = L => L && L.params ? presetBall(L.brush, L.params) : '';
function presetBall(brush, pr) {
  if (brush === 'metal') return `radial-gradient(circle at 34% 30%, ${pr.c2} 0 12%, ${pr.c1} 38%, ${pr.c0} 72%, ${pr.c1} 100%)`;
  const c = hexRgb(pr.color), lo = toHex(c.map(v => v * .62)), hi = toHex(mix3(c, [1, 1, 1], .55));
  if (brush === 'clay') return `radial-gradient(circle at 36% 30%, ${toHex(mix3(c, [1, 1, 1], .32))} 0 14%, ${pr.color} 50%, ${toHex(c.map(v => v * .55))} 100%)`;
  if (brush === 'stone') {
    // a few dark pits for craters; a hard white glint for glossy stone
    const pit = (x, y, r) => `radial-gradient(circle at ${x}% ${y}%, rgba(0,0,0,${.18 + .3 * pr.pits}) 0 ${r}%, transparent ${r + 2}%)`;
    const pits = pr.pits > .2 ? [pit(62, 58, 10), pit(36, 68, 7), pit(68, 30, 6)].join(',') + ',' : '';
    const glint = pr.gloss > .4 ? `radial-gradient(circle at 34% 30%, #fff 0 6%, transparent 9%),` : '';
    const mid = toHex(mix3(c, [1, 1, 1], pr.gloss > .4 ? .12 : .3));
    return `${glint}${pits}radial-gradient(circle at 34% 30%, ${mid} 0 18%, ${pr.color} 52%, ${toHex(c.map(v => v * .5))} 100%)`;
  }
  return `radial-gradient(circle at 34% 30%, #fff 0 7%, ${hi} 16%, ${pr.color} 46%, ${lo} 100%)`;
}
function updateBalls() {
  for (const b of TOOLS) {
    const L = [...doc.layers].reverse().find(l => l.brush === b && l.id === doc.active) || [...doc.layers].reverse().find(l => l.brush === b);
    $('#ball' + NAMES[b]).style.background = ballCss(L || { brush: b, params: lastParams[b] });
  }
}
function updatePill() {
  const tools = $('#tools');
  let cur = null;
  $$('button', tools).forEach(b => { const on = b.dataset.tool === ui.tool; b.setAttribute('aria-pressed', String(on)); if (on) cur = b; });
  if (cur && cur.offsetWidth) placeThumb($('.thumb', tools), cur);
  const chip = (c, tool) => {
    const b = $(`[data-tool="${tool}"]`, tools);
    c.classList.toggle('on', ui.tool === tool);
    if (b.offsetWidth) c.style.left = tools.offsetLeft + b.offsetLeft + b.offsetWidth / 2 + 'px';
  };
  chip($('#c3d'), 'view'); chip($('#lchip'), 'lasso');
  $('#c3d').setAttribute('aria-pressed', String(ui.canvas3d));
  $$('#lchip [data-scope]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.scope === 'all') === ui.selAll)));
  $('#ldel').classList.toggle('on', !!sel.poly);
  board.classList.toggle('lasso', ui.tool === 'lasso');
  updateBalls();
}
function setCanvas3d(v) { ui.canvas3d = v; updatePill(); request(); save(); }
$('#c3d').onclick = () => setCanvas3d(!ui.canvas3d);
$$('#lchip [data-scope]').forEach(b => b.onclick = () => { ui.selAll = b.dataset.scope === 'all'; dropSel(); updatePill(); save(); });
$('#ldel').onclick = () => deleteSel();
// glide the selection thumb; the very first placement lands without motion
function placeThumb(th, target) {
  const first = !th._placed;
  if (first) th.style.transition = 'none';
  th.style.width = target.offsetWidth + 'px';
  th.style.transform = `translateX(${target.offsetLeft}px)`;
  if (first) { th.offsetWidth; th.style.transition = ''; th._placed = true; }
}
$$('#tools button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('#undo').onclick = undo;
$('#redo').onclick = redo;

function setTool(t) {
  if (t !== 'lasso') dropSel();
  if (t === 'view') { ui.tool = 'view'; enter3D(); afterChange(); return; }
  exit3D();
  if (t === 'lasso') { ui.tool = 'lasso'; afterChange(); return; }
  if (t === 'erase') { ui.tool = 'erase'; }
  else {
    ui.tool = t; ui.brush = t;
    const L = activeLayer();
    if (!L || L.brush !== t) {
      if (L && !L.strokes.length) {
        mutate(() => { L.brush = t; L.params = { ...lastParams[t] }; L.name = newLayer(t).name; });
      } else {
        const top = doc.layers[doc.layers.length - 1];
        if (top && top.brush === t) doc.active = top.id;
        else mutate(() => { const nl = newLayer(t); doc.layers.push(nl); doc.active = nl.id; });
      }
      dirty.add(doc.active);
    }
  }
  afterChange();
}
function setParam(L, k, v) {
  L.params[k] = v;
  lastParams[L.brush][k] = v;
  if (GEOM.has(k)) dirty.add(L.id);
  request();
}
function afterChange() {
  renderPanel(); updatePill(); updateGuides(); updateEmpty(); request(); save();
}
function updateEmpty() { $('#empty').classList.toggle('off', doc.layers.some(L => L.strokes.length)); }

const sec = t => h('div', { class: 'sec' }, t);
const hint = html => h('div', { class: 'hint', html });
const fmtNum = (v, step, suf = '') => (step >= 1 ? Math.round(v) : v.toFixed(2)) + suf;

function slider(o) {
  const beginEdit = o.hist === false ? () => {} : beginEditDoc, endEdit = o.hist === false ? () => {} : endEditDoc;   // view settings aren't undo steps
  const inp = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, 'aria-label': o.label });
  const b = h('b');
  const row = h('div', { class: 'ctrl' }, h('span', null, o.label), b, inp);
  const upd = () => {
    const v = o.get();
    inp.value = v; b.textContent = fmtNum(v, o.step, o.suf);
    row.style.setProperty('--fill', clamp((v - o.min) / (o.max - o.min), 0, 1) * 100 + '%');
  };
  const setX = cx => {
    const r = row.getBoundingClientRect();
    let v = o.min + clamp((cx - r.left) / r.width, 0, 1) * (o.max - o.min);
    v = +(Math.round(v / o.step) * o.step).toFixed(4);
    if (v !== o.get()) { o.set(v); upd(); }
  };
  let drag = null;
  row.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: e.pointerType !== 'touch' };
    if (drag.on) { beginEdit(); row.setPointerCapture(e.pointerId); row.classList.add('on'); setX(e.clientX); }
  });
  row.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.on) {
      const dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
      if (dy > 8 && dy > dx) { drag = null; return; }
      if (dx < 6) return;
      drag.on = true; beginEdit(); row.setPointerCapture(e.pointerId); row.classList.add('on');
    }
    setX(e.clientX);
  });
  row.addEventListener('pointerup', e => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.on) { beginEdit(); setX(e.clientX); }
    drag = null; row.classList.remove('on'); endEdit();
  });
  row.addEventListener('pointercancel', () => { drag = null; row.classList.remove('on'); endEdit(); });
  inp.addEventListener('input', () => { beginEdit(); o.set(+inp.value); upd(); });
  inp.addEventListener('change', endEdit);
  row._upd = upd; upd();
  return row;
}
function seg(options, get, set) {
  const el = h('div', { class: 'seg' }, h('i', { class: 'thumb' }));
  for (const [v, label, title] of options) {
    el.append(h('button', { type: 'button', 'data-v': v, title: title || null, html: label, onclick: () => { set(v); upd(); } }));
  }
  const upd = () => {
    const cur = String(get());
    let s = null;
    $$('button', el).forEach(b => { const on = b.dataset.v === cur; b.setAttribute('aria-pressed', String(on)); if (on) s = b; });
    if (s && s.offsetWidth) placeThumb($('.thumb', el), s);
  };
  el._upd = upd; el.classList.add('segctl');
  return el;
}
function refreshSegs() { $$('.segctl').forEach(s => s._upd()); updatePill(); }
function refreshControls() { $$('.ctrl, .row.color').forEach(c => c._upd && c._upd()); refreshSegs(); }
function colorRow(label, get, set) {
  const ci = h('input', { type: 'color', 'aria-label': label });
  const sw = h('label', { class: 'swatch' }, ci);
  const hx = h('input', { type: 'text', class: 'hex', spellcheck: 'false', maxlength: '7', 'aria-label': label + ' hex' });
  const row = h('div', { class: 'row color' }, h('span', { class: 'lab' }, label), sw, hx);
  const upd = () => { const v = get(); ci.value = v.toLowerCase(); hx.value = v.toUpperCase(); sw.style.background = v; };
  ci.addEventListener('input', () => { beginEdit(); set(ci.value.toUpperCase()); upd(); });
  ci.addEventListener('change', endEdit);
  ci.addEventListener('blur', endEdit);       // a picker dismissed without 'change' must not leave the edit open
  // a full hex applies as it's typed, not only once the field lets go of focus
  hx.addEventListener('input', () => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hx.value.trim());
    if (m) { beginEdit(); set('#' + m[1].toUpperCase()); endEdit(); ci.value = '#' + m[1].toLowerCase(); sw.style.background = '#' + m[1]; }
  });
  hx.addEventListener('change', upd);
  hx.addEventListener('keydown', e => { if (e.key === 'Enter') hx.blur(); });
  row._upd = upd; upd();
  return row;
}
function toggleRow(label, get, set) {
  const id = 'tg-' + label.toLowerCase().replace(/\W+/g, '-');
  const cb = h('input', { type: 'checkbox', id });
  cb.checked = get();
  cb.onchange = () => { set(cb.checked); save(); };
  return h('div', { class: 'row tog' }, cb, h('label', { for: id }, label));
}

const SYM_ICONS = {
  off: 'Off',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v18" stroke-dasharray="2 2.5"/><path d="M8 8l-3 4 3 4M16 8l3 4-3 4"/></svg>',
  y: '<svg class="i" viewBox="0 0 24 24"><path d="M3 12h18" stroke-dasharray="2 2.5"/><path d="M8 8l4-3 4 3M8 16l4 3 4-3"/></svg>',
  xy: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" stroke-dasharray="2 2.5"/><circle cx="7.5" cy="7.5" r="1.3"/><circle cx="16.5" cy="7.5" r="1.3"/><circle cx="7.5" cy="16.5" r="1.3"/><circle cx="16.5" cy="16.5" r="1.3"/></svg>',
  r6: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.2"/><path d="M12 4v4M12 16v4M5.1 8l3.4 2M15.5 14l3.4 2M5.1 16l3.4-2M15.5 10l3.4-2"/></svg>',
};

function renderPanel() {
  const L = activeLayer();
  const brush = L ? L.brush : ui.brush;
  const P = L ? L.params : lastParams[brush];
  const set = (k) => v => { if (L) setParam(L, k, v); else { lastParams[brush][k] = v; } updateBalls(); };
  const ps = d => slider({ label: d[1], min: d[2], max: d[3], step: d[4], suf: d[5], get: () => (L ? L.params : lastParams[brush])[d[0]], set: set(d[0]) });

  // Brush
  const bp = pane('brush'); bp.replaceChildren();
  $('.tab[data-tab="brush"]').textContent = ui.tool === 'view' ? 'View' : 'Brush';
  if (ui.tool === 'view') bp.append(...viewControls());
  else {
    if (ui.tool === 'lasso') {
      bp.append(sec('Lasso'), hint(isTouchUI
        ? 'Circle something to select it, then drag it anywhere, off the board too: nothing is lost there. Tap to select everything, tap again to let go. A cut closes round, like the liquid it is.'
        : 'Circle something to select it, then drag it anywhere, off the board too: nothing is lost there. Click to select everything, click again to let go · <kbd>⌫</kbd> deletes · <kbd>Esc</kbd> lets go · <kbd>L</kbd> back to the brush.'));
    }
    if (ui.tool === 'erase') {
      bp.append(sec('Eraser'),
        slider({ label: 'Size', min: 4, max: 240, step: 1, get: () => ui.eraser, set: v => { ui.eraser = v; save(); } }),
        hint(`Cuts ${L ? L.name : 'the active layer'}. The cut edge stays rounded.`));
    }
    bp.append(sec(`${NAMES[brush]} stroke`),
      ...[['size', 'Size', 2, 140, 1], ['pressure', 'Pressure', 0, 1, .01], ['speed', 'Speed', 0, 1, .01], ['tilt', 'Tilt', 0, 1, .01]].map(ps),
      sec('Flow'),
      ...[['merge', 'Merge', 0, 1, .01], ['pool', 'Pooling', 0, 2, .01], ['vary', 'Wobble', 0, 1, .01], ['smooth', 'Smoothing', 0, 1, .01]].map(ps),
    );
    const taper = ps(['taper', 'Taper', .2, 3, .01]);
    taper.hidden = P.end !== 'wedge';
    bp.append(sec('Ends'),
      seg([['drop', 'Drop'], ['wedge', 'Wedge']], () => (L ? L.params : lastParams[brush]).end, v => { beginEdit(); set('end')(v); endEdit(); taper.hidden = v !== 'wedge'; }),
      taper);
    bp.append(sec('Mirror'),
      seg(Object.keys(SYM_ICONS).map(k => [k, SYM_ICONS[k], { off: 'No mirror', x: 'Left / right', y: 'Top / bottom', xy: 'Four quarters', r6: 'Six-way radial' }[k]]),
        () => ui.sym, v => { ui.sym = v; updateGuides(); save(); }),
      hint('Pressure comes from Apple Pencil and drawing tablets, and from a Force Touch trackpad in Safari. A mouse has no pressure sensor, so speed and pauses do the work: slow down to swell, hold still to pool.'),
      sec('Shapes'),
      toggleRow('Hold to snap', () => ui.snap, v => ui.snap = v),
      hint('Hold the pen still at the end of a stroke and a nearly straight one becomes a line, an even curve an arc, a closed loop a circle. Keep holding and move to adjust it. Strokes that are neither still pool.'));

  }
  // Surface
  const sp = pane('surface'); sp.replaceChildren();
  const presets = PRESETS[brush];
  const mats = h('div', { class: 'mats' });
  for (const pr of presets) {
    mats.append(h('button', { type: 'button', class: 'mat', 'data-name': pr.name, onclick: () => {
      if (!L) return;
      mutate(() => { const { name, ...vals } = pr; Object.assign(L.params, vals, { preset: name }); Object.assign(lastParams[brush], vals, { preset: name }); });
      request(); renderPanel(); updateBalls();
    } }, h('span', { class: 'ball', style: `background:${presetBall(brush, pr)}` }), h('span', null, pr.name)));
  }
  sp.append(sec('Material'), mats);
  if (brush === 'metal') {
    sp.append(sec('Palette'),
      colorRow('Shadow', () => P.c0, set('c0')), colorRow('Midtone', () => P.c1, set('c1')), colorRow('Highlight', () => P.c2, set('c2')),
      sec('Reflection'),
      ...[['sky', 'Top', 0, 1, .01], ['rim', 'Edge tone', 0, 1, .01], ['contrast', 'Contrast', .4, 2, .01], ['brk', 'Banding', 0, 1, .01]].map(ps),
      sec('Finish'),
      ...[['shine', 'Shine', 0, 2, .01], ['grain', 'Grain', 0, 1, .01], ['rough', 'Ripple', 0, 1, .01], ['iri', 'Iridescence', 0, 1, .01]].map(ps));
  } else if (brush === 'stone') {
    sp.append(sec('Colour'), colorRow('Stone', () => P.color, set('color')),
      sec('Texture'),
      ...[['pits', 'Pits', 0, 1, .01], ['facets', 'Facets', 0, 1, .01], ['grit', 'Grit', 0, 1, .01], ['scale', 'Scale', .3, 3, .01], ['relief', 'Relief', 0, 2, .01]].map(ps),
      sec('Finish'),
      ...[['gloss', 'Gloss', 0, 1, .01], ['shine', 'Shine', 0, 2, .01]].map(ps));
  } else if (brush === 'clay') {
    sp.append(sec('Colour'), colorRow('Clay', () => P.color, set('color')),
      sec('Finish'),
      ...[['gloss', 'Sheen', 0, 1, .01], ['grain', 'Texture', 0, 1, .01], ['glow', 'Glow', 0, 1, .01]].map(ps));
  } else {
    sp.append(sec('Colour'), colorRow('Glaze', () => P.color, set('color')),
      sec('Finish'),
      ...[['gloss', 'Gloss', 0, 1, .01], ['shine', 'Shine', 0, 2, .01], ['brk', 'Break', 0, 1, .01], ['speckle', 'Speckle', 0, 1, .01], ['grain', 'Grain', 0, 1, .01]].map(ps));
  }
  sp.append(sec('Form'), ...[['vol', 'Volume', .2, 2.5, .01], ['edge', 'Edge', 2, brush === 'clay' ? 160 : 80, 1]].map(ps), sec('Light'));
  if (brush === 'clay' || doc.light.shadows) sp.append(hint(`Lit by the board's light, set in <b>Canvas → Light</b>${brush === 'clay' ? '' : ' while shadows are on'}.`));
  else sp.append(...[['light', 'Light', 0, 360, 1, '°'], ['shadow', 'Shadow', 0, 1, .01]].map(ps));
  markPresets();

  // Canvas
  const cp = pane('canvas'); cp.replaceChildren();
  cp.append(sec('Layers'), h('div', { class: 'layers', id: 'layers' }),
    h('div', { class: 'btnrow' },
      h('button', { type: 'button', class: 'btn', onclick: () => { mutate(() => { const nl = newLayer(ui.brush); doc.layers.push(nl); doc.active = nl.id; }); if (ui.tool === 'erase') ui.tool = ui.brush; afterChange(); } }, `New ${NAMES[ui.brush].toLowerCase()} layer`)));
  cp.append(sec('Artboard'),
    seg(BOARDS.map(b => [b[0], b[0]]), () => (BOARDS.find(b => b[1] === doc.w && b[2] === doc.h) || [''])[0], v => {
      const b = BOARDS.find(x => x[0] === v);
      mutate(() => { resizeDoc(b[1], b[2]); doc.bgImage = null; });
      afterChange();
    }));
  const bgs = h('div', { class: 'bgs' });
  for (const [name, val] of BGS) {
    bgs.append(h('button', { type: 'button', title: name, class: val === 'none' ? 'clr' : null, style: val === 'none' ? null : `background:${val}`,
      'aria-pressed': String(doc.bg === val && !doc.bgImage), onclick: () => { mutate(() => { doc.bg = val; doc.bgImage = null; }); afterChange(); } }));
  }
  cp.append(sec('Background'), bgs);
  if (doc.bg !== 'none') cp.append(colorRow('Colour', () => doc.bg, v => { doc.bg = v; doc.bgImage = null; markBgs(); request(); }));
  if (doc.bg !== 'none' || doc.bgImage) cp.append(seg([['plain', 'Plain'], ['paper', 'Paper'], ['folded', 'Folded']], () => doc.light.paper,
    v => { mutate(() => { doc.light.paper = v; }); request(); }));
  cp.append(h('div', { class: 'btnrow' },
    h('button', { type: 'button', class: 'btn', onclick: () => $('#file').click() }, doc.bgImage ? 'Replace image' : 'Draw on an image'),
    doc.bgImage ? h('button', { type: 'button', class: 'btn', onclick: () => { mutate(() => { doc.bgImage = null; }); afterChange(); } }, 'Remove image') : null));
  // the board's light: one key light and the sky, shared by every layer
  const lset = k => v => { doc.light[k] = v; request(); };
  cp.append(sec('Light'),
    toggleRow('Shadows', () => doc.light.shadows, v => { mutate(() => { doc.light.shadows = v; }); afterChange(); }),
    slider({ label: 'Direction', min: 0, max: 360, step: 1, suf: '°', get: () => doc.light.angle, set: lset('angle') }),
    slider({ label: 'Height', min: 8, max: 80, step: 1, suf: '°', get: () => doc.light.height, set: lset('height') }),
    slider({ label: 'Softness', min: 0, max: 1, step: .01, get: () => doc.light.soft, set: lset('soft') }),
    slider({ label: 'Fill', min: 0, max: 1, step: .01, get: () => doc.light.fill, set: lset('fill') }));
  if (doc.light.shadows) cp.append(
    toggleRow('Shadows in preview', () => ui.previewShadows, v => { ui.previewShadows = v; request(); }),
    hint('Turn off to keep drawing smooth on a slower device. Contact shading stays, and exports always include the shadows.'));
  cp.append(sec('Export'),
    seg([['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×']], () => ui.exp.scale, v => { ui.exp.scale = +v; save(); }),
    toggleRow('Transparent background', () => ui.exp.transparent, v => ui.exp.transparent = v),
    toggleRow('Crop to drawing', () => ui.exp.crop, v => ui.exp.crop = v),
    h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', onclick: exportPNG }, 'Export PNG')),
    sec('Reset'),
    h('div', { class: 'btnrow' },
      h('button', { type: 'button', class: 'btn quiet', onclick: clearLayer }, 'Clear layer'),
      h('button', { type: 'button', class: 'btn quiet', onclick: clearAll }, 'Clear all')),
    hint(isTouchUI
      ? 'Two-finger tap to undo, three-finger tap to redo. Pinch to zoom. Once a Pencil touches the screen, fingers only navigate.'
      : '<kbd>⌘Z</kbd> undo · <kbd>⇧⌘Z</kbd> redo · <kbd>[</kbd> <kbd>]</kbd> size · <kbd>B</kbd> next brush · <kbd>E</kbd> eraser · hold <kbd>Space</kbd> to pan · <kbd>⌘</kbd>+scroll to zoom · <kbd>S</kbd> panel'));
  renderLayers();
  renderSessions();
  showTab(ui.tab);
}
const thumbURL = new WeakMap();
const urlOf = b => { let u = thumbURL.get(b); if (!u) { u = URL.createObjectURL(b); thumbURL.set(b, u); } return u; };
function when(t) {
  const d = Date.now() - t;
  if (d < 6e4) return 'just now';
  if (d < 36e5) return Math.round(d / 6e4) + ' min ago';
  const dt = new Date(t), hm = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (dt.toDateString() === new Date().toDateString()) return 'today ' + hm;
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + hm;
}
function renderSessions() {
  const sp = pane('sessions');
  if (!sp) return;
  if (sp.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   // don't yank a rename
  sp.replaceChildren();
  if (isLab || !DB.ok || !session) { sp.append(hint('Sessions need browser storage, which is turned off here.')); return; }
  const nm = h('input', { type: 'text', class: 'sname', spellcheck: 'false', 'aria-label': 'Session name' });
  nm.value = session.name;
  nm.addEventListener('change', () => renameSession(nm.value));
  nm.addEventListener('keydown', e => { if (e.key === 'Enter') nm.blur(); });
  const grid = h('div', { class: 'sess' });
  for (const m of sessions) {
    grid.append(h('div', { class: 'scard', role: 'button', tabindex: '0', 'aria-current': String(m.id === session.id),
        onclick: () => openSession(m.id), onkeydown: e => { if (e.key === 'Enter') openSession(m.id); } },
      h('div', { class: 'sthumb' }, m.thumb ? h('img', { src: urlOf(m.thumb), alt: '' }) : null),
      h('div', { class: 'smeta' }, h('span', { class: 'nm' }, m.name), h('small', null, when(m.updated))),
      h('button', { type: 'button', class: 'sdel', title: 'Delete session', html: ICON.del, onclick: e => { e.stopPropagation(); deleteSession(m.id); } })));
  }
  sp.append(sec('This session'), h('div', { class: 'row' }, h('span', { class: 'lab' }, 'Name'), nm),
    h('div', { class: 'btnrow' }, h('button', { type: 'button', class: 'btn primary', onclick: newSession }, 'New session')),
    sec('Saved'), grid,
    sec('Backup'),
    h('div', { class: 'btnrow' },
      h('button', { type: 'button', class: 'btn', onclick: saveSessionFile }, 'Save to Files'),
      h('button', { type: 'button', class: 'btn', onclick: () => $('#sessFile').click() }, 'Open file')),
    hint('Sessions save as you draw and stay on this device. Saving to Files keeps a copy outside the app.'));
}
$('#sessFile').onchange = e => { if (e.target.files[0]) openSessionFile(e.target.files[0]); e.target.value = ''; };
function markPresets() {
  const L = activeLayer();
  $$('.mat').forEach(b => b.setAttribute('aria-pressed', String(!!L && L.params.preset === b.dataset.name)));
}
// pick light or dark glass from what actually sits behind the panel: the board's tone (colour, or a photo's
// average) weighted by how much of the panel the board covers; the rest is the near-white page
const imgLum = new WeakMap();
function lumOfImage(cv) {
  if (imgLum.has(cv)) return imgLum.get(cv);
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const x = c.getContext('2d'); x.drawImage(cv, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data; let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255;
  const v = sum / 64; imgLum.set(cv, v); return v;
}
function updateGlass() {
  const boardLum = doc.bgImage ? lumOfImage(doc.bgImage) : doc.bg === 'none' ? .95 : (c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2])(hexRgb(doc.bg));
  // the panel's layout box, not its animated one, so a sliding-in panel already knows what it will sit over
  const o = panel.offsetParent ? panel.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  const p = { left: o.left + panel.offsetLeft, top: o.top + panel.offsetTop, width: panel.offsetWidth, height: panel.offsetHeight };
  p.right = p.left + p.width; p.bottom = p.top + p.height;
  const b = board.getBoundingClientRect();
  const ox = Math.max(0, Math.min(p.right, b.right) - Math.max(p.left, b.left)), oy = Math.max(0, Math.min(p.bottom, b.bottom) - Math.max(p.top, b.top));
  const cover = p.width && p.height ? ox * oy / (p.width * p.height) : 0;
  panel.classList.toggle('dark', lerp(.96, boardLum, cover) < .5);
}
function markBgs() { $$('.bgs button').forEach((b, i) => b.setAttribute('aria-pressed', String(BGS[i][1] === doc.bg && !doc.bgImage))); updateGlass(); }

function renderLayers() {
  const box = $('#layers');
  if (!box) return;
  box.replaceChildren();
  if (!doc.layers.length) { box.append(hint('No layers yet. Your first stroke makes one.')); return; }
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i];
    const btn = (icon, title, fn) => h('button', { type: 'button', title, html: icon, onclick: e => { e.stopPropagation(); fn(); } });
    const row = h('div', { class: 'lrow' + (L.visible ? '' : ' hid'), 'aria-current': String(L.id === doc.active), role: 'button', tabindex: '0',
      'data-id': L.id, onclick: e => {
        if (performance.now() - (e.currentTarget._swiped || 0) < 400) return;      // the click that ends a swipe
        // a second tap on the name renames; our own timing, since iPad Safari doesn't reliably fire dblclick
        const now = performance.now(), again = lastTap.id === L.id && now - lastTap.t < 450 && e.target.closest('.nm');
        lastTap = again ? { id: null, t: 0 } : { id: L.id, t: now };
        if (again) renameLayer(L.id); else selectLayer(L.id);
      } },
      h('span', { class: 'ball', style: `background:${ballCss(L)}` }),
      h('span', { class: 'nm' }, L.name),
      h('small', null, L.strokes.length ? String(L.strokes.length) : 'empty'),
      h('span', { class: 'acts' },
        btn(ICON.dup, 'Duplicate (or swipe the row)', () => duplicateLayer(L.id)),
        btn(L.visible ? ICON.eye : ICON.eyeOff, L.visible ? 'Hide' : 'Show', () => { mutate(() => { L.visible = !L.visible; }); renderLayers(); request(); }),
        i < doc.layers.length - 1 ? btn(ICON.up, 'Move up', () => moveLayer(i, 1)) : null,
        i > 0 ? btn(ICON.down, 'Move down', () => moveLayer(i, -1)) : null,
        btn(ICON.del, 'Delete layer', () => deleteLayer(L.id))));
    swipeRow(row, L.id);
    box.append(row);
  }
}
// a sideways swipe past 56px duplicates; anything more vertical stays a scroll, anything shorter springs back
function swipeRow(row, id) {
  let s = null;
  row.addEventListener('pointerdown', e => {
    if (e.button || e.target.closest('input')) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, dx: 0 };
  });
  row.addEventListener('pointermove', e => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      s.on = true; row.classList.add('swiping');
      try { row.setPointerCapture(e.pointerId); } catch (_) {}
    }
    s.dx = dx;
    const d = Math.sign(dx) * Math.min(Math.abs(dx), 56 + Math.max(0, Math.abs(dx) - 56) * .25);   // gives way past the mark
    row.style.transform = `translateX(${d}px)`;
    row.classList.toggle('sw-r', dx > 0); row.classList.toggle('sw-l', dx < 0);
    row.classList.toggle('armed', Math.abs(dx) >= 56);
  });
  const end = e => {
    if (!s || e.pointerId !== s.id) return;
    const t = s; s = null;
    if (!t.on) return;
    row._swiped = performance.now();
    row.classList.remove('swiping', 'sw-r', 'sw-l', 'armed'); row.style.transform = '';
    if (Math.abs(t.dx) >= 56 && e.type === 'pointerup') duplicateLayer(id);
  };
  row.addEventListener('pointerup', end); row.addEventListener('pointercancel', end);
}
/* The copy sits right above its layer and comes up selected with the lasso, so the next drag moves it
   (and only it) off its twin. */
function duplicateLayer(id) {
  const L = layerById(id);
  if (!L) return;
  let nl;
  mutate(() => {
    nl = { ...L, id: uid(), name: L.name + ' copy', params: { ...L.params }, strokes: L.strokes.slice(), ops: (L.ops || []).map(o => ({ ...o })) };
    doc.layers.splice(doc.layers.indexOf(L) + 1, 0, nl); doc.active = nl.id;
  });
  dirty.add(nl.id);
  setTool('lasso');
  if (nl.visible && nl.strokes.length) selectAll([nl]);
  toast(nl.strokes.length ? `${nl.name} · drag to move it` : nl.name, { label: 'Undo', fn: undo });
}
let lastTap = { id: null, t: 0 };
function renameLayer(id) {
  const L = layerById(id), row = $(`.lrow[data-id="${id}"]`);
  if (!L || !row) return;
  const inp = h('input', { type: 'text', class: 'lname', spellcheck: 'false', 'aria-label': 'Layer name' });
  inp.value = L.name;
  let done = false;
  const finish = keep => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (keep && v && v !== L.name) mutate(() => { L.name = v; });
    renderLayers();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('click', e => e.stopPropagation());
  $('.nm', row).replaceWith(inp);
  inp.focus(); inp.select();
}
function selectLayer(id) {
  if (!ui.selAll && id !== doc.active) dropSel();
  doc.active = id;
  const L = activeLayer();
  ui.brush = L.brush;
  if (brushTool()) ui.tool = L.brush;
  afterChange();
}
function moveLayer(i, d) {
  mutate(() => { const ls = doc.layers; [ls[i], ls[i + d]] = [ls[i + d], ls[i]]; });
  renderLayers(); request();
}
function deleteLayer(id) {
  const L = layerById(id);
  mutate(() => {
    doc.layers = doc.layers.filter(l => l.id !== id);
    if (doc.active === id) doc.active = doc.layers.length ? doc.layers[doc.layers.length - 1].id : null;
  });
  gcTargets(); afterChange();
  toast(`${L.name} deleted`, { label: 'Undo', fn: undo });
}
function clearLayer() {
  const L = activeLayer();
  if (!L || !L.strokes.length) return;
  mutate(() => { L.strokes = []; });
  dirty.add(L.id); afterChange();
  toast(`${L.name} cleared`, { label: 'Undo', fn: undo });
}
function clearAll() {
  if (!doc.layers.some(L => L.strokes.length)) return;
  mutate(() => { const nl = newLayer(ui.brush); nl.name = NAMES[ui.brush]; doc.layers = [nl]; doc.active = nl.id; });
  gcTargets(); afterChange();
  toast('Canvas cleared', { label: 'Undo', fn: undo });
}
function resizeDoc(w, hgt) {
  const dx = (w - doc.w) / 2, dy = (hgt - doc.h) / 2;
  if (dx || dy) {
    for (const L of doc.layers) {
      L.strokes = L.strokes.map(s => { const p = s.pts.slice(); for (let i = 0; i < p.length; i += 5) { p[i] += dx; p[i + 1] += dy; } return { ...s, pts: p }; });
      if (L.ops) L.ops = L.ops.map(o => ({ ...o, poly: o.poly && o.poly.map((v, i) => v + (i % 2 ? dy : dx)) }));
      dirty.add(L.id);
    }
  }
  doc.w = w; doc.h = hgt;
  view.z = 1; fit(); updateResolution();
}
function updateGuides() {
  const g = $('#guides');
  g.setAttribute('viewBox', `0 0 ${doc.w} ${doc.h}`);
  $('#selg').setAttribute('viewBox', `0 0 ${doc.w} ${doc.h}`);
  board.classList.toggle('clear', doc.bg === 'none' && !doc.bgImage);
  updateGlass();
  const cx = doc.w / 2, cy = doc.h / 2, R = Math.hypot(doc.w, doc.h);
  const lines = [];
  if (ui.sym === 'x' || ui.sym === 'xy') lines.push([cx, 0, cx, doc.h]);
  if (ui.sym === 'y' || ui.sym === 'xy') lines.push([0, cy, doc.w, cy]);
  if (ui.sym === 'r6') for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3 + Math.PI / 6; lines.push([cx - Math.cos(a) * R, cy - Math.sin(a) * R, cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  g.innerHTML = lines.map(l => `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}"/>`).join('');
}

