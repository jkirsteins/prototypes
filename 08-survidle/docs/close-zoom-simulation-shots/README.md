# Close zoom simulation comparison

These images compare the old cosmetic close zooms with the authoritative
50 m simulation that replaces them.

## Fixed scene

- Seed: 21
- Start day: 90
- Game minute: 10
- Old-world player position: x 1068.5, y 312.5
- Old-world region: 2914
- New-world player position: x 373075 m, y 140175 m
- New-world region: 4345
- Browser viewport: 1440 by 900 CSS pixels
- Capture scale: 2
- Baseline commit: `56942580`
- After commit: `d9ed2087`

The baseline was reached through the normal landing controls. The capture
harness selected the first offered survivor, landed, closed the welcome and
goal overlays, used the real zoom controls, and waited for game minute 10.
It did not assign terrain, player position, weather, visibility, map markup,
CSS, or simulation state.

`before-scene.json` and `after-scene.json` record the browser-observed scene
facts. Regenerate the after pair with `npm run dev` in one shell and
`node scripts/close-zoom-shots.mjs` in another; `SHOTS_URL`, `SHOTS_PORT` and
`CHROME_PATH` override the defaults.

## Images

- `before-100m.png`: the old 100 m cosmetic details nested inside 300 m cells.
- `before-50m.png`: the old 50 m cosmetic details nested inside 300 m cells.
- `after-100m.png`: the real 100 m aggregate view.
- `after-50m.png`: the real 50 m patch view.

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

Both after images are built from real 50 m patches. Ground changes from one
glyph to the next: a bog (`n`) runs into birch (`A`) and spruce and pine
(`T`), and the water (`~`) has a stepped, coherent shore rather than a
rectangle. The 50 m image is the 100 m image at twice the scale - the same
shore, bog and forest, each drawn with twice the detail and no repeated nested
parent blocks. The survivor's `@` marker is visible in the same ground in both,
and both carry their own zoom label: `100 m per glyph, 7.2 by 3.6 km` and
`50 m per glyph, 3.6 by 1.8 km`.

Both after images are 1680 by 900 pixels, captured from the same `#map` box at
the same scale. The before pair is 1680 by 812: the map panel is the same width
and position, and is taller now because the close rungs draw the full 72 by 36
board instead of a handful of cells. Nothing else about the capture differs.
