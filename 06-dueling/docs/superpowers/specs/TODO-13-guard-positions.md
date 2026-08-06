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
realization in this version** - guard changes move the upper body
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
gather to the shoulder - and the map lives in positions.json, not
code). Its side comes from the track's latched side (section 5), so
retracting from a centre row never has to invent one.
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
  primaryHandCm: {x, y},        // the side-view plane
  lateral,                      // -1 sword-arm side .. +1 other, 0 centred
  torsoProfileDeg,
  poseRef
}
type WeaponCore = BodyCore & {  // + what only an armed position has
  weaponAngleDeg,
  secondaryHandCm: {x, y} | "onSocket"
}

type PositionDefinition =
  | WeaponCore & { kind: "guard";  ... }  // + the realization fields below
  | WeaponCore & { kind: "launch";   handlingMode }   // + the grip the
  | WeaponCore & { kind: "terminal"; handlingMode }   //   map keys by
  | BodyCore   & { kind: "unarmed" }      // NO weapon fields at all:
                                          //   nothing derives a blade,
                                          //   coverage is none by
                                          //   construction, and it is the
                                          //   disarmed fighter's frozen pose
```

Every ARMED position carries the same weapon core - including
`secondaryHandCm` and `torsoProfileDeg`, which launch and terminal
rows need because transitions into and out of them are priced by the
same derivation as any other (and `grip-switching` measures torso
travel). `launch` and `terminal` rows carry a `handlingMode`, since the maps
that reach them are keyed by one and a key must be checkable against
its row - a data test asserts they agree, the analogue of the
`sideVariant`-agrees-with-`lateral` test. Only `guard` rows add family,
side variant and a slot, and `guard` rows are the standable, selectable ones; `unarmed` is neither.
It supplies the pose a disarmed fighter is FROZEN in, which is why it
needs geometry at all. `unarmed` carries the BODY core only, precisely so nothing can derive
a blade for a fighter who has none - it is outside the sixteen-realization roster and outside
every coverage rule. Per guard realization row, on top of the core:

```
{
  ...WeaponCore,           // primaryHandCm, lateral, weaponAngleDeg,
                           // secondaryHandCm, torsoProfileDeg, poseRef
  family, sideVariant, handlingMode, slot,
  displayName,             // "Right Ochs", "Langort", "Terza"
  offHand                  // "onHilt" | "free" (dagger etc., FUTURE)
}
```

Two notes on the core's fields, since guards are where they bite:
`secondaryHandCm` is `"onSocket"` on two-handed rows (the target
derives from the weapon's grip2 socket, so it adapts per weapon) and
an explicit point on one-handed rows, where the hand is off the hilt
and its position still has to be measurable - `grip-switching` reads
exactly this difference. `offHand` is inert data for a future dagger
or buckler and never decides this. `poseRef` is **presentation only**: the engine never inspects
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
covered(pose, weapon) =              // ANY pose: authored or interpolated
  pose.weaponAngleDeg == null ? none : // unarmed: there is no blade
  seg.point.advanceCm < EXTENDED_MIN ? none :      // not extended
  sideOf(pose.lateral) is none ? none :            // straddling: no line
  { heights: bands(seg), side: sideOf(pose.lateral) }

sideOf(lateral) =                    // lateral in [-1, +1]
  |lateral| < CENTRE_BAND ? none     //   a blade near the centreline
  : lateral < 0 ? outside : inside   //   claims neither side
```

**Coverage reads the blade where the blade actually is.** `covered`
takes a POSE - authored or interpolated - so a fighter mid-transition
is covered by the geometry on screen at that instant, never by the row
they left. Heights come from the segment the pose derives
(`bands(seg)`); the side comes from `pose.lateral`.

**`lateral` is a real pose coordinate, because the side axis is not
readable from a side-view segment.** Poses are authored in the
renderer's side-view plane - a hand position and a weapon angle - so
that plane carries height and reach but has no coordinate for
inside/outside at all. Rather than pretend a segment can be asked
which side of the centreline it lies on, `BladePose` carries
`lateral` in [-1, +1]: the sword-arm side at -1, the other at +1,
centred at 0. Authored rows set it per side variant (a centre row is
0); a transition interpolates it like every other coordinate; and
`CENTRE_BAND` is the deadband within which a blade claims neither
side - which is what makes a centre guard cover nothing without a
special case, and what stops a blade crossing the middle from
flickering between sides.

**This is the one place where "the renderer must conform" would
otherwise have been impossible to honour**, which is what decides the
model. A row-based rule keeps the source guard effective for the whole
travel, so a blade one frame short of a completely different guard
still parries - an invisible parry, which no bounded IK correction can
draw. This project's founding rule is that contact is emergent from
the simulation and presentation follows it; a defence the renderer
cannot show inverts that rule. Contact itself stays categorical
(below); only where the guard IS becomes geometric.

What follows:

- *A guard shift stops covering the old line when the blade leaves it
  and covers the new one when it arrives* - both derived instants,
  neither pinned to the transition's endpoints. The two held-guard
  assertions that pin today's phase-based behaviour ("old side covered
  until arrival", "the OLD line's clock keeps counting") are REWRITTEN
  against geometry: what survives is their intent - a shifting guard
  is not helpless, and its clock is not naively reset - not their
  exact instants.
