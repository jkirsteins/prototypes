# skeletal-renderer: One performance, simulation-locked

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

The 07 renderer investigation concluded and its architecture is proven:
direct live 3D in an orthographic 2D stage, poses deterministically
sampled from simulation time (25 unit tests, a 151-check browser suite,
screenshots inspected at semantic marks). This spec imports that
**architecture** into 06 and defines the production contract around it.
It deliberately does NOT transplant the 07 assets, marker mappings,
timings or constants - section 12's do-not-import list is normative,
not advisory.

The central production model:

> **One uninterrupted authored animation for each attack performance,
> deterministically sampled from simulation time, with semantic
> animation markers aligned to engine timeline marks.**

The animator authors a natural, complete motion first; the engine maps
its timeline marks onto the clip's markers; the simulation remains the
only clock. This preserves the animator's performance while keeping
every visible moment locked to combat timing.

**Delivers:** the 3D orthographic stage, the canonical rig and asset
pipeline, deterministic sampling, the continuous-performance attack
model with source-guard adaptation, engine-conformant root motion, the
freelancer asset contract, and the production acceptance suite.

**Depends on:** `physical-foundations` (reach, grip sockets,
stature), `guard-positions` (its engine and data contract: positions,
`BladeTrack`, timeline marks, movement windows, interruption
outcomes). `grip-switching` follows this spec and consumes section 7.

The order is one-way: `physical-foundations` -> `guard-positions`
(engine and data) -> `skeletal-renderer` -> `grip-switching`. This
spec is `guard-positions`' consumer AND its playtest gate - guards
cannot be played or shipped until this lands, but nothing here blocks
their engine work.

---

## 1. Stage and rig

- Live 3D rendered through an **orthographic camera** into the
  side-view 2D stage: the 07 coordinate convention, flat floor and
  background carry over as architecture.
- **The canonical rig is the Mixamo Xbot** skeleton: its rest pose,
  scale and bone names are the contract every asset is validated
  against. The 07 walking-demo Knight is not part of this spec.
- **Character modularity:** meshes are skinned to the canonical rig,
  or retargeted onto it OFFLINE during asset validation and baked -
  runtime retargeting is not the default pipeline. Poses and
  animations belong to the rig; a new character costs a mesh, never a
  new copy of every animation.
- **The engine owns the fighter root at every tick**; all runtime
  clips are in-place. Every state the engine can occupy - the current
  game's and `guard-positions`' - must be expressible at least as
  legibly as the sprites express theirs today.

## 2. Deterministic sampling: the hard-reset rule

The 07 rule carries over verbatim as contract:

- Animation actions remain **paused**; simulation state and simulation
  time select the clip time.
- Every weight and every clip time is **explicitly set on every
  render**; nothing persists by omission.
- **Rendering history cannot affect the pose** - bone-level history
  independence is an acceptance test, not an aspiration.
- Pausing, tick-stepping, replay and slow motion are exact: the same
  simulation state always renders the same pixels.

## 3. One continuous attack performance

- Each `attack x handling mode x movement mode` has **one canonical
  uninterrupted clip** from start posture to end posture. Windup,
  strike and recovery are semantic REGIONS of that performance, never
  separate clips - `guard-positions` derives their durations, and
  derived timing does not imply fragment assembly.
- Engine marks (`riseStart`, `riseEnd`, `strikeStart`,
  `parryableUntil` = the **full-extension** marker, `strikeEnd`,
  `recoveryEnd`) map onto the clip's semantic markers through a
  **smooth monotonic time warp with declared minimum and maximum
  speed factors**. The 07 piecewise-linear warp, which changes
  playback speed abruptly at an anchor, is the named defect this
  requirement exists to fix.
- **Full extension and contact are different things.** Full extension
  is a fixed timeline mark (`parryableUntil`); CONTACT is a dynamic
  event whose tick depends on the gap and the blade's travel, and at
  close measure it happens EARLIER than full extension. So the asset
  carries a full-extension marker, not a "contact" marker; reach
  equality (section 9) is measured at full extension; and the IK
  correction (below) runs at the actual contact tick, wherever that
  falls.
