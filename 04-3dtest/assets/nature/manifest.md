# assets/nature - manifest

Source: Kenney "Nature Kit" 2.1 (330 assets), https://kenney.nl/assets/nature-kit
Direct zip: https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip
Author: Kenney (www.kenney.nl). License: CC0 1.0 (public domain, no attribution required).

All files are self-contained GLB (single binary chunk). Materials are flat solid
colors (base color factors only) - no image textures, no external dependencies.
One mesh per file, mesh named like the file (e.g. "Mesh tree_default").

Approximate size in gltf units, from POSITION accessor min/max union (x, y, z).
Origin is at the trunk/base center, y up, sitting on y=0.

| File | What it is | Size (x, y, z) |
|---|---|---|
| tree_pineTallA.glb | tall pine/spruce, layered cone canopy | 0.39 x 1.53 x 0.39 |
| tree_pineTallB.glb | taller pine/spruce variant | 0.39 x 1.94 x 0.39 |
| tree_default.glb | round-canopy deciduous tree (birch stand-in) | 0.76 x 1.71 x 0.65 |
| tree_thin.glb | slender multi-lobe deciduous tree (birch stand-in) | 0.68 x 1.49 x 0.62 |
| plant_bush.glb | simple low bush | 0.40 x 0.24 x 0.40 |
| plant_bushLarge.glb | larger bush | 0.37 x 0.24 x 0.34 |
| rock_largeA.glb | large boulder (materials: dirt + grass tint) | 0.79 x 0.26 x 1.02 |
| rock_smallA.glb | small rock | 0.36 x 0.19 x 0.36 |
| grass.glb | tall grass tuft cluster | 0.38 x 0.25 x 0.39 |
| grass_large.glb | bigger grass tuft cluster | 0.41 x 0.25 x 0.41 |
| flower_yellowA.glb | yellow flower with leaves | 0.16 x 0.19 x 0.18 |
| flower_purpleA.glb | purple flower with leaves | 0.16 x 0.24 x 0.18 |

Scaling: the kit is built to a ~0.5 unit tile scale, so at 1 unit = 1 m the
trees are only ~1.5-1.9 m tall. Scale trees roughly 4-6x for realistic heights
(pineTallB at 5x = ~9.7 m spruce). Keep one consistent multiplier across this
kit and the KayKit buildings (see assets/buildings/manifest.md) - they are
close in native scale.

Bark colors are generic brown ("woodBark"); for birch, either accept the
stylization or override the trunk material with a whitish base color in Godot
(materials are named, e.g. "woodBark" / "leafsGreen" on tree_thin).