- *The defensive timings change deliberately and are recalibrated.* A
  geometric rule generally covers the destination earlier than arrival
  does, which shortens the effective answer time. Section 9's tempo
  economics are re-proven over the derived numbers, and the documented
  side-redirect outcome (today's rapier disengage being too fast to
  chase) is a target the calibration must still produce - recomputed
  from the derivation, never asserted by weapon name.
- *Coverage through a travel is sampled, never assumed.* Only
  `lateral` is read directly and so moves monotonically; the height
  and extension thresholds are read off a DERIVED point combining an
  interpolating hand position with an interpolating angle, so a travel
  can enter and leave a band twice on the way. The whole-travel
  sampling test therefore covers **every transition in the roster**,
  not only handling switches: it walks the interpolated pose, records
  what each travel covers, and pins the result. A travel that flickers
  is an authoring fault to fix, not a surprise to meet in play.
- *A handling switch never blanks the defence.* Its endpoints share a
  `lateral`, so the side it covers cannot move - that much is
  structural. The height band is an authoring matter, since a switch
  moves the hands, and the same whole-travel test holds it.
- *Mid-motion restarts need no special case.* A transition beginning
  from an interpolated pose is covered by that pose like any other -
  coverage never depended on having an authored source.

**Each covered line carries its own clock**, because `bands(seg)` is a
SET and a transition can have two rows covering different lines at
once:

```
coveredSince: Map<LineKey, ms>      // on the BladeTrack itself, in
                                    // EVERY variant - a fighter met
                                    // mid-shift or mid-bind has the
                                    // same clocks a settled one does
LineKey = `${height}:${side}`       // a string: Line is a structural
                                    // object, so a Map keyed by the
                                    // object itself would never hit
```

An entry appears on the tick the interpolated blade begins covering
that line, carrying the SUB-TICK remainder of the crossing (solved by
linear interpolation across the tick that crossed it - the same
precision today's scheduled arrival gets), and is deleted the tick
coverage is lost.

**`covered()` is stateless, and stays that way.** No hysteresis: what
it returns is a pure function of the pose handed to it, so the same
pose always yields the same lines. What is PUBLISHED to `coveredSince`
is separately gated by phase (a strike publishes nothing) and by
`formationMs`; the function never guesses, and the gate is stated in
one place rather than hidden inside it.

Clock churn at a boundary is prevented at the source instead. A data
test asserts **no authored row sits near any of the three thresholds
`covered()` reads**, each measured in its own units, since they are
not commensurable:

| threshold | margin |
|---|---|
| `\|lateral\| = CENTRE_BAND` | `LATERAL_MARGIN`, dimensionless like the coordinate |
| `advanceCm = EXTENDED_MIN` | `LENGTH_MARGIN`, centimetres |
| each height band edge | `LENGTH_MARGIN`, centimetres |

Each margin is measured from the THRESHOLD, not from an axis origin.
That distinction is what makes centre rows legal: a centre row sits at
`lateral = 0`, `CENTRE_BAND` away from the threshold, so it passes -
**provided `CENTRE_BAND > LATERAL_MARGIN`, which the calibration must
honour** and a test asserts, or the four centre realizations would
fail the very check written to protect them. A SETTLED pose therefore
never hovers on a threshold.

Derived poses (`PoseTarget`, below) are the one case a row cannot
police, since a displaced guard can land anywhere. When one settles,
the engine nudges it clear of the nearest threshold ON EACH AXIS by
that axis's margin - a deterministic, tiny correction whose only
purpose is to keep a resting pose off a knife edge.

So a freshly covered line never inherits the age of the line
the fighter was previously holding. It starts at the **sub-tick
remainder**, not at zero: the clock is compared against the attacker's
continuous overshoot, so a guard that physically formed before the
deadline must not be refused for having formed between two ticks -
which is exactly why today's reset carries the remainder rather than
clearing to zero, and the overshoot semantics carry over intact. `parryMeetsAttack`
and `firmness()` both read the entry for the line actually contacted.

**The lifecycle, for every variant.** Every variant maintains entries
by the one coverage rule above - the current pose, every tick - with
exactly one interval excepted: **a STRIKE publishes no entries.** The
map is cleared at `strikeStart` and repopulated from `recoveryStart`
with fresh clocks, so a recovery must outlast `formationMs` before it
answers anything, exactly like any other arrival. That single
exception is what makes the parry and crossing tests disjoint (below);
everywhere else, including a windup, the pose speaks for itself.

**An attacking fighter is not declared uncovered; but a blade in a
STRIKE is not a guard either.** The three phases differ physically and
the model follows them:

- **Windup and recovery are transitions**, and cover exactly like any
  other transition. A recovery arriving in a guard begins covering as
  it arrives - which is what the player can SEE, and declaring
  otherwise reinstated the geometry-versus-engine disagreement this
  model exists to remove. Today's engine drops the guard on cut and
  thrust only because a parry was a MODE an attack could not carry; a
  position is not a mode, so there is nothing to drop.
- **A strike is steel committed forward**, and the engine already
  models that: `extension`, and a CROSSING when it meets other steel.
  A striking blade therefore does not additionally offer a guard.
  This is not an exception to geometry - it is the same blade,
  classified by what it is doing rather than counted twice.

That split is load-bearing, and it is why the categorical contact
rules need no new arbitration. Two attacks meeting is a crossing, one
event, one clash. A guard meeting an attack is a parry. Nothing can be
both, so no precedence rule is needed, no contact resolves twice, and
the one-clash-per-contact doctrine survives untouched.

**What still keeps a passing blade from parrying is formation, and it
is derived.** A line answers only once its clock exceeds
`formationMs`, the settle portion of the transition that brought the
blade there - the successor to today's `rising` phase, which geometry
would otherwise have deleted with nothing in its place. Steel arriving
in a line has to be braced there before it can turn anything, so a
windup sweeping through a line covers it honestly and answers nothing.

**The economics are re-proven with it.** An attacker recovering into a
covering guard is genuinely defended sooner than today, which moves
the punish window; section 9 re-derives the invariant rather than
assuming the old one survives.

A void keeps its covering pose for the same reason - see below. At
`combinedEnd` the track returns to `settled` at the resulting guard.
`frozen` keeps whatever the contact tick left, since the bind reads
those clocks and nothing is moving.

Extended SIDED guards (Ochs, Pflug) cover their band; the centre
longpoint covers nothing despite being extended (below); and
withdrawn guards (Vom Tag, Alber) also cover nothing - they are
attack-loaded (Vom Tag) or an invitation (Alber). For Vom Tag that is an
authoring outcome of `EXTENDED_MIN` and for the centred Alber it is the
deadband - either way a derivation, never a fact about a name - so a third
test asserts every withdrawn-slot realization derives `none`. This
replaces the parry's `coveredLine` snapshot: what a guard covers is
readable from where the blade IS, for both fighters and the AI alike.

`derivedBlade`, `bands`, `sideOf`, `EXTENDED_MIN`, `CENTRE_BAND`,
`LATERAL_MARGIN`, `LENGTH_MARGIN` and the band edges
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
Pflug spans depend on the fighter's height in a way nobody authored. Because negative `lateral` is the sword-arm side, a cut (declared
`outside`) is answered by guards sitting there and a thrust (declared
`inside`) by the others. Side VARIANTS stay on authored rows for
naming, `exitSide` and realization selection; coverage reads
`lateral`, which those variants set.