- **When derived timing falls outside an asset's permitted speed
  range**, the warp does not silently clamp: the manifest declares
  the range, a validation test fails any shipping
  weapon x definition x movement whose derived duration exceeds it,
  and the resolution is an authored **exception clip** for that case
  (or retuning). Out-of-range retiming is as much an asset gap as
  out-of-range pose correction.
- This supersedes the sprite renderer's discrete-pose language: there
  is no pose flip at `parryableUntil`. Readability comes from the
  authored performance hitting its markers exactly at the simulation's
  moments.
- **The blade follows the animated hands.** Where exact meeting is
  required - parry contact, bind entry, the delivered pose - a
  **bounded, deterministic IK/contact correction** conforms the blade
  to the categorical verdict at the tick the engine reports it,
  solved from the CONSTRAINT the engine hands over in
  `RenderSource.contact` (the gap, both blades' extensions at that
  tick, and the line) - never from a solution the engine computed,
  which it cannot. Where that meeting lands along the DEFENDER's blade
  is the renderer's to work out from its own drawn geometry; the
  categorical model does not simulate it. The
  full blade path is never procedurally reconstructed from the scalar
  extension value.

## 4. Source-guard adaptation: no asset explosion

`guard-positions` promises attacks from every guard; this spec
promises complete performances; neither may produce a
`sourceGuard x resultGuard` asset multiplier. The resolution:

