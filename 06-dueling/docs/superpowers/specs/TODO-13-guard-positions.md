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
transition derivation (replacing six authored timing fields), attack
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
type PositionDefinition =
  | { kind: "guard";    ... }  // realization rows: the full schema below
  | { kind: "launch";   ... }  // hand + weapon geometry only
  | { kind: "terminal"; ... }  // hand + weapon geometry only
```

Launch and terminal rows carry only the geometric core (primary hand,
weapon orientation, pose ref) - no family, side variant, coverage or
slot; only `guard` rows are standable and selectable. Attack
definitions reference all three by stable `PositionId`. Per guard
realization row:

```
{
  family, sideVariant, handlingMode,
  displayName,             // "Right Ochs", "Langort", "Terza"
  primaryHandCm: {x, y},   // primary hand transform, body-relative
  weaponAngleDeg,          // desired weapon orientation
  secondaryHandCm: {x, y} | "onSocket",
                           // "onSocket" derives the target from the
                           // weapon's grip2 socket; an explicit point
                           // is required whenever offHand is "free" -
                           // a free hand is somewhere, and the engine
                           // must be able to measure its travel
  torsoProfileDeg,         // how far the body is turned side-on
  poseRef,                 // renderer's pose id - PRESENTATION ONLY:
                           // the engine never inspects it, so every
                           // quantity a derivation needs must exist as
                           // a number in this row
  offHand                  // "onHilt" | "free" (dagger etc., FUTURE)
}
```

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
p = derivedPoint(realization, weapon)
covered(realization, weapon) =
  realization.sideVariant == "centre" ? none :
  p.advanceCm >= EXTENDED_MIN
    ? { height: band(p.heightCm), side: sideOf(sideVariant, facing) }
    : none
```

The centre branch is explicit, not an accident of attack availability:
a centre variant claims no categorical line, so `sideOf` never runs on
an input it has no answer for.

Extended guards (Ochs, Langort/Terza, Pflug) cover their line;
withdrawn guards (Vom Tag, Alber) cover nothing - they are
attack-loaded (Vom Tag) or an invitation (Alber). This replaces the
parry's `coveredLine` snapshot: what a guard covers is readable from
where the blade IS, for both fighters and the AI alike.

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

**Formedness** survives as the transition's completion clock: a guard
covers once its transition completes - settling is part of
`transitionMs` (section 5) and is counted exactly once, never again at
formation - with the same overshoot-at-the-deadline semantics
`parryMeetsAttack` has today. `contact.parryMeetsAttack` is rewritten to
read (realization, completion clock) instead of the parry object; its
contract - formed, covering, both axes match, grace tick for blade
quantization only - is unchanged and its tests carry over.

## 5. Transitions, derived

```
transitionMs(from, to, weapon, fighter, mode) =
  max( profileTime(handTravelM, HAND_ACCEL, handSpeedMps / strainFactor),
       profileTime(bladeArcRad, alpha,     omegaCap) )
  + SETTLE_MS

alpha    = controlTorquePeakNm / inertiaGripKgM2 / strainFactor  // rad/s^2
omegaCap = OMEGA_CAL * handSpeedMps                              // rad/s

profileTime(dist, acc, cap):   // symmetric accelerate-then-decelerate,
  peak = sqrt(dist * acc)      // cruising at the cap when it binds
  peak <= cap ? 2 * sqrt(dist / acc)
              : dist / cap + cap / acc
```

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
blade + weak grip = slow guard changes, emergently. `SETTLE_MS` lives here and
only here - formedness (section 4) starts when the transition
completes, with no second settling. Because the lower body is one
shared configuration, transitions move hands and blade only; when the
stance extension separates the lower body, foot, hip and weight travel
join this same derivation rather than being a free visual.

This derivation **replaces** the authored `heightChangeMs`,
`sideChangeMs`, `guardShiftMs` and `firmUpMs`, which are deleted from
the profile. The old semantics map onto special cases of the one
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
  sourceId?                   // provenance for the renderer only
}

