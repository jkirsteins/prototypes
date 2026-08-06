# 07-rendertest: combat animation proof of concept

## Purpose

Answer the one question the Mixamo catalog research could not: can curated
timestamps from mocap clips produce combat phase poses as readable as
06-dueling's hand-picked sprite frames, under 06's exact timing discipline?

What a pass proves: phase-pose readability and the renderer contract
(state-sampled poses driven by 06's timeline shapes) - enough to transplant
the RENDERING approach into 06 by replacing `render/draw.ts`'s sprite
blitting while keeping the combat engine as is. What it does not prove:
weapon/character modularity (a second handling family, prop swapping, other
skins). Those claims wait for their own evidence.

One fighter, no opponent logic, no hit resolution. Keys force state
transitions directly. Success is judged the repo way: numbers asserted by
machine, readability by the user playing it.

## Constraints carried over from 06 (the transplant contract)

- **Pose is a pure function of combat state.** No free-running animation
  during combat states: `pickPose(state, timeMs)` returns
  `{ clip, clipTime, mode: "held" | "loop" }` exactly as 06's `pickFrame`
  returns `{ sheet, frame, flip }`. `timeMs` exists only for looping idles,
  as in 06. Loops are only where 06 loops (idles).
- **No animation-system state may leak between frames.** rig.ts applies a
  PosePick by hard reset: exactly one action active at weight 1, its time
  set explicitly, EVERY action paused always - looping picks do not run
  free either; their clipTime is computed from timeMs in pickPose
  (`(timeMs / 1000) % clipDuration`, exactly how 06 derives idle frames
  from timeMs) and the mixer is advanced with `mixer.update(0)` so dt
  never moves a pose. The same PosePick must produce the same skeleton
  regardless of what played before; e2e proves it by comparing sampled
  bone transforms relative to the fighter root after reaching the same
  PosePick via different preceding states, not by action weights alone.
- **The same `AttackTimeline`.** Seven fields, same names (`riseStart`,
  `riseEnd`, `strikeStart`, `parryableUntil`, `strikeEnd`, `recoveryStart`,
  `recoveryEnd`), absolute ms from attack start, snapshotted at launch.
- **Timings and distances copied verbatim from 06's longsword**: cut
  600/100/380/420, thrust 440/60/260/300 (windup/beat/strike/recovery),
  `PARRYABLE_FRACTION` 0.5, step 260 ms over 60 cm, void 320 ms over
  100 cm (both linearly interpolated per tick, as 06's fighter.ts does),
  hitstun 350 ms, death 900 ms. Rapier is a data swap and is NOT built.
- **The strike contract**: the travelling pose is retained while
  `elapsedMs <= parryableUntil` and swaps to delivered immediately after -
  the same inclusive boundary as 06's frames.ts. The visual is the parry
  window.
  (Amended 2026-08-06 after the first playtest: attacks now PLAY - each
  phase scrubs its clip segment across its timeline window,
  piecewise-linear in elapsed ms, with the blade arriving at delivered as
  the strike resolves and the stillness beat still held as the telegraph.
  The discrete swap is gone; the window's closing reads from the blade's
  continuous position. Pose purity is unchanged. See the completion
  report's "Amendment: continuous playback".)
- **The engine owns position, facing and displacement.** All clips play in
  place; states.ts owns x and facing and applies step/void displacement
  over the state's duration. Root motion in clips is stripped or
  downloaded as in-place.
- **Units**: 1 cm = 0.01 world m. The duel fighter normalizes to 1.75 m
  (06's ~175 cm person) via a target-height parameter on the loader; the
  walk demo keeps its existing 1.8 m default untouched.

## States in scope

06's `pickFrame` branches, driven by keys. Two branches have no separate
trigger because they add no new renderer evidence: `disarming` and
`exposed` both render as a held contact pose - the identical
paused-timestamp mechanism the bind freeze (B) demonstrates. The coverage
claim is: every DISTINCT pose mechanism in `pickFrame` is exercised;
disarming/exposed are covered by the bind's mechanism, not by their own
keys.

| state | trigger | clip source |
|---|---|---|
| guard idle (ready) | default | Great Sword Idle, looping |
| step fwd/back | A / D | Great Sword Walk, scrubbed over 260 ms |
| void (back-hop) | S | Standing Dodge Backward, scrubbed over 320 ms |
| cut (windup/strike/recovery) | J | Great Sword Slash, curated timestamps |
| thrust (windup/strike/recovery) | K | Stabbing, curated timestamps |
| parry rise / formed / release | L hold | Great Sword Blocking |
| hitstun | H | Great Sword Impact, scrubbed |
| bind freeze | B | paused contact timestamp of Slash |
| unarmed idle (disarmed) | U | Unarmed Idle, looping |
| death | X | Two Handed Sword Death, scrubbed once, holds last pose |
| reset | R | back to guard idle |

**The bind is staged as a bind.** A lone fighter frozen mid-slash cannot
read as pressure. B also places a static counterpart: a second, mirrored
Xbot instance frozen at the complementary contact timestamp, positioned so
the blades meet. No opponent logic - it is scenery, the visual condition
the bind gate needs. In 06 this reading comes from two opposed bodies; the
PoC reproduces that condition or the gate would be untestable.

## Architecture

- `src/duel/timings.ts` - the timing/distance table and `AttackTimeline`
  builder, field-for-field 06's `weapons.ts` shapes, longsword numbers.
- `src/duel/states.ts` - minimal state machine (the PoC stand-in for 06's
  fighter): key events enter states, elapsed ms advances them, attacks walk
  their timeline phases, step/void apply displacement. Owns x and facing.
  Pure, vitest-covered.
- `src/duel/poses.ts` - THE artifact: `pickPose(state, timeMs) -> PosePick`
  with a curated timestamp table per clip (the 3D analogue of
  `ATTACK_FRAMES`). Pure, vitest-covered at every boundary (rise midpoint,
  riseEnd, parryableUntil inclusive/exclusive, recovery span, death clamp).
- `src/duel/rig.ts` - applies a PosePick to the AnimationMixer under the
  hard-reset rule, attaches the sword prop to the right-hand bone, exposes
  the blade tip and grip markers.
- `src/duel/main-duel.ts` - wiring; reached via `?mode=duel` from main.ts.
  The walk demo stays the default page, untouched.
- Sword prop: the Quaternius pack's separate `FBX/Sword.fbx` (CC0),
  converted with FBX2glTF to `public/models/Sword.glb` and committed.
- Clips: each Mixamo animation ships as its own small without-skin GLB in
  `public/models/clips/`, committed; tracks bind to Xbot's `mixamorig`
  bones by name. Xbot stays the only skinned model in duel mode.

## Clip acquisition (automated attempt, manual fallback, committed result)

`tools/mixamo-fetch.mjs` (committed, rerunnable): I open mixamo.com in
Chrome via devtools automation, the user logs in (credentials, captchas,
account are the user's alone - never automated). The script reads the
session's bearer token and drives Mixamo's export flow per clip: request
FBX export (in place where the option exists, without skin), poll, download.

This rides an undocumented API, so it is a convenience, not a dependency:
the supported fallback is the user clicking Download in Mixamo's UI with
the same settings and dropping the FBX files in Downloads. Either way the
FBX conversion runs once, offline, with fbx2gltf@0.9.7-p1 (pinned), and
the RESULTING GLBs are committed - the build never re-fetches or
re-converts, so reproducibility comes from git, not from Mixamo.

Shopping list: Great Sword Idle, Great Sword Walk, Great Sword Slash,
Great Sword Blocking, Great Sword Impact, Standing Dodge Backward,
Stabbing, Unarmed Idle, Two Handed Sword Death.

## Reach calibration (in scope, with its consequence handled)

06's measure game requires the visual blade tip to agree with the weapon's
`reach`. Definitions first:

- **Measure origin**: the fighter root node's world x - the same value
  states.ts owns as x, i.e. 06's body-center semantics.
- **Forward reach**: `facing * (tipWorldX - rootWorldX)`. Signed by
  facing so it is correct after flips; y and z do not contribute (06's
  reach is horizontal).

Procedure:

1. A tip marker sits at the blade end of the sword prop; grip markers sit
   at both ends of the hilt's grip segment.
2. At each delivered pose (cut and thrust), the e2e hook reads forward
   reach as defined above.
3. The blade scale is solved so forward reach lands at 2.00 m (200 cm).
   A floor line at reach is drawn (debug overlay) so the tip visibly
   meets it.
4. **The consequence is part of the loop**: after solving, screenshots of
   both delivered poses are examined. The sword must still read as a
   longsword - total length in the 1.0-1.4 m band against the 1.75 m
   fighter, and visually neither stubby nor lance-like. If it fails, the
   delivered-pose timestamp is re-curated (more or less arm extension) and
   the scale re-solved, until BOTH the numeric assert and the visual check
   pass. Final numbers (timestamp, scale, measured reach) go in the
   completion report.

## Two-handed grip verification

Great Sword clips are two-handed; the prop follows the right hand only.
Xbot's `mixamorig` hand bones originate at the wrists, so raw bone origins
cannot measure a grip. Definitions:

- **Palm markers**: one calibrated child node under each hand bone, offset
  from wrist to palm center; the offsets are set once during rig setup and
  confirmed by screenshot (marker rendered as a debug dot in the palm).
- **Sword socket**: the prop parents to the right hand via an explicit
  local transform (position + rotation), calibrated so the hilt lies in
  the right palm across the curated poses - parenting alone guarantees
  nothing about visual alignment, so the socket transform is itself a
  calibrated, recorded value.
- **Grip segment**: two markers at the ends of the hilt's grip section, in
  the sword's local space.

At every curated non-unarmed pose, the e2e hook measures the LEFT palm
marker's distance to the grip segment (point-to-segment, world space).
Gate: within 10 cm at attack and parry poses (mocap hands are not exact),
and the screenshots are examined for a visibly floating off-hand. If a
pose fails, its timestamp is re-curated; if the clip family fundamentally
separates the hands, that is a finding for the report, not a silent pass.

## Verification

- vitest: `states.ts` transitions and displacement; `poses.ts` boundary
  exactness (the parryableUntil swap above all); timing table equals 06's
  values.
- e2e in Chrome devtools (or the headless CDP fallback): for each state,
  trigger via key event, sample the hook at timeline marks to assert the
  active clip, clipTime, paused flag AND that exactly one action has
  weight 1 with all others at 0 (the contract's single-action rule,
  verified directly); prove history independence by sampling bone
  transforms RELATIVE TO THE FIGHTER ROOT (local position/quaternion/
  scale per bone, small numeric tolerance) after reaching the same
  PosePick via at least two different preceding states and asserting
  equality - root-relative because world transforms include the
  engine-owned position and facing; screenshot every phase pose;
  tip-at-reach within 2 cm at delivered poses; grip gate as above;
  console clean.
- **Ground contact is per state**, not uniform: idle/windup/strike/
  recovery/parry/bind/unarmed require a support foot on the band (lowest
  foot bone within tolerance of y = 0); void may be airborne mid-hop but
  must land; death must END in ground contact (prone); steps are not
  gated (scrubbed locomotion, parity with 06's sprites). Step/void foot
  drift is measured and reported, not gated - 06's sprite scrubbing does
  not guarantee it either, and parity is the standard here.
- Final human gate, per repo convention: a short "what to play and what
  would look wrong" list - windup stillness must read as a telegraph, the
  travelling-to-delivered swap must read as the window closing, the bind
  scene must read as two blades in pressure, not a glitch.

## Non-goals

Opponent logic, hit detection, HUD, audio, the rapier, weapon or character
modularity claims, transplant itself (06 is untouched by this work).