**The centre longpoint covers nothing, by geometry:** its row sets
`lateral` to 0, inside `CENTRE_BAND`, so it claims neither side - its
identity falling out of the formula rather than a branch. Historically the
longpoint is a threat, not a parry - its defense is that the point
stands in the opponent's way, which in this model is its near-direct
thrust (section 6), not a coverage claim. Two data tests keep the variant and the coordinate honest: the formula
returns `none` for every centre-variant realization, through the
deadband rather than a special case; and **every row's `sideVariant`
agrees with the sign of its `lateral`** - the variant names the row and
drives `exitSide`, the coordinate decides coverage, and the two may
never disagree about which side a guard is on. Middle-line attacks DO ship in v1 - a
fighter standing in Langort throws one - and they are answered by the
sided guards whose blades span the middle band, which is what
`bands(seg)` is for. What no v1 row provides is a centre guard that
covers; if a sided longpoint variant ever ships, its coverage arrives
through the same formula's non-centre branch, in data.

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

**The consumers of the deleted parry object need new meanings, and
here they are.** A guard is now a position the fighter occupies, not a
raised action that can be spent:

- `engine.ts`'s `dropGuard(defender)` on a parried attack disappears.
  A deflection does not delete a posture; it displaces it. The
  defender's blade is pushed off line by the impact - an ordinary
  derived transition away from the covering geometry, whose
  DESTINATION is the displaced pose:

  ```
  impactN     = attacker's bindAuthority * ANCHOR_FORCE   // the force
                                                          // arriving
  displaceRad = DISPLACE_CAL * impactN
              / displacementResistanceN(def, w, engagement)
  ```

  The destination is `{ kind: "derived" }`, computed on the deflection
  tick: the covering pose rotated by `displaceRad` and pushed along
  `lateral` by `displaceRad / LATERAL_SPAN_RAD`, **in the direction
  the attack was travelling** - steel arriving on a line drives the
  guard across it, never further out - and clamped to the [-1, +1] the
  coordinate allows. A strong two-handed guard is barely moved; a
  one-handed or strained one is thrown wide enough that `sideOf` stops
  returning its line, which is what `grip-switching` means by a parry
  met weakly. Recovery is that transition run backwards, priced by
  `transitionMs` like any other - which is why `parryRecoveryMs` has
  nothing left to do.
- `parryRecoveryMs` is DELETED from the profile alongside the others.
- `fighter.ts`'s refusal to parry while recovering disappears with it:
  there is no parry to refuse. What limits a defender is where the
  blade physically is and how long the derived travel takes.
- `engine.ts`'s `f.parry = null` at BIND ENTRY ("no guard is up
  mid-attack") needs no successor and keeps its meaning: a bind is
  entered by two blades mid-strike, and a strike offers no guard under
  section 4's phase rule, so the line it cleared was already empty.
