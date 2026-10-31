/* ════════════════════════════════════════════════════════════════════
   state
   ════════════════════════════════════════════════════════════════════ */
let doc = { w: 1600, h: 1200, bg: '#E2DFD8', bgImage: null, layers: [], active: null };
const ui = { tool: 'slip', brush: 'slip', sym: 'off', eraser: 44, depth: 3, canvas3d: true, selAll: true, snap: true, tab: 'brush', exp: { scale: 2, transparent: true, crop: true } };
const lastParams = { slip: { ...DEF.slip }, metal: { ...DEF.metal }, stone: { ...DEF.stone } };
const activeLayer = () => doc.layers.find(L => L.id === doc.active) || null;
const layerById = id => doc.layers.find(L => L.id === id);
const brushTool = () => ui.tool !== 'erase' && ui.tool !== 'view' && ui.tool !== 'lasso';

function newLayer(brush, params) {
  const n = doc.layers.filter(L => L.brush === brush).length + 1;
  return { id: uid(), brush, name: NAMES[brush] + (n > 1 ? ' ' + n : ''), visible: true, seed: Math.random() * 100,
           params: { ...(params || lastParams[brush]) }, strokes: [] };
}

