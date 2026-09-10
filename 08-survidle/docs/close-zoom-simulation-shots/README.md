# Close zoom simulation comparison

These images compare the old cosmetic close zooms with the authoritative
50 m simulation that replaces them.

## Fixed scene

- Seed: 21
- Start day: 90
- Game minute: 10
- Old-world player position: x 1068.5, y 312.5
- Old-world region: 2914
- Browser viewport: 1440 by 900 CSS pixels
- Capture scale: 2
- Baseline commit: `56942580`

The baseline was reached through the normal landing controls. The capture
harness selected the first offered survivor, landed, closed the welcome and
goal overlays, used the real zoom controls, and waited for game minute 10.
It did not assign terrain, player position, weather, visibility, map markup,
CSS, or simulation state.

`before-scene.json` records the browser-observed scene facts.

## Images

- `before-100m.png`: the old 100 m cosmetic details nested inside 300 m cells.
- `before-50m.png`: the old 50 m cosmetic details nested inside 300 m cells.
- `after-100m.png`: reserved for the real 100 m aggregate view.
- `after-50m.png`: reserved for the real 50 m patch view.

The after images must use the same seed, start day, game minute, viewport,
landing flow, and zoom controls. World coordinates and region ids may differ
because the new 50 m generator deliberately does not preserve old saves or
seed layouts. No application code may recognize or special-case this scene.
