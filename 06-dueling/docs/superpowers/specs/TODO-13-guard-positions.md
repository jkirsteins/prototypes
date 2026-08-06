# guard-positions: Guards as the source of truth

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

Today defense is an abstract parry mode: a held button raises a guard in
a line, stance keys pick the height, and the blade's actual position is
implied. This spec replaces that abstraction with its physical original:
**named guard positions are the single source of truth** for where the
blade is, what it covers, what it threatens, and what any change costs.

- A fighter is always in (or transitioning between) specific guard
  positions - Right Ochs, Vom Tag, Left Pflug, Alber, Langort/Terza.
- **Coverage is derived from the position's geometry.** There is no
  separate parry state to maintain. Steel-on-steel contact itself,
  however, stays decided by the existing categorical line model -
  section 4 makes that choice explicit.
- **A parry is an event, not a mode:** an attack arriving on a line the
  formed guard covers, or the defender reaching the covering guard in
  time. Changing guard IS the defensive action.
- **Transitions have physical travel times** derived from the distance
  between postures and the weapon's handling (`physical-foundations`).
- **Attacks originate from the current guard** and are transitions
  themselves: current guard -> launch configuration -> contact pose ->
  resulting guard. Preparation is the visible travel, never an
  unrelated cost placed on top.
- Guard data is **data-driven** (JSON), so the roster and geometry are
  updatable without touching engine code.

The historical guard names are used as authored data rows, never as
identity: every consequence derives from the row's geometry plus the
weapon's physical facts plus the fighter. Suitability (a rapier thrives
in Terza, a longsword merely manages) must emerge from those numbers -
the emergent-outcomes rule. Availability is universal past the
`physical-foundations` gates: recommended pairings affect suitability,
not availability.

**Delivers:** guard data model and JSON file, coverage derivation,
transition derivation (replacing seven authored timing fields), attack
definitions as data with addressable terminal configurations and
data-resolved resulting guards, the fighter's blade track, moving
attacks as snapshotted combined actions, parry as event, attacks as
transitions, repurposed inputs, AI guard play, help rewrite, the
suitability matrix test, re-proven tempo economics.

**Depends on:** `physical-foundations` (attributes, handling modes,
control torque, inertia, strain), `preparation-and-readiness`,
`held-guard`, `attack-lines` (whose mechanics this spec re-founds).

**`skeletal-renderer` is NOT a dependency - it is this spec's
consumer, and its playtest gate.** This spec lands first and defines
the engine and data contract the renderer consumes; the renderer then
makes it visible. The one non-negotiable consequence of that order is
that **`guard-positions` must not be declared done, and must not be
playtested or shipped to the player, until the renderer lands** - the
sprite pack cannot draw Ochs, Alber, guard transitions, one-handed
realizations or per-weapon blades. Engine, data and tests may (and
should) be green well before then.

---

## 1. Concepts and composition

```
Weapon         supplies length, mass distribution, hilt geometry, grip room
Handling mode  supplies hand count, grip locations, arm arrangement
Guard position supplies blade position, point direction, side, height, coverage
Body stance    supplies lead foot, weight, width (FUTURE - baked in for now)

weapon + handling mode + guard position (+ stance) = complete posture
```

