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
  positions - Right Ochs, Left Pflug, Vom Tag, Alber, Terza.
- **Coverage is derived from the position's geometry.** There is no
  separate parry state to maintain.
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
transition derivation (replacing five authored timing fields), parry as
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
family itself. In this version each realization bakes its canonical
lower body in; the future stance extension separates it (see
`skeletal-renderer` for the layered composition).

## 2. The roster and the input grid

Positions map onto a grid the existing controls already express:
**height** (stanceUp/stanceDown) x **extension** (guard button held =
point-forward, released = withdrawn) x **side variant** (sideShift).

| slot            | two-handed realization | one-handed realization |
|-----------------|------------------------|------------------------|
| high, extended  | Ochs (R/L)             | Ochs (R/L), one-handed |
| high, withdrawn | Vom Tag                | Vom Tag, one-handed    |
| low, extended   | Pflug (R/L)            | **Terza** (R/L)        |
| low, withdrawn  | Alber                  | Alber, one-handed      |

**The one naming resolution to review:** the low-extended slot resolves
per handling mode. Two-handed low-extended IS Pflug; the natural
one-handed low-extended guard IS Terza - historically each is that
slot's canonical form in its mode. Terza's two-handed realization
("would substantially change its historical form") and Pflug's
one-handed realization are deliberately not authored; the slot always
resolves to an authored realization. Every other family has both
realizations authored. Vom Tag and Alber ship one variant each
(right-shoulder Vom Tag, centre Alber); Ochs, Pflug and Terza have R/L
variants selected by sideShift. `middle` height stays modelled but
unreachable, as today (types.ts pattern).

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
  displayName,            // "Right Ochs", "Terza"
  handAnchorCm: {x, y},   // body-relative, forward/up
  pointHeightCm,          // where the point sits vertically
  pointAdvanceCm,         // how far forward of the body the point sits
  bladeAngleDeg,          // orientation, drives transition arcs
  leadFoot,               // data now, inert until the stance extension
  offHand                 // "onHilt" | "free" (free = dagger etc., FUTURE)
}
```

Authored values follow the historical postures (Ochs: hilt high beside
the head, point at the face; Pflug: hilt at hip, point at chest; Vom
Tag: blade gathered at the shoulder; Alber: point dropped; Terza: arm
naturally extended, point in line). Exact numbers are authoring, tuned
within the section 9 constraints.

## 4. Coverage, derived

One shared function reads a realization's geometry:

```
covered(realization) =
  pointAdvanceCm >= EXTENDED_MIN
    ? { height: band(pointHeightCm), side: sideOf(sideVariant, facing) }
    : none
```

Extended guards (Ochs, Pflug, Terza) cover their line; withdrawn guards
(Vom Tag, Alber) cover nothing - they are attack-loaded (Vom Tag) or an
invitation (Alber). This replaces the parry's `coveredLine` snapshot:
what a guard covers is readable from where the blade IS, for both
fighters and the AI alike.

**Formedness** survives as the transition's settle clock: a guard
covers only once the transition into it completes (plus the settle
constant), with the same overshoot-at-the-deadline semantics
`parryMeetsAttack` has today. `contact.parryMeetsAttack` is rewritten to
read (realization, settle clock) instead of the parry object; its
contract - formed, covering, both axes match, grace tick for blade
quantization only - is unchanged and its tests carry over.

## 5. Transitions, derived

```
transitionMs(from, to, weapon, fighter, mode) =
  max( handTravelM / handSpeed(f, strain),
       bladeArcRad / angularSpeed(controlTorque, inertia, strain) )
  + SETTLE_MS
```

Hand travel comes from the two realizations' `handAnchorCm`; the blade
arc from their `bladeAngleDeg` and point positions; angular speed from
`physical-foundations` (peak torque against rotational inertia, scaled
by strain). Heavy blade + weak grip = slow guard changes, emergently.

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
small. Each attack is now a transition chain:

```
current guard -> launch config -> [strike, authored] -> resulting guard
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
- **Attack line:** height comes from the current guard family (high
  from Ochs/Vom Tag, low from Pflug/Alber/Terza), side declared by the
  attack kind - both exactly as the current stance-height rule, now
  grounded in a real posture.
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

- thrust from Terza, one-handed: small arc + one-handed reach ->
  fast preparation, longest reach (potentially effective, any sword);
- large cut from Terza one-handed: high rotational demand + wrist-only
  torque -> slow (emergently poor, worse the heavier the blade);
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
