# Where things live

One map of the code: the file to edit for each job and what it owns. `node dev/build.mjs --check` fails
when a source file is missing from this map, when the map names a file that is gone, or when `index.html`
is stale. Any change that adds, moves or removes a file updates this map in the same commit.

## The page

Edit `src/`, never `index.html`. `node dev/build.mjs` (`dev/build.mjs`) joins the files back into
`index.html`, which stays one page that opens by double-click. `src/page.html` is the markup (head, chrome,
panel, overlays); each whole line `@@ css/…` or `@@ js/…` in it is replaced by that file, verbatim, in the
order listed there. Line 2 of `index.html` says it is built and carries a hash, so the build refuses to
overwrite a hand edit (`--force` discards one).

The JS files are one IIFE cut at its `═══` section banners: it opens in `src/js/00-helpers.js` and closes
in `src/js/85-boot.js`. They share one scope, so a function or constant in any file is visible to the
others, and they must stay in this order. They are not modules. Number prefixes keep the folder listing in
page order; a new file takes a free number between its neighbours and gets its own `@@` line.

| CSS file | Owns |
|---|---|
| `src/css/00-tokens.css` | Colour, type and easing tokens on `:root`, page background and base type. |
| `src/css/10-stage.css` | The stage and artboard, the 3D window, empty state, guides, brush ring, the lasso. |
| `src/css/20-chrome.css` | Frosted chrome: brand, top-right buttons, status text, zoom bar and its menu. |
| `src/css/30-tool-pill.css` | The tool pill: tools, brush balls, the 3D button, tool and layer chips. |
| `src/css/40-panel.css` | The floating glass panel: header, tabs, sections, rows, fill-bar sliders, dark glass, phone layout. |
| `src/css/50-controls.css` | Segmented controls, material chips, background swatches, layer rows (swipe to duplicate), buttons. |
| `src/css/60-sessions-overlays.css` | Session cards, the drop veil, the toast, the fatal message, touch and reduced-motion rules. |

| JS file | Owns |
|---|---|
| `src/js/00-helpers.js` | Opens the IIFE. `$`, `$$`, maths (`clamp`, `lerp`, `sstep`), colour helpers, `h()` element builder, `ICON`. |
| `src/js/05-brushes.js` | Slip, metal and stone presets, `DEF`, `GEOM`, `BRUSHES`, `TOOLS`, backgrounds `BGS`, `BOARDS`. |
| `src/js/10-state.js` | `doc` (the drawing) and `ui` (tool, panel, prefs), layer lookups, `newLayer`. |
| `src/js/15-webgl.js` | The WebGL2 context, shader programs from `js/shaders.js`, VAOs and buffers, render targets. |
| `src/js/20-stamps.js` | Turning a stroke's samples into stamps: `FBuf`, noise, `emitter`, `strokeStamps`. |
| `src/js/25-fields.js` | Building each layer's height field from stamps (draw, erase, moved selections), dirty tracking, live strokes. |
| `src/js/30-compositing.js` | Background and image textures, light direction, height uniforms, compositing layers to the screen. |
| `src/js/35-view-3d.js` | The 3D relief view: pose and camera, grid, slab, the MSAA target, `buildStacks`, `render3D`, orbit input. |
| `src/js/40-frame-loop.js` | `request()` and the frame loop, the status readout. |
| `src/js/45-view.js` | 2D view: fit, zoom and pan, the zoom bar, board rotation, resolution, the close-up. |
| `src/js/50-history.js` | Undo and redo, sessions in IndexedDB (save, open, rename, delete, thumbnails), session files, prefs. |
| `src/js/55-input.js` | Pen, mouse, finger and Force Touch: strokes, hold to snap (line, arc, circle), taps, two-finger gestures, lasso selection and moving it. |
| `src/js/60-ui.js` | The panel and its tabs, the tool pill, toast, sliders and segments, materials, backgrounds, layers, sessions list. |
| `src/js/65-images-in.js` | Dropping or picking an image to draw on (`loadImageFile`). |
| `src/js/70-export-png.js` | `renderCanvas` at any scale, `deliverFile`, `exportPNG`, `export3DPNG`. |
| `src/js/75-export-models.js` | Models: `heightGrid`, `buildModel`, `stlBlob`, `glbBlob`, `exportModel`, `viewControls`. |
| `src/js/80-first-run-sample.js` | Synthetic gestures for the first-run drawing and the `?test` demo (`seedDemo`). |
| `src/js/85-boot.js` | `boot()`, save on leaving, `window.__sm` for checks, loading `dev/lab.js` and `dev/test.js`. Closes the IIFE. |

## Shaders

| File | Owns |
|---|---|
| `js/shaders.js` | Every GLSL source, as a classic script loaded before the app (so the page opens from disk). `GL_H` is the height chunk shared by 2D, 3D and export; `fsComp(mesh)` is the material shader. Edited directly, not built. |

## Dev tools (not part of the published tool)

| File | Owns |
|---|---|
| `dev/build.mjs` | The build above, the hand-edit guard, and `--check` (this map, and `index.html` up to date). |
| `dev/test.js` | `__sm.test.*` checks, loaded by `index.html?test` (see CLAUDE.md → Running and checking). |
| `dev/lab.js` | A/B against reference images (`?lab=metal|ceramic`). |
| `dev/serve.sh` | The local server on :4178 used by the preview pane and `STARTTHIS.command`. |
