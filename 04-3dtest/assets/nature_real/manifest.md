# nature_real - realistic forest assets

Sourced 2026-08-01 for the Godot 4.7.1 web prototype. Total on disk: ~26.7 MB.
Look target: photoreal pine/birch forest at golden hour (reference:
github.com/GamesNotDeveloped/godot-forest-demo).

All glTF folders keep their gltf + .bin + textures/ layout intact so Godot can
import them directly. Y-up. Meters unless noted.

## Trees

### pine_tree_1/ (scene.gltf)
- Source: https://sketchfab.com/3d-models/pine-tree-d45218a3fab349e5b1de040f29e7b6f9
  (obtained via github.com/GamesNotDeveloped/godot-forest-demo, objects/pine-tree-1)
- Author: evolveduk (https://sketchfab.com/evolveduk)
- License: CC-BY-4.0. Required credit (copy verbatim wherever shared):
  This work is based on "Pine Tree" (https://sketchfab.com/3d-models/pine-tree-d45218a3fab349e5b1de040f29e7b6f9)
  by evolveduk (https://sketchfab.com/evolveduk) licensed under CC-BY-4.0
- Triangles: 5,627 (2 meshes). Folder: 4.3 MB
- Textures: Tree_0Mat (trunk) baseColor/normal/metallicRoughness 512x1024 PNG;
  Tree_1Mat (branches) baseColor/normal/metallicRoughness 1024x1024 PNG
- Size: raw geometry is in cm; the scene root applies 0.01 scale, so real size is
  about 2.2 x 2.2 m footprint, 5.3 m tall
- Alpha: branch material Tree_1Mat is alphaMode MASK (photo needle cards),
  trunk OPAQUE

### birch_tree_1/ (scene.gltf)
- Source: https://sketchfab.com/3d-models/tree-bake-upload-4e78d13152cf4214a256230765f6d6d3
  (obtained via github.com/GamesNotDeveloped/godot-forest-demo, objects/birch-tree-1)
- Author: restlessmonkey (https://sketchfab.com/restlessmonkey)
- License: CC-BY-4.0. Required credit (copy verbatim wherever shared):
  This work is based on "Tree Bake Upload" (https://sketchfab.com/3d-models/tree-bake-upload-4e78d13152cf4214a256230765f6d6d3)
  by restlessmonkey (https://sketchfab.com/restlessmonkey) licensed under CC-BY-4.0
- Triangles: 29,010 (2 meshes). Folder: 7.0 MB
- Textures: Leaves_diffuse 2048x2048 PNG (photographed birch leaves),
  Material.002_diffuse 2048x2048 PNG (photo birch bark, baked UV atlas)
- Size: about 5.2 x 4.4 m canopy, 7.4 m tall (root node converts Z-up to Y-up)
- Alpha: Leaves material is alphaMode BLEND, double sided; bark OPAQUE

## Undergrowth

### fern_02/ (fern_02_1k.gltf)
- Source: https://polyhaven.com/a/fern_02 - Poly Haven, author Rico Cilliers
- License: CC0
- Triangles: 6,232 (4 meshes). Folder: 1.7 MB
- Textures: diff+alpha 1024 PNG (baked locally, see note), nor_gl 1024 JPG,
  arm 1024 JPG
- Size: 0.99 x 0.89 m spread, 0.43 m tall
- Alpha: MASK, double sided (photo-scanned frond cards)

### shrub_04/ (shrub_04_1k.gltf)
- Source: https://polyhaven.com/a/shrub_04 - Poly Haven, author James Ray Cock
- License: CC0
- Triangles: 27,327 (1 mesh). Folder: 2.5 MB
- Textures: diff+alpha 1024 PNG (baked locally), nor_gl 1024 JPG, arm 1024 JPG
- Size: 0.58 x 0.15 m spread, 0.22 m tall (small leafy shrub; scale up or
  cluster for bigger bushes)
- Alpha: MASK, double sided

## Rocks

### boulder_01/ (boulder_01_1k.gltf)
- Source: https://polyhaven.com/a/boulder_01 - Poly Haven
- License: CC0
- Triangles: 66,122 (1 mesh). Folder: 5.8 MB
- Textures: diff / nor_gl / arm, all 1024 JPG (lichen-covered granite boulder)
- Size: 1.27 x 1.83 m footprint, 1.0 m tall
- Alpha: none (OPAQUE)

### rock_moss_set_01/ (rock_moss_set_01_1k.gltf)
- Source: https://polyhaven.com/a/rock_moss_set_01 - Poly Haven (pine_forest
  collection, scanned in a pine forest, mossy)
- License: CC0
- Triangles: 63,127 total across 6 separate rock meshes (about 10k each; use
  individually or as a scatter set)
- Textures: diff / nor_gl / rough, all 1024 JPG. Folder: 1.9 MB
- Size: set spans 2.66 x 3.37 m, tallest rock 1.77 m
- Alpha: none (OPAQUE)

## Grass

### grass_medium_01/ (grass_medium_01_1k.gltf) - 3D grass clump
- Source: https://polyhaven.com/a/grass_medium_01 - Poly Haven (pine_forest
  collection), author Rico Cilliers
- License: CC0
- Triangles: 24,730 (17 meshes - blade clusters; instance sparingly or use for
  hero patches near the camera)
- Textures: diff+alpha 1024 PNG (baked locally), nor_gl 1024 JPG, arm 1024 JPG
- Size: 0.32 x 0.33 m clump, 0.34 m tall
- Alpha: BLEND, double sided

### grass_billboard/ - photographic cutout cards for billboard grass
- grass_clump_billboard_01.png 320x155 RGBA (wide dense clump)
- grass_clump_billboard_02.png 209x135 RGBA (upright tuft)
- grass_clump_billboard_03.png 335x108 RGBA (low spreading clump)
- Derived locally from the photo-scanned grass_medium_01 diffuse+alpha atlas
  (Poly Haven, CC0): cropped clump sprites, stray atlas islands erased from the
  alpha. Photographic, not painted. Real-world scale of the source clumps is
  roughly 0.3-0.5 m wide; size cards accordingly.
- License: CC0

## Local modifications
- fern_02, shrub_04, grass_medium_01: Poly Haven's 1k glTF export ships the
  diffuse as JPG even though the material needs an alpha channel (the image is
  even named "diff-..._alpha"), which would render foliage as opaque cards.
  Fixed by downloading each asset's 1k Alpha PNG map from the Poly Haven files
  API, merging it into the diffuse as an RGBA PNG
  (<slug>_diff_alpha_1k.png), and repointing the glTF image entry. The
  original diff JPGs were removed.
- grass_billboard/*.png cropped from grass_medium_01 as described above.

## Rejected during sourcing
- Poly Haven's own trees (pine_tree_01, fir_tree_01, saplings): geometry-nodes
  exports with huge meshes - pine_tree_01 glTF is ~958 MB, even
  pine_sapling_small has a 17.8 MB bin (several hundred k tris). Unusable for a
  web export.
- godot-forest-demo pine-tree-2/3/4: explicitly "low poly" / PS1-style,
  excluded by the no-low-poly requirement.
- grassbushcc008.png from the demo: painted look, 256px; replaced with the
  photo-derived cutouts above.
