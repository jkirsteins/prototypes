# physical-foundations: Real bodies, real steel, derived handling

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

The weapon profiles author conclusions that are really consequences.
`bindAuthority: 1.0` is commented "The two-handed grip: presses hardest" -
the grip is the cause, but the grip exists nowhere in the model; the
conclusion is written on the sword. Fighters have no body at all: no
strength, no height, no hands. Nothing can therefore ask "what if this
fighter held this sword differently?", which is exactly the question the
guard-position and grip-switching specs need answered.

This spec gives weapons physical facts in real units (kilograms,
centimeters), gives fighters attributes in real units (stature, torque
capacities, hand speed), introduces **handling modes** (one-handed /
two-handed) as fighter state, and replaces the authored handling
conclusions with **derivations** from those facts - the `canBind` pattern
(emergent-outcomes rule) applied to everything the grip decides.

**The whole spec is behavior-neutral.** The baseline body and the
calibration constants are chosen so every derived quantity reproduces
today's shipped values exactly. The golden replay hash must not change.
This spec delivers a model, not a rebalance.

**Delivers:** weapon physical facts, fighter attributes, handling
modes with derived availability gates, derived bind/handling
quantities, derived reach, the hold-strain accumulator (dormant at
baseline), the equivalence golden test.

**Depends on:** `sustained-bind` and `pressure-and-winding` (whose
authored quantities this spec re-derives), `preparation-and-readiness`
(the one-simulation doctrine: attributes are per-fighter data and must
never condition on which side controls the fighter).

---

## 1. Weapon physical facts

`WeaponProfile` gains, replacing nothing yet:

| field       | unit | longsword | rapier | meaning                                    |
|-------------|------|-----------|--------|--------------------------------------------|
| `massKg`    | kg   | 1.5       | 1.3    | total mass                                 |
| `balanceCm` | cm   | 8         | 6      | center of mass forward of the crossguard   |
| `bladeCm`   | cm   | 100       | 108    | crossguard to point                        |
| `hiltCm`    | cm   | 25        | 12     | grip room behind the crossguard            |
| `taper`     | -    | tuned     | tuned  | mass-distribution coefficient (see 4.2)    |

`bladeStiffness` stays as-is. The example values are a starting solution;
implementation may adjust them (and the calibration constants of section
4) freely **as long as the equivalence tests of section 7 hold exactly**.
The values must stay physically plausible - a reviewer with a HEMA
background should not laugh at them.

## 2. Fighter attributes

