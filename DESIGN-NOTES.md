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
- iPad gestures: two-finger tap undo, three-finger tap redo, pinch to zoom.

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
