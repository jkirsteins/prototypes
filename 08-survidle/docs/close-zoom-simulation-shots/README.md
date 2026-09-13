# Close zoom simulation comparison

These images compare the old cosmetic close zooms with the authoritative
50 m simulation that replaces them. The after pair now stands on the solved
world main brought in: 300 m arrays of height, water and discharge, refined
into 50 m chunks, so the close ground has rivers and real shores in it.

## Fixed scene

- Seed: 21
- Start day: 90
- Game minute: 10
- Old-world player position: x 1068.5, y 312.5
- Old-world region: 2914
- New-world player position: x 63325 m, y 613775 m
- New-world region: 18849
- Browser viewport: 1440 by 900 CSS pixels
- Capture scale: 2
- Baseline commit: `56942580`
- After commit: `c342e7b0`

The baseline was reached through the normal landing controls. The capture
harness selected the first offered survivor, landed, closed the welcome, field
note and goal overlays, used the real zoom controls, and waited for game
minute 10. It did not assign terrain, player position, weather, visibility, map
markup, CSS, or simulation state. Field notes pause the clock, so the harness
answers them as they arrive; that is the only way the minute passes at all.

`before-scene.json` and `after-scene.json` record the browser-observed scene
facts. Regenerate the after pair with `npm run dev -- --port 5199 --strictPort`
in one shell and `SHOTS_URL=http://127.0.0.1:5199/prototypes/08/ node
scripts/close-zoom-shots.mjs` in another; `SHOTS_URL`, `SHOTS_PORT`,
`SHOTS_PROFILE` and `CHROME_PATH` override the defaults. `SHOTS_PROFILE` names
a Chrome profile to keep, so the world's solve is read from that profile's
IndexedDB instead of being paid again.

## Images

- `before-100m.png`: the old 100 m cosmetic details nested inside 300 m cells.
- `before-50m.png`: the old 50 m cosmetic details nested inside 300 m cells.
- `after-100m.png`: the real 100 m aggregate view on the solved world.
- `after-50m.png`: the real 50 m patch view on the solved world.
- `reach-50m.png`, `reach-100m.png`, `reach-300m.png`: seed 42's river reach at
  the three closest rungs (see below).
- `reach-50m-reload.png`: the closest of those again after a page reload.

The after images use the same seed, start day, game minute, viewport, landing
flow, and zoom controls. World coordinates and region ids differ because the
new 50 m generator deliberately does not preserve old saves or seed layouts.
No application code recognizes or special-cases this scene; a test asserts
that in `tests/close-zoom.test.ts`.

### What the four images show

Both before images are built from 300 m cells. Each cell is a single flat
rectangle of one colour, and the letters inside it are a scattered field that
means nothing: large uniform blocks of water and forest sit edge to edge, and
the same block repeats its own parent colour behind every detail letter. The
50 m before image is the 100 m one with bigger blocks, not more ground - the
shoreline gains no detail, and the survivor's `@` has moved inside a cell it
never left.

Both after images are built from real 50 m patches of the solved world. Ground
changes from one glyph to the next: birch (`Y`) stands with bog (`"`) and rock
(`n`) through it, and the water (`~`) has a stepped, coherent shore that runs
diagonally across the board rather than a rectangle edge. The region outline
steps patch by patch along that ground rather than along 300 m cells. The 50 m
image is the 100 m image at twice the scale - the same shore and the same
stand, each drawn with twice the detail and no repeated nested parent blocks -
and at that rung the shore band itself breaks up into its own patches. The
survivor's `@` is on the shore in both, and both carry their own zoom label:
`100 m per glyph, 7.2 by 3.6 km` and `50 m per glyph, 3.6 by 1.8 km`.

Both after images are 1680 by 900 pixels, captured from the same `#map` box at
the same scale. The before pair is 1680 by 812: the map panel is the same width
and position, and is taller now because the close rungs draw the full 72 by 36
board instead of a handful of cells. Nothing else about the capture differs.

## The river reach, seed 42

Seed 42 has no river within 150 km of its landing, so the reach the terrain
report names - the solved cell at 715, 2160 - can only be seen by standing
somebody on it. `scripts/close-zoom-reach-shots.mjs` does that through the
application's own development doors (`window.survidle.placeAtPatch`, which runs
the ordinary region change and viewshed, and `window.survidle.reveal`, the same
mark the sight pass makes), then presses the real zoom buttons. It needs the
dev server, because those doors exist only in a development build.
`reach-scene.json` records what each capture read.

- `reach-50m.png`: pine forest with a chain of ford marks (`#`) one patch wide
  running north to south past the `@`, river glyphs (`=`) above and below it,
  bog (`"`) patches at the water's edge, and lakes whose edges step patch by
  patch rather than along 300 m lines.
- `reach-100m.png`: the same reach at two patches per glyph. The channel still
  reads as a line, not a block, and the revealed ground ends in fog because the
  survivor has read 2 km around them and no more.
- `reach-300m.png`: one glyph per solved cell. The channel survives as single
  glyphs, and the region outlines run on across the fog.
- `reach-50m-reload.png`: byte for byte the same file as `reach-50m.png`. A
  chunk that refined differently on the second load would differ here.
