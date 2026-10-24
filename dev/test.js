/* Dev checks: open index.html?test (the demo drawing; saved sessions and prefs are never read or written),
   then call window.__sm.test.* from the console or a browser tool. Everything returns plain JSON.

     await __sm.test.view({ canvas: false, depth: 1.5, pose: { rx: -.45, ry: 2.6, zoom: 1.4 } })
     await __sm.test.stl()          // watertight + outward, size in mm
     await __sm.test.glb()          // structure, bbox, winding; .glbPreview() renders it in three.js
     await __sm.test.bench()        // GPU ms per 3D frame, still and moving, canvas on/off, two zooms
     await __sm.test.flat()         // back to 2D

   Not part of the published tool. */
(() => {
  'use strict';
  const sm = window.__sm;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const frame = () => new Promise(r => requestAnimationFrame(() => r()));
  const gl = document.querySelector('#c').getContext('webgl2');

  // exports hand files over through an <a download>; catch the next one instead and read its blob
  let catcher = null;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!(this.download && catcher)) return click.call(this);
    const done = catcher; catcher = null;
    fetch(this.href).then(r => r.blob()).then(blob => done({ name: this.download, blob }));
  };
  const download = start => new Promise((res, rej) => {
    catcher = res;
    setTimeout(() => { if (catcher === res) { catcher = null; rej(new Error('no download within 30 s')); } }, 30000);
    start();
  });

  const signedVolume = (a, b, c) => (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  // closed and consistently wound: every directed edge once, and its reverse present
  function closedMesh(tris) {
    const edges = new Set(); let repeated = 0, open = 0;
    const key = v => v.map(x => Math.round(x * 1e4)).join(',');
    for (const t of tris) {
      const k = t.map(key);
      for (let r = 0; r < 3; r++) { const e = k[r] + '|' + k[(r + 1) % 3]; if (edges.has(e)) repeated++; edges.add(e); }
    }
    for (const e of edges) { const [a, b] = e.split('|'); if (!edges.has(b + '|' + a)) open++; }
    return { repeated, open, watertight: !repeated && !open };
  }
  const bbox = pts => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    return hi.map((v, k) => +(v - lo[k]).toFixed(3));
  };

  async function readGlb() {
    const { name, blob } = await download(() => sm.exportModel('glb'));
    const buf = await blob.arrayBuffer(), dv = new DataView(buf);
    const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), bin = 28 + jl;
    const view = (i, T) => { const v = json.bufferViews[i]; return new T(buf.slice(bin + v.byteOffset, bin + v.byteOffset + v.byteLength)); };
    const P = view(0, Float32Array), I = view(4, Uint32Array), pt = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    let vol = 0, maxIndex = 0;
    for (let t = 0; t < I.length; t += 3) { vol += signedVolume(pt(I[t]), pt(I[t + 1]), pt(I[t + 2])); maxIndex = Math.max(maxIndex, I[t], I[t + 1], I[t + 2]); }
    const png = new Uint8Array(buf, bin + json.bufferViews[5].byteOffset, 4);
    return { name, mb: +(blob.size / 1048576).toFixed(1),
      valid: dv.getUint32(0, true) === 0x46546C67 && dv.getUint32(8, true) === buf.byteLength && dv.getUint32(24 + jl, true) === 0x004E4942,
      vertices: json.accessors[0].count, triangles: I.length / 3, indicesOk: maxIndex < json.accessors[0].count,
      size_m: json.accessors[0].max.map((v, k) => +(v - json.accessors[0].min[k]).toFixed(3)), outward: vol > 0,
      texturePng: png[0] === 0x89 && png[1] === 0x50, unlit: !!json.materials[0].extensions?.KHR_materials_unlit, alphaMode: json.materials[0].alphaMode,
      buf };
  }

  const test = {
    state() {
      const t = sm.three, d = sm.doc(), c = document.querySelector('#c');
      return { tool: sm.ui.tool, three: t.on, pose: { rx: +t.rx.toFixed(3), ry: +t.ry.toFixed(3), zoom: +t.zoom.toFixed(3), panX: t.panX, panY: t.panY },
        depth: sm.ui.depth, canvas3d: sm.ui.canvas3d, board: [d.w, d.h], layers: d.layers.map(L => `${L.brush}:${L.strokes.length}`),
        canvasPx: [c.width, c.height], fieldPx: [sm.T.w, sm.T.h], stat: document.querySelector('#stat').textContent };
    },
    // into 3D (or adjust it): canvas on/off, depth, then jump to a pose without the glide
    async view({ canvas, depth, pose } = {}) {
      if (canvas != null) sm.ui.canvas3d = canvas;
      if (depth != null) sm.ui.depth = depth;
      if (sm.ui.tool !== 'view') { sm.setTool('view'); await wait(950); }
      if (pose) { sm.animate3D(pose, null, 1); await frame(); await frame(); }
      sm.renderPanel(); sm.request(); await frame();
      return test.state();
    },
    async pose(p) { sm.animate3D(p, null, 1); await frame(); await frame(); return test.state().pose; },
    async flat() { if (sm.ui.tool === 'view') { sm.setTool(sm.ui.brush); await wait(750); } return test.state(); },
    async demo() { await test.flat(); sm.demo(); await wait(300); return test.state(); },

    async stl() {
      const { name, blob } = await download(() => sm.exportModel('stl'));
      const dv = new DataView(await blob.arrayBuffer()), n = dv.getUint32(80, true), tris = [];
      let vol = 0;
      for (let t = 0; t < n; t++) {
        const o = 84 + t * 50 + 12, p = i => [0, 1, 2].map(k => dv.getFloat32(o + i * 12 + k * 4, true));
        const tri = [p(0), p(1), p(2)]; tris.push(tri); vol += signedVolume(...tri);
      }
      return { name, mb: +(blob.size / 1048576).toFixed(1), triangles: n, ...closedMesh(tris), outward: vol > 0,
        volume_mm3: Math.round(vol), size_mm: bbox(tris.flat()) };
    },
    async glb() { const { buf, ...info } = await readGlb(); return info; },
    // an independent reader: load the GLB in three.js and draw it over the page (closePreview() removes it)
    async glbPreview({ camera = [.18, .32, .38] } = {}) {
      const { buf } = await readGlb();
      const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
      const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm');
      const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf, '', res, rej));
      test.closePreview();
      const cv = Object.assign(document.createElement('canvas'), { id: 'sm-test-preview', width: 800, height: 600 });
      Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '800px', height: '600px', zIndex: 99 });
      document.body.append(cv);
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setClearColor(0xdddddd);
      const scene = new THREE.Scene(); scene.add(gltf.scene);
      const cam = new THREE.PerspectiveCamera(35, 4 / 3, .01, 10); cam.position.set(...camera); cam.lookAt(0, 0, 0);
      r.render(scene, cam);
      const mat = gltf.scene.children[0].material;
      return { material: mat.type, textured: !!mat.map };
    },
    closePreview() { document.getElementById('sm-test-preview')?.remove(); return true; },
    async png3d() {
      const { name, blob } = await download(() => sm.export3DPNG());
      const bm = await createImageBitmap(blob), c = Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height });
      const x = c.getContext('2d'); x.drawImage(bm, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let solid = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 250) solid++;
      return { name, size: [bm.width, bm.height], opaquePct: Math.round(solid / (d.length / 4) * 100) };
    },

    /* GPU ms for one 3D frame: N renders, then a readPixels that waits for them. The frame loop and
       screenshots are no use for timing (rAF pacing, a preview pane's compositor). "moving" is the 60%
       render used while the view turns. Leaves the canvas toggle and zoom as they were. */
    async bench({ zooms = [.8, 2.2], canvas = [true, false], n = 8 } = {}) {
      if (!sm.three.on) await test.view();
      const px = new Uint8Array(4), keep = { canvas3d: sm.ui.canvas3d, zoom: sm.three.zoom };
      const run = scale => {
        sm.render3D(null, scale); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) sm.render3D(null, scale);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return +((performance.now() - t0) / n).toFixed(1);
      };
      const out = {};
      for (const z of zooms) for (const c of canvas) {
        sm.three.zoom = z; sm.ui.canvas3d = c;
        out[`zoom ${z} · canvas ${c ? 'on' : 'off'}`] = { still: run(1), moving: run(.6) };
      }
      sm.ui.canvas3d = keep.canvas3d; sm.three.zoom = keep.zoom; sm.request();
      return { canvasPx: test.state().canvasPx, ms: out };
    },
  };
  sm.test = test;
  console.info('__sm.test ready:', Object.keys(test).join(', '));
})();