- `fighter.ts`'s `dropGuard` on cut and thrust has NO successor, and
  that is a deliberate change: it existed because a parry was a mode
  an attack could not carry, and a position is not a mode. An
  attacking fighter now covers whatever their blade covers during a
  windup or a recovery, gated by `formationMs` like everyone else,
  and covers nothing during the strike itself (section 4).
- `engine.ts` dropping the STRUCK defender's guard has no successor
  and needs none: the same tick ends the round, and the engine's own
  comment says the charge is moot under hitstun. The struck fighter's
  track simply keeps the pose it had, which is what
  `skeletal-renderer` blends out of. `frozen.why` covers the states
  that outlive their attack; hitstun and death are not among them
  because nothing reads their coverage.
- `dropGuard` on a VOID goes the same way and for the same reason: a
  void is locomotion, the blade goes where the blade goes, and a
  voiding fighter keeps covering what their pose covers. Voiding and
  attacking both become better defended than they are today, which is
  the intended consequence of making guards positions rather than
  modes - and the tempo economics (section 9) are re-proven with it,
  since void pricing is one of the invariants they pin.
- The held-guard LATCH (`targetAttackStartTime`, `releaseQueued`,
  `visibleMs`, swept each tick) moves onto the `BladeTrack` unchanged
  in meaning: it governs when a released input actually starts the
  return transition, which is an input-timing concern and survives the
  parry object's deletion untouched. `f.guardSide` becomes the
  track's latched side, written when a side travel completes.
