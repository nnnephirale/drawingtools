# Slip & Metal

A WebGL2 drawing tool where strokes become material (glazed slip, stone, retired metal), with a 3D view
and STL/GLB export. No build step and no dependencies. `DESIGN-NOTES.md` is the history and the reasoning
behind every look and decision; read the round that matches the area you're touching.

## Files
- `index.html`: markup, CSS and the whole app, in one IIFE. Sections open with `═══` banners, so grep a
  banner title instead of reading the file: helpers · brushes, presets, defaults · state · WebGL · strokes →
  stamps · field building · compositing · 3D view · frame loop · view: fit / zoom / pan · history +
  persistence · input · UI · images in · export (PNG, then models: `heightGrid`, `buildModel`, `stlBlob`,
  `glbBlob`, `exportModel`, `viewControls`) · first-run sample · boot.
- `js/shaders.js`: every GLSL source (a classic script, so the page still opens from disk). `GL_H` is the
  height chunk shared by 2D shading, the 3D mesh and export (`H` shading bevel, `Hg` geometry profile,
  `Hc` edge-closed bevel). `fsComp(mesh)` is the material shader; `mesh = true` adds `#define MESH`.
- `dev/test.js`: the check harness (below). `dev/lab.js`: A/B against reference images (`?lab=metal|ceramic`).
- `dev/serve.sh`: starts the app server on :4178. `STARTTHIS.command` runs it and opens the page.

## Rules
- **2D stays pixel-identical.** Anything 3D-only in the shaders goes behind `#ifdef MESH`, with `TX`, `OW()`,
  `tang()`, `jit()`, `rnd()`, `lumpGrad()` covering the 2D/3D differences. Edit GLSL in `js/shaders.js`.
- **3D frame budget ≈16 ms.** Never switch framebuffers inside the multisampled pass (on Apple GPUs it
  stores and reloads the whole MSAA target, ~10 ms each). Build per-layer textures first (`buildStacks`).
- Height used for geometry (`Hg`) is not the height used for shading (`H`/`Hc`). See DESIGN-NOTES rounds 6–7.
- After each round, add a "Round N" section to `DESIGN-NOTES.md`: what changed and why, in plain words.
- Commit straight to `main` once a round is verified, after asking. Don't push unless asked.

## Running and checking
1. `bash dev/serve.sh` from the Bash tool. The preview pane can't read this drive, so `.claude/launch.json`
   (`slip-metal`, port 4180) is only a proxy to :4178. A 502 page saying so means step 1 was skipped.
2. `preview_start slip-metal`, then open `http://localhost:4180/?test`. Test mode always opens the demo
   (1600×1200, two slip and two stone strokes) and never reads or writes saved sessions or prefs.
3. Call the harness instead of writing one-off snippets:
   - `await __sm.test.view({ canvas, depth, pose: { rx, ry, zoom, panX, panY } })`, `.pose(p)`, `.flat()`, `.state()`
   - `await __sm.test.stl()`: `watertight`, `outward`, size in mm · `.glb()`: validity, bbox, winding, unlit
   - `await __sm.test.glbPreview()`: renders the GLB in three.js over the page (`.closePreview()`)
   - `await __sm.test.png3d()` · `await __sm.test.bench()`: GPU ms per 3D frame, still and moving
4. Preview screenshots often lag a frame or two behind; trust `__sm.test.state()` and take a second
   screenshot before believing a visual glitch. Time the GPU with `bench()` (readPixels after N renders),
   never with the frame loop.

`window.__sm` exposes internals for checks (`doc()`, `ui`, `three`, `render3D`, `animate3D`,
`exportModel`, `setDoc`, `demo`, …); add to it rather than reaching into the IIFE another way.
