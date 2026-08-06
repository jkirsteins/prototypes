# Combat animation PoC: completion report

Spec: `docs/superpowers/specs/2026-08-05-combat-anim-poc-design.md`.
Plan: `docs/superpowers/plans/2026-08-05-combat-anim-poc.md`.

The question the spec set: **can curated timestamps from mocap clips
produce combat phase poses as readable as 06-dueling's hand-picked sprite
frames, under 06's exact timing discipline?**

## Verdict

**Yes, with two named exceptions, and one finding that changes what a
transplant into 06 would have to negotiate.**

The renderer contract holds exactly. Pose is a pure function of combat
state: every phase mark in the timeline lands on the value `pickPose`
computes with no drift, exactly one animation action is ever active, every
action is always paused, and the same `PosePick` reached through different
preceding states produces a **bit-identical** skeleton - the bone-local
comparison across four different histories came back with a maximum
component delta of 0.0, not merely within tolerance.

The attacks PLAY rather than snap (amended after the first playtest, see
"Amendment: continuous playback" below): each phase scrubs its clip
segment across its timeline window, piecewise-linear in elapsed ms, so
the animation moves continuously while the combat marks still land where
the timeline says. The blade arrives at the delivered pose exactly as the
strike resolves; the meetable half of the parry window corresponds to the
first half of the visible travel. The one deliberate hold is the
pre-strike stillness beat - motion stopping is the telegraph.

Readability holds for the cut, the parry, the step, the void, the hitstun,
the bind and the death. Each reads as its phase and each is distinguishable
from its neighbours at a glance. The cut's travelling-to-delivered pair is
a whole lunge apart, which is what makes the closing window visible.

The two exceptions are both properties of the Mixamo catalog, not of the
method:

1. **The parry has no rise.** `great-sword-blocking.glb` holds one crouched
   guard for its entire 0.958 s (hips move 4 mm, blade tip 10 mm). Parry
   rise and parry formed therefore render identically, so `PARRY_FORM_MS`
   has a timing but no visual expression. No timestamp fixes this; it needs
   a second clip or a synthesised blend.
2. **The thrust is one-handed.** All six point-forward clips in the catalog
   were fetched and measured (table below). The best of them, `stabbing-3`,
   is a real lunge with 1.05 m of point drive, and it throws the off-hand
   back: 78.5 cm off the hilt at full extension. No clip in the catalog
   thrusts with both hands on the grip.

And the finding that matters most for a transplant:

3. **The engine's reach and the visible blade tip cannot be reconciled by
   calibration.** 06's longsword has `reachCm` 200. The furthest this clip
   family drives the tip is 1.464 m (cut) and 1.560 m (thrust) with a 1.393 m
   sword - already the top of the longsword band. Closing the gap needs
   about 2.1 m of weapon for the cut and 2.6 m for the thrust: a lance, and
   two different lances. See "The reach divergence" below.

What this does **not** prove is unchanged from the spec: weapon and
character modularity are untested, and 06 is untouched.

## The e2e suite

`tools/duel-e2e.mjs`. Standalone node script, no dependencies. It launches
its own headless Chrome on 9418 (9419 if busy) with a profile under the
shots directory, drives the page over a raw CDP WebSocket, asserts, saves a
screenshot per pose, kills its browser and exits non-zero on any failure.

```
cd 07-rendertest && npm run dev
node tools/duel-e2e.mjs http://127.0.0.1:5173/prototypes/07/ <shotsDir>
```

Result: **143 pass / 0 fail**, 14 measured (ungated) notes.

Determinism comes from `__duel.setPaused(true)` plus `step(ms)`: the frame
loop is driven by hand, so every mark is exact rather than sampled off a
real clock. The curated timestamp table is **restated inside the e2e
script** rather than imported from `poses.ts`, so a wrong table cannot
agree with itself.

### What is asserted, and the values measured

**Pose marks.** 22 marks, each reached by `KeyR` (reset), the state's key,
and one `step()`. At each: `pick()` and `sample()` agree on the clip, the
clip time equals the curated value to 1e-9, exactly one action carries
weight 1 with every other at exactly 0, and every action reports paused.

