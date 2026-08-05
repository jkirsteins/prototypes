# 07 - Rendertest

A rendering experiment: can a rigged, skinned 3D character with baked
animations replace 06-dueling's hand-made spritesheets while the scene
still reads as a 2D side view? No game logic - one mannequin, a floor,
walking left and right.

Spec: `docs/superpowers/specs/2026-08-05-3d-character-2d-render-design.md`.

The character is `public/models/Xbot.glb`, the gray Mixamo X Bot mannequin
vendored from the three.js examples repository. It renders through an
orthographic camera locked to a straight side view, which removes
perspective convergence so the frame reads flat like 06. World units are
the glTF's own meters (~1.8 m mannequin).

## Run

From this directory: `npm run dev`, then open
`http://127.0.0.1:5173/prototypes/07/`.

## Controls

- A / D or arrow keys: walk left / right. The walk clip's timeScale is
  derived from the ground speed so the feet plant without sliding; facing
  flips instantly by design (no turn animation).

`npm test` runs vitest over the pure movement logic; `npm run build` runs
`tsc` then `vite build`.
