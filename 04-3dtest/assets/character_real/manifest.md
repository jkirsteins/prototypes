# Realistic character

| Directory | Asset | Author | License | Source |
|---|---|---|---|---|
| monk/ | Monk (model) + Monk animated (animations) | model/rig: CDmir, animations: hwoarangmy | CC-BY-SA 3.0 (animations; base model CC0) | https://opengameart.org/content/monk and https://opengameart.org/content/monk-animated |

Converted from MONK.blend (Blender 2.77) with Blender 4.x: the pre-2.8
Blender Internal materials were rebuilt as Principled BSDF (diffuse + normal
maps preserved, spec/AO dropped), then exported as GLB with all actions.

Facts: 1.75 units tall, 3,942 triangles, 4.4 MB with embedded PNG textures.
Animation clips: Attack1, Die, Flee, Idle, Sad, Sleep, Stand, TortureFire,
Walk. The game maps Idle -> Idle, Walk -> walk synonym, and run uses Flee
via a "flee" synonym in player.gd.

Attribution requirement: CC-BY-SA 3.0 - credit hwoarangmy (animations) and
CDmir (model), and note the license in the README credits.