| mark | clip @ t | ground gate | lowest foot y |
|---|---|---|---|
| idle (step 400) | gsIdle, looping | yes | +0.004 |
| cut 150 rising | gsSlash 0.40 (scrub low..high) | - | +0.006 |
| cut 300 windupHigh | gsSlash 0.50 | - | +0.005 |
| cut 650 still | gsSlash 0.61 (held beat) | yes | +0.005 |
| cut 700 travelling | gsSlash 0.78 (strike starts) | yes | +0.007 |
| cut 890 mid-strike | gsSlash 0.83 (scrubbing) | - | +0.010 |
| cut 1079 delivered | gsSlash 0.8797 (strike resolves) | yes | +0.011 |
| cut 1200 recovery | gsSlash 3.3314 | - | +0.003 |
| cut 1300 recovery | gsSlash 3.3743 | yes | +0.003 |
| thrust 470 still | stab 0.32 (held beat) | - | +0.002 |
| thrust 500 travelling | stab 0.40 (strike starts) | - | +0.003 |
| thrust 630 mid-strike | stab 0.49 (scrubbing) | - | +0.002 |
| thrust 759 delivered | stab 0.5793 (strike resolves) | yes | +0.003 |
| parry 100 rise | gsBlock 0.10 | yes | +0.002 |
| parry 250 formed | gsBlock 0.70 | yes | +0.002 |
| hitstun 200 | gsImpact 0.5386 | yes | +0.004 |
| void 160 mid-hop | dodgeBack 0.60 | no (airborne) | +0.132 |
| void 320 landed | dodgeBack 1.20 | yes | +0.003 |
| step 130 | gsWalk 0.323 | no (scrubbed) | +0.004 |
| bind | gsSlash 0.86 | yes | +0.010 |
| unarmed (step 400) | unarmedIdle, looping | yes | +0.003 |
| death 900 | gsDeath 2.30 | prone, below | +0.010 |

The ground band is 5 cm; the worst gated pose sits 1.1 cm above the floor,
so the whole set clears it by a factor of four. Every foot y is slightly
**positive** - the rig floats a few millimetres rather than sinking, which
is the safer sign at this camera.

**Loop mode.** `pickPose` derives a looping idle's clip time from `timeMs`
(`(timeMs / 1000) % duration`), the same way 06 derives idle frames. Both
loops were checked to advance by exactly 0.500 s over a 500 ms step.

**Death is prone.** `lowestFootY` +0.010 m (gate 0.15) and the highest bone
in the whole skeleton at y 0.451 m (gate 0.7): lying, not standing.

**The void lands.** Mid-hop at 160 ms the lowest foot is 13.2 cm up, which
the spec leaves unconstrained; one millisecond past the hop's 320 ms it is
back to +0.004 m.

**History independence.** Bone-local position, quaternion and scale for all
67 bones, tolerance 1e-4, compared across:

| same pose reached two ways | max component delta |
|---|---|
| cut delivered: ready -> J -> 1000, vs hitstun -> R -> J -> 1000 | 0.0 |
| cut delivered: ready, vs death 900 -> R -> step 130 -> R -> J -> 1000 | 0.0 |
| parry formed: ready, vs void 320 -> L -> 250 | 0.0 |
| bind: ready, vs unarmed 700 -> R -> B | 0.0 |

Exactly zero, because `applyPose` sets every action's weight and the active
action's time explicitly and then advances the mixer with `update(0)`.
Nothing accumulates. Looping idles are excluded from this comparison by
construction: their clip time is a function of a monotonic `timeMs`, so
"the same pose" is not reachable twice within one session. The
state-derived poses above cover the claim.

**Reach and grip** are in their own sections below.

**Console.** Errors, warnings and uncaught exceptions collected from before
navigation, over a 5 s idle after a fresh load, and again after the whole
drive: none in either window.

**Screenshots.** One PNG per asserted mark plus one per drift run, written
to the directory passed as the second argument:

