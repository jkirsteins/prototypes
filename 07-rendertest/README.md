# 07 - Rendertest

A rendering experiment: can a rigged, skinned 3D character with baked
animations replace 06-dueling's hand-made spritesheets while the scene
still reads as a 2D side view? No game logic - one mannequin, a floor,
walking left and right.

Spec: `docs/superpowers/specs/2026-08-05-3d-character-2d-render-design.md`.

Two characters, picked with `?model=`:

- `knight` (default) - the Quaternius animated knight (CC0), converted
  from the pack's `KnightCharacter.fbx` with FBX2glTF (the `fbx2gltf` npm
  package's bundled binary) to `public/models/Knight.glb`.
- `xbot` - the gray Mixamo X Bot mannequin vendored from the three.js
  examples repository (`public/models/Xbot.glb`), recolored from its
  baked-in salmon materials to dummy grays.

Everything renders through an orthographic camera locked to a straight
side view, which removes perspective convergence so the frame reads flat
like 06. Models are normalized to 1.8 m and their feet rest on y = 0.
Each model's `clipNaturalSpeedMS` (the ground speed its walk clip was
authored for) was measured, not eyeballed: the `__character` e2e hook
samples a foot bone's world x while walking, and the planted-foot drift
during a stance phase is the error in the constant.

## Run

From this directory: `npm run dev`, then open
`http://127.0.0.1:5173/prototypes/07/`.

## Controls

- A / D or arrow keys: walk left / right. The walk clip's timeScale is
  derived from the ground speed so the feet plant without sliding; facing
  flips instantly by design (no turn animation).

`npm test` runs vitest over the pure movement logic; `npm run build` runs
`tsc` then `vite build`.