A new `Attributes` record on the fighter (data, not identity - the AI's
fighter and the human's fighter carry the same struct, per the doctrine):

| field               | unit | baseline | meaning                                   |
|---------------------|------|----------|-------------------------------------------|
| `statureCm`         | cm   | 175      | drives arm reach, hand width, travel arcs |
| `peakTorqueNm`      | N*m  | tuned    | burst capacity: accelerating the blade, resisting displacement |
| `sustainTorqueNm`   | N*m  | tuned    | holdable capacity: keeping a guard up     |
| `handSpeedMps`      | m/s  | tuned    | unloaded hand speed cap (agility)         |

Both fighters ship with the identical baseline body. Attribute selection
UI, asymmetric bodies and their balance pass are explicitly out of scope
(a later spec); what this spec guarantees is that when they arrive, no
derivation needs to change - only inputs.

## 3. Handling modes

```
type HandlingMode = "oneHanded" | "twoHanded";
```

The fighter carries `handlingMode`. How the hands control the weapon is
a separate concept from the guard (where the blade is) and the body
stance (lower body) - the full composition lives in `guard-positions`;
this spec owns only the mode and its physics.

**One-handed is the baseline mode**: every weapon affords it whenever
the hold gate passes, because one hand on a hilt is always physically
possible. Two-handed is the option that exists only where the hilt has
room. The duel-start mode, however, is the weapon's **conventional
mode**, itself derived, not authored: the available mode with the
higher derived control torque (4.1). That lands longsword -> twoHanded
and rapier -> oneHanded from the numbers alone. In-duel switching is
the `grip-switching` spec; nothing here adds inputs.

### Availability gates - the only hard denies

Both live in one shared module (`src/combat/handling.ts`), both are
thresholds on derived quantities, per the emergent-outcomes rule:

- `canGripTwoHanded(f, w)`: `w.hiltCm >= 2 * handWidthCm(f)` where
  `handWidthCm = statureCm / 19`. Two hands need room to sit on the
  hilt. Longsword (25cm vs ~18.4) passes; rapier (12cm) fails.
- `canGripOneHanded(f, w)`: `staticHoldTorqueNm(w, fullyExtended) <=
  sustainTorqueNm(f, oneHanded)`. If one arm cannot keep the point up at
  all, the grip is denied. Both shipping weapons pass at baseline -
  Fiore's sword in one hand is real, and the model must allow it. The
  gate exists for future heavy steel and weak bodies, not for today's
  roster.

Everything past a gate is priced, never forbidden: the impractical is
playable and merely bad, which is the design's stated intent.

## 4. Derivations

All in `src/combat/handling.ts`, all reading (weapon facts, attributes,
grip) - never a weapon id, never a side.

### 4.1 Control torque (leverage)

Two hands separated on a hilt form a force couple; one hand has the
wrist alone:

```
handSeparationM(f, w, grip) = grip == twoHanded
    ? (w.hiltCm - handWidthCm(f)) / 100
    : 0
controlTorqueNm(f, w, grip, capacity) =
    wristTorqueNm(capacity) + handSeparationM * coupleForceN(capacity)
```

`capacity` selects peak or sustain. This one function is the spine of
the model: bind authority, displacement resistance and the one-hand gate
all read it.

### 4.2 Rotational inertia

```
inertiaKgM2(w) = w.massKg * radiusOfGyrationM(w)^2
```

with `radiusOfGyration` from a tapered-rod approximation over `bladeCm`,
`balanceCm` and `taper`. This is deliberately a model, not physics
homework: one formula, two calibratable inputs, and the acceptance
criterion is section 7, not textbook accuracy.

### 4.3 The bind quantities, derived

The three authored conclusions become outputs, and the profile fields
are **deleted**:

```
bindAuthority(f, w, grip)     = controlTorquePeak / ANCHOR_TORQUE
bindHandling(f, w, grip)      = HANDLING_CAL * handSpeedMps / sqrt(inertiaKgM2)
rotationalControl(f, w, grip) = ROTATION_CAL * wristTorquePeak / inertiaKgM2
```

`ANCHOR_TORQUE` is the baseline two-handed longsword's control torque,
making its authority exactly 1.0 by construction, matching the existing
anchor comment. The calibration constants and physical inputs are solved
so the six shipped values (1.0 / 0.7 / 0.7 and 0.55 / 1.15 / 1.1) are
reproduced **exactly** at baseline. `src/combat/bind.ts` calls the
derivations at its existing read sites; its formulas do not change.

### 4.4 Reach, derived

The authored `reach` field is deleted and derived:

```
reachCm(f, w, grip) = armReachCm(f) + w.bladeCm + w.hiltCm
                    + (grip == oneHanded ? profilingBonusCm(f) : 0)
```

with `armReachCm = statureCm * 3/7` (= 75 at baseline) and
`profilingBonusCm = statureCm * 9/35` (= 45): a one-handed grip frees
the body to turn side-on, adding shoulder rotation to the line. At
baseline this reproduces the shipped values exactly: longsword
two-handed 75 + 125 = 200, rapier one-handed 75 + 120 + 45 = 240. It
also quietly prices the future: a one-handed longsword reaches 245 -
di Grassi's released-hand extension, emergent - but nothing in this
spec exposes that grip yet.

### 4.5 Static hold torque

```
staticHoldTorqueNm(w, extension) = w.massKg * g * momentArmM(w, extension)
```

where the moment arm grows as the posture advances the point (a
withdrawn blade rests near the body; an extended one cantilevers). In
this spec only two extension inputs exist (the current stance rest and
the held guard) and both demand far below baseline sustain capacity -
the quantity becomes load-bearing when `guard-positions` gives postures
real geometry.

## 5. Hold strain

A per-fighter accumulator, ticked by the engine:

```
demand = staticHoldTorqueNm(current posture) / sustainTorqueNm(f, grip)
strain' = demand > REST_FRACTION
    ? strain + (demand - REST_FRACTION) * STRAIN_RATE * dt
    : max(0, strain - STRAIN_DECAY * dt)
```

Strain multiplies transition times and divides displacement resistance
(both factors are 1.0 at strain 0). **At baseline with conventional
grips, demand never exceeds `REST_FRACTION`, strain is identically zero
and no behavior changes** - the golden replay proves it. The mechanism
ships now because `guard-positions` and `grip-switching` both price
"holding the extended guard for a long time" through it, and it must be
tested (unit tests drive it with above-threshold synthetic inputs) before
anything depends on it.

## 6. What is explicitly out of scope

- Attribute selection UI and asymmetric bodies (later spec, with its own
  balance pass over the tempo-economics invariants).
- The in-duel grip switch action (`grip-switching`).
- Guard postures and any change to defense or attack timing
  (`guard-positions`).
- Deriving `heightChangeMs`, `sideChangeMs`, `guardShiftMs`, `firmUpMs`
  or the attack timings - those fall to `guard-positions`, where the
  postures they measure between exist.

## 7. Testing

- **Golden replay unchanged.** The existing name-free per-tick hash
  replay must be byte-identical before and after. This is the spec's
  headline promise and the reason it can land without a playtest.
- **Equivalence test:** derived bindAuthority / bindHandling /
  rotationalControl / reach at baseline equal the old constants exactly
  (strict equality, not epsilon - the calibration is solved, not
  approximated).
- **Gate matrix test:** compute `canGripTwoHanded` / `canGripOneHanded`
  over all weapons x the baseline body from the derivations and pin the
  shape (longsword: both; rapier: one-handed only). The test names no
  weapon in its logic - it pins the computed matrix, so a future sword
  lands in the matrix without new control flow.
- **Strain unit tests:** synthetic above-threshold demand accumulates,
  decays, and scales the two effect factors; baseline inputs produce
  zero forever.
- **Doctrine test:** attributes are read from the fighter, never from
  the side; the timeline-symmetry test extends to cover two fighters
  with identical bodies and different controllers.

## 8. Playtest

There is nothing to play - that is the point. Run the game before and
after; they must be indistinguishable, and the golden replay is the
referee. What would look wrong: any felt difference at all.