```
01-idle.png                 02-cut-150-rising.png
03-cut-300-windupHigh.png   04-cut-650-still.png
05-cut-700-travelling.png   06-cut-890-midstrike.png
07-cut-1079-delivered.png   08-cut-1200-recovery.png
09-cut-1300-recovery.png    10-thrust-470-still.png
11-thrust-500-travelling.png 12-thrust-630-midstrike.png
13-thrust-759-delivered.png 14-parry-100-rise.png
15-parry-250-formed.png     16-hitstun-200.png
17-void-160-midhop.png      18-void-320-landed.png
19-step-130.png             20-bind.png
21-unarmed.png              22-death-900.png
drift-KeyD.png              drift-KeyS.png
```

The evidence set for this report was written to the session scratchpad at
`<scratchpad>/e2e-final/`; it is regenerated by re-running the command
above, which is why the tool takes the directory as an argument rather than
committing the images.

## Calibration numbers

Solved in tasks 5, 6, 8 and 8b, verified by this suite.

**Fighter.** Xbot normalized to 1.75 m (06's ~175 cm person). 1 cm =
0.01 world m. Clips play in place; `stripRootMotion` zeroes Hips x and z
and keeps y.

**Retarget.** The mocap clips carry Mixamo's own per-bone rest frames;
Xbot's rest pose is identity everywhere. The correct rewrite is
`q'_b = W_p * (q_b * r_b^-1) * W_p^-1` - the pose delta taken in the
**parent's** frame and conjugated into the world frame. Task 8 shipped the
bone-local form `r_b^-1 * q_b`, which is only equal where the source rest
frames are world-aligned. The difference is invisible at the hips and
catastrophic at the wrists, which is exactly where a two-handed grip is
judged. After the fix the rig reproduces the source skeletons' landmark
geometry to a mean 0.10-0.17 cm and a max 0.35 cm.

**Sword.** `public/models/Sword.glb` (Quaternius, CC0). Its own units run
4.353 from pommel to tip; `BLADE_LENGTH_SCALE = 0.32` makes that a
**1.393 m** weapon against the 1.75 m fighter - the top of the spec's
1.0-1.4 m longsword band, chosen there because reach is the scarce
quantity.

**Socket.** Not guessed. The hilt line was measured as right-palm-centre to
left-palm-centre in right-hand-local axes across the great-sword family
(idle 0.54, slash 0.84, block 0.70; the three agree within 18 degrees):

```
GRIP_AXIS          (0.460, 0.014, -0.888)   normalized, right-hand local
BLADE_DIR          -GRIP_AXIS               tip away from the off-hand
BLADE_ROLL         pi/2                     flat toward the side-view camera
GRIP_SEAT          0.50 sword units         right palm just under the crossguard
SWORD_SOCKET_POS   (0.0306, -0.0178, -0.1501) m, right palm group
SWORD_SOCKET_QUAT  (0.2155, 0.4965, 0.6787, 0.4965)
PALM_OFFSET        (0.043, -0.020, -0.008) m, wrist origin to palm centre
```

The roll was swept at 5 degrees and `pi/2` is the all-round best: the
blade's flat faces the camera 0.85 at idle, 0.99 at the cut, 0.60 at the
parry. It cannot serve all three - at `gsBlock` 0.70 the hilt line runs
into the screen, so the parry blade reads as a narrow line. That is where
the clip points the sword, not a constant that can be improved.

**Measured reach** (forward reach = `(tipWorldX - rootWorldX) * facing`,
06's body-centre semantics):

| pose | forward reach |
|---|---|
| cut delivered (gsSlash 0.88) | **1.464 m** |
| thrust delivered (stab 0.58) | **1.560 m** |
| bind contact (gsSlash 0.86) | 1.465 m |
| idle (gsIdle 0.54) | 1.117 m |
| parry formed (gsBlock 0.70) | 0.911 m |

## The reach divergence

The spec's procedure was: solve the blade scale so forward reach lands at
2.00 m, then check the weapon still reads as a longsword. Those two
requirements are not simultaneously satisfiable with this clip family, and
the reason is geometric rather than a calibration failure.

At their most extended frames these clips carry the sword **hand** 0.41 m
(cut) and 0.67 m (thrust) ahead of the hips, and the blade leaves that hand
0.97 (cut) and 0.66 (thrust) aligned with the forward axis. A tip 2.00 m
out therefore needs roughly 2.1 m of weapon for the cut and 2.6 m for the
thrust - two different lances, both far outside the 1.0-1.4 m band the spec
requires the sword to stay inside.

**Ruling (user).** `LONGSWORD.reachCm` stays **200**, copied verbatim from
06 as the transplant contract requires, and the debug reach line is still
drawn at 200 cm so the gap is visible on screen rather than hidden. The
e2e suite asserts the **measured visual reach** instead: 1.464 m at the cut
and 1.560 m at the thrust, each within 2 cm.

This is the PoC's headline transplant finding. 06's measure game - "am I in
range?" - is played against `reachCm`, and a 3D fighter drawn from these
clips would show a blade tip 54 cm short of the number the engine is
adjudicating with. A real transplant has to pick one: retune `reachCm` to
what the animation shows (which changes 06's balance), stage the poses to
reach further (which the catalog will not do), or accept that the reach
line is an abstraction the art does not have to touch. The PoC's job was to
find that out before 06 was edited, and it did.

## Grip findings

Gate: the left palm marker within 10 cm of the hilt's grip segment
(point-to-segment, world space).

| pose | left palm to grip | verdict |
|---|---|---|
| idle | **2.68 cm** | PASS |
| cut delivered | **1.32 cm** | PASS |
| parry formed | **1.69 cm** | PASS |
| bind contact | 1.47 cm | (measured in task 8b) |
| thrust delivered | **78.46 cm** | EXPECTED - one-handed by choreography |

The three two-handed poses pass by a factor of four to eight. The thrust
does not, and the e2e asserts its value at 78.5 cm +/- 8 cm and labels it
EXPECTED rather than gating it: `stabbing-3.glb`'s lunge throws the rear
arm back, which is correct fencing and correct for the clip, and the rig
reproduces the source's own hand separation to within 3%. The spec
anticipated this case - "if the clip family fundamentally separates the
hands, that is a finding for the report, not a silent pass" - and this is
that finding.

It was established by measurement, not by giving up. Every point-forward
clip in the Mixamo catalog was fetched and swept:

| clip | max reach | at clip t | grip there | verdict |
|---|---|---|---|---|
| **stabbing-3** (adopted) | **1.592 m** | 0.50 | 79.5 cm | real lunge in profile, 1.05 m point drive |
| upward-thrust | 1.505 m | 0.95 | 36.9 cm | rising diagonal, windup is one held pose |
| standing-torch-melee-attack-stab | 1.222 m | 1.65 | 81.6 cm | off-hand attack, sword carried at the hip |
| bayonet-stab | 1.207 m | 1.10 | 38.0 cm | only level blade in the field, but it does not travel |
| double-dagger-stab | 0.935 m | 1.60 | 13.2 cm | best grip by far, but the point never faces forward |
| stabbing-2 | 0.553 m | 1.20 | 93.6 cm | off-hand punch with a sword along for the ride |
| stabbing (1st, task 4) | - | - | - | three-quarters to camera, no point-forward frame |

The best two-handed number at a forward frame is `double-dagger-stab`'s
13 cm, on a clip that points the weapon up through its whole high-reach
window. Closing the thrust's grip needs an additive off-hand correction on
the left arm chain, or a clip from outside Mixamo.

## Clips that fought the approach

Everything in this section is an asset finding. None of it is a defect in
the state-sampled-pose method, and all of it would follow the method into
06.

1. **`great-sword-slash.glb` is a four-swing combo, not a cut.** Swing 1
   (0.20-0.95) is the only one that stays on the floor through a full
   cock-and-cleave, so it supplies windupLow through delivered. It has no
   recovery: the frame after its delivery already has the feet 10 cm up and
   by 1.00 s the fighter is airborne. **The recovery pair is therefore
   borrowed from the combo's closing swing** (3.28 -> 3.46), which settles
   into the same guard the clip opens on and so hands off to the idle loop
   without a pop. The 0.88 -> 3.28 jump cut is invisible because `pickPose`
   hard-cuts between every phase anyway; only the recovery lerp has to be
   contiguous, and it is.
2. **`great-sword-blocking.glb` has no rise.** One crouched guard held for
   0.958 s. `PARRY_FORM_MS` (180 ms, 06's `guardShiftMs`) is timed but not
   drawn.
3. **The thrust took four clips to find.** `stabbing.glb` (task 4) stands
   three-quarters to camera with both arms up; `upward-thrust.glb` (task
   7b) lunges upward with a windup that is one held pose; `stabbing-3.glb`
   (task 7c) is the one that works. Its three windup marks are three
   genuinely different poses - low guard, 45-degree rise, vertical cock -
   and its 0.40 -> 0.58 pair moves the point 1.05 m. Its remaining
   weaknesses are the one-handed grip above, about 22 degrees of residual
   rise at the delivered frame, and 40% of the clip being an unused held
   hip guard.
4. **Root-motion y leaks in two clips.** `stripRootMotion` zeroes Hips x
   and z and keeps y, which is right for a crouch and wrong for a fall.
   `great-sword-death.glb` floats 40 cm off the floor at 0.32-0.56 and dips
   74 cm below it at 1.36-1.60; `great-sword-impact.glb` spends its recoil
   20 cm up. The endpoints the state machine actually samples are fine -
   every gated mark in the e2e passes ground contact - but a scrub through
   the middle of the death shows it. A per-clip floor-contact offset would
   fix both at once.
5. **The prop has to be taken away by hand.** The sword follows the right
   hand, so the death pose ran a 1.393 m blade through the floor (tip y
   -0.33) and the disarmed idle stood there still holding what it had just
   lost. `rig.setSwordVisible()` existed and nothing called it. Fixed in
   this task: one conditional in the frame loop hides the sword in the
   `dead` and `unarmed` states. Confirmed in `22-death-900.png` and
   `21-unarmed.png`.
6. **Every great-sword clip carries a forward hunch** when retargeted onto
   Xbot. It is consistent across the family, so it reads as a fighting
   crouch rather than an error, but it is the clips' posture and not a
   choice.

## Foot drift: measured, not gated

The spec exempts the scrubbed locomotion states from the ground-contact
gate and asks for their foot drift to be measured and reported, on the
grounds that 06's sprite scrubbing does not guarantee it either.

Method: the frame loop is unpaused, the key is pressed, and both foot
bones' world x is read from `matrixWorld` on every animation frame until
the state ends. Naming a stance phase by "whichever foot is lower" is
unreliable here - the clip is scrubbed about 2.5x faster than it was
authored for, so the lower foot is often still swinging - so the figure
below is the **slower of the two feet at each frame**, which is the floor
on the skate: if even the better-planted foot is moving, nothing is
planted. The duel page exposes `__duel.rigRoot` for this, exactly as the
walk demo exposes `__character` for its own skate measurement.

| state | frames | best-planted foot travel | mean | peak | body |
|---|---|---|---|---|---|
| step (KeyD, 260 ms over 60 cm) | 31 | 55.1 cm | 220 cm/s | ~450 cm/s | 57.6 cm at 231 cm/s |
| void (KeyS, 320 ms over 100 cm) | 38 | 116.3 cm | 377 cm/s | ~1400 cm/s | 96.4 cm at 312 cm/s |

These are real-time samples, so the frame count and the peak vary by a few
percent between runs; the totals and means repeat to within 0.2 cm.

Read plainly: **neither foot ever plants.** The step's better foot travels
55 cm while the body travels 58 cm, so the feet are essentially carried
along by the root rather than pushing against the ground. The cause is
structural, not a bug: 06's timings are copied verbatim (60 cm in 260 ms =
2.31 m/s), the walk clip is scrubbed over one stride in that window
regardless of what ground speed it was authored for, and nothing ties the
two together. The walk demo in this same prototype does tie them together -
it derives the walk clip's `timeScale` from a measured
`clipNaturalSpeedMS` - and its feet plant.

This is a real cost of the transplant, and it is exactly the parity the
spec asked for: 06's sprites slide too. It is reported rather than gated
because fixing it means either changing 06's step distance and duration to
match the clip, or abandoning "scrub the clip across the state" for the
walk demo's speed-matched playback - and the second breaks the
pose-is-a-pure-function-of-state contract that is the whole point of the
PoC. That trade is a decision for the transplant, not for this PoC.

## What to play, and what would look wrong

Open `http://127.0.0.1:5173/prototypes/07/?mode=duel` and press these in
order. Space pauses; `?markers` adds the calibration dots.

- **J, the cut.** Watch 0-600 ms. The windup must read as a **telegraph** -
  three separated poses (hands past the head, hands high behind, deep cock
  with the knees loaded) that hold still long enough to be answered. Wrong:
  a continuous smear, or a windup you cannot tell from the idle.
- **J again, watching 890 ms.** The travelling-to-delivered swap must read
  as **the window closing** - one frame the blade is mid-arc overhead, the
  next the fighter is in a deep lunge with the blade horizontal on the
  line. Wrong: the two poses looking similar, which would mean a parry
  window with no visual edge.
- **K, the thrust.** The point must drive forward in the picture plane, not
  wave. Correct-but-noted: the off-hand is thrown back, so this is a
  one-handed lunge. Wrong: the point ending up behind the head.
- **B, the bind.** Two bodies, two blades crossed at mid height under
  pressure. Wrong: one fighter frozen alone, or the blades passing through
  each other, or the counterpart standing at the wrong distance.
- **L held, the parry.** Both hands on the hilt, blade up and forward in
  front of the body - a line to catch a cut on. Known: rise and formed look
  identical.
- **A / D / S.** Feet slide (see above). Judge only that the body reads as
  stepping and hopping and lands upright.
- **X, then U.** The body settles prone and the sword is gone; the disarmed
  idle stands empty-handed. Wrong: a blade sticking through the floor or
  out of an empty fist - that was the bug this task fixed.
- **Everywhere:** both hands should be on the hilt except in the thrust,
  the hitstun, the unarmed idle and the death, and the feet should be on
  the floor in every state except the void's mid-hop.

## Gates

- `npm test` 24/24.
- `npx tsc --noEmit` clean.
- `npm run build` clean (the pre-existing >500 kB chunk advisory only).
- `npx biome lint 07-rendertest/src 07-rendertest/tools` from the repo
  root: exits 0 with 26 warnings - 25 `noConsole` in the two tools CLIs and
  1 `noApproximativeNumericConstant` on `poses.ts:19` (`durationS: 2.000`
  flagged as an approximate Math.E).
- `node tools/duel-e2e.mjs <url> <dir>`: 143 pass / 0 fail.

## Amendment: continuous playback (2026-08-06)

The first playtest judged the original renderer's attack cadence "choppy":
faithful to 06's sprite mechanism, windup and strike held a handful of
discrete curated poses and snapped between them. Six pixel-art frames read
as animation; a smooth-shaded mesh teleporting between five poses reads as
dropped frames. The two media do not share this convention.

The remedy keeps every contract and changes only the time mapping in
`pickPose`: windup scrubs low -> high -> still across the rise (the
curated marks became via points), the stillness beat still holds as the
telegraph, and the strike scrubs travelling -> delivered across the whole
strike window, arriving exactly as the strike resolves. Clip time is now
piecewise-linear in elapsed ms instead of piecewise-constant - still a
pure function of state, still applied paused with `mixer.update(0)`,
still bit-identical across histories.

One semantic changed: 06's discrete travelling/delivered swap AT
`parryableUntil` no longer exists. The window's closing is now carried by
the blade's continuous position (the meetable half is the first half of
the visible travel), which trades the sprite renderer's single-frame
legibility cue for physical continuity. A transplant into 06 would keep
the engine's `parryableUntil` untouched; only the visual cue differs.

A side effect worth knowing: each phase plays at the speed its window
dictates, not the speed the mocap was authored at - the cut's strike
covers 0.10 s of clip in 380 ms of sim (about 0.26x), so the swing reads
deliberate rather than ballistic. That is 06's tempo design showing
through, not a bug.

All 143 e2e assertions re-pass at the remapped marks; reach re-measured
1.464 m / 1.559 m at the true delivered instants; grip and history
independence unchanged.