- `engine.ts` charges `parryRecoveryMs` at bind resolution and at a
  neutral break, on the side whose contact was a guard - a branch that
  never fires, since a bind has no guard side. Both charges become the
  derived transition out of the frozen pose (section 5's exit table),
  which prices each fighter by how far they actually have to come
  back; the tempo economics are re-proven with it (section 9).

`contact.parryMeetsAttack` is rewritten to read the defender's
`BladeTrack` - which carries the covered lines and their clocks -
instead of the parry object, keeping its attacker and gap arguments. Two parts of its
contract change and the change is deliberate, so the carry-over of its
tests is not blanket: the height comparison becomes membership in
the current pose's covered bands, read through `coveredSince`, and
coverage comes from the blade's own geometry rather than a phase
label. Its other arguments are unchanged -
it still takes the attacker and the gap, because the extension and
overshoot checks need them. Everything else stands -
side match, the settle requirement with its overshoot semantics, and
the grace tick for blade quantization only. The two held-guard assertions that pin
shift-covers-the-old-line and the running clock are rewritten against
geometry (section 4): their intent survives - a shifting guard is not
helpless and its clock is not naively reset - while the exact instants
become derived.

## 5. Transitions, derived

```
transitionMs(from, to, weapon, fighter) =    // reads f.engagement
  max( profileMs(primaryHandM,  HAND_ACCEL / s,  handSpeedMps / s),
       profileMs(offHandM,      HAND_ACCEL / s,  handSpeedMps / s),
       profileMs(bladeArcRad,   alpha / s,       omegaCap / s),
       profileMs(lateralArcRad, alpha / s,       omegaCap / s),
       // lateralArcRad = |d lateral| * LATERAL_SPAN_RAD: the arc the
       // point sweeps crossing the body from one side to the other
       profileMs(torsoArcRad,   TORSO_ACCEL / s, torsoOmegaCap / s) )
  + SETTLE_MS

s        = strainFactor(fighter)          // >= 1; BOTH terms of ALL
                                          // FIVE profiles, never one
alpha    = controlTorquePeak(f, w, f.engagement) / inertiaGripKgM2   // rad/s^2
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
derives the same milliseconds from the same physical data. `HAND_ACCEL`, `OMEGA_CAL`, `TORSO_ACCEL`, `torsoOmegaCap` and
`LATERAL_SPAN_RAD` (radians per unit of `lateral` - the conversion
that turns a dimensionless coordinate into an angle the profile can
price) are calibration constants of the section 9 tuning - all five live
here, since this is the spec that first needs them, and
`grip-switching` reads them rather than declaring its own;
`strainFactor` is `physical-foundations`' strain effect (1.0 at zero
strain).

A transition prices all five authored axes - both hands, the weapon's
rotation, the lateral sweep and the torso - by the same motion-profile `max` that
`grip-switching`'s `switchMs` uses (five axes here, four there - a
switch never moves `lateral`), so no authored geometry ever moves
for free. Hand travel is the two realizations' `primaryHandCm` difference
resolved at THIS fighter's stature (the rows are stature fractions
written in centimetres at the 175 cm baseline, section 3), so a taller
fighter's longer travels take proportionally longer rather than being
computed from the baseline table; the
blade arc from their `weaponAngleDeg` and derived point positions;
angular acceleration from `physical-foundations` (peak control torque
against rotational inertia about the grip, scaled by strain). The
LATERAL sweep is the `lateral` difference carried through the same
angular profile - the blade crosses the body on an arc, and this is
what replaces the deleted `sideChangeMs`: a right-to-left guard change
is priced by how far the steel must travel across, against the same
inertia every other rotation pays. Heavy
blade + weak grip = slow guard changes, emergently. `SETTLE_MS` lives
here and only here, and it prices the MOTION - it is not a coverage
gate by itself. Formedness is section 4's rule: a line's clock starts
the tick the interpolated blade begins covering it - generally BEFORE
the motion finishes - and the line ANSWERS once that clock exceeds
`formationMs`.

`formationMs` is a derived fraction of the travel that brought the
blade there - `FORMATION_FRACTION * transitionMs(from, to, ...)`, so a
long sweep needs longer bracing than a short firming and neither is
authored. It is the successor to today's `rising` phase, and it is not
`SETTLE_MS`: that constant is part of the transition's DURATION, the
hands coming to rest, while `formationMs` is the interval a covered
line must outlast before it will turn steel. `FORMATION_FRACTION`
joins the section 9 calibration constants.

The combined predicate `parryMeetsAttack` evaluates is therefore
`coveredSince[line] - overshoot >= formationMs`, where `overshoot` is
the attacker's excess past `parryableUntil` exactly as today - the
same shape as the shipped `p.settledMs < overshoot` check, with a
derived requirement in place of a phase label. Because the lower body is one
shared configuration, transitions move the upper body only; when the
stance extension separates the lower body, foot, hip and weight travel
join this same derivation rather than being a free visual.

This derivation **replaces** the authored `heightChangeMs`,
`sideChangeMs`, `guardShiftMs`, `firmUpMs` and `parryRecoveryMs`,
which are deleted from the profile. Their readers are named, like the
reach table in `physical-foundations`, because a missed one is a
silent divergence. Source: `fighter.ts`'s `guardFormationMs` (the
shared derivation the engine and AI must never drift apart on), its
`dropGuard`, phase-duration, side-travel, stance-height and redirect
sites, three sites in `ai.ts`, four in `ui/help.ts` (whose panel
cites the durations), two in `render/draw.ts`. Tests: `attack-lines`
(the largest group, including the `heightChangeMs > firmUpMs`
invariant and a profile-mutating fixture), `held-guard`,
`line-feints`, `parry-rise`, `engine`, `help`, `blade-contact`,
`duelist-defence` (whose feasibility matrix is built on
`guardFormationMs`), `fighter-defense`, `threat-latch`,
`pressure-winding` and `sustained-bind`. One does not merely re-plumb: `fighter-defense`
asserts that a VOID clears the guard, which this spec deliberately
reverses (below), so that half of its loop inverts and says so. Each moves to `transitionMs` between the two rows
it was approximating; the help panel's callbacks read the derivation,
so its cited numbers stay true by construction. **A guard test asserts no reader of
any deleted field survives anywhere, source or test - including the
attack timings deleted in section 6** - the same shape as `physical-foundations`' reach guard, and
for the same reason.

**Two assertions must change their form, not just their plumbing.**
The side-redirect test in `line-feints` reads
`expect(answerable).toBe(atk.id !== "rapier")`, and `attack-lines`
does the same through an `isRapierThrust` flag. Both branch on a
weapon's name - forbidden by the emergent-outcomes rule. The rewrite computes the answerable matrix
from the derivation and pins its SHAPE; it may document that today's
rapier redirect is too fast to chase, but it may not require that
failure because the weapon is called a rapier. The old semantics map onto special cases of the one
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
  primaryHandCm, lateral, torsoProfileDeg,   // body, always present
  weaponAngleDeg?,            // absent for an unarmed pose - there is
  secondaryHandCm?,           //   no blade to angle and no hilt to hold
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
  sampledUnit;                // 0..1 through it; 0 for a settled guard,
                              // whose `from` and `to` are both its row
  from, to;                   // PoseTarget endpoints - a transition
                              // needs both, or two different travels
                              // would share a RenderSource
  targetHeight, movement,
  engagement,                 // the continuous grip, not a mode label:
                              // a switch in progress has no label
  contact?: {                 // SIMULATION facts about a meeting of
    gapCm,                    //   steel: the measure at contact,
    extensionCm,              //   THIS fighter's extension and the
    otherExtensionCm,         //   opponent's - a bind has two
    line                      //   attackers, so one number could not
  },                          //   locate the meeting - and the line.
                              //   All known to the categorical model,
                              //   none of them a renderer result
  blendFrom?: {               // an interruption blends out of what was
    coords,                   //   on screen: the five POSE COORDINATES
    startedMs                 //   only, never a nested RenderSource -
  }                           //   see below
}

// Interpolation is ENGINE-owned and normative: every coordinate of a
// BladePose (primaryHandCm, lateral, weaponAngleDeg, secondaryHandCm,
// torsoProfileDeg) moves by the transition's own eased progress, and
// the renderer conforms to the pose that produces. Coverage depends on
// it now, so it cannot be a presentation choice.
type PoseTarget =             // where a motion is going. NOT every
  | { kind: "row"; id: PositionId }      // destination is authored:
  | { kind: "derived"; pose: BladePose } // a displaced guard is computed

type BladeTrack = { coveredSince: Map<LineKey, ms> } & (   // ALWAYS present
  | { kind: "settled";       at: PoseTarget, pose: BladePose }
  | { kind: "transitioning"; fromPose: BladePose,
                             to: PoseTarget, elapsedMs, durationMs }
  | { kind: "attacking";     attack: ActiveAttack }   // the attack owns it
  | { kind: "frozen";        pose: BladePose, why: "bind" | "exposed"
                                  | "disarming" | "disarmed",
                             movement?: MovementOutcome }
)

type MovementOutcome = {      // the interrupted attack's movement facts,
  movementStoppedAtMs,        // carried into the frozen state so the
  movementStoppedX,           // feet can still be stabilized once the
  plantMs                     // attack object is gone (plantMs resolved
}                             // at the truncation tick, section 6)
```

**`PoseTarget` exists because not every destination is authored.** A
guard displaced by a deflection (below) lands at a COMPUTED pose, and
so does a fighter who changed their mind mid-travel; both are ordinary
destinations, and a track that could only name authored rows could not
express either. `settled` therefore records what it settled at, which
may itself be derived - and coverage, reading geometry, never cares
which kind it is.

**The source of a transition is a POSE, not an id.** Interrupting a
transition continues from the blade's actual interpolated geometry,
which usually corresponds to no authored position at all - so
`fromPose` is a snapshot and re-deriving a new transition from
mid-motion is always expressible. The destination is a `PoseTarget`
for the same reason in reverse: usually an authored row, but a
displaced guard is computed, and both must be nameable.

**A pose carries its whole body, not just its blade.** The engine
decides contact from the blade geometry alone, but a redirect or a hit
must continue from the pose that was ACTUALLY on screen - legs,
torso, both arms. `RenderSource` solves that without the engine
knowing anything about bones: it is entirely simulation facts, and the
renderer resolves them back into a full body deterministically. Two
fighters with the same `RenderSource` are drawn identically, always.

**Everything here is a simulation fact; nothing is a renderer result.**
The distinction matters most for the two cases that look like
exceptions:

- *A frozen contact pose is contact-CONFORMED, and the engine cannot
  compute the conforming.* What the engine owns is the CONSTRAINT -
  the gap, both blades' extensions at that tick, and the line, all of
  which the categorical contact derivation already computes (a parry
  leaves the defender's extension at zero; a bind has two real ones,
  which is why one number would not do).
  Where along the DEFENDER's blade that lands is the renderer's to
  work out from its own drawn geometry - it is the segment-intersection
  quantity this spec deliberately does not simulate.
  `contact` stores that; the renderer solves its bounded IK from it
  deterministically, and two viewers of the same constraint draw the
  same blades. The engine never stores the solution.
- *An interrupted performance blends out of the pose on screen*, so
  the renderer needs to know which pose that was. `blendFrom` carries
  the five pose COORDINATES and the tick the blend began - not a
  `BladePose`, which would carry a `RenderSource` and reopen the chain
  one level deeper than the nesting it replaced. Coordinates because
  interruptions compose: a second interruption arriving mid-blend must
  leave from what is visible NOW, which already contains the first
  blend, and sampling the coordinates collapses that history into five
  numbers that cannot grow. What this deliberately does not preserve
  is the rest of the body mid-blend; the renderer eases the remainder
  from its own current state, which is the one place its continuity is
  allowed to be its own business precisely because nothing in the
  simulation reads it.

The rule the earlier draft broke stands: adaptation magnitudes,
correction limits and exception-clip selection are the renderer's, are
pure functions of what is stored here, and never enter engine state.

This is a TRACK beside the body state, never an arm of the exclusive
state machine - and the reason a guard change, a step and a handling
switch can be reasoned about independently. Coverage (section 4) reads the
track's current interpolated pose, wherever the blade has got to. During an attack the track is `attacking`
and the attack owns it; at `combinedEnd` it returns to `settled` at
the snapshotted resulting guard.

**Exactly one writer of blade geometry, always.** A concurrent
`handlingTransition` (`grip-switching`) does not interpolate a second
copy of the hands: starting a switch puts the `BladeTrack` into
`transitioning` (`fromPose` = the current mode's realization pose,
`to` = the same family's row in the target mode) for the switch's
own duration, and the handling track carries only what is genuinely
its own - the mode endpoints and `secondaryHandEngagement`. Coverage
therefore reads the interpolated pose like any other. It stays
continuous on the SIDE axis structurally - both endpoints share their
`lateral`, so no interpolation can carry the blade across - and on the
height axis by authoring, which the whole-travel data test holds to
account, rather than needing a separate
derivation, and the two tracks cannot disagree because only one of
them owns a pose.

**The engine samples the strike, because a bind freezes one.** A
strike's path is authored rather than interpolated between two rows,
so there is no transition to evaluate - `trajectoryCurve` is what the
engine evaluates instead, at that tick's progress, REBASED onto the
snapshotted launch and terminal poses: the curve is stored normalized
(each coordinate as a fraction of its own launch-to-terminal span),
so one curve serves every height and both grips, and the endpoints it
is stretched between are the ones the attack snapshotted. That gives
the numeric pose a bind entry writes into `frozen`.

Coverage does not read it - a striking blade offers no guard (section
4) - so the curve's job is the frozen pose and the renderer's
conformance, nothing more. Windup and recovery need no curve at all,
being ordinary transitions.

**The curve does not block this spec on the renderer.** It ships first
as a hand-authored approximation of the intended motion, which is
enough for the engine, its tests and the frozen pose; when
`skeletal-renderer` lands the approved asset, the curve is
re-extracted from it and a validation test bounds their divergence.
That keeps the stated one-way order honest - engine and tests green
first, the animation refining the numbers later, never gating them.

**`frozen` is how the blade survives its attack.** Bind entry,
exposure, disarming and disarmed all outlive the attack state that
produced them, so the entry tick writes the sampled contact pose into
the track - and, when the attack was a moving one, its
`MovementOutcome` too: `{movementStoppedAtMs, movementStoppedX,
plantMs}`, the three facts the foot stabilization needs. Without them
the renderer would lose mid-stride feet the moment the attack object
disappeared, which is the one thing `skeletal-renderer`'s truncation
rule cannot do without. `BindContact` gains exactly one field - `pose: BladePose`. Only its
`strike` variant is reachable: a bind forms from a CROSSING of two
attacking blades, so the `guard` variant stays in the union and stays
unreached, exactly as today. Everything else the renderer needs is
already inside `pose.render`: the performance, how far through it,
both endpoints, the target height, the engagement and the movement.
One home per fact.

**Leaving `frozen` - every exit, stated.** A frozen pose is a real
place the blade is, so every way out is an ordinary transition FROM
that pose; none of them teleport, and none of them need a new
mechanism:

| exit | resolution |
|---|---|
| Bind breaks neutral (clock expiry, shove-apart) | Both fighters go `transitioning` with `fromPose` = the frozen pose, `to` = the guard their held input levels currently select (section 6's sequencing rule, unchanged). |
| Bind winner takes the advantage thrust | The attack launches with `launchPose = { kind: "derived", pose: <the frozen contact pose> }` - `bindTimeline`'s no-windup thrust starts from contact precisely because there is no gather to cross, and the derived launch is what states that in the data. The track becomes `attacking`. |
| Winner declines the thrust / returns to ready | Same as neutral break: `transitioning` from the frozen pose to the level-selected guard. |
| Exposed fighter recovers | `transitioning` from the frozen pose to the level-selected guard, priced by `transitionMs` like every other exit. The exposure's own duration is a FLOOR the derived travel is taken against (`max` of the two), so being turned out of a bind always costs at least what the bind spec charges, and more when the blade has further to come back. |
| Disarming resolves (sword taken) | The loser's track goes `frozen` with `why: "disarmed"`, its pose taken from the `kind: "unarmed"` position (section 3 - no weapon, no derived blade, coverage `none` by construction). It is frozen rather than settled because the round is over on that tick: nothing more will move. The winner transitions from their frozen pose like any other exit. |
| Disarmed | Stays as the row above left it until the round ends - there is no blade to move. |

In every armed case the destination is the standing levels' selection,
so the fighter comes out of contact into the guard they were asking
for, having paid the derived travel from where the bind actually left
them.

Defensive flow: pressing toward a new slot starts the transition
(press-to-move and release semantics preserved from `held-guard`'s
latch); if the covering guard forms before the blade arrives, the
attack is parried; too late, it lands.

**A parry deflects; it never binds.** That is the shipped rule rather
than a new one: the engine locks only on a CROSSING of two attacking
blades, so a met guard is displaced (section 5) and the bind system is
untouched by this spec beyond the pose a crossing freezes. The
`BindContact.guard` variant stays in the union and stays unreached.

**No contact can be both, so no precedence rule is needed.** A blade
in a strike is steel and meets other steel as a CROSSING; a blade in
any other phase is a guard and meets an attack as a PARRY (section 4).
The two tests are therefore disjoint by construction, the engine's
existing check order is unchanged, and a contact still produces
exactly one event and one sound.

The displaced pose (section 5) applies to a fighter whose track is
`settled` or `transitioning` in the ordinary way. A fighter met during
a WINDUP or a RECOVERY is on an `attacking` track, which the attack
owns, so the displacement does not move them to a new track: it
rewrites that phase's DESTINATION in the snapshot to the derived
displaced pose - the launch pose during a windup, the resulting guard
during a recovery - and the same interpolation carries them there. One
writer of blade geometry still, and the knock-off-line is visible in
the phase it happened in.

A fighter mid-strike is never displaced by a parry, because a parry
cannot meet them; two crossing blades resolve through the bind rules,
unchanged, and a crossing that does not lock already deflects both.

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
  launchBy;              // Record<HandlingMode, Record<Height, PositionId>>
                         // where the blade gathers to threaten each
                         // height, in each grip: a one-handed gather has
                         // a different off-hand and torso from a
                         // two-handed one, and the renderer already keys
                         // its clips this way
  trajectoryRef;         // the authored animation the renderer plays
  trajectoryCurve;       // the SAME motion as engine data: normalized
                         // samples of all five pose coordinates -
                         // primaryHandCm, lateral, secondaryHandCm,
                         // weaponAngleDeg, torsoProfileDeg - against
                         // strike progress, each a fraction of its own
                         // launch-to-terminal span so one curve serves
                         // every height and both grips. Hand-authored
                         // first, re-extracted from the approved asset
                         // at validation, divergence bounded by test
  terminalBy;            // Record<HandlingMode, Record<Height, PositionId>>
                         // the delivered contact pose per grip and
                         // target height. A high and a low thrust cannot
                         // end in the same blade pose, and neither can a
                         // one- and a two-handed one, so the terminal
                         // resolves with BOTH and is snapshotted with
                         // them. Total over the reachable combinations;
                         // a missing row fails the data test
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
                         // finishes past it), mapped back to the
                         // variant whose `lateral` carries that sign -
                         // rows keep variants for exactly this job.
                         // Resolution is total by construction: a
                         // sided family takes exitSide,
                         // a centre-only family (alber, longpoint)
                         // resolves to its centre row and ignores it -
                         // so a descending cut from Right Vom Tag lands
                         // in Alber, and a low thrust in Right Pflug,
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
{ definitionId, sourcePose, handlingMode, targetLine,  // sourcePose is
                                                      // a PoseTarget, so
                                                      // a bind thrust can
                                                      // start from steel
                                                      // already in contact
  launchPose,                             // PoseTarget - usually the
                                          // definition's launch row, but
                                          // the bind winner's thrust
                                          // launches from the FROZEN
                                          // contact pose, which is
                                          // derived and is exactly why
                                          // that thrust has no windup
  terminalConfigurationId, resultingGuardId,
  movement, movementStartMs, plannedMovementEndMs,
  movementStartX, movementDistanceCm,     // the PLAN, immutable
  movementStoppedAtMs?, movementStoppedX? // the OUTCOME, written once
}
```

The launch, terminal and resulting positions are resolved with the
target height AND the launching handling mode (`launchBy`,
`terminalBy`, the result rule) and snapshotted, so a high and a low thrust carry different terminal
poses from the moment they start.

**The MOVEMENT plan is immutable; the blade plan re-resolves on a
redirect.** A redirect changes the target line mid-windup, and the
blade plan is a function of that line, so the redirect tick
re-resolves `targetLine`, `launchPose`,
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
arrives at recovery's end, so the two can disagree: a fighter holding
the extended levels throws a cut and legitimately ends in withdrawn
Alber, the family the cut's own row names. The rule:
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
  FIGHTER constant, since recovering a stride is the body's business
  and not the sword's, the engine owns the formula, and a unit test pins both ends: `u = 1` (movement finished
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
  is separately bounded at or below the SMALLEST `stepRecoveryMs`
  across the roster (70 ms today, the rapier's), for a different
  reason: it caps how far an early truncation can push `combinedEnd`
  out, so being parried at the very start of a lunge costs at most one
  step-recovery of extra commitment rather than an unbounded stumble.
  A test asserts the bound over every weapon, so neither a retune nor
  a new sword can silently break it.
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

**`AttackTimings.windup` and `.recovery` are deleted too**, being
derived above, while `strike`, `beat` and `side` stay authored on
`AttackTimings` and `feintRecoveryMs` stays on the profile. They have the largest reader set in the codebase and it is
named for the same reason as the others: `weapons.ts`'s
`attackTimeline`, `counterTime` and `bindTimeline` - which survives
but is REWRITTEN with them: the bind winner's thrust keeps its zero
windup and the weapon's authored `strike`, and takes its recovery from
the same derivation every other attack now uses, the transition from
its terminal position to its resulting guard. It cannot go on reading
an authored `recovery` that no longer exists. Also `engine.ts`'s
windup event and
`baseRecovery`, `ai.ts`'s whiff commit, `fighter.ts`'s redirect, and
three sites in `ui/help.ts`. The guard test covers these alongside
the five guard-timing fields.

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
- attacks into uncovered lines - INCLUDING the lines an opponent's own
  attack covers, since a fighter in windup or recovery is defended by
  where their blade is (section 4). A named branch decides whether to
  punish a recovering opponent at all, given what their recovery
  covers, and it is the branch that carries the biggest behavioural
  change in this spec;
- answers threats by transitioning to the covering slot; uses
  withdrawn guards to load attacks it intends;
- chooses among stationary, advancing and retreating versions of an
  attack by measure - advancing to reach from wide, retreating to
  strike while leaving - through the SAME attack definitions and
  movement snapshots the player uses; no AI-only movement physics;
- the policy-coverage discipline applies: each guard-related decision
  branch is named in the AI test suite, so no behaviour ships as
  fallthrough.

## 8. Help

The "?" panel is rewritten around guards, and it must state the rule
that changed most: **your blade defends you wherever it is - while you
gather, while you recover, while you void - but not while you strike,
because committed steel is an attack, not a guard.** A recovery that
arrives in a guard is a guard; a blade sweeping past a line is not. That is the
acceptance rule players will feel first, so it lands in the same
change. `HELP` becomes a typed Record
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
- a HEAVY blade held one-handed in an extended guard accrues strain,
  while a light one and any withdrawn guard rest - weight and moment
  arm decide it, not hand count, so the rapier's own Terza is
  restful and the longsword's is not;
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
contains enough time for the counter to land ON A LINE THE RECOVERING
BLADE DOES NOT COVER**. The second clause is new and follows from
coverage surviving an attack (section 4): time alone stopped being
sufficient the moment a recovering fighter could be defended by where
their blade actually is - asserted over the
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
