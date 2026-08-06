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
timings or constants - section 11's do-not-import list is normative,
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

**Depends on:** `physical-foundations` (reach, grip sockets),
`guard-positions` (positions, timeline marks, movement windows, the
guard track). `grip-switching` consumes section 6. This spec remains
the playtest gate for `guard-positions`: engine and tests may land
first, the game cannot ship visibly without this.

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
- Engine marks (`riseStart`, `riseEnd`, `strikeStart`, the
  contact/full-extension moment, `strikeEnd`, `recoveryEnd`) map onto
  the clip's semantic markers through a **smooth monotonic time warp
  with declared minimum and maximum speed factors**. The 07
  piecewise-linear warp, which changes playback speed abruptly at an
  anchor, is the named defect this requirement exists to fix.
- This supersedes the sprite renderer's discrete-pose language: there
  is no pose flip at `parryableUntil`. Readability comes from the
  authored performance hitting its markers exactly at the simulation's
  moments.
- **The blade follows the animated hands.** Where exact meeting is
  required - parry contact, bind entry, the delivered pose - a
  **bounded, deterministic IK/contact correction** conforms the blade
  to the categorical verdict. The full blade path is never
  procedurally reconstructed from the scalar extension value.

## 4. Source-guard adaptation: no asset explosion

`guard-positions` promises attacks from every guard; this spec
promises complete performances; neither may produce a
`sourceGuard x resultGuard` asset multiplier. The resolution:

- One canonical full animation per `attack x handling x movement`,
  selected by `trajectoryRef + handling mode + movement mode` from a
  presentation-side manifest - the combat engine stores no visual
  asset ids.
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

## 5. Root motion and feet

- The engine owns displacement, but 07's raw clip scrubbing is not
  acceptable: it measured ~55 cm of foot drift during a step and
  113.5 cm during a void, tolerated in the PoC. **Foot drift is a
  failing production test here.**
- Each asset's authored reference root-motion curve and its
  foot-lift/foot-plant markers must match the simulation's
  displacement curve - `guard-positions`' shared step easing and, for
  moving attacks, the movement window between the definition's marks.
  Animation time still derives entirely from simulation progress;
  this strengthens deterministic locking, it does not weaken it.

## 6. Grip switching and locomotion layering

The visual split for concurrent actions (`grip-switching`'s
`handlingTransition` track):

- Attacks: full-body, uninterrupted clips (section 3).
- Grip switching: **deterministic hand/arm/torso interpolation plus
  IK**, layered over the lower body's continuing locomotion - steps
  and voids proceed underneath, as the simulation allows.
- Combined full-body exception animations only where that layering
  fails visual review.

The normal attack animations are never fragmented by this layering.

## 7. Weapon attachment and measured geometry

The 07 concepts carry over; the 07 numbers do not (socket constants,
sword scale and the hips scale factor are asset-specific):

- explicit primary-hand socket; blade-tip marker; grip-segment
  markers; palm markers; measured off-hand distance from the grip;
- attachment reads `physical-foundations`' grip-socket data, so the
  drawn grip and the derived hand separation agree by construction;
- a debug visualization exists for calibration and is never how
  conformance is achieved (section 8).

## 8. Reach and contact conformance

- **Drawn reach at the delivered/contact marker must equal the
  derived `reachCm`.** 07 measured the failure this rule forbids:
  engine longsword reach 2.00 m against 1.464 m rendered cut reach
  and 1.560 m thrust. Production assets pass the measurement, or
  `physical-foundations` recalibrates - explicitly, never silently. A
  debug line hiding the mismatch is not acceptable.
- The exact 07 marker mapping is not imported: it puts a mid-arc pose
  at `parryableUntil` and reaches the delivered pose only at
  `strikeEnd`, which contradicts the engine's extension and contact
  meaning. The contact/full-extension marker must land where the
  engine says the blade is delivered.
- Rendered blades meet exactly when the categorical engine reports
  contact, and visibly do not when it does not - via section 3's
  bounded correction. This is the obligation the old placeholder
  called the import's hardest burden, and it is demonstrated by the
  section 10 suite, not asserted.

## 9. The asset contract

Each delivered attack includes:

- the complete uninterrupted performance, start posture to end
  posture;
- the canonical Xbot skeleton, rest pose, scale and bone names;
- declared handling mode and movement mode;
- semantic markers for `riseStart`, `riseEnd`, `strikeStart`,
  contact/full-extension, `strikeEnd`, `recoveryEnd`;
- foot-lift, foot-plant and grip-engagement markers;
- an authored reference root-motion curve, even though the exported
  runtime clip is in-place;
- the natural animation duration and its permitted retiming range;
- the source DCC file, the baked GLB, and a validated marker manifest.

The animator creates the natural animation first; the engine maps its
timing marks onto the markers. Assets failing manifest validation or
the section 10 measurements do not ship.

## 10. Production acceptance tests

Port the 07 browser suite's structure: exact simulation-time sampling;
independent expected-marker data; bone-level history independence;
frame-to-frame continuity; ground contact; blade reach; off-hand grip;
weapon visibility; clean console; screenshots at semantic marks.

Beyond the PoC, all of these are added and all fail the build when
violated: foot drift; velocity continuity (the smooth time warp's
proof); contact geometry against the categorical verdicts; both
facings; both fighters; every handling mode; all three attack
movement modes.

## 11. Do not import from 07

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
