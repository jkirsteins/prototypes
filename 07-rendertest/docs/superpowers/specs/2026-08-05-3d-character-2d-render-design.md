# 07-rendertest: a 3D animated character rendered as a 2D scene

## Purpose

06-dueling draws its fighters from hand-made spritesheets. This prototype
tests the alternative: a rigged, skinned 3D character with baked animations,
rendered so the scene still reads like 06's 2D side view. It is a rendering
experiment only - no combat, no game logic.

Success criteria (the whole goal):

- A mannequin character stands on a visible floor in a side-view scene.
- Holding A/D or the arrow keys walks it left/right with its walk animation,
  foot speed matched to movement speed so the feet do not slide.
- Changing direction flips the character instantly (no turn animation).
- No jump, no other moves.

## Approach

Live three.js rendering with an orthographic camera locked to a straight
side view. The orthographic projection removes perspective convergence, so
the frame reads as a flat 2D scene like 06 while the character itself is a
real skinned mesh. The considered alternative - rendering the model into an
offscreen buffer and blitting frames into a 2D canvas like 06's sprite
pipeline - was rejected: more machinery for the same visual result.

## Asset

`public/models/Xbot.glb`, the gray Mixamo X Bot mannequin vendored from the
three.js examples repository. It ships with `walk` and `idle` clips (plus
others this prototype ignores). Walk plays while moving; idle plays while
standing, because a walk frozen mid-stride reads as broken. Idle is a
rendering-quality choice, not new scope: it is baked into the same file.

Amended same day: a second character, the Quaternius animated knight
(CC0, converted from the user's downloaded FBX pack with FBX2glTF), is
available as `?model=knight`; the mannequin stays the default. Both run
through the same model spec table (file, clip names, measured natural
walk speed).

## Structure

Vite + TypeScript per repo conventions: `base: "/prototypes/07/"`,
`npm test` runs vitest, `npm run build` runs `tsc && vite build`, and the
prototype is linked from `.github/pages-index.html` in the same change.

- `src/movement.ts` - pure state: position, facing, speed from held keys.
  Unit tested (facing persists when keys release, opposing keys cancel,
  position clamps to the visible floor).
- `src/scene.ts` - renderer, orthographic camera, lights, floor, background
  styled after 06 (dark backdrop, flat floor band).
- `src/character.ts` - GLB loading, AnimationMixer, walk/idle crossfade,
  walk `timeScale` tied to movement speed, yaw flip for facing.
- `src/input.ts` - key state tracking.
- `src/main.ts` - wiring and the render loop.

## Verification

`npm test` and `npm run build` pass. Then an end-to-end pass in Chrome via
the devtools MCP: load the dev server, hold the movement keys, and confirm
by screenshot that the character stands on the floor, translates in both
directions, animates while moving, and flips facing.