- One canonical full animation per `attack x handling x movement`,
  selected by `trajectoryRef + handlingMode + movement` from a
  presentation-side manifest - the combat engine stores no visual
  asset ids. Target height does NOT multiply the clip set: it selects
  the snapshotted launch and terminal positions
  (`guard-positions`' `launchByHeight` / `terminalByHeight`), and the
  same bounded adaptation that fits the clip to its source guard fits
  it to those - validated per height by section 11, with an exception
  clip wherever a height exceeds the correction limits.
- A **smoothly fading pose offset** during the clip's authored
  preparation region adapts its start to the actual source guard; the
  same during its authored exit region reaches the snapshotted
  resulting guard.
- **Strict declared limits** on hand, torso and blade correction
  magnitude bound the adaptation.
- An authored **exception clip** exists only where a guard falls
  outside those limits.

This is one continuous performance with a fading offset - never
stitching attack fragments. The asset budget is a predictable base set
plus a small number of exceptions.

## 5. Interrupted performances

One continuous clip covers the attack that runs to completion.
`guard-positions` preserves several ways a performance ends or changes
early, and each needs its own continuity rule - these are genuinely
interrupted actions, not fragment stitching. In every case the rule is
the same in spirit: **continue from the pose actually on screen**,
never from a canned entry pose.

| interruption | visual rule |
|---|---|
| Redirect (height or side) | Continue smoothly from the currently sampled pose into the redirected trajectory's clip, entering it at the phase-equivalent point. |
| Abandoned feint | Recover from the current sampled pose toward the resulting guard - a fading offset over the recovery region, never a jump to a canned recovery start. |
| Bind entry | The engine freezes the pose and its contact CONSTRAINT (`RenderSource.contact`); the renderer re-solves the conforming IK from that constraint every frame, so the bind, exposed, disarming and disarmed states all draw from real geometry after the attack is gone - without the engine ever storing a pose the renderer computed. |
| Struck | Blend from the actual interrupted pose into hitstun or death; the blend is deterministic and bounded like every other correction. |
| Parried / whiffed recovery | The recovery region is RETIMED within the asset's declared speed range (`parriedPenalty` lengthens it, `whiffRecoveryFactor` multiplies it); out-of-range cases follow section 3's exception-clip rule. |
| Movement truncation | The feet stabilize deterministically between `movementStopped` and the engine's derived plant tick - no teleport, no slide, and the plant is visually on the ground when the footfall sounds. |

Every rule here is deterministic and history-independent: the same
simulation state (including "interrupted at this tick from this pose")
always renders the same pixels, so section 2's guarantees survive
interruption. The `BladeTrack` pose snapshots exist precisely so an
interrupted pose is engine state, not renderer memory.

## 6. Root motion and feet

- The engine owns displacement, but 07's raw clip scrubbing is not
  acceptable: it measured ~55 cm of foot drift during a step and
  116.3 cm during a void, tolerated in the PoC. **Foot drift is a
  failing production test here.**
- Each asset's authored reference root-motion curve and its
  foot-lift/foot-plant markers must match the simulation's
  displacement curve IN NORMALIZED UNITS - fraction of total travel
  against fraction of the window - so one clip serves every weapon
  whose distance and window differ - `guard-positions`' shared step easing and, for
  moving attacks, the movement window between the definition's marks.
  Animation time still derives entirely from simulation progress;
  this strengthens deterministic locking, it does not weaken it.

## 7. Grip switching and locomotion layering

The visual split for concurrent actions (`grip-switching`'s
`handlingTransition` track):

- Attacks: full-body, uninterrupted clips (section 3).
- Grip switching: the engine interpolates the pose as for any
  transition; the renderer draws it with **IK on the hands and arms**,
  layered over the lower body's continuing locomotion - steps and
  voids proceed underneath, as the simulation allows.
- Combined full-body exception animations only where that layering
  fails visual review.

The normal attack animations are never fragmented by this layering.

## 8. Weapon attachment and measured geometry

The 07 concepts carry over; the 07 numbers do not (socket constants,
sword scale and the hips scale factor are asset-specific):

- explicit primary-hand socket; blade-tip marker; grip-segment
  markers; palm markers; measured off-hand distance from the grip;
- attachment reads `physical-foundations`' grip-socket data, so the
  drawn grip and the derived hand separation agree by construction;
- a debug visualization exists for calibration and is never how
  conformance is achieved (section 9).

## 9. Reach and contact conformance

- **Drawn reach at the full-extension marker must equal the derived
  `reachCm`.** 07 measured the failure this rule forbids: engine
  longsword reach 2.00 m against 1.464 m rendered cut reach and
  1.560 m thrust. Production assets pass the measurement, or
  `physical-foundations` recalibrates - explicitly, never silently. A
  debug line hiding the mismatch is not acceptable.
- The exact 07 marker mapping is not imported: it puts a mid-arc pose
  at `parryableUntil` and reaches the delivered pose only at
  `strikeEnd`, which contradicts the engine's extension model. The
  full-extension marker must land on `parryableUntil`, where the
  engine says the blade is fully delivered.
- Rendered blades meet exactly when the categorical engine reports
  contact, and visibly do not when it does not - via section 3's
  bounded correction. This is the obligation the old placeholder
  called the import's hardest burden, and it is demonstrated by the
  section 11 suite, not asserted.

## 10. The asset contract

### 10.1 Attacks

Each delivered attack includes:

- the complete uninterrupted performance, start posture to end
  posture;
- the canonical Xbot skeleton, rest pose, scale and bone names;
- declared handling mode and movement mode;
- semantic markers for `riseStart`, `riseEnd`, `strikeStart`,
  full extension, `strikeEnd`, `recoveryEnd`;
- foot-lift, foot-plant and grip-engagement markers;
- an authored reference root-motion curve, even though the exported
  runtime clip is in-place;
- the natural animation duration and its permitted retiming range;
- the source DCC file, the baked GLB, and a validated marker manifest.

### 10.2 Everything else the engine can render

An attack contract alone does not deliver a renderer. Every remaining
state needs its own assets, mapping and validation rules, and none
ships without them:

| asset group | contract |
|---|---|
| Guard poses | One pose per realization row (sixteen), authored against the row's `primaryHandCm`, `lateral`, `weaponAngleDeg`, `secondaryHandCm` and `torsoProfileDeg`; validated so the rendered geometry matches the row's numbers within declared tolerance. `lateral` matters most: it is the side axis coverage reads, so a pose drawn on the wrong side of the centreline is a guard defending a line the player cannot see it defending - the failure the geometric model exists to prevent. |
| Guard transitions | Not authored per pair (that is the sixteen-squared trap): the ENGINE interpolates the pose (`guard-positions` declares that interpolation normative, because coverage now depends on it) and the renderer draws what it produces over the derived `transitionMs`, with the same bounded correction rules as section 4. Exception clips only where a pair reviews badly. |
| Step / void | In-place locomotion clips, phase-locked to the engine's displacement curve; foot-plant markers required; section 6's drift test applies to these first. |
| Bind, exposed, disarming, disarmed | Rendered from the `BladeTrack`'s `frozen` pose plus the state's own body treatment; the pressure/yield beats need visible motion mapped to the bind's own events. |
| Hitstun, death | Full-body clips entered by the blend rule in section 5; death owns `DEATH_ANIM_MS`. |
| Grip switch | No clip: deterministic interpolation plus IK per section 7. |

### 10.3 Scale and the body

The canonical Xbot authoring height is one number; the RUNTIME body is
not. Skeleton scale, body centre, palm positions and every measured
reach derive from the fighter's `statureCm`
(`physical-foundations`), so a taller fighter is drawn taller and
measures longer through the same assets. Asset-space constants never
become gameplay constants.

### 10.4 Side-view readability

The 07 thrust showed a physically attached blade going nearly
invisible edge-on. The fix must be presentational, never geometric:
an outline, or a minimum screen-space blade thickness. **Rotating the
blade away from its simulated orientation to make it visible is
forbidden** - that would break the contact conformance of section 9.

The animator creates the natural animation first; the engine maps its
timing marks onto the markers. Assets failing manifest validation or
the section 11 measurements do not ship.

## 11. Production acceptance tests

Port the 07 browser suite's structure: exact simulation-time sampling;
independent expected-marker data; bone-level history independence;
frame-to-frame continuity; ground contact; blade reach; off-hand grip;
weapon visibility; clean console; screenshots at semantic marks.

Beyond the PoC, all of these are added and all fail the build when
violated: foot drift; velocity continuity (the smooth time warp's
proof); contact geometry against the categorical verdicts; both
facings; both fighters.

Coverage is a product over the INDEPENDENT axes: **every source
realization (all sixteen - a realization already is position x
handling mode, so handling is not a separate axis) x every target
height x all three movement modes x every weapon x a short stature
range**, for every attack definition. Weapon and stature are real axes,
not decoration: the weapon decides grip-socket geometry and blade
length, stature scales the rig and every measured reach, and section 9's
reach equality has to hold for each combination rather than for a
representative one. Defensive transitions are additionally sampled at
several progress points, not only at their endpoints, since coverage is
now geometric and the mid-travel frames are where a drawn blade and a
derived line can disagree,
plus every interruption branch in section 5 (redirect, abandoned
feint, bind entry, struck, parried and whiffed retiming, movement
truncation). The resulting guard is not a free axis - it is derived
from the definition and the source side - so the suite asserts the
adaptation reaches whatever the derivation yields rather than
enumerating destinations. For each case: correction magnitudes inside
their declared limits, retiming inside the asset's declared range, no
drift, continuity across the interruption tick, and exception-clip
selection where and only where the limits are exceeded. A case that needs an exception clip and
lacks one fails the build - it does not silently over-correct.

## 12. Do not import from 07

- The current Mixamo attack and blocking clips as production assets.
- The invisible parry rise.
- The one-handed thrust used for a two-handed longsword.
- The exact timestamps, socket constants, or the 1.39 m sword scale.
- Measured-but-accepted foot sliding.
- The static second fighter used to illustrate a bind.
- The exact `parryableUntil -> midArc` mapping.
- Runtime retargeting as the default pipeline (offline validate and
  bake against the canonical rig instead).
- The older 07 report passages describing discrete attack poses or an
  invisible recovery jump - superseded by the later contiguous-clip
  amendment, which is the model this spec builds on.
