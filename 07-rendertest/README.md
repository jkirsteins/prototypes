# 07 - Rendertest

A rendering experiment: can a rigged, skinned 3D character with baked
animations replace 06-dueling's hand-made spritesheets while the scene
still reads as a 2D side view? No game logic - one mannequin, a floor,
walking left and right.

Spec: `docs/superpowers/specs/2026-08-05-3d-character-2d-render-design.md`.

Two characters, picked with `?model=`:

- `xbot` (default) - the gray Mixamo X Bot mannequin vendored from the
  three.js examples repository (`public/models/Xbot.glb`), recolored from
  its baked-in salmon materials to dummy grays.
- `knight` - the Quaternius animated knight (CC0), converted from the
  pack's `KnightCharacter.fbx` with FBX2glTF (the `fbx2gltf` npm package's
  bundled binary) to `public/models/Knight.glb`.

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

## Duel mode

`http://127.0.0.1:5173/prototypes/07/?mode=duel` - a second, separate page
(the walk demo above is untouched by it). One fighter, no opponent logic and
no hit resolution: keys force combat states directly, and each state draws a
curated timestamp of a mocap clip. It answers whether curated timestamps can
read as combat phases as clearly as 06-dueling's hand-picked sprite frames,
under 06's longsword timings copied verbatim.

Add `?markers` to draw the calibration points (blade tip, both grip ends,
left palm) as dots that read through the mesh.

| key | state | what it should look like |
|---|---|---|
| (none) | guard idle | upright, both hands on the hilt at the waist, blade up and forward; the only looping state |
| D / A | step forward / back | one stride of the walk clip scrubbed over 260 ms while the body moves 60 cm; feet slide (measured, not gated) |
| S | void (back hop) | crouch, hop back 100 cm over 320 ms with the feet leaving the floor mid-hop, land and rise |
| J | cut | one continuous swing, every frame in order: the rise slows almost to a stop at the deepest cock (the telegraph), the arc comes over and lands in a deep lunge as the strike resolves, then the follow-through gathers |
| K | thrust | one continuous motion: low guard, vertical cock creeping through the beat, the lunge driving the point 1.05 m forward, then the withdrawal folds back to a hip guard. One-handed: the off-hand is thrown back (the clip, not the rig) |
| L (hold) | parry | crouched guard, both hands on the hilt, blade up and forward in front of the body. Rise and formed look identical - the clip has no rise |
| H | hitstun | struck and thrown back over 350 ms, back over the feet by the end |
| B | bind | two fighters, blades crossed at mid height under pressure; the counterpart is static scenery, not an opponent |
| U | unarmed idle | disarmed: arms at the sides, no sword in hand |
| X | death | settles prone over 900 ms and holds; the sword is hidden rather than run through the floor |
| F | flip facing | mirrors instantly, no turn animation |
| R | reset | back to guard idle from any state |
| Space | pause | freezes the frame loop (the e2e hook steps it by hand) |

Every state that ends into the guard idle winds down through a 150 ms
settle blend rather than snapping - inputs still launch instantly during
it.

The debug line on the floor is the weapon's `reachCm`, 200 cm, copied from
06. The blade tip does not meet it, and that gap is deliberate - see the
report.

- Spec: `docs/superpowers/specs/2026-08-05-combat-anim-poc-design.md`
- Findings and verdict: `docs/superpowers/2026-08-05-combat-anim-poc-report.md`
- Assertions: `node tools/duel-e2e.mjs http://127.0.0.1:5173/prototypes/07/ <shotsDir>`
  against a running dev server. It launches its own headless Chrome, asserts
  the pose contract, saves a screenshot per pose and exits non-zero on any
  failure.