type BladeTrack =
  | { kind: "settled";      at: PositionId, pose: BladePose, settledMs }
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

This is a TRACK beside the body state, never an arm of the exclusive
state machine - the same shape `grip-switching`'s `handlingTransition`
takes, and the reason a guard change, a step and a handling switch can
be reasoned about independently. Coverage (section 4) reads the
track's current pose. During an attack the track is `attacking` and
the attack owns it; at `combinedEnd` it returns to `settled` at the
snapshotted resulting guard.

**`frozen` is how the blade survives its attack.** Bind entry,
exposure, disarming and disarmed all outlive the attack state that
produced them, so the entry tick writes the sampled contact pose into
the track. `BindContact` is extended to carry what re-deriving it
later cannot: `{ pose: BladePose, sourceGuardId, handlingMode,
movement, trajectoryRef }` alongside today's kind/progress/settledMs.
That is exactly the data the renderer needs to hold the contact pose
and to keep drawing the right weapon in the right hands after the
attack is gone.

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
    preferred;           // GuardSelector[]: where the launch is cheapest -
                         // any guard still transitions into the launch
                         // config at derived cost (guard-priced, never
                         // guard-gated). A GuardSelector names a family,
                         // a specific guard, or ANY PositionId - terminal
                         // configurations included, which is how a future
                         // continuation attack exists as pure data
    required?;           // GuardSelector[]: a future technique MAY gate
                         // itself; v1 rows never set this
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
    default;             // GuardDestination: resolves to a COMPLETE
                         // specific position from (targetHeight, source
                         // side) by rule (attackExitSide /
                         // oppositeSourceSide): a crossing cut from Right
                         // Vom Tag exits left and resolves to Left Pflug,
                         // side included, never a bare family
    ...variants?;        // future exits, selected by an input at launch;
                         // v1 rows author only "default"
  };
  allowedMovements;      // AttackMovement[]: v1 rows allow all three
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

**Plan and outcome are separate fields.** Everything above the line is
resolved at launch and never re-derived. Truncation does not rewrite
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
  `landMs - startMs` - `stepDuration` prices ordinary steps only and
  is not consulted; `stepDistance` supplies the displacement magnitude
  (negated for retreat) and `stepRecoveryMs` still applies after
  `movementEnd`. The root interpolates as
  `x(t) = movementStartX + movementDistanceCm * STEP_EASING(u)` with
  `u` the window fraction and `STEP_EASING` THE SAME shared easing the
  ordinary step uses (currently linear), so ordinary and combined
  movement can never drift apart - the live gap, and therefore the
  contact tick, follows from this formula and nothing else.
- **Steel truncates movement.** On the tick the strike resolves
  against steel (parried, bind entry) or the fighter is struck, the
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
  settles: `plantMs = movementStoppedAtMs + settleFromStride(u)`,
  derived from how far through the stride the truncation caught it
  (zero when the movement completed on schedule, so an uninterrupted
  step sounds exactly as it does today). The renderer places the foot
  deterministically across that interval (`skeletal-renderer`) - a
  planted foot never teleports, and the sound never precedes the
  weight. Both events fire even if the blade is still in recovery:
  presentation follows the simulation, and both moments ARE
  simulation moments.
- The engine owns the root position at every tick (the renderer's
  clips are in-place, `skeletal-renderer`).
- An attack pressed during an ordinary active step stays BUFFERED,
  exactly as today - the combined action exists only from launch.
- The whole action commits until BOTH schedules finish, reading the
  ACTUAL movement end:
  `combinedEnd = max(attackRecoveryEnd, movementEnd + stepRecoveryMs)`
  where `movementEnd = movementStoppedAtMs ?? plannedMovementEndMs`.

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
  row (id, preferred sources, launch, trajectory, terminal, resulting
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
