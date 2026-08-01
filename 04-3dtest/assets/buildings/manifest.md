# assets/buildings - manifest

Source: KayKit "Medieval Hexagon Pack" 1.0,
https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0
(files taken from addons/kaykit_medieval_hexagon_pack/Assets/gltf/buildings/,
red and neutral variants).
Author: Kay Lousberg (www.kaylousberg.com). License: CC0 1.0.

Original distribution is .gltf + .bin + shared hexagons_medieval.png texture
atlas; repacked here into self-contained GLB (texture embedded as a PNG
bufferView, 1024x1024 palette atlas, ~16 KB). No external files needed.
All three GLBs use the same single material/atlas ("hexagons_medieval").

Sizes in gltf units from POSITION min/max, y up.

| File | What it is | Meshes | Size (x, y, z) | Origin note |
|---|---|---|---|---|
| cabin_home_A.glb | small rustic medieval house, wood beams + red roof, no modern features | building_home_A_red | 0.79 x 0.93 x 0.85 | centered on origin, sits on y=0 |
| fence_wood.glb | straight rough wooden fence segment | fence_wood_straight | 0.10 x 0.55 x 1.16 | GOTCHA: mesh is offset to x = -1.05..-0.95 (pivot was a hex-tile center, geometry sits on the hex edge). Runs along z, length ~1.15. |
| fence_wood_gate.glb | wooden fence segment with gate + separate door mesh | fence_wood_straight_door, fence_wood_straight_gate | 1.13 x 0.65 x 1.16 | same edge offset (x ~ -1.07..0.06); door is a separate mesh so it can be rotated open |

Scaling: cabin is ~0.93 units tall to the roof ridge; at the same 4-5x
multiplier suggested for the Kenney nature kit it becomes a ~4 m tall cottage,
which reads correctly next to 5x trees. Fence at 4x is ~2.2 m rail height
posts - consider ~3x for the fences, or sink them slightly.

Not sourced: a true log cabin as ONE model. Kenney's "Holiday Kit" (CC0) has
log-cabin wall/roof modules but no assembled building; Quaternius packs are
behind Google Drive folder links (not scriptable). This KayKit house is the
closest single-model rustic dwelling; alternatively assemble a log cabin from
textured boxes using assets/textures/wood_albedo.jpg.