A **guard family** (`ochs`, `vomTag`, `pflug`, `alber`, `longpoint` -
geometric keys, never a tradition's word) is a reusable concept
independent of the equipped weapon. A **specific guard
position** is family x side variant (Right Ochs, Left Pflug). A
**realization** is the authored posture for a specific position under a
handling mode - the unit a pose belongs to:

```
realization = guard position x handling mode
```

A rapier uses Ochs through the one-handed Ochs realization; the
canonical two-handed Ochs is one realization of the family, not the
family itself.

**The lower body is one canonical configuration shared by every
realization in this version** - guard changes move hands and blade
only, so the animation can never change feet the simulation did not
price. Lead foot, weight and width arrive with the stance extension,
which will also add their travel to the transition derivation (see
`skeletal-renderer` for why layering is an optimization target, not a
guaranteed decomposition).

## 2. The roster and the input grid

Positions map onto a grid the existing controls already express:
**height** (stanceUp/stanceDown) x **extension** (guard button held =
point-forward, released = withdrawn) x **side variant** (sideShift).

| slot             | family    | two-handed realization | one-handed realization |
|------------------|-----------|------------------------|------------------------|
| high, extended   | ochs      | Ochs (R/L)             | one-handed Ochs (R/L)  |
| middle, extended | longpoint | **Langort**            | **Terza**              |
| low, extended    | pflug     | Pflug (R/L)            | one-handed Pflug (R/L) |
| high, withdrawn  | vomTag    | Vom Tag (R/L)          | one-handed Vom Tag (R/L) |
| low, withdrawn   | alber     | Alber                  | one-handed Alber       |

**Input slot, guard family and handling mode are three separate
things.** The slot is an input coordinate; the family is a geometric
concept (its key is geometric, `longpoint`, not a tradition's word);
the historical names are **display data on realization rows**, because
traditions name the same geometry differently - Langort is the
two-handed longpoint of the Liechtenauer corpus, Terza the natural
one-handed form of the Italian one (dall'Agocchie's extended point at
the face; Alfieri's high/low Terza variants are future data rows, as
are Fiore's one-handed plays behind the one-handed Ochs and Pflug).
Every family is authored in BOTH modes and every sided family in both
sides - **sixteen realization rows** (Ochs 2 sides x 2 modes = 4,
Pflug 4, Vom Tag 4, longpoint 2, Alber 2) - so availability is
universal, the slot map never depends on handling mode, and
**switching handling mode never changes the guard family**
(`grip-switching`). Suitability differences between realizations are
the derivations' business, never the roster's.

Vom Tag is sided even though it covers nothing: a withdrawn guard's
side is where the sword RESTS, so it decides transition distances,
which cuts launch cheaply, and the side an attack exits toward - Right
Vom Tag is not "protecting" the outside, it is the outside being where
every next action starts. The schema permits side variants for any
family; Alber and longpoint ship one centre row each, and adding their
variants later is a data row, not code.

The extended column has three height stops (`middle` becomes reachable
- the exact "data change, not a new concept" the `Height` union
reserves); the withdrawn column keeps two. stanceUp/stanceDown move
between the current column's stops; toggling extension at `middle`
retracts to the slot map's authored target (Vom Tag by default - the
gather to the shoulder - and the map lives in positions.json, not code).
Ochs, Pflug and Vom Tag take sideShift; longpoint and Alber ignore it.

No new ActionIds. The `guard` button's meaning sharpens from "parry
raised" to "point extended"; muscle memory (holding it = covering)
carries over. Labels and help text change; bindings do not. The Intent
union renames follow the new meanings (`parry`/`parryRelease` become
extension intents; `stanceUp/Down` select the height family) - names in
code say what they now do.

## 3. Guard data

`src/combat/data/positions.json`, imported statically (Vite),
validated by a test against the TS types - a malformed row fails the
suite, so the file is editable without touching engine code. The file
holds ALL addressable positions as a discriminated union:

```
type PositionId = string        // stable key, unique across the file

type BodyCore = {               // geometry EVERY position carries
  primaryHandCm: {x, y},
  torsoProfileDeg,
  poseRef
}
type WeaponCore = BodyCore & {  // + what only an armed position has
  weaponAngleDeg,
  secondaryHandCm: {x, y} | "onSocket"
}

type PositionDefinition =
  | WeaponCore & { kind: "guard";  ... }  // + the realization fields below
  | WeaponCore & { kind: "launch" }       // geometry only
  | WeaponCore & { kind: "terminal" }     // geometry only
  | BodyCore   & { kind: "unarmed" }      // NO weapon fields at all:
                                          //   nothing derives a blade,
                                          //   coverage is none by
                                          //   construction, and it is the
                                          //   disarmed fighter's rest
```

Every ARMED position carries the same weapon core - including
`secondaryHandCm` and `torsoProfileDeg`, which launch and terminal
rows need because transitions into and out of them are priced by the
same derivation as any other (and `grip-switching` measures torso
travel). Only `guard` rows add family, side variant, handling mode and
a slot, and only `guard` rows are standable and selectable. `unarmed` carries the BODY core only, precisely so nothing can derive
a blade for a fighter who has none - it is outside the sixteen-realization roster and outside
every coverage rule. Per guard realization row, on top of the core:

```
{
  ...WeaponCore,           // primaryHandCm, weaponAngleDeg,
                           // secondaryHandCm, torsoProfileDeg, poseRef
  family, sideVariant, handlingMode, slot,
  displayName,             // "Right Ochs", "Langort", "Terza"
  offHand                  // "onHilt" | "free" (dagger etc., FUTURE)
}
```

Two notes on the core's fields, since guards are where they bite:
`secondaryHandCm` is `"onSocket"` for an ordinary two-handed grip (the
target derives from the weapon's grip2 socket, so it adapts per
weapon) and an explicit point whenever the off-hand is `"free"` - a
free hand is somewhere, and the engine must be able to measure its
travel. `poseRef` is **presentation only**: the engine never inspects
it, so every quantity a derivation needs exists as a number in the row
itself.

**The realization authors the hands, the weapon orientation and the
torso; everything else about the blade is derived** - the geometry
must never be overdetermined:

```
crossguard    = primaryHandCm advanced grip1Cm along weaponAngleDeg
point         = crossguard advanced bladeCm along weaponAngleDeg
blade segment = crossguard -> point
secondary hand = secondaryHandCm == "onSocket"
                   ? grip2Cm back along the hilt   // weapon-adaptive
                   : the authored point            // a free off-hand
```

A longer blade moves the derived point without touching the pose; the
realization stays weapon-independent, and an `onSocket` secondary hand
adapts to the weapon's grip sockets (`physical-foundations`) instead
of being authored per weapon. There is no authored point position, no authored
blade angle separate from the weapon orientation, and no `leadFoot` -
the lower body is the single canonical configuration of section 1
until the stance extension.

Authored values follow the historical postures (Ochs: hilt high beside
the head, point at the face; Pflug: hilt at hip, point at chest; Vom
Tag: blade gathered at the shoulder; Alber: point dropped; Langort /
Terza: arm extended, point in line at the face). Exact numbers are
authoring, tuned within the section 9 constraints.

## 4. Coverage, derived

One shared function reads the realization's **derived** blade geometry
(section 3) with the equipped weapon:

```
seg = derivedBlade(pose, weapon)     // section 3: crossguard -> point,
                                     // each with heightCm and advanceCm
covered(pose, weapon) =
  pose.sideVariant == "centre" ? none :
  seg.point.advanceCm >= EXTENDED_MIN
    ? { heights: bands(seg), side: sideOf(pose.sideVariant) }
    : none
```

**Coverage reads a POSE, not a position row, and it is continuous.**
Every `BladePose` carries the `sideVariant` its geometry belongs to
(section 5), so coverage is defined at every instant - standing,
mid-transition, mid-handling-switch - from the blade's live geometry.
That single choice is what makes two other rules true instead of
contradictory:

- **A guard shift keeps covering the old line until the blade
  actually leaves it.** Today's `ParryTrack` has exactly this
  behaviour and tests pin it ("old side covered until arrival", "the
  OLD line's clock keeps counting"); a completion-gated coverage
  would have deleted it and turned every guard change into a total
  opening nobody priced.
- **A handling switch does not blank the defence.** Taking the
  off-hand off a hilt does not move the point out of line, so an
  extended guard keeps covering through the switch, exactly as
  `grip-switching` promises - no scripted vulnerability.

**The side comes from the geometry too.** An interpolated pose belongs
to no authored row, so a discrete `sideVariant` cannot answer for it:
`sideOf` reads which side of the body centreline the blade segment
actually lies on. A guard rotating from one side to the other
therefore stops covering the old side and starts covering the new one
when the steel CROSSES, which is a derived instant, not a phase label.
`pose.sideVariant` remains as provenance for the renderer and for
`exitSide`; coverage never consults it.

**Formedness is continuity, and each covered line has its own clock.**
Because `bands(seg)` is a SET, a travelling blade transiently spans
two bands, so one scalar cannot express what is settled:

```
coveredSince: Map<Line, ms>    // on the BladeTrack
```

An entry appears when the geometry begins covering that line and is
DELETED when it stops - so a shift holds the old line's clock right up
to the moment the steel leaves it, and the newly covered line starts
from zero rather than inheriting the old one's age.
`parryMeetsAttack` reads the entry for the attack's own line, and
`firmness()` at bind entry reads the same one; a freshly crossed line
can never present itself as long-braced, which is exactly what the old
`settledMs = remainder` reset on shift completion existed to prevent.
The overshoot-at-the-deadline semantics are unchanged.

**Coverage is the band the BLADE spans, not the point's band.** A
Pflug holds its hilt at the hip with the point up at the chest: the
steel physically stands across the low line, which is exactly why the
guard closes it, and reading only the point would say it covers the
middle and leave the low line permanently unparryable - with Alber
and longpoint centre, and Ochs high, no realization could cover low
at all. `bands(seg)` is the set of `Height` bands the segment from
crossguard to point passes through, and `parryMeetsAttack` matches
when the attack's height is IN that set (`covered.heights.has(...)`).

Two validation tests keep the roster honest, and both are about
authoring, not code: **every `Height` is covered by at least one
realization x side**, and **no realization covers all three** - a
guard that closes every line is a wall, not a guard.

`sideOf` reads the side variant alone. It takes no facing: sides are
body-relative, and `contact.ts`'s existing rule is label-equal with no
mirroring ("a symmetric engagement folds my inside and their inside
onto the same crossing"), so introducing a facing term would invert
one fighter and break every parry-matching test this spec promises to
carry over.

The centre branch is explicit, not an accident of attack availability:
a centre variant claims no categorical line, so `sideOf` never runs on
an input it has no answer for.

Extended guards (Ochs, Langort/Terza, Pflug) cover their band;
withdrawn guards (Vom Tag, Alber) cover nothing - they are
attack-loaded (Vom Tag) or an invitation (Alber). That is an authoring
outcome of `EXTENDED_MIN`, not a fact about their names, so a third
test asserts every withdrawn-slot realization derives `none`. This
replaces the parry's `coveredLine` snapshot: what a guard covers is
readable from where the blade IS, for both fighters and the AI alike.

`derivedBlade`, `bands`, `sideOf`, `EXTENDED_MIN` and the band edges
all live in the one shared coverage module beside `parryMeetsAttack`.
Every derived location has `advanceCm` (forward of the body centre)
and `heightCm` (above the floor), computed from the pose's
`primaryHandCm` and `weaponAngleDeg` by section 3's construction.

**Band edges AND pose geometry are both stature-relative**, so they can
never drift apart: every authored length in a position row is a
fraction of `statureCm` (the tables read in centimetres at the
baseline 175 cm body, which is how they are written and reviewed), and
the band edges - `low` below the hip, `middle` to the shoulder, `high`
above - are fractions of the same stature. A taller fighter's guards
and lines scale together, the two validation tests below hold at every
body rather than only the baseline, and `physical-foundations`'
promise that attribute variation needs "only inputs" survives. Mixing
absolute poses with proportional edges would have made which bands a
Pflug spans depend on the fighter's height in a way nobody authored. `sideOf` maps the row's side variant
to the engine's `Side` union body-relatively: the variant on the
sword-arm side is `outside`, the other `inside` - which is why a cut
(declared `outside`) is answered by the right-side guards and a thrust
(declared `inside`) by the left, for a right-handed fighter, with no
facing term anywhere.

**The centre longpoint covers nothing, by encoding:** the formula's
centre branch is the guard's identity made explicit. Historically the
longpoint is a threat, not a parry - its defense is that the point
stands in the opponent's way, which in this model is its near-direct
thrust (section 6), not a coverage claim. A validation test asserts
the formula returns `none` for every centre-variant realization; if a
sided longpoint variant or a middle-line attack ever ships, coverage
for it arrives through the same formula's non-centre branch, in data.

**The deciding contact model stays categorical - an explicit choice.**
Two options existed: keep the abstract line-plus-scalar-extension
contact (`contact.ts`) as the arbiter of steel meeting steel, or
simulate 2D blade segments and derive contact from segment
intersection. This spec chooses the FIRST. Derived blade geometry
classifies coverage, prices transitions and drives rendering; but
whether blades meet is decided exactly as today - line match on both
axes, extensions covering the gap. Consequences the whole sequence
must honour: postures and attack trajectories must be authored so the
categorical verdicts are visually plausible, and the renderer
(`skeletal-renderer`) must conform to the categorical result - blades
are drawn meeting when and only when the engine says they meet.
Blade-segment contact is a named future extension: if it ever comes,
it replaces the internals of `parryMeetsAttack`/`bladesCross` in that
one module, and this paragraph is its door.

**Three consumers of the deleted parry object need new meanings, and
here they are.** A guard is now a position the fighter occupies, not a
raised action that can be spent:

- `engine.ts`'s `dropGuard(defender)` on a parried attack disappears.
  A deflection does not delete a posture; it displaces it. The
  defender's blade is pushed off line by the impact - a derived
  transition away from the covering geometry, its size read from
  `displacementResistanceN` against the attack's force
  (`physical-foundations` 4.1), so a strong two-handed guard barely
  moves and a strained one-handed guard is thrown wide.
- `parryRecoveryMs` is DELETED from the profile alongside the other
  five, and the recovery it used to charge is that displacement's own
  transition back - derived, not authored.
- `fighter.ts`'s refusal to parry while recovering disappears with it:
  there is no parry to refuse. What limits a defender is where the
  blade physically is and how long the derived travel takes.

`contact.parryMeetsAttack` is rewritten to read
`(pose, coveredSince)` instead of the parry object. Two parts of its
contract change and the change is deliberate, so the carry-over of its
tests is not blanket: the height comparison becomes membership in the
covered band (`covered.heights.has(line.height)`), and coverage comes
from live geometry rather than a phase label. Everything else stands -
side match, the settle requirement with its overshoot semantics, and
the grace tick for blade quantization only. The existing held-guard
and line-feint tests that pin shift-covers-the-old-line and the
running clock keep passing BECAUSE of the continuity rule above; a
test that asserted a mid-shift blackout would not, and none does.

## 5. Transitions, derived

```
transitionMs(from, to, weapon, fighter, mode) =
  max( profileMs(handTravelM, HAND_ACCEL / s, handSpeedMps / s),
       profileMs(bladeArcRad, alpha / s,      omegaCap / s) )
  + SETTLE_MS

s        = strainFactor(fighter)          // >= 1; BOTH terms of BOTH
                                          // profiles, never just one
alpha    = controlTorquePeakNm / inertiaGripKgM2                 // rad/s^2
omegaCap = OMEGA_CAL * handSpeedMps                              // rad/s

// SI in, SECONDS out - so every caller converts explicitly:
profileSec(dist, acc, cap):    // symmetric accelerate-then-decelerate,
  peak = sqrt(dist * acc)      // cruising at the cap when it binds
  peak <= cap ? 2 * sqrt(dist / acc)
              : dist / cap + cap / acc

profileMs(dist, acc, cap) = 1000 * profileSec(dist, acc, cap)
```

**Units, stated once for every consumer.** `profileSec` takes metres
or radians against m/s^2 or rad/s^2 and returns SECONDS; `profileMs`
is the only form callers use, so a millisecond constant like
`SETTLE_MS` is never added to a seconds quantity. Lengths are authored
in centimetres and divided by 100 at the call; angles are authored in
degrees and converted by `rad()` at the call.

Torque over inertia is an ACCELERATION, not a speed - the time comes
from this motion profile, stated here exactly so every implementer
derives the same milliseconds from the same physical data. `HAND_ACCEL`
and `OMEGA_CAL` are calibration constants of the section 9 tuning;
`strainFactor` is `physical-foundations`' strain effect (1.0 at zero
strain).

Hand travel comes from the two realizations' `primaryHandCm`; the
blade arc from their `weaponAngleDeg` and derived point positions;
angular acceleration from `physical-foundations` (peak control torque
against rotational inertia about the grip, scaled by strain). Heavy
blade + weak grip = slow guard changes, emergently. `SETTLE_MS` lives
here and only here, and it prices the MOTION - it is not a coverage
gate. Formedness is section 4's continuity rule: a line counts from
the instant the geometry begins covering it, whether or not the
transition that carried it there has finished. Because the lower body is one
shared configuration, transitions move hands and blade only; when the
stance extension separates the lower body, foot, hip and weight travel
join this same derivation rather than being a free visual.

This derivation **replaces** the authored `heightChangeMs`,
`sideChangeMs`, `guardShiftMs`, `firmUpMs` and `parryRecoveryMs`,
which are deleted from the profile. The old semantics map onto special cases of the one
function: firm-up is a transition of near-zero arc (extending in
place), a height change is the Ochs<->Pflug arc, a side change the
R<->L arc. Interrupting a transition re-derives from the blade's
interpolated current position - leaving from wherever you actually are,
never a table lookup.

**Where the blade lives - the fighter's `BladeTrack`.** The fighter
carries its blade state explicitly and completely, so that no
consumer (engine, AI, renderer, `grip-switching`) ever infers posture
from the body state. It is a discriminated union, and it is the
SINGLE source of blade truth in every state the fighter can occupy:

```
type BladePose = {            // a geometry snapshot, never an id:
  primaryHandCm, weaponAngleDeg,   // the interpolable core
  secondaryHandCm, torsoProfileDeg,
  sideVariant,                // which side this geometry belongs to,
                              // so coverage (section 4) is defined at
                              // every instant, not only at rest
  render: RenderSource        // how to reconstruct the FULL body
}

/**
 * What the renderer was drawing at the instant this pose was taken -
 * semantic, never bone arrays. Any consumer can reproduce the exact
 * full-body pose by re-sampling the same performance at the same
 * point with the same adaptations, which is what makes an
 * interrupted pose history-independent (skeletal-renderer section 2).
 */
type RenderSource = {
  performance;                // "guard" | "transition" | trajectoryRef
  sampledUnit;                // 0..1 through that performance
  fromId, toId;               // the performance's endpoints - a
                              // transition needs both, or two different
                              // travels would share a RenderSource
  targetHeight, handlingMode, movement
}

type BladeTrack =
  | { kind: "settled";      at: PositionId, pose: BladePose,
                            coveredSince: Map<Line, ms> }
  | { kind: "transitioning"; fromPose: BladePose, toId: PositionId,
                             elapsedMs, durationMs }
  | { kind: "attacking";     attack: ActiveAttack }   // the attack owns it
  | { kind: "frozen";        pose: BladePose, why: "bind" | "exposed"
                                  | "disarming" | "disarmed" }
```

**The source of a transition is a POSE, not an id.** Interrupting a
transition continues from the blade's actual interpolated geometry,
which usually corresponds to no authored position at all - so
`fromPose` is a snapshot and re-deriving a new transition from
mid-motion is always expressible. `toId` stays an id because the
destination is always an authored position.

**A pose carries its whole body, not just its blade.** The engine
decides contact from the blade geometry alone, but a redirect or a hit
must continue from the pose that was ACTUALLY on screen - legs,
torso, both arms. `RenderSource` solves that without the engine
knowing anything about bones: it is entirely simulation facts, and the
renderer resolves them back into a full body deterministically. Two
fighters with the same `RenderSource` are drawn identically, always.

**No renderer-computed value may live here.** An earlier draft stored
the active bounded corrections, which only the renderer can compute
from asset limits - that would have made the engine depend on
presentation, breaking both this spec's own `poseRef` rule and the
DOM-free engine. Adaptation is a pure function of
`(performance, sourceGuardId, targetHeight, handlingMode, movement)`,
so the renderer recomputes it from what is stored here and nothing is
lost.

This is a TRACK beside the body state, never an arm of the exclusive
state machine - and the reason a guard change, a step and a handling
switch can be reasoned about independently. Coverage (section 4) reads
the track's current pose. During an attack the track is `attacking`
and the attack owns it; at `combinedEnd` it returns to `settled` at
the snapshotted resulting guard.

**Exactly one writer of blade geometry, always.** A concurrent
`handlingTransition` (`grip-switching`) does not interpolate a second
copy of the hands: starting a switch puts the `BladeTrack` into
`transitioning` (`fromPose` = the current mode's realization pose,
`toId` = the same family's row in the target mode) for the switch's
own duration, and the handling track carries only what is genuinely
its own - the mode endpoints and `secondaryHandEngagement`. Coverage
therefore reads the mid-switch geometry through the ordinary
derivation, and the two tracks cannot disagree because only one of
them owns a pose.

**`frozen` is how the blade survives its attack.** Bind entry,
exposure, disarming and disarmed all outlive the attack state that
produced them, so the entry tick writes the sampled contact pose into
the track. `BindContact` gains exactly one field - `pose: BladePose` -
on both existing variants of the union (the `strike` variant with its
`progress`, the `guard` variant with its `settledMs` - which now
carries the CONTACTED line's own clock, read from `coveredSince`; they are
alternatives, not co-resident fields). Everything else the renderer
needs is already inside `pose.render`: the performance, how far
through it, the source guard, target height, handling mode and
movement. One home per fact.

**Leaving `frozen` - every exit, stated.** A frozen pose is a real
place the blade is, so every way out is an ordinary transition FROM
that pose; none of them teleport, and none of them need a new
mechanism:

| exit | resolution |
|---|---|
| Bind breaks neutral (clock expiry, shove-apart) | Both fighters go `transitioning` with `fromPose` = the frozen pose, `toId` = the guard their held input levels currently select (section 6's sequencing rule, unchanged). |
| Bind winner takes the advantage thrust | The attack launches with `sourceGuardId` = the frozen pose's provenance and the frozen pose as its launch geometry - `bindTimeline`'s no-windup thrust already starts from contact, and this is why that is physically honest: the point is already there. The track becomes `attacking`. |
| Winner declines the thrust / returns to ready | Same as neutral break: `transitioning` from the frozen pose to the level-selected guard. |
| Exposed fighter recovers | `transitioning` from the frozen pose to the level-selected guard, over the exposure's own recovery duration - being turned out of a bind costs the travel back, which is what "exposed" means. |
| Disarming resolves (sword taken) | The loser's track becomes `settled` at the `kind: "unarmed"` position (section 3 - no weapon, no derived blade, coverage `none` by construction); the winner transitions from their frozen pose like any other exit. |
| Disarmed | Stays `frozen` with `why: "disarmed"` until the round ends - there is no blade to move. |

In every armed case the destination is the standing levels' selection,
so the fighter comes out of contact into the guard they were asking
for, having paid the derived travel from where the bind actually left
them.

Defensive flow: pressing toward a new slot starts the transition
(press-to-move and release semantics preserved from `held-guard`'s
latch); if the covering guard forms before the blade arrives, the
attack is parried; too late, it lands. Blade contact then enters the
existing bind system unchanged - the bind's guard-side contact snapshot
carries the formation clock exactly as `settledMs` does today.

## 6. Attacks as transitions

The vocabulary stays `cut` and `thrust` - generic intents, deliberately
small. An attack takes a **target line** as a free input; the current
guard prices the attack, it never gates which lines exist:

```
current guard + definition + target line + movement mode
  -> launch config
  -> [strike, authored] while the root follows a fixed movement curve
  -> terminal config, at the new root position
  -> resulting guard
```

**Attacks are data, like guards** - the future of named techniques is
a schema, not a promise in prose. v1 ships exactly two rows:

```
interface AttackDefinition {
  id;                    // "genericCut" | "genericThrust" (later "mittelhau", ...)
  kind;                  // "cut" | "thrust"
  side;                  // the DECLARED side of the line it travels
                         // (the AttackTimings.side rule, carried over)
  sourcePolicy: {
    idiomatic;           // GuardSelector[]: the guards this technique is
                         // TAUGHT from - an authored fact about the
                         // technique, never a cost claim (cost is always
                         // transitionMs from wherever the blade is). Its
                         // consumers are AI policy (which prefers
                         // idiomatic launches when otherwise
                         // indifferent) and the help panel. v1's
                         // generic rows leave it
                         // empty: a generic cut is idiomatic from nowhere
                         // in particular
    required?;           // GuardSelector[]: a future technique MAY gate
                         // itself; v1 rows never set this. A GuardSelector
                         // names a family, a specific guard, or ANY
                         // PositionId - terminal configurations included,
                         // which is how a future continuation attack
                         // exists as pure data
  };
  launchByHeight;        // Record<Height, PositionId>: where the blade
                         // gathers to threaten each height
  trajectoryRef;         // the strike path: renderer cue + authored strike timing
  terminalByHeight;      // Record<Height, PositionId> - the delivered
                         // contact pose PER TARGET HEIGHT. A high and a
                         // low thrust cannot end in the same blade pose,
                         // so the terminal resolves with the target line
                         // and is snapshotted with it. Total over the
                         // reachable heights; a missing row fails the
                         // data test
  resultVariants: {      // named exits; "default" is required on every row
    default;             // Record<Height, GuardDestination> - per target
                         // height, like launch and terminal, because
                         // where a blade finishes depends on where it
                         // was sent. GuardDestination is
                         // { family, sideRule }: the FAMILY is the
                         // attack's own fact (a descending cut finishes
                         // low, in alber; a thrust finishes in the
                         // extended guard of the height it was thrown
                         // at - ochs high, longpoint middle, pflug low),
                         // and the single side rule `exitSide` is the
                         // OPPOSITE of the definition's declared side
                         // (a blade that travelled through a line
                         // finishes past it), mapped back to a variant
                         // by the inverse of section 4's sideOf. Resolution is total by
                         // construction: a sided family takes exitSide,
                         // a centre-only family (alber, longpoint)
                         // resolves to its centre row and ignores it -
                         // so a descending cut from Right Vom Tag lands
                         // in Alber, and a low thrust in Left Pflug,
                         // each a COMPLETE position, never a bare family
    ...variants?;        // future exits, selected by an input at launch;
                         // v1 rows author only "default"
  };
  allowedMovements;      // AttackMovement[]: v1 rows allow all three. A
                         // request naming a movement not in the list is
                         // REFUSED whole (no silent downgrade to
                         // stationary) and logged, like any other
                         // rejected intent
  movementTiming: {
    startMark;           // AttackMark: when the feet begin (e.g. late windup)
    landMark;            // AttackMark: when the step lands (e.g. delivery)
  };
}
```

**Terminal configurations are position rows** in positions.json
(`kind: "terminal"`) - not selectable as standing guards, but
addressable, so the delivered pose is a real place the fighter is
standing, not an implicit animation moment. Recovery is an ordinary
derived transition FROM that position.

**The active attack snapshots its resolution at launch** (the same
snapshot pattern `AttackTimeline` already uses):

```
{ definitionId, sourceGuardId, handlingMode, targetLine,
  launchConfigurationId, terminalConfigurationId, resultingGuardId,
  movement, movementStartMs, plannedMovementEndMs,
  movementStartX, movementDistanceCm,     // the PLAN, immutable
  movementStoppedAtMs?, movementStoppedX? // the OUTCOME, written once
}
```

The launch, terminal and resulting positions are resolved with the
target height (`launchByHeight`, `terminalByHeight`, the result rule)
and snapshotted, so a high and a low thrust carry different terminal
poses from the moment they start.

**The MOVEMENT plan is immutable; the blade plan re-resolves on a
redirect.** A redirect changes the target line mid-windup, and the
blade plan is a function of that line, so the redirect tick
re-resolves `targetLine`, `launchConfigurationId`,
`terminalConfigurationId` and `resultingGuardId` from the new line
(and, where a redirect crosses to the other side and therefore the
other definition, `definitionId`, `side` and `trajectoryRef` with
them), priced by the derived transition from the blade's current
interpolated position. What never re-resolves is the movement: the
feet were committed at launch and keep their schedule, which is what
makes a redirect a blade decision rather than a second chance at
measure.

**Plan and outcome are separate fields.** Truncation does not rewrite
the plan - it WRITES THE OUTCOME once: `movementStoppedAtMs` and
`movementStoppedX` are null until steel or a hit ends the travel, and
`combinedEnd` reads the actual end,
`movementEnd = movementStoppedAtMs ?? plannedMovementEndMs`. The
distinction matters to more than bookkeeping: the renderer needs the
plan to know what the performance intended and the outcome to know
where it actually stopped.

`handlingMode` is snapshotted at launch like everything
else - the performance was thrown by the hands that held the sword
then, and the renderer selects its clip by
`trajectoryRef + handlingMode + movement` (`skeletal-renderer`
section 4) without the engine ever storing a visual asset id.
Continuing:
`resultingGuardId` is the resolution of the CHOSEN result variant,
which in v1 is always `default`. The extension point is therefore
already in the data, not in prose: a future selectable exit is a
named entry in `resultVariants` plus the input that picks it at
launch, and a future continuation is an `AttackDefinition` whose
`sourcePolicy` names a terminal `PositionId`. Neither requires a
model change. No continuations system ships now.

**Resulting guards and the held levels sequence; neither wins.** The
input levels (guard button, height stop, side) are standing TARGETS,
never teleports - and the resulting guard is where the body PHYSICALLY
arrives at recovery's end, so the two can disagree: a released-guard
fighter's cut can legitimately end in extended Left Pflug. The rule:
the attack always arrives in its snapshotted resulting guard; on the
first tick after `combinedEnd`, if the standing levels select a
different slot, an ordinary derived transition toward it begins,
priced like any other. A player whose held levels match the result
stays put; one whose levels disagree pays the travel they are asking
for. The result is never overridden mid-attack, and the levels are
never cleared by the attack.

### Moving attacks: one action, two schedules

An attack may be thrown stationary, advancing, or retreating -
`AttackMovement` - and all three are THE SAME attack definition: same
source rules, trajectory, target line, terminal configuration,
resulting guard and timings. Movement moves the fighter's ROOT, and
therefore the live gap; it never touches `reachCm`
(`physical-foundations`). An advancing cut reaches from further away
because the gap shrinks under it, and finishes closer; a retreating
one may finish outside the answer. Contact always reads the current
tick's gap - no special case anywhere in `contact.ts`.

**The attack input is compound.** The engine stops receiving a bare
attack intent: player input layer and AI policy alike produce an

```
AttackRequest { definitionId, targetHeight, movement }
```

**The request carries a target HEIGHT, not a whole line.** The side is
the definition's declared `side` and cannot be contradicted by an
input - two sources for one axis is exactly the disagreement the
types.ts rule forbids. The engine composes
`targetLine = { height: request.targetHeight, side: definition.side }`
at launch; the resolved line is what gets snapshotted.

and the engine accepts the request object whole - the Intent plumbing
change is part of this spec, because today main.ts hands the engine
one string per tick and gives a pending attack priority over the held
direction, which would silently discard the movement. The player's
`movement` is read from the directions held on the tick the attack key
is PRESSED: advance held -> advance, retreat held -> retreat, neither
-> stationary, and **both held -> stationary** (they cancel;
deterministic, side-symmetric). A buffered attack buffers its whole
request and fires it verbatim - the movement was chosen at the press,
not at the buffer's release.

The body follows a fixed schedule, not a second action track:

- Movement is snapshotted with the attack and cannot change during
  it. Direction inputs during the combined action are ignored; feints
  and redirects change the blade's plan, never the movement plan.
- The movement curve runs between the definition's `movementTiming`
  marks on the attack's own timeline - the feet do not start at the
  keypress and do not finish independent of the blade. The default
  rows start the step in late windup and land it at delivery, so the
  plant and the delivered pose read as one act; simply running the
  260ms step from the keypress would plant the feet hundreds of
  milliseconds before a longsword cut arrives, which is exactly the
  wrongness this timing exists to prevent. Advance and retreat share
  the timing and reverse the displacement.
- **The root math, exactly.** `AttackMark` is the timeline-mark union:
  `"riseStart" | "riseEnd" | "strikeStart" | "parryableUntil" |
  "strikeEnd"`. The marks resolve against the attack's snapshotted
  `AttackTimeline`; a data test validates that `startMark` resolves
  strictly before `landMark` and the window is positive for every
  shipping definition x weapon. Default rows: `startMark: "riseEnd"`,
  `landMark: "parryableUntil"`. The window's duration IS
  `landMs - startMs`; `stepDistance` supplies the displacement the
  movement ASKS for (negated for retreat, clamped below), and
  `stepRecoveryMs` still applies after the movement ends. The root
  interpolates as
  `x(t) = movementStartX + movementDistanceCm * STEP_EASING(u)` with
  `u` the window fraction and `STEP_EASING` THE SAME shared easing the
  ordinary step uses (currently linear), so ordinary and combined
  movement can never drift apart - the live gap, and therefore the
  contact tick, follows from this formula and nothing else.
- **The implied root speed is capped at the fighter's own footwork -
  a ceiling, not a band.**

  ```
  freeStepSpeed      = stepDistance / stepDuration
  movementDistanceCm = min(stepDistance,
                           freeStepSpeed * SPEED_CEILING * windowMs)
  ```

  An attack's window is generally shorter than a step, so an uncapped
  combined attack would sprint: the longsword thrust's window is
  190 ms for 60 cm, 3.16 m/s against an ordinary step's 2.31 m/s -
  the same class of wrongness as feet that plant too early, so the
  distance shrinks (never the window stretches, which would unstick
  the feet from the blade). Moving SLOWER than a free step is fine and
  needs no remedy: the longsword cut's 290 ms window covers its 60 cm
  at 2.07 m/s, a fighter stepping deliberately under a big cut, which
  is exactly right. That is why this is a ceiling - a two-sided band
  would fail the shipping cuts for being unhurried. The data test
  validates the ceiling for every shipping definition x weapon x
  movement, and `skeletal-renderer`'s root curve then has a speed it
  can actually animate.
- **Steel truncates movement, on the CONTACT tick.** The moment that
  ends the travel is the tick blades meet (`met` is set - the same
  tick the clash sounds), or the tick the fighter is struck; not the
  later tick the strike resolves. Resolving would be too late to
  matter: with the default marks the movement window closes at
  `parryableUntil`, at or before `strikeEnd`, so a truncation keyed to
  resolution could never fire at all. On that contact tick the
  movement schedule ends at the current interpolated root - remaining
  displacement is cancelled and recovery (or the bind, or hitstun)
  happens where the fighter stands - nothing rewinds. Only a whiff
  carries the feet through the full window: you committed through
  empty air.
- **Stopping travelling and planting a foot are two moments.** The
  root stops at `movementStoppedAtMs`; the foot is not necessarily
  under the fighter at that instant, because an interrupted step is
  interrupted mid-stride. So the engine emits `movementStopped` there,
  and the footfall `step` event on the tick the weight actually
  settles:

  ```
  movementEnd = movementStoppedAtMs ?? plannedMovementEndMs
  u           = (movementEnd - movementStartMs)
                / (plannedMovementEndMs - movementStartMs)   // 0..1
  plantMs     = movementEnd + PLANT_SETTLE_MS * (1 - u)
  ```

  Both read `movementEnd`, never the nullable field directly: an
  untruncated movement has `movementEnd == plannedMovementEndMs`,
  so `u == 1` and `plantMs == plannedMovementEndMs` exactly.

  **This is COMBAT data, not animation data** - `PLANT_SETTLE_MS` is a
  weapon-profile constant (the fighter's own footwork, derived like
  the rest from step numbers during calibration), the engine owns the
  formula, and a unit test pins both ends: `u = 1` (movement finished
  on schedule, `movementStoppedAtMs` null) gives
  `plantMs == plannedMovementEndMs`, so an
  uninterrupted step sounds exactly as it does today; `u = 0`
  (truncated at the very start) gives the full settle. The renderer
  places the foot deterministically across that interval
  (`skeletal-renderer` section 5) - a planted foot never teleports,
  and the sound never precedes the weight.
- **`combinedEnd` waits for the foot.** It uses `plantMs` as the
  movement's end (below), so the fighter can never accept the next
  action while a foot is still visibly in the air - that follows from
  `combinedEnd >= plantMs + stepRecoveryMs` alone. `PLANT_SETTLE_MS`
  is separately bounded at or below `stepRecoveryMs` for a different
  reason: it caps how far an early truncation can push `combinedEnd`
  out, so being parried at the very start of a lunge costs at most one
  step-recovery of extra commitment rather than an unbounded stumble.
  A test asserts the bound, so a future retune cannot silently break
  it.
- Both events fire even if the blade is still in recovery:
  presentation follows the simulation, and both moments ARE
  simulation moments.
- The engine owns the root position at every tick (the renderer's
  clips are in-place, `skeletal-renderer`).
- An attack pressed during an ordinary active step stays BUFFERED,
  exactly as today - the combined action exists only from launch.
- The whole action commits until BOTH schedules finish, reading the
  ACTUAL movement end - which is the foot's plant, not the root's
  stop:
  `combinedEnd = max(attackRecoveryEnd, plantMs + stepRecoveryMs)`
  where an untruncated movement has
  `plantMs == plannedMovementEndMs`, so the uninterrupted case is
  exactly the formula it has always been.

Movement does not alter the resulting guard: an advancing and a
retreating Oberhau both end in the definition's resolved position. A
future named attack that wants a different exit declares it in data.

- **Windup, derived:** the transition from the current realization to
  the attack's launch configuration (cut: blade gathered high on the
  attack's side, Vom-Tag-like geometry; thrust: point onto the target
  line). A thrust from Ochs is near-direct - the point is already high
  and forward; a cut from Alber pays the full gather. A floor,
  `minGatherMs` per attack kind (authored weapon fact, paid identically
  by both fighters), keeps the fastest windup readable - preparation
  never becomes invisible.
- **Strike, authored:** the ballistic phase stays the weapon's own
  `strike` timing with `PARRYABLE_FRACTION` unchanged - the travelling
  half, the delivered half, the extension model in `contact.ts`, all as
  today.
- **Recovery, derived:** the ordinary transition from the attack's
  terminal configuration to its snapshotted resulting guard (a
  descending cut's terminal resolves toward Alber; a thrust recovers
  toward the extended guard of its line - all from the definition's
  data). `parriedPenalty` and `whiffRecoveryFactor` still apply on
  top, as today.
- **Attack line:** the target line is the attacker's choice. Its
  height defaults to the current guard's height stop and is re-aimed
  with the height keys (during windup, that is the redirect); its side
  is the attack definition's DECLARED side, exactly as
  `AttackTimings.side` today - declared data, never inferred from the
  kind (the types.ts rule stands). The guard's only influence on the
  line is price: launching high from Alber pays the travel, it is
  never refused.
- **Feints and redirects** re-derive: abandoning a windup transitions
  back (feintRecoveryMs stays authored as the sell-price); a redirect
  is a mid-windup change of launch config, priced by the derived
  transition from the blade's current interpolated position -
  `redirectHeightMs`/`redirectSideMs` are deleted.

Timeline marks (`riseStart`, `riseEnd`, `strikeStart`,
`parryableUntil`, `strikeEnd`) keep their meanings; only their values
become derived. Every presentation-follows-simulation rule and the
engine test block pinning it carry over unchanged.

**Deriving these durations separately is not an instruction to
assemble the visuals from fragments.** The engine computes windup,
strike and recovery as distinct intervals because they are distinct
physical facts; the renderer expresses them as semantic REGIONS of
one continuous authored performance whose markers are warped onto
these marks (`skeletal-renderer` section 3). No part of this spec may
be read as requiring a guard-transition clip, a strike clip and a
recovery clip to be played back to back.

## 7. AI

The policy layer (`ai.ts`) learns the guard game, with reaction
emulation as its only privilege:

- reads the opponent's realization and in-flight transitions through
  the existing delayed-read machinery - a guard change is a signal like
  a windup;
- attacks into uncovered lines; answers threats by transitioning to the
  covering slot; uses withdrawn guards to load attacks it intends;
- chooses among stationary, advancing and retreating versions of an
  attack by measure - advancing to reach from wide, retreating to
  strike while leaving - through the SAME attack definitions and
  movement snapshots the player uses; no AI-only movement physics;
- the policy-coverage discipline applies: each guard-related decision
  branch is named in the AI test suite, so no behaviour ships as
  fallthrough.

## 8. Help

The "?" panel is rewritten around guards: `HELP` becomes a typed Record
over the realization/state unions (a missing entry fails the build),
one sentence for what the position is, one for what it covers or
threatens. All cited durations come from the derivation callbacks at
render time, never literals - including derived transition examples.

## 9. Suitability matrix and tempo economics

**The matrix is computed, then pinned.** A test builds, from the shared
derivations at baseline attributes: for every realization x weapon x
handling mode x attack x movement mode x initial measure - hold demand
(strain rate), transition times to adjacent slots, windup per attack,
coverage, and where the attacker's root and the gap end up. The pinned
shape must show, among others, the worked example from the design
discussion:

- thrust from Terza (one-handed longpoint): small arc + the one-handed
  profiling reach gain -> fast preparation, long reach (potentially
  effective, any sword - where its derived reach lands against the
  rapier's is calibration, pinned here, promised nowhere);
- large cut from Terza: high rotational demand + wrist-only torque ->
  slow (emergently poor, worse the heavier the blade);
- extended one-handed guards accrue strain; withdrawn ones rest;
- in contact, one hand's control torque -> displaced easily;
- an advancing attack reaches from further away and finishes closer; a
  stationary one preserves measure; a retreating one reaches less
  reliably and may finish outside the counter - all read from the
  matrix's end-of-action gap, never asserted by movement-mode name.

No assertion may branch on a weapon or guard name to force a verdict;
the test pins the derived numbers' shape, so retuning moves the matrix
without new control flow.

**Tempo economics are re-proven, not preserved - and the punishment
invariant becomes conditional on measure.** Unconditionally, "every
parried and whiffed attack is punishable" cannot survive retreating
attacks: escaping the counter is what retreating while striking is
FOR. The invariant is restated as: **if the defender remains within
counter-thrust measure when the punishment window opens, the recovery
contains enough time for the counter to land** - asserted over the
derived timing matrix across realizations, movement modes and initial
measures. The void-always-outprices-parry invariant stays
unconditional. Calibration constants are tuned until both hold. The golden replay WILL change: this spec intends new behavior. A
new golden is recorded only after the playtest below signs off - never
silently (golden-replay refactor gate applies only where behavior must
be preserved; here the re-record is the deliverable).

## 10. Out of scope

- Named techniques (Zornhau, Krumphau, Mittelhau, ...): a generic cut
  from Vom Tag is not a Zornhau; those arrive only when their specific
  trajectories and defensive functions are modelled - and section 6's
  `AttackDefinition` is deliberately shaped so each arrives as a data
  row (id, idiomatic sources, launch, trajectory, terminal, resulting
  guard), never as new control flow.
- The independent stance layer (lead foot, weight) - baked into
  realizations for now.
- Off-hand items (dagger, buckler): `offHand` is data, inert.
- In-duel handling-mode switching (`grip-switching`).
- Attribute asymmetry and its balance pass.

## 11. Playtest

Play longsword against the rapier AI and swap. What must feel right:
standing in Ochs visibly closes the high line and the AI stops
attacking into it; dropping to Alber visibly invites and the AI takes
the bait; a thrust thrown from Pflug/Terza arrives noticeably sooner
than one gathered from Alber; changing guards under pressure is a real
decision with a real travel cost; the same cut thrown stationary,
advancing and retreating reads as one technique carried by different
footwork, and the AI visibly retreats out of your answer sometimes.
What would look wrong: any guard change that snaps instantly; an
attack landing through a formed covering guard; the AI ignoring your
guard when choosing lines; an advancing cut whose feet plant long
before the blade arrives; a fighter visibly in one posture while the
engine treats them as in another (the renderer contract exists
precisely to forbid this).
