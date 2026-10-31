# Slip & Metal — design notes

A browser drawing tool after Desssign(Tools)' *Kinetic Design Brushes* (keenetic-welcome-page.netlify.app). First two brushes: ceramic slip / glazed ceramic, and liquid metal.

## What came from the reference
- The behaviour, not the look: the path of the hand becomes material. Speed thins the line, pauses pool it into drops, crossings fuse.
- Retune after drawing: every slider re-renders the whole layer.
- One layer per brush, eraser that cuts the form (edges stay rounded), mirror axes, draw on your own image, transparent PNG export cropped to the drawing.
- The metal palette as three colours (shadow / midtone / highlight) plus a banding control, which gives the posterised "comic chrome" from the reference video.

## House style kept (the reference's own UI was not copied)
- The UI is the creative-tool-ui kit (IBM Plex Mono Light, warm greys, frosted floating rail, fill-bar sliders, bottom pill), not the reference's stark black/white Swiss panel with black CTA buttons.
- Overridden reference defaults: black primary buttons → grey muted primary; uppercase bold display title → small brand label.

## How it renders
Strokes are stored as raw samples (x, y, pressure, time, tilt). At build time each sample becomes a gaussian stamp in a half-float field: R = summed density, G = density-weighted radius. The surface is where R > 1; height = local radius × sqrt profile, so a lone line is a round rope and crossings bulge. Merge sets the peak/threshold ratio (longer tails fuse more). A composite shader lights the field: glaze (wrap diffuse, glaze break on thin edges, iron speckle, lacquer highlight) or metal (reflection of a studio environment mapped through the three-colour palette).

## Matching the references (round 2)
The first pass looked like a Photoshop bevel-and-emboss with a drop shadow. Matched against the reference images in `dev/lab.js` (`index.html?lab=metal` / `?lab=ceramic`: the reference stroke hand-traced and overlaid, Ours / Ref / Split):
- No drop shadows by default. The references carry depth in the material only (Shadow slider still there, at 0).
- Height is a bevel profile with an Edge radius: lone lines stay round, pools and merges flatten like liquid.
- Metal, from pixel samples of the reference: dark grainy top (~0.39), cool grey bevel that brightens toward the outer edge on the side away from the light, a glint right at the top/bevel boundary on the lit side (a long softbox, so it runs along the whole edge), and a crisp per-pixel dither on that boundary. Top / Edge tone sliders replace the old fixed environment.
- Ceramic: smooth satin, flat-ish top, soft broad sheen, deeper shadow side, very gentle lumps; the crisp glint only on glossy glazes.
- Speed curve rebalanced so a relaxed pace gives full width; slow swells, fast thins. Width wobble at the reference's wavelength.

## Input
- Apple Pencil / tablets: pressure, tilt (altitude), coalesced samples, hover ring. Once a Pencil is seen, fingers only navigate; broad contacts are ignored as palms.
- Force Touch trackpad: real pressure via Safari's `webkitmouseforcechanged`.
- Mouse: no sensor, so speed and dwell stand in (slow = thicker, holding still pools a drop).
- iPad gestures: two-finger tap undo, three-finger tap redo (in 2D and 3D), pinch to zoom.

