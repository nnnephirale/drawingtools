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
