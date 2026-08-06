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

**The spec delivers a model, not a rebalance - and changes no
behavior silently.** The baseline body and the calibration constants
are solved so the derived quantities land on today's shipped values;
where a physically plausible model cannot land exactly, the deviation
is documented in the calibration workbook, the golden replay is
re-recorded, and the tempo-economics invariants are re-proven (4.3).
Reach and the availability gates are exact by construction. Anything
that moves, moves on the record.

**Delivers:** weapon physical facts, fighter attributes, handling
modes with derived availability gates, derived bind/handling
quantities, derived reach, displacement resistance, the hold-strain
accumulator (dormant at baseline), the calibration workbook and its
equivalence report.

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
| `bladeCm`   | cm   | 95        | 112    | crossguard to point                        |
| `hiltCm`    | cm   | 25        | 12     | grip room behind the crossguard            |
| `grip1Cm`   | cm   | 7.5       | 5      | primary grip socket centre, behind the crossguard |
| `grip2Cm`   | cm   | 19        | 10     | secondary grip socket centre, further behind |
| `taper`     | -    | tuned     | tuned  | mass-distribution coefficient (see 4.2)    |

**The weapon owns its grip sockets.** Hands sit at sockets; every
distance the derivations use (hand separation, hand-to-point length)
is measured from a socket, never from `hiltCm` - the hilt behind the
hands contributes room and counterweight, not forward length. A
secondary socket is authored on every weapon; whether a second hand
FITS there is the section 3 gate's derived verdict, not the data's
claim (the rapier's socket exists and fails the fit).

`bladeStiffness` stays as-is. The example values are a starting
solution; the calibration workbook (section 7) may adjust them and the
calibration constants freely, subject to two constraints that pull
against each other on purpose: the derived quantities must land on
today's shipped values or document why they cannot (4.3), and the
values must stay physically plausible - a reviewer with a HEMA
background should not laugh at them. Plausibility wins ties; that is
what makes the deviation report meaningful rather than a formality.

## 2. Fighter attributes

A new `Attributes` record on the fighter (data, not identity - the AI's
fighter and the human's fighter carry the same struct, per the doctrine):

| field                 | unit | baseline | meaning                                   |
|-----------------------|------|----------|-------------------------------------------|
| `statureCm`           | cm   | 175      | drives arm reach, hand width, travel arcs |
| `wristTorquePeakNm`   | N*m  | tuned    | burst torque one wrist/forearm can apply about the grip |
| `wristTorqueSustainNm`| N*m  | tuned    | wrist torque holdable without strain      |
| `shoulderTorquePeakNm`| N*m  | tuned    | burst torque about the shoulder (raising, resisting bodily displacement) |
| `shoulderTorqueSustainNm` | N*m | tuned | shoulder torque holdable: what keeps an extended arm up |
| `handForcePeakN`      | N    | tuned    | burst push/pull force of one hand (the couple's input) |
| `handForceSustainN`   | N    | tuned    | holdable push/pull force of one hand      |
| `handSpeedMps`        | m/s  | tuned    | unloaded hand speed cap (agility)         |

Each derivation names the joint it reads: wrist torque governs point
control, the two-hand force couple governs leverage on the blade,
shoulder torque governs holding and moving the extended arm. `peak`
feeds accelerations and contests; `sustain` feeds holds and strain.

Both fighters ship with the identical baseline body. Attribute selection
UI, asymmetric bodies and their balance pass are explicitly out of scope
(a later spec); what this spec guarantees is that when they arrive, no
derivation needs to change - only inputs.

## 3. Handling modes

```
type HandlingMode = "oneHanded" | "twoHanded";
```

The fighter carries `engagement` in [0,1] (4.1); `handlingMode` is the
LABEL for its endpoints, computed where a data selection needs one -
which realization row to stand in, which gate to check - and a switch
in progress simply has no label, because nothing that matters mid-
switch consults one. How the hands control the weapon is
a separate concept from the guard (where the blade is) and the body
stance (lower body) - the full composition lives in `guard-positions`;
this spec owns only the mode and its physics.

**One-handed is the baseline mode**: every weapon affords it whenever
the hold gate passes, because one hand on a hilt is always physically
possible. Two-handed is the option that exists only where the hilt has
room. The duel-start mode, however, is the weapon's **conventional
mode**, itself derived, not authored:

```
engagementOf(mode) = mode == twoHanded ? 1 : 0

conventionalScore(f, w, mode) =
    reachCm(f, w, engagementOf(mode))              // what the mode BUYS
  * min(1, wieldRatio(f, w, engagementOf(mode)))   // can you FENCE it?

wieldRatio(f, w, engagement) =           // 1.0 = fully competent
    controlTorquePeak(f, w, engagement)
  / (inertiaGripKgM2(w) * TARGET_ALPHA)  // TARGET_ALPHA in rad/s^2: the
                                         // torque a fencer needs to
                                         // turn THIS blade briskly
conventionalMode = argmax over AVAILABLE modes
```

**The trade has to be able to go either way, or it is not a
derivation.** Comparing raw control torque would be a tautology: the
couple term is non-negative, so two hands always win and no weapon
could ever be conventionally one-handed however light its blade -
and dividing both modes by a mode-independent hold demand does not
help, because the same divisor cannot reorder them. What actually
differs per mode is what the mode BUYS: one hand frees the body to
profile and adds reach. So the score multiplies reach by a control
term that SATURATES - once a mode can WIELD the weapon competently,
extra torque buys nothing and the reach decides.

**The saturating term asks about wielding, not holding, and that
distinction is what makes the derivation work at all.** Holding is
already the one-handed gate's question (section 3), and every weapon
that passes that gate can by definition hold its resting guard - so a
hold-based ratio would saturate in BOTH modes for every available
weapon, reach would always win, and nothing could ever be
conventionally two-handed. Wielding is the question that actually
separates them: a longsword's grip moment needs more torque to turn
briskly than one wrist can deliver, so its one-handed ratio sits below
1 and drags the score under the two-handed one despite the extra
reach; a light, close-balanced sword turns fine in either hand, both
ratios saturate, and the reach decides for one-handed. Both outcomes
fall out of `inertiaGripKgM2` and the couple, with no weapon named. A heavy longsword one-handed
falls short of saturation by enough to matter: two-handed wins when
its one-handed ratio is below `reach2H / reach1H` (200/225.5 = 0.887
at baseline), not merely below 1, so the calibration has a real
threshold to hit rather than a trivial one; a light, close-balanced sword
with a long hilt saturates in both modes and starts one-handed for
the reach, which is the historically right answer and one no
tautology could produce.

For today's roster: the rapier is one-handed because two-handed is not
AVAILABLE to it (the hilt gate), so the score is never consulted; the
longsword is two-handed because its one-handed WIELD ratio stays below
saturation and cannot pay for the reach the profiling bonus would add.
`TARGET_ALPHA` is calibrated in the workbook so that this holds for
the shipping longsword and would stop holding for a light enough
blade - it is the threshold that makes the trade real, and section 7
pins the resulting conventional-mode matrix. In-duel switching is the `grip-switching` spec; nothing
here adds inputs.

### Availability gates - the only hard denies

Both live in one shared module (`src/combat/handling.ts`), both are
thresholds on derived quantities, per the emergent-outcomes rule:

Both read `handWidthCm(f) = f.statureCm / 19` (9.21 cm at baseline):

- `canGripOneHanded(f, w)`: the primary hand clears the crossguard
  (`w.grip1Cm >= handWidthCm(f) / 2`) AND the arm can hold the weapon
  out (`staticHoldTorqueNm(f, w, fullyExtended) <=
  f.shoulderTorqueSustainNm`). If one arm cannot keep the point up at
  all, the grip is denied. Both shipping weapons pass at baseline -
  Fiore's sword in one hand is real, and the model must allow it. The
  gate exists for future heavy steel and weak bodies, not for today's
  roster. (The rapier's 5 cm socket against a 4.61 cm half-hand is a
  near thing by design: the calibration workbook must not let a
  shipping weapon sit on a gate boundary - see section 7.)
- `canGripTwoHanded(f, w)`: both hands fit their sockets -
  `w.grip2Cm + handWidthCm(f) / 2 <= w.hiltCm` - and the sockets are
  at least a hand apart (`w.grip2Cm - w.grip1Cm >= handWidthCm(f)`).
  Longsword (19 + 4.61 <= 25, separation 11.5 >= 9.21) passes; rapier
  (10 + 4.61 > 12) fails.

Everything past a gate is priced, never forbidden: the impractical is
playable and merely bad, which is the design's stated intent.

## 4. Derivations

All in `src/combat/handling.ts`, all reading (weapon facts, attributes,
handling mode) - never a weapon id, never a side.

### 4.1 Control torque (leverage)

Two hands at their sockets form a force couple; one hand has the wrist
alone:

```
handSeparationM(w) = (w.grip2Cm - w.grip1Cm) / 100   // weapon only
controlTorqueNm(f, w, capacity, engagement) =
    wristTorqueNm(f, capacity)
    + engagement * handSeparationM(w) * handForceN(f, capacity)
```

`capacity` selects peak or sustain. **`engagement` is the secondary
hand's seatedness in [0,1], and it is the ONLY thing that scales the
couple** - `handSeparationM` reads the weapon alone. An earlier draft
gated the separation on `handlingMode` as well, which silently zeroed
the couple for the whole of a one-handed -> two-handed switch: the
engagement climbed from 0 to 1 while the mode still said one-handed,
so a fighter with both hands visibly on the hilt had no leverage at
all. One scaler, no gate.

**Engagement is the physical truth; `handlingMode` is a label derived
from it.** It lives on the FIGHTER as `engagement` in [0,1] - one
field, always present, whether or not a switch is running - and
`grip-switching`'s `handlingTransition` only drives it. That is why an
interrupted switch needs no special storage: the fighter keeps the
`engagement` they had. `engagement == 1` is two-handed, `0` is one-handed, and
anything between is a switch in progress. The mode selects DATA -
which realization row to stand in, which availability gate to check -
and never appears in a physics formula; every derivation that cares
about the hands takes `engagement`. That is what makes an interrupted
switch coherent (`grip-switching`): a fighter frozen at 0.9 has 0.9 of
the couple, 0.9 of the way through the profiling bonus, and no
contradiction to resolve.

**Control torque is a property of the BODY AND GRIP, not of the
blade.** A wrist applies the torque it can apply whatever it holds, so
no inertia term belongs here: every consumer already divides by what
matters to it - the grip or contact MOMENT where the blade must be
turned (4.3), the contact ARM where a force is wanted - and folding
inertia in as well would
double-count it - guard changes and bind handling would scale with the
inverse SQUARE of blade inertia, which no physics supports. The
weapon's influence enters where it physically acts, one level down.

`contactArmM(w)` is the other geometric fact the bind needs: the lever
arm from the primary grip socket to the blades' reference crossing
point, derived from `grip1Cm` and `bladeCm`. Torque divided by that
arm is the FORCE the hands can put into the contact, which is what
pressing in a bind physically means.

This function and `contactArmM` are the spine of the model: bind
authority, displacement resistance and contest reads all go through
them.

**Displacement resistance**, named here because two later specs
consume it: how strongly a fighter holds a line against steel pushing on it.

```
displacementResistanceN(f, w, engagement) =
    controlTorqueNm(f, w, peak, engagement) / contactArmM(w) / strainFactor(f)
```

A one-handed grip loses the couple term and so most of the force;
strain erodes what remains. `guard-positions` reads it when steel
meets a formed guard, `grip-switching` when contact lands mid-switch.

### 4.2 Rotational inertia: one distribution, two moments

A single mass-distribution model over (`massKg`, `balanceCm`,
`bladeCm`, `taper`) yields **two independent moments**:

```
inertiaGripKgM2(w)    // about the primary grip socket:
                      // swinging the whole weapon, changing guards
inertiaContactKgM2(w) // about a mid-blade reference contact point:
                      // rotating the blade around a bind contact
```

They are different integrals of the same distribution, so their ratios
across weapons are independent, and `taper` is the per-weapon freedom
that moves one without the other. The distribution model is
deliberately simple (a tapered rod plus a pommel point mass behind the
socket); the acceptance criterion is section 7, not textbook accuracy.

### 4.3 The bind quantities, derived

The three authored conclusions become outputs, and the profile fields
are **deleted**:

```
bindAuthority(f, w, engagement)     = (controlTorquePeak(f, w, engagement) / contactArmM(w))
                                / ANCHOR_FORCE
bindHandling(f, w, engagement)      = HANDLING_CAL
                                * sqrt(controlTorquePeak(f, w, engagement)
                                       / inertiaGripKgM2(w))
rotationalControl(f, w, engagement) = ROTATION_CAL * controlTorquePeak(f, w, engagement)
                                / inertiaContactKgM2(w)
```

**All three read control torque, so the grip genuinely lands in all
three** - `grip-switching`'s promise that every bind quantity
re-derives when a hand joins or leaves the hilt is then true rather
than aspirational. Authority is the FORCE the hands put into the
contact (torque over the contact arm), so a one-handed longsword and
a one-handed rapier differ by their geometry rather than collapsing to
the same bare wrist torque; handling is the rate at which that mass
can be moved by the grip holding it; rotational control is torque
against the contact moment. `ANCHOR_FORCE` is the baseline two-handed
longsword's contact force, keeping its authority exactly 1.0 by
construction and matching the existing anchor comment.

#### The calibration is a solve with a documented outcome, not a promise

The six shipped constants (1.0 / 0.7 / 0.7 and 0.55 / 1.15 / 1.1) were
themselves authored guesses. Requiring a physical model to reproduce
six guesses EXACTLY, from plausible masses and balance points, is not
obviously satisfiable - and if it were forced, it would be satisfied
by distorting the physical inputs until a HEMA reviewer laughs, which
defeats the spec. So the workbook (section 7) does this instead, in
order:

1. Author physically plausible values for every weapon fact.
2. Solve the free calibration constants to land the derived six as
   close to the shipped six as that model allows.
3. **Report every deviation.** A derived value within `EPSILON` of its
   shipped constant is equality and nothing changes. Any larger
   deviation is a DELIBERATE behavior change: it is listed in the
   workbook with its cause, the golden replay is re-recorded, and the
   tempo-economics invariants are re-proven with the new numbers.
4. If a deviation is large enough to move the shipping matchups
   qualitatively (a bind pairing flipping, a punisher disappearing),
   that is the signal to revise the model or the physical inputs -
   before wiring, per section 7.

What the spec guarantees is therefore honest: **no silent behavior
change.** Either the model reproduces today's numbers, or every
difference is on the record with fresh evidence behind it.

**The bind API changes shape, and that is part of this deliverable.**
Every read site in `src/combat/bind.ts` takes a `WeaponProfile` and
nothing else today - `lead(firm, w)`, `deriveInitialBindControl(firm, ws)`,
`derivePressurePulse(w)`, `deriveYieldZone(self, opp)` and
`deriveYieldDuration(self)`, plus `createBindContest`, which holds the
weapon pair and calls `lead` directly. All six take the `Fighter`
instead, so
they read attributes AND the live `engagement` - never a mode label,
which could not express a fighter interrupted mid-switch at 0.9. The bind's own formulas - what it does
with authority, handling and rotational control - do not change.

### 4.4 Reach, derived

The authored `reach` field is deleted and derived. Forward length is
measured from the primary hand's socket - the hilt behind the hand is
counterweight, not reach:

```
reachCm(f, w, engagement) =
    armReachCm(f) + w.grip1Cm + w.bladeCm
  + (1 - engagement) * profilingBonusCm(f)
```

**Reach interpolates with the grip, it does not jump.** The profiling
bonus is what a freed off-hand lets the body turn, so it follows the
same `engagement` in [0,1] the couple term does: full at engagement 0
(one-handed), gone at 1 (two-handed), and CONTINUOUS in between. A
mid-switch fighter therefore has a mid-switch reach, which is what
keeps `skeletal-renderer`'s rule - drawn reach equals derived reach -
satisfiable while the torso is visibly turning. A discrete
mode-keyed bonus would step 25.5 cm in one tick under a smoothly
interpolating pose.

`armReachCm` (body centre to primary hand at full extension) and
`profilingBonusCm` (the side-on shoulder rotation a one-handed grip
frees) are stature-proportional; with the section 1 example values,
longsword two-handed 97.5 + 7.5 + 95 = 200 and rapier one-handed
97.5 + 5 + 112 + 25.5 = 240 reproduce the shipped reaches exactly
(`armReachCm = statureCm * 39/70`, `profilingBonusCm = statureCm *
51/350`). Those two fractions are the CURRENT solution, not fixed
constants: the workbook solves them together with `grip1Cm` and the
blade lengths, so when milestone zero moves the rapier's socket off
its gate margin the fractions move with it and 200 / 240 still come
out exactly. "No free constants to absorb" means the test cannot be
satisfied by tuning something invisible - not that the inputs are
frozen. The blade lengths carry the weapons' real difference - a
rapier IS the longer blade - so the profiling bonus stays near the
25 cm a shoulder turn can plausibly buy, rather than the 42.5 cm
an earlier equal-blade draft forced it to absorb.
Whether a one-handed longsword's derived reach lands above or below
the rapier's is a **calibration outcome, pinned by the suitability
matrix test - not a design promise**: it now depends on real blade
lengths and socket offsets, no longer on hilt length counted as
forward steel.

One boundary, stated for every later spec: **movement changes the
fighter's root position and therefore the live gap; it never modifies
`reachCm`.** An advancing attack (`guard-positions`) lands from
further away because the gap shrinks under it, not because the sword
grew.

**Every reader of `reach` is part of this change.** Deleting the field
touches call sites that today need only a weapon, so each is named
with its resolution:

| site | resolution |
|---|---|
| `measure.ts` (`zoneFor(gap, weapon)`, called from `draw.ts` and `ai.ts`) | takes `(gap, fighter)`; the pure function stays pure, its input widens. |
| `contact.ts` `extension`, `engine.ts` strike resolution, `ai.ts` (3 sites), `draw.ts` reach guides, its in-duel HUD card and `openingPromptText`'s in-range test | all have the fighter in scope already: `reachCm(f, f.weapon, f.engagement)`. |
| `select.ts` weapon-card text ("effective reach N cm") | no fighter exists yet on the select screen: show the **baseline body in the weapon's conventional mode**, labelled as such, so the number the player compares is the one they will fence with. |

Five test files read `WEAPONS.*.reach` directly (`weapons`, `engine`,
`blade-contact`, `parry-rise`, `preparation-readiness`); they move to
the derivation with the baseline body, which is the same number. A
sixth, `measure.test.ts`, calls `zoneFor` with a profile and follows
that signature's widening. A test asserts no call site anywhere - source or test - reads
a stored reach: the field is gone, not deprecated.

### 4.5 Static hold torque

Hold demand is measured **about the shoulder** - the joint that
carries an extended arm-plus-weapon cantilever; the wrist merely
orients the blade:

```
staticHoldTorqueNm(f, w, posture) =        // g = 9.81 m/s^2
    w.massKg * G * (posture.armExtensionCm + w.grip1Cm + w.balanceCm) / 100
```

- the horizontal shoulder-to-CoM distance, authored in centimetres
like every other length and divided to metres at the one place it
enters an SI formula. The arm's own mass moment is a constant
folded into `REST_FRACTION` (section 5), not modelled per posture. In
this spec only three posture inputs exist - the resting guard, the
held guard, and the fully-extended arm the one-handed gate probes,
which is the highest-demand of the three and therefore the one that
binds the gate and all three demand far below the baseline shoulder
sustain capacity - the quantity becomes load-bearing when
`guard-positions` gives postures real geometry.

## 5. Hold strain

A per-fighter accumulator, ticked by the engine:

```
demand  = staticHoldTorqueNm(f, w, current posture)
        / holdCapacityNm(f, f.engagement)
holdCapacityNm(f, engagement) =        // two arms share the cantilever
    f.shoulderTorqueSustainNm * (1 + (TWO_ARM_SHARE - 1) * engagement)
strain' = demand > REST_FRACTION                    // strain in [0, 1]
    ? min(1, strain + (demand - REST_FRACTION) * STRAIN_RATE * dt)
    : max(0, strain - STRAIN_DECAY * dt)            // dt in MILLISECONDS,
                                                    // so both rates are per-ms
```

**The one effect function, defined here and read everywhere:**

```
strainFactor(f) = 1 + STRAIN_PENALTY * f.strain        // >= 1, exactly 1 at 0
```

Every consumer divides by it or multiplies by it in the direction that
makes strain hurt: `guard-positions` and `grip-switching` divide the
motion profile's acceleration and speed cap by `strainFactor`, so a
strained fighter's transitions take longer; contact derivations divide
displacement resistance by it. Consumers never read the raw `strain`
accumulator - it is identically zero at baseline, so dividing by it
would be a division by zero, and the factor exists precisely to give
them a safe, unit-free quantity.

**At baseline with conventional grips, demand never exceeds
`REST_FRACTION`, strain is identically zero, `strainFactor` is exactly
1 and no behavior changes** - the golden replay proves it. The mechanism
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

- **The calibration workbook exists BEFORE engine wiring**, and it is
  milestone zero: the concrete mass-distribution formula, the numeric
  `taper` values, both computed moments per weapon, `contactArmM`,
  every calibration constant, and the **equivalence report** - each of
  the six derived quantities beside its shipped constant, with the
  deviation. A model that cannot get close with plausible inputs sends
  the spec back for revision rather than being forced; that decision is
  made here, on paper, not discovered mid-wiring.
- **Exact-by-construction test:** derived `reachCm` for both weapons in
  their conventional modes equals the shipped 200 / 240 exactly, and
  the gate verdicts match. These have no free constants to absorb -
  they are arithmetic, and they hold or the numbers are wrong.
- **Equivalence test:** six values - three bind quantities x two
  weapons in their conventional modes. Three of them (the longsword's)
  are exact by construction, since `ANCHOR_FORCE`, `HANDLING_CAL` and
  `ROTATION_CAL` are solved on it; **the rapier's three are what this
  test actually proves**. For each, the
  derived value equals its shipped constant within `EPSILON`, OR the
  workbook lists it as an accepted deviation. The test reads the
  workbook's own table, so an undocumented drift fails even when it is
  small.
- **Golden replay:** unchanged if the workbook lists no deviations. If
  it lists any, the golden is re-recorded IN THE SAME COMMIT as the
  workbook entry that explains it, and the tempo-economics invariants
  re-run - never a silent re-record.
- **Gate matrix test:** compute `canGripTwoHanded` / `canGripOneHanded`
  over all weapons x the baseline body from the derivations and pin the
  shape (longsword: both; rapier: one-handed only). The test names no
  weapon in its logic - it pins the computed matrix, so a future sword
  lands in the matrix without new control flow. It also asserts a
  **clearance margin** per threshold, each in that threshold's own
  units - three lengths (primary-socket clearance, hilt fit, socket
  separation) and one torque (the shoulder-sustain hold gate) - so no
  shipping weapon sits near a boundary and a gate verdict is never a
  rounding accident.
  The rapier's 5 cm socket against a 4.61 cm half-hand is 0.4 cm of
  clearance where every other LENGTH gate margin is 1.39 cm or more: milestone zero
  MUST move it, not may.
- **Conventional-mode matrix test:** compute `conventionalMode` for
  every weapon x the baseline body and pin the shape (longsword
  two-handed, rapier one-handed). Like the gate matrix it names no
  weapon in its logic, so `TARGET_ALPHA`'s calibration is what the
  test actually holds to account - and a future light sword landing
  one-handed changes the matrix rather than needing new control flow.
- **Weapon-blindness test:** one-handed `bindAuthority` DIFFERS between
  the two weapons. The baseline ships the longsword two-handed and the
  rapier one-handed, so a derivation that collapsed to the bare wrist
  would hide behind the equivalence test; this is what catches it.
- **Strain calibration constraint**, named because two specs depend on
  it, and it is about WEIGHT rather than hand count: `REST_FRACTION`
  must sit ABOVE every weapon's demand in its own conventional mode -
  including the rapier's one-handed Terza, which is its ordinary
  standing game and must rest indefinitely - and BELOW the demand of a
  heavy blade held one-handed, so `grip-switching`'s one-handed
  longsword actually tires. The 1.3 kg rapier and the 1.5 kg longsword
  sit on opposite sides of it because they weigh different amounts at
  different balance points, not because of how many hands hold them.
  The workbook solves for it and this test pins both sides.
- **Strain unit tests:** synthetic above-threshold demand accumulates,
  decays, and moves `strainFactor` in the direction that hurts; baseline inputs produce
  zero forever.
- **Doctrine test:** attributes are read from the fighter, never from
  the side; the timeline-symmetry test extends to cover two fighters
  with identical bodies and different controllers.

## 8. Playtest

If the workbook lists no deviations there is nothing to play, and that
is the ideal outcome: run the game before and after, they must be
indistinguishable, and the golden replay is the referee. If it lists
deviations, play exactly what they touch - the bind above all: press,
yield and wind with both weapons, both grips, and see whether the
contest still reads. What would look wrong: any felt difference the
workbook does not already name.
