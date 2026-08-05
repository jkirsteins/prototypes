# 07-rendertest: combat animation proof of concept

## Purpose

Answer the one question the Mixamo catalog research could not: can curated
timestamps from mocap clips produce combat phase poses as readable as
06-dueling's hand-picked sprite frames, under 06's exact timing discipline?
If yes, this renderer is conceptually transplantable into 06: swap
`render/draw.ts`'s sprite blitting for this, keep the combat engine as is.

One fighter, no opponent, no hit resolution. Keys force state transitions
directly. Success is judged the repo way: the numbers are asserted by
machine, the readability by the user playing it.

## Constraints carried over from 06 (the transplant contract)

- **Pose is a pure function of combat state.** No free-running animation
  during combat states: `pickPose(state, timeMs)` returns
  `{ clip, clipTime, mode: "held" | "loop" }` exactly as 06's `pickFrame`
  returns `{ sheet, frame, flip }`. Loops are only where 06 loops (idles).
- **The same `AttackTimeline`.** Seven fields, same names (`riseStart`,
  `riseEnd`, `strikeStart`, `parryableUntil`, `strikeEnd`, `recoveryStart`,
  `recoveryEnd`), absolute ms from attack start, snapshotted at launch.
- **Timings copied verbatim from 06's longsword**: cut 600/100/380/420,
  thrust 440/60/260/300 (windup/beat/strike/recovery), `PARRYABLE_FRACTION`
  0.5, step 260 ms, void 320 ms, hitstun 06's `HIT_STUN_MS`, death 06's
  `DEATH_ANIM_MS`. Rapier is a data swap and is NOT built.
- **The strike contract**: the pose swaps from "travelling" to "delivered"
  exactly at `parryableUntil` - the visual is the parry window.
- **The bind copes like 06 copes**: no bind animation exists anywhere; the
  fighter freezes at a curated contact timestamp (mixer paused), exactly as
  `pickBindFrame` freezes on a contact frame.
- **The engine owns position.** All clips play in place; root motion is
  stripped or downloaded as in-place. World x comes from the state layer.
- **Units**: 1 cm = 0.01 world m. The fighter normalizes to 1.75 m (06's
  ~175 cm person). Longsword reach 200 cm = tip at 2.00 m from body center.

## States in scope

Everything 06's `pickFrame` renders, driven by keys:

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

## Architecture

- `src/duel/timings.ts` - the timing table and `AttackTimeline` builder,
  field-for-field 06's `weapons.ts` shapes, longsword numbers.
- `src/duel/states.ts` - minimal state machine (the PoC stand-in for 06's
  fighter): key events enter states, elapsed ms advances them, attacks walk
  their timeline phases. Pure, vitest-covered.
- `src/duel/poses.ts` - THE artifact: `pickPose(state) -> PosePick` with a
  curated timestamp table per clip (the 3D analogue of `ATTACK_FRAMES`).
  Pure, vitest-covered at every boundary (rise midpoint, riseEnd,
  parryableUntil inclusive/exclusive, recovery span, death clamp).
- `src/duel/rig.ts` - applies a PosePick to the AnimationMixer (action
  selection, `action.time`, paused vs playing), attaches the sword prop
  (the knight pack's Sword mesh) to the right-hand bone, exposes the blade
  tip marker.
- `src/duel/main-duel.ts` - wiring; reached via `?mode=duel` from main.ts.
  The walk demo stays the default page, untouched.
- Clips: each Mixamo animation ships as its own small without-skin GLB in
  `public/models/clips/`; tracks bind to Xbot's `mixamorig` bones by name.
  Xbot stays the only skinned model. Knight mode is irrelevant here.

## Clip acquisition (automated, login delegated)

`tools/mixamo-fetch.mjs` (committed, rerunnable): I open mixamo.com in
Chrome via devtools automation, the user logs in (credentials, captchas,
account are the user's alone - never automated). The script then reads the
session's bearer token and drives Mixamo's own export API per clip: request
FBX export (in place where the option exists, without skin), poll until
ready, download. Each FBX converts with the same FBX2glTF binary used for
the knight. Shopping list: Great Sword Idle, Great Sword Walk, Great Sword
Slash, Great Sword Blocking, Great Sword Impact, Standing Dodge Backward,
Stabbing, Unarmed Idle, Two Handed Sword Death.

## Reach calibration (in scope, with its consequence handled)

06's measure game requires the visual blade tip to agree with the weapon's
`reach`. Calibration procedure:

1. A tip marker sits at the blade end of the sword prop.
2. At each delivered pose (cut and thrust), the e2e hook reads the tip's
   world x offset from body center.
3. The blade scale is solved so the tip lands at 2.00 m (200 cm reach).
   A floor line at reach is drawn (debug overlay) so the tip visibly
   meets it.
4. **The consequence is part of the loop**: after solving, screenshots of
   both delivered poses are examined. The sword must still read as a
   longsword - total length in the 1.0-1.4 m band against the 1.75 m
   fighter, and visually neither stubby nor lance-like. If it fails, the
   delivered-pose timestamp is re-curated (more or less arm extension) and
   the scale re-solved, until BOTH the numeric assert and the visual check
   pass. The final calibration numbers (timestamp, scale, measured tip x)
   are recorded in the completion report.

## Verification

- vitest: `states.ts` transitions; `poses.ts` boundary exactness (the
  parryableUntil swap above all); timing table equals 06's values.
- e2e in Chrome devtools (or the headless CDP fallback): for each state,
  trigger via key event, sample the hook at timeline marks to assert the
  active clip, clipTime and paused flag are exactly what `pickPose` says;
  screenshot every phase pose; assert feet grounded (band contact),
  tip-at-reach within 2 cm at delivered poses, console clean.
- Final human gate, per repo convention: a short "what to play and what
  would look wrong" list - windup stillness must read as a telegraph, the
  travelling-to-delivered swap must read as the window closing, the bind
  freeze must read as pressure and not a glitch.

## Non-goals

Two fighters, hit detection, HUD, audio, the rapier, weapon switching,
transplant itself (06 is untouched by this work).
