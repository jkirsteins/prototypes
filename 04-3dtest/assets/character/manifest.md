# Character asset manifest

## Source

- Pack: KayKit Character Pack : Adventurers (1.0)
- Author: Kay Lousberg (www.kaylousberg.com)
- License: CC0 (Creative Commons Zero) - see LICENSE.txt in this directory
- Downloaded from: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
  (raw file: addons/kaykit_character_pack_adventures/Characters/gltf/Barbarian.glb)
- Downloaded: 2026-08-01

## Files kept

- `Barbarian.glb` (3.6 MB) - rigged, animated, texture embedded (barbarian_texture, PNG)
- `LICENSE.txt` - pack license text

No external textures needed; everything is inside the GLB.

## Rig

- One skin, 41 joints. Bone names: root, hips, spine, chest, upperarm.l/r,
  lowerarm.l/r, wrist.l/r, hand.l/r, handslot.l/r, head, legs, etc.
- Single scene root node named `Rig`.
- Accessory meshes (1H_Axe, 1H_Axe_Offhand, 2H_Axe, Barbarian_Round_Shield,
  Mug, Barbarian_Hat, Barbarian_Cape) are separate mesh nodes attached to
  hand/head slots - hide the ones you do not want in Godot.

## Scale

- Feet at y=0. Bind-pose world bounding box is about 2.4 units tall, but that
  includes the hat and T-posed arms; the body itself is roughly 1.7-1.9 units
  to the top of the head. Stylized chibi proportions. No import rescale needed
  for a ~1.8 m human scale.

## Animations (76, names exactly as in the GLB)

Movement set most relevant to the prototype:

- `Idle`
- `Walking_A`, `Walking_B`, `Walking_C`, `Walking_Backwards`
- `Running_A`, `Running_B`, `Running_Strafe_Left`, `Running_Strafe_Right`

Full list:

1H_Melee_Attack_Chop, 1H_Melee_Attack_Slice_Diagonal,
1H_Melee_Attack_Slice_Horizontal, 1H_Melee_Attack_Stab, 1H_Ranged_Aiming,
1H_Ranged_Reload, 1H_Ranged_Shoot, 1H_Ranged_Shooting, 2H_Melee_Attack_Chop,
2H_Melee_Attack_Slice, 2H_Melee_Attack_Spin, 2H_Melee_Attack_Spinning,
2H_Melee_Attack_Stab, 2H_Melee_Idle, 2H_Ranged_Aiming, 2H_Ranged_Reload,
2H_Ranged_Shoot, 2H_Ranged_Shooting, Block, Block_Attack, Block_Hit, Blocking,
Cheer, Death_A, Death_A_Pose, Death_B, Death_B_Pose, Dodge_Backward,
Dodge_Forward, Dodge_Left, Dodge_Right, Dualwield_Melee_Attack_Chop,
Dualwield_Melee_Attack_Slice, Dualwield_Melee_Attack_Stab, Hit_A, Hit_B, Idle,
Interact, Jump_Full_Long, Jump_Full_Short, Jump_Idle, Jump_Land, Jump_Start,
Lie_Down, Lie_Idle, Lie_Pose, Lie_StandUp, PickUp, Running_A, Running_B,
Running_Strafe_Left, Running_Strafe_Right, Sit_Chair_Down, Sit_Chair_Idle,
Sit_Chair_Pose, Sit_Chair_StandUp, Sit_Floor_Down, Sit_Floor_Idle,
Sit_Floor_Pose, Sit_Floor_StandUp, Spellcast_Long, Spellcast_Raise,
Spellcast_Shoot, Spellcasting, T-Pose, Throw, Unarmed_Idle,
Unarmed_Melee_Attack_Kick, Unarmed_Melee_Attack_Punch_A,
Unarmed_Melee_Attack_Punch_B, Unarmed_Pose, Use_Item, Walking_A, Walking_B,
Walking_Backwards, Walking_C

## Godot import notes

- Animations are all in this one GLB - no separate animation library file.
- In Godot the imported scene gets an AnimationPlayer; animation names appear
  as listed above (Godot may namespace them under a library, e.g.
  `Barbarian/Idle` or just `Idle` depending on import settings - check the
  AnimationPlayer's list after import).
- In-place animations (no root motion baked into a moving root by default);
  drive locomotion from code.
- Sister characters in the same pack (Knight, Mage, Rogue, Rogue_Hooded) share
  the same rig and animation set, so swapping is trivial.
