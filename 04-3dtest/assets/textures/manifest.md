# assets/textures - manifest

Source: ambientCG (https://ambientcg.com), author Lennart Demes / ambientCG.
License: CC0 1.0. All are the 1K JPG "Color" (albedo) maps from the asset zips,
seamless/tileable, 1024x1024.

| File | ambientCG asset | Download used | What it is |
|---|---|---|---|
| grass_albedo.jpg | Grass001 (https://ambientcg.com/a/Grass001) | https://ambientcg.com/get?file=Grass001_1K-JPG.zip | short green lawn/meadow grass |
| dirt_albedo.jpg | Ground048 (https://ambientcg.com/a/Ground048) | https://ambientcg.com/get?file=Ground048_1K-JPG.zip | brown bare soil / dirt path |
| wood_albedo.jpg | Wood035 (https://ambientcg.com/a/Wood035) | https://ambientcg.com/get?file=Wood035_1K-JPG.zip | rough weathered brown wood, good for log/plank walls |
| wood_normal_gl.jpg | Wood035 NormalGL map | same zip | OpenGL-convention normal map for the wood (Godot uses GL +Y convention - use as-is) |

Only albedo maps were kept (plus the wood normal); roughness/AO/displacement
maps from the zips were discarded to stay in budget. Set uniform roughness
~0.9 in Godot materials instead.