## Stone (round 3): Comet Pit and Obsidian
After two of Illustrator's 3D and Materials Substance stones, *Comet Pit Surface* and *Ominous Obsidian*. A third brush, **Stone**, with one procedural shader. Comet Pit is its first preset (plus Ketchup, a glossy red that replaced Obsidian, and Pumice, Moon, Basalt, Meteorite), so the pill gains one button rather than two.
- The relief sits on top of the existing inflate: every layer returns height and its analytic gradient in doc px, added straight onto the inflate's normal (no extra texture taps).
- **Pits:** three octaves of craters (big, mid, pores), each a steep-walled bowl with a raised lip, on a lightly warped lattice so the rims come out lumpy. Floors darken (cavity), and craters bite into the silhouette.
- **Facets:** conchoidal chips. Each Voronoi cell is a gently dished plane with its own tilt, so whole facets flash at once, with faint struck-flint rings. A stretched metric gives elongated chips.
- **Grit:** fine fbm pocking with granular light/dark flecks. **Scale** sizes everything; **Relief** sets depth.
- **Finish:** Lambert body plus a small studio (softbox, long strip, faint card, dark floor) through Fresnel. Gloss sharpens and strengthens it; the dark floor keeps steep walls black on glossy stone.
- GPU gotchas: lattice features use an integer hash, because a float hash of `cell + offset + seed` gets reassociated by Metal's fast-math and clips craters along cell lines. The facet search is 5×5 with a stretch-only metric (≤1.6), for the same reason.
- Source material: Adobe's `.sbsar` files and previews are copied into `dev/materials/` (gitignored, not ours to redistribute). Next: bake their maps in Substance 3D Player, add the Illustrator reference renders to `dev/ref/`, and match in the lab (`?lab=comet` / `?lab=obsidian`).

## Sessions and the floating panel (round 4)
- **Sessions:** every drawing is a session in IndexedDB. The `meta` store holds name, dates, stroke count and a 360px PNG thumbnail; `docs` holds raw strokes plus params, with the background photo as a Blob (it now survives reloads). localStorage keeps only prefs and the open session's id.
- Autosave runs 600ms after each change, plus immediately when the app is hidden. Writes are chained, so switching sessions never interleaves with a save. Thumbnails re-render 1.5s after a save and on open, using the export renderer (`renderCanvas`).
- **Sessions tab:** rename the open session (ghost input), New session, a 2-up thumbnail grid (tap to open; × on hover, or on the open card on touch), and delete with Undo (no confirm). Backup: Save to Files / Open file as `.json`, with the photo inlined.
- Each record stores `v` (format) and `renderer` (shader generation, 3 = stone). Saved sessions re-render with the current shaders by design; `renderer` is there in case an old look ever needs keeping.
- **Migration:** the single localStorage drawing from v1 becomes "Session 1". Prefs aren't rewritten until it's safely in IndexedDB. v1 prefs also take the new shared brush defaults once.
- **Undo history** is per visit and resets when switching sessions.
- **Brush defaults** are now shared by all three brushes (size 37, pressure .84, speed .15, tilt .33, merge .28, pooling .54, wobble .31, smoothing .92, drop ends). Stone starts at Volume 1.75 / Edge 11.
- **Panel:** it floats over the artboard instead of pushing it aside, as see-through frosted glass (38% wash, blur 16). Legibility comes from the backdrop filter (contrast .78, brightness 1.1), darker inks inside the panel and a faint light halo, rather than an opaque fill. Slider tracks are faint frost and the filled part is the bright chip.
- **Adaptive glass:** when what's behind the panel is dark (the board tone, or a photo's average, weighted by how much of the panel the board covers), it switches to smoky dark glass with light text, as in the user's reference.
- **Touch:** palm rejection after Pencil use now needs a contact wider than 90px (it was 44, and Safari reports fingertips at around 40–60px, which silently ate pinches and two-finger taps). The corner readout shows the last touch size, for checking on the iPad.

