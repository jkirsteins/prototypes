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
transition derivation (replacing six authored timing fields), parry as
event, attacks as transitions, repurposed inputs, AI guard play, help
rewrite, the suitability matrix test, re-proven tempo economics.

**Depends on:** `physical-foundations` (attributes, handling modes,
control torque, inertia, strain), `skeletal-renderer` (playtesting
gate - engine and tests may land first, the game cannot ship visibly
without it), `preparation-and-readiness`, `held-guard`, `attack-lines`
(whose mechanics this spec re-founds).

---

## 1. Concepts and composition

```
Weapon         supplies length, mass distribution, hilt geometry, grip room
Handling mode  supplies hand count, grip locations, arm arrangement
Guard position supplies blade position, point direction, side, height, coverage
Body stance    supplies lead foot, weight, width (FUTURE - baked in for now)

weapon + handling mode + guard position (+ stance) = complete posture
```

A **guard family** (Ochs, Vom Tag, Pflug, Alber, Terza) is a reusable
concept independent of the equipped weapon. A **specific guard
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
| high, withdrawn  | vomTag    | Vom Tag                | one-handed Vom Tag     |
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
Every family is authored in BOTH modes - ten realizations - so
availability is universal, the slot map never depends on handling
mode, and **switching handling mode never changes the guard family**
(`grip-switching`). Suitability differences between realizations are
the derivations' business, never the roster's.

The extended column has three height stops (`middle` becomes reachable
- the exact "data change, not a new concept" the `Height` union
reserves); the withdrawn column keeps two. stanceUp/stanceDown move
between the current column's stops; toggling extension at `middle`
retracts to the slot map's authored target (Vom Tag by default - the
gather to the shoulder - and the map lives in guards.json, not code).
Ochs and Pflug have R/L variants on sideShift; longpoint, Vom Tag and
Alber ship one variant each.

No new ActionIds. The `guard` button's meaning sharpens from "parry
raised" to "point extended"; muscle memory (holding it = covering)
carries over. Labels and help text change; bindings do not. The Intent
union renames follow the new meanings (`parry`/`parryRelease` become
extension intents; `stanceUp/Down` select the height family) - names in
code say what they now do.

## 3. Guard data

`src/combat/data/guards.json`, imported statically (Vite), validated by
a test against the TS types - a malformed row fails the suite, so the
file is editable without touching engine code. Per realization row:

```
{
  family, sideVariant, handlingMode,
  displayName,             // "Right Ochs", "Langort", "Terza"
  primaryHandCm: {x, y},   // primary hand transform, body-relative
  weaponAngleDeg,          // desired weapon orientation
  poseRef,                 // upper-body pose id for the renderer
  offHand                  // "onHilt" | "free" (dagger etc., FUTURE)
}
```

**The realization authors the primary hand and the desired weapon
orientation; everything else about the blade is derived** - the
geometry must never be overdetermined:

```
crossguard    = primaryHandCm advanced grip1Cm along weaponAngleDeg
point         = crossguard advanced bladeCm along weaponAngleDeg
blade segment = crossguard -> point
secondary-hand IK target = grip2Cm back along the hilt
                           (two-handed realizations only)
```

A longer blade moves the derived point without touching the pose; the
realization stays weapon-independent, and the secondary hand adapts to
the weapon's grip sockets (`physical-foundations`) instead of being
authored per weapon. There is no authored point position, no authored
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
  p.advanceCm >= EXTENDED_MIN
    ? { height: band(p.heightCm), side: sideOf(sideVariant, facing) }
    : none
```

Extended guards (Ochs, Langort/Terza, Pflug) cover their line;
withdrawn guards (Vom Tag, Alber) cover nothing - they are
attack-loaded (Vom Tag) or an invitation (Alber). This replaces the
parry's `coveredLine` snapshot: what a guard covers is readable from
where the blade IS, for both fighters and the AI alike.

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
  max( handTravelM / handSpeed(f, strain),
       bladeArcRad / angularSpeed(controlTorque, inertia, strain) )
  + SETTLE_MS
```

Hand travel comes from the two realizations' `primaryHandCm`; the
blade arc from their `weaponAngleDeg` and derived point positions;
angular speed from `physical-foundations` (peak torque against
rotational inertia about the grip, scaled by strain). Heavy blade +
weak grip = slow guard changes, emergently. `SETTLE_MS` lives here and
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
current guard + kind + target line
  -> launch config -> [strike, authored] -> resulting guard
```

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
- **Recovery, derived:** the transition from the delivered contact pose
  to the attack's **resulting guard** (a data field per attack kind and
  launch family: a descending cut resolves toward Alber; a thrust
  recovers toward the extended guard of its line). `parriedPenalty` and
  `whiffRecoveryFactor` still apply on top, as today.
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

## 7. AI

The policy layer (`ai.ts`) learns the guard game, with reaction
emulation as its only privilege:

- reads the opponent's realization and in-flight transitions through
  the existing delayed-read machinery - a guard change is a signal like
  a windup;
- attacks into uncovered lines; answers threats by transitioning to the
  covering slot; uses withdrawn guards to load attacks it intends;
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
handling mode - hold demand (strain rate), transition times to adjacent
slots, windup per attack, coverage. The pinned shape must show, among
others, the worked example from the design discussion:

- thrust from Terza (one-handed longpoint): small arc + the one-handed
  profiling reach gain -> fast preparation, long reach (potentially
  effective, any sword - where its derived reach lands against the
  rapier's is calibration, pinned here, promised nowhere);
- large cut from Terza: high rotational demand + wrist-only torque ->
  slow (emergently poor, worse the heavier the blade);
- extended one-handed guards accrue strain; withdrawn ones rest;
- in contact, one hand's control torque -> displaced easily.

No assertion may branch on a weapon or guard name to force a verdict;
the test pins the derived numbers' shape, so retuning moves the matrix
without new control flow.

**Tempo economics are re-proven, not preserved.** The invariants from
the tuning history (every parried and every whiffed attack punishable
by either weapon's thrust; the void always outpricing the parry) are
restated as properties over the DERIVED timing matrix and asserted
across all realizations. Calibration constants are tuned until they
hold. The golden replay WILL change: this spec intends new behavior. A
new golden is recorded only after the playtest below signs off - never
silently (golden-replay refactor gate applies only where behavior must
be preserved; here the re-record is the deliverable).

## 10. Out of scope

- Named techniques (Zornhau, Krumphau, ...): a generic cut from Vom Tag
  is not a Zornhau; those arrive only when their specific trajectories
  and defensive functions are modelled as separate attack definitions.
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
decision with a real travel cost. What would look wrong: any guard
change that snaps instantly; an attack landing through a formed
covering guard; the AI ignoring your guard when choosing lines; a
fighter visibly in one posture while the engine treats them as in
another (the renderer contract exists precisely to forbid this).