## Round 5
- **Metal is retired from the pill** (and from B's cycle) until a better metal is built. Its shader and presets stay, so Metal layers in saved sessions still render and stay editable. The first-run demo uses Stone instead.
- **A material chip stays lit after its values are tuned** (the preset name is no longer cleared on edit).
- **Tenmoku retuned:** #111400, Gloss 1, Shine .81, Break .70, Speckle 0, Grain .56. Every slip preset now sets Shine, so switching presets never inherits it.
- **Layer rename:** tap the name of a layer twice (or double-click it) to edit it in place. Enter or tapping away saves, Escape cancels, and it's undoable. Our own tap timing is used because iPad Safari doesn't reliably fire `dblclick`.
- **Session thumbnails** are absolutely positioned inside their 4:3 box. Safari doesn't resolve a % height inside `aspect-ratio`, so a tall drawing's thumbnail grew its card down the panel.

## Round 6: 3D view and model export
- **3D** is a fourth tool in the pill (key `3`). The board glides from its 2D place into a tilted slab and back. At zero tilt the camera puts it exactly where the 2D board sat, so entering and leaving are one continuous move (house expo easing, 850 / 650 ms).
- **Turning:** drag or scroll turns it (±77°), a flick drifts and settles, pinch / ⌘-scroll zooms, two fingers or right-drag / Space-drag move it. The zoom bar's −/+/Fit drive the camera, and Fit returns to the starting angle.
- **Rendering:** each layer is a ~512-cell grid lifted by its own height × Depth, standing on the summed heights of the layers below it (a half-float stack texture). It uses the same material shader as 2D with the real view direction, so gloss and reflections slide as it turns. The light stays fixed in the room while the drawing turns under it. A depth pre-pass from the solid part, then a blended colour pass, keeps soft edges without holes. 4× MSAA, resolved onto the canvas. The board is a slab whose top is the background exactly as in 2D.
- **Geometry height ≠ shading height.** The shading bevel meets the board with a vertical wall, which a grid can't follow: a comb appeared along every tilted stroke. The mesh uses `Hg`, the same form with a finite-slope wall that carries on *below* the board outside the stroke (signed distance), so each triangle crosses zero right at the silhouette.
- **Depth** (1–3×, default 3×) lives in the View tab (Brush becomes View in 3D). It's a view setting, not an undo step.
- **Model export:** STL is a closed, outward-wound tile 120 mm wide with a 3 mm base (for slicers). GLB carries the 2D render as an unlit texture (KHR_materials_unlit), with darker walls via vertex colour; on a Clear board it's the relief alone with an alpha mask. Both read heights back from the GPU (16 bits packed in RGBA8 per layer, summed) and use the current Depth. The export button saves a PNG of the 3D view while in 3D.
- **Phones:** below 440 px the pill's tools are icons only, so four tools plus undo/redo fit.
- Not in the mesh yet: Stone's pits and facets are in the shading only, not the geometry (STL prints them smooth).

## Round 7: solid texture, canvas toggle, a back side
- **Canvas** toggle in the View tab. Off, each stroke gets its mirrored underside and becomes a whole object; the turn (left/right) now goes all the way round in both modes, and the board has a back face.
- **Solid texture in 3D.** The stone relief (craters, chips, grit) and the slip's speckle, lumps and grain are evaluated at the surface's 3D position instead of the drawing's 2D position, so walls, tops and the back are textured alike (the 2D version smeared straight down steep walls like a slit-scan). Craters are spherical bowls in a 3D lattice: a surface passing through one shows a pit of that size. 2D is unchanged; the 3D path is a `MESH` define in the same shader.
- **Lighting in the room's frame:** normals and bumps are turned into camera space, so whichever side faces you is lit and ambient-shaded the way the front is in 2D. Shading uses the round bevel (its normal lies flat at the rim), so the two halves read as one rounded body rather than meeting at a crease.
- Strokes that run off the board close at its edge instead of showing a hollow end. Crater "bite" is off in 3D (it punched holes in the tall walls).
- **Depth** is 1–3× (was 1–12×).
- **Speed** (WebKit on an Apple GPU, 1732×2160, 4× MSAA): switching framebuffers mid-pass made the tiled GPU write out and reload the whole multisampled target per layer, ~10 ms each. The layers' height stacks are now built before the 3D pass, depth is laid down for everything before any shading, the grid is ~7 screen px per cell and only covers each layer's rows, and frames render at 60% while the view moves. Default view ~11 ms (canvas on) / ~16 ms (off); zoomed in 20 / 36 ms.
- Exports are unchanged: STL is still the tile; GLB still carries the flat 2D render as its texture.

## Round 8: close-up, canvas toggle by the 3D button, sturdier taps
- **Close-up rendering.** Zoomed past what a whole-board canvas can hold (the field size is capped by memory), the old canvas was a bitmap magnified by CSS, so 200% looked soft and blocky. Now the canvas leaves the board's size and covers the window at the screen's own resolution, and the material shader draws only the part of the board in view (`uView`). The fields keep their resolution; edges, grit, speckle and glints are shaded per screen pixel. Panning and zooming re-shade the view without rebuilding any field, and an eased zoom covers where it starts as well, so the glide never shows a bare edge. At fit (and anywhere the board canvas is already sharp) nothing changes.
- **Canvas toggle** moved from the View tab to a small chip that rises just above the 3D button while 3D is on (key `C`).
- **Taps:** a tap now counts every finger that came down, not just the most held at once, and a three-finger tap gets a little longer (480 ms) and more slack (20 px), since fingers never land or lift quite together. Taps also work in 3D. With nothing to undo or redo, the toast says so, which shows the gesture was read.

## Round 9: lasso and move, turning the board, duplicating layers
- **Off the board is kept.** Strokes have always been stored as raw samples with nothing clipped at the edge, so whatever runs past the board is still there; the board just doesn't show it. The lasso can now bring it back.
- **Lasso** is a tool (key `L`). Circle something and marching ants mark it; drag inside to move it, anywhere, off the board included. With nothing selected, a tap selects everything in scope (including what sits off the board); a tap elsewhere lets go. `⌫` or the bin in its chip deletes, and `Esc` lets go. The chip over the tool sets the scope: **All** visible layers (default) or the active **Layer**.
- **How a move is stored:** as an op on the layer (`{ at, poly, dx, dy, del }`), not by editing strokes. When a layer is built, every stamp of an older stroke that falls inside the lasso shifts (or is dropped, for a delete). Strokes keep every sample, the sliders still retune moved strokes, and undo is the op list. A stamp goes wholly to one side of the lasso, so a cut closes round, like the liquid it is, rather than a knife edge. While one selection is held, further drags refine the same op instead of stacking new ones; each drag is one undo step.
- **A moved piece is laid on top.** What a move took is rebuilt on its own (a fourth field target) and added at the moment of the move. So erasures it carried only cut it, older erasures where it lands don't touch it, and strokes drawn afterwards sit above it. Layers without moves build exactly as before.
- **Turning the board.** Two fingers twist it like paper on a desk. A pinch rarely twists on purpose, so turning only starts past 7° of twist. Within 8° of upright or a quarter turn it holds there exactly, and letting go near one settles onto it. Safari's trackpad twist works too; `R` / `⇧R` step a quarter turn, and Fit returns upright. Drawing, the brush ring, close-up and the lasso all map through the turn (`screenToDoc`). 3D starts from the upright board.
- **Layers:** swipe a row either way past 56 px to duplicate it ("Duplicate" slides in behind the row); there's also a copy button next to the eye. The copy sits above its twin and comes up selected with the lasso, so the next drag moves only the copy.
- **Colour fields:** a typed hex applies as soon as it's complete, not when the field loses focus, and a native picker closed without a `change` event no longer leaves its edit open. The first tap after using the native picker can still be swallowed by the browser (Chromium's popup, iPad's popover).

## Round 10: the code in pieces
Nothing changed in how the tool looks or works. `index.html` had grown to 3,200 lines, so its code now
lives in `src/`: the markup in `src/page.html`, the styles in seven files, and the app in eighteen, cut at
the section banners it already had. `node dev/build.mjs` joins them back into the same single
`index.html`, which still opens by double-click. The first build reproduced the old file byte for byte;
the only change since is line 2, which says the file is built. `ARCHITECTURE.md` says which file owns
what, and `node dev/build.mjs --check` fails if that map or `index.html` falls out of date.
