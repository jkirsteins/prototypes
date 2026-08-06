# grip-switching: Changing handling mode mid-duel

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

`physical-foundations` made handling mode fighter state and derived what
each mode is worth; `guard-positions` authored realizations for both
modes. This spec adds the verb: **switching handling mode during the
duel**. A strong fighter takes one hand off the longsword to steal
reach; a pressed fighter puts the second hand back on before the bind.
The gamble prices itself through the existing derivations - this spec
adds no new physics, only the action, its window, and the AI's and
help panel's understanding of it.

Historical anchor: Fiore's sword in one hand; di Grassi's released-hand
extension of the two-handed sword's thrust. The model already produces
the payoff (the one-handed profiling bonus adds tens of centimeters of
derived reach over the same sword two-handed) and the price (wrist-only
control torque, strain in extended guards); the switch makes both
reachable in play. Whether the one-handed longsword's reach lands above
or below the rapier's is a calibration outcome the suitability matrix
pins - the gamble is priced either way, because the opponent's measure
expectations are set by the two-handed grip they were just fencing.

**Delivers:** the `gripSwitch` action on both schemes, the switch
transition and its emergent costs, mode-resolved realization morphs
within one family (Langort <-> Terza in `longpoint`; Pflug stays
Pflug), AI switching policy, help entries, the extended suitability
matrix tests.

**Depends on:** `physical-foundations` (gates, derivations),
`guard-positions` (realizations for both modes), `skeletal-renderer`
(both modes' poses drawable).

---

## 1. The action

A new `ActionId` `gripSwitch`, per the two-schemes rule: union entry,
labels in every scheme table, pad binding.

- Keyboard: `G`.
- Pad: left trigger (button 6, digital press) - unbound today, and the
  left hand's squeeze mirrors the right trigger's disarm grab: both
  read as the hands doing something to a weapon. (Stick clicks 10/11
  remain the fallback if playtest dislikes the trigger.) The legend and
  help tests keep the labels honest.

One press toggles between the modes the gates allow. If the other mode
is unavailable (rapier: two-handed fails the hilt-room gate; a heavy
future blade: one-handed fails the hold gate), the press is a no-op and
the activity log says why - the denial is the gate's derived verdict,
surfaced, never a silent nothing.

## 2. The switch transition

Switching is a transition, not an instant:

Both endpoints are realization rows of the same family in the two
handling modes, so every travel the switch interpolates is a
difference of authored numbers - `secondaryHandCm` (resolved through
the weapon's grip socket when `"onSocket"`), `primaryHandCm`,
`weaponAngleDeg` and `torsoProfileDeg`, all added to the row schema by
`guard-positions` for exactly this reason:

```
switchMs(f, w, family) =         // from -> to realization, at f's stature
  max( profileMs(|d secondaryHandCm| / 100, HAND_ACCEL / s,  handSpeedMps / s),
       profileMs(|d primaryHandCm|   / 100, HAND_ACCEL / s,  handSpeedMps / s),
       profileMs(rad(|d weaponAngleDeg|),   alpha / s,       omegaCap / s),
       profileMs(rad(|d torsoProfileDeg|),  TORSO_ACCEL / s, torsoOmegaCap / s) )
  + SETTLE_MS      // s = strainFactor(f); alpha reads f.engagement, which
                   // is itself sweeping across this interval - evaluate it
                   // at the midpoint, the one value the whole travel shares
```

Strain scales BOTH terms of ALL FOUR profiles - a strained fighter's
switch is slower whichever part of the body is setting its tempo. An
earlier draft left the torso terms unscaled, which would have made a
torso-dominated switch strain-invariant.

`profileMs`, `alpha` and `omegaCap` are `guard-positions`' shared
motion profile, unchanged, and `SETTLE_MS` is the same shared constant
that spec's transitions use - the switch settles like any other blade
motion, and there is exactly one settle constant in the model.
**Units are explicit at every call**: `profileMs` returns
milliseconds (`profileSec * 1000`), so adding `SETTLE_MS` is
dimensionally sound; hand travels are authored in cm and divided to
metres; angles are authored in degrees and converted by `rad()`,
because the angular profile's `alpha` is rad/s^2 and its cap rad/s.
`strainFactor` is `physical-foundations`' effect function (>= 1,
exactly 1 at zero strain) - never the raw strain accumulator, which
is identically zero at baseline. The slowest-moving part sets the
tempo; within one family the realizations are close and the off-hand's
travel usually dominates, but the formula, not that assumption, is
normative. `TORSO_ACCEL` and `torsoOmegaCap` come from `guard-positions`
alongside the rest of the motion profile.

Mid-switch control is defined, not improvised. `engagement` is the
fighter's physical truth and `handlingMode` only a label derived from
it (`physical-foundations` 4.1), so there is no second quantity to
keep in step:

```
secondaryHandEngagement = lerp(fromEngagement, toEngagement, progress)
  where engagement(twoHanded) = 1, engagement(oneHanded) = 0
        progress = elapsedMs / durationMs
```

so two-handed -> one-handed DECREASES from 1 to 0 and the reverse
increases - the direction is in the endpoints, never in an assumption
about which way a switch runs. The shared control-torque derivation
takes this number directly and `handSeparationM` reads the weapon
alone, so BOTH directions scale: an inbound switch gains leverage as
the hand seats, an outbound one loses it as the hand leaves. "Met
weakly mid-switch" below means this number, nothing scripted.

**Where the switch lives - an explicit concurrent track.** The switch
is a nullable `handlingTransition` field on the fighter (`{from, to,
elapsedMs, durationMs}`, engagement lerped from progress as above),
beside the body state - a track like `guard-positions`' `BladeTrack`,
NEVER a new arm of the exclusive state machine. That is what makes
"step while switching" structurally possible instead of accidentally
forbidden.
Its rules, stated once:

- **May start** while ready, stepping, or voiding. Refused during
  attacks, feints, guard transitions, binds, hitstun, and the
  disarm/exposed/dead states - and refused while one is already
  running. The footwork states are symmetric on purpose: if a void may
  continue through a switch, it may also begin during one, because
  the hands and the feet are genuinely independent and the rule
  should not depend on which started first.
- **While it runs**, attacks, feints and guard changes are refused
  (one blade, one plan - the mirror of the rule above, so a combined
  attack and a switch can never overlap from either side); steps and
  voids may start and continue freely - the hands, not the feet, are
  busy.
- **Interruption freezes the engagement it had.** The reachable case
  is being struck - single-hit lethality means that is where a switch
  usually ends, and the frozen engagement is what the death pose is
  drawn from. Neither a bind nor a parry can interrupt one: a bind
  needs two attacking blades and attacks are refused while a switch
  runs, and a parry deflects the guard rather than seizing it
  (`guard-positions` section 4). The rule is stated for the general
  case and exercised today by the hit. Interruption clears the transition but does NOT snap the mode
  to an endpoint: the fighter keeps the engagement the switch had
  reached - `engagement` is a plain field on the fighter
  (`physical-foundations` 4.1), so nothing needs storing anywhere
  special, and since every derivation reads it rather than the mode
  label (control torque, reach, the bind quantities), there is nothing
  left that can disagree with the geometry. A hand caught halfway onto the hilt is halfway onto
  the hilt, and the engine sees the value the renderer draws.
  Should a survivable interruption ever exist, leaving it resumes the
  switch from that engagement or abandons it back toward an endpoint;
  either way the change is a transition, not a snap.

Because the track is concurrent, the renderer must draw the
combination: `skeletal-renderer` section 7 owns it - deterministic
hand/arm/torso interpolation plus IK for the switch, layered over
continuing lower-body locomotion, with full-body exception clips only
where that layering fails review. The switch is never drawn by
fragmenting an attack performance, which the mutual exclusion above
makes structurally impossible anyway.

The switch interpolates the WHOLE realization - primary hand, weapon
orientation, secondary hand joining or leaving its socket, torso pose -
between the same guard family's two mode realizations. **The guard
family never changes** (`guard-positions`: the slot map does not depend
on mode); only the realization's display name may, where traditions
name the same geometry differently (Langort <-> Terza in the longpoint
family).

There is no scripted vulnerability, and coverage is not special-cased
to achieve it. **Both endpoints share their `lateral`, so the side the
switch covers never moves** - taking the off-hand off the hilt does
not carry the point across the body. The HEIGHT band is an authoring
matter rather than a structural one, since the two realizations do
move the hands: `guard-positions` requires a data test that samples
the whole travel and holds the covered line constant, so a pair of
realizations that would dip out of their band fails the suite instead
of silently opening the fighter up. What the
switch actually costs, all emergent:

- **tempo**: no attack, feint, or guard change may start while the
  hands rearrange (steps may continue - the hands, not the feet, are
  busy);
- **contact resistance**: any contact during the switch reads the
  momentary control torque, which is part-handed mid-rearrange, so a
  PARRY met then is met weakly. A bind cannot occur here at all - it
  needs two attacking blades and attacks are refused while a switch
  runs - which is the same fact the interruption rules rest on;
- being struck mid-switch is being struck: no special state, and the
  existing rules apply to the line the switch's endpoints cover,
  which the shared `lateral` keeps covered throughout.

On completion the fighter stands in the same family's realization for
the new mode - unless steel found them on the way. **A deflection
mid-switch displaces the pose but does not abort the switch**: the
`handlingTransition` runs to its engagement endpoint regardless, since
the hands finish arranging themselves whatever the blade is doing,
while the `BladeTrack`'s destination is rewritten to the displaced
geometry (`guard-positions` section 4).

**The displaced destination keeps following the engagement, or the two
would part company.** The grip-bearing coordinates -
`secondaryHandCm` and `torsoProfileDeg` - are `BladePose` fields, so
freezing them at the deflection tick while `engagement` ran on to its
endpoint would hand the engine a full two-hand couple over a drawn
off-hand still short of the socket: two sources for one visible fact,
and precisely the engine-versus-picture disagreement the renderer
contract forbids. So the displacement moves the destination's BLADE -
its `primaryHandCm`, `weaponAngleDeg` and `lateral` - and leaves the
two grip coordinates resolving from the live engagement toward the
target realization, as they were doing before the steel arrived.

The fighter therefore ends the switch in the new mode, hands where the
new mode puts them, and knocked off line; the standing levels then
transition them out of THAT pose rather than out of the realization
they were aiming for. Reach, control torque, all three bind quantities (each
reads control torque, so each genuinely moves with the mode -
`physical-foundations` 4.3) and the strain rate re-derive on the
completion tick; nothing is cached.

## 3. Emergent consequences (already derived, now reachable)

None of these are new rules; they are `physical-foundations` and
`guard-positions` derivations becoming playable, and the matrix test
extension (section 5) pins each:

- One-handed longsword in Terza (the longpoint family's one-handed
  realization): strain accrues faster than two-handed, because hold
  capacity scales with engagement (`physical-foundations` 5) - the
  shoulder carries the same cantilever with one arm instead of two.
  The profiling bonus adds derived reach the opponent's
  two-handed measure reads did not price, and the thrust preparation is
  near-direct - a real ambush at long measure. The exact reach number
  is calibration, pinned by the matrix, promised nowhere.
- The same posture held: strain accrues against a single arm's
  sustainable shoulder torque, slowing every later transition.
- Large cuts one-handed: the gather and the arc pay wrist-only torque
  against full inertia - visibly slow, honestly bad.
- Any bind entered one-handed against two hands: authority and
  displacement resistance collapse - the shove loses, the guard is
  turned.
- Switching back to two hands before contact restores the bind numbers
  but surrenders the reach - the tempo spent switching is the price.

## 4. AI

Policy branches (named in the coverage test, reaction-emulated like
everything else):

- **Reach steal:** at wide measure with the opponent recovering, a
  longsword AI may switch one-handed and thrust from Terza; it switches
  back when measure closes.
- **Brace:** an AI reading an incoming committed attack while
  one-handed switches to two hands if the transition fits the tempo,
  else retreats - never voluntarily meets force one-handed.
- The AI must also punish the player's switch window like any other
  opening - the same read machinery as windups, no special case.

## 5. Help, log, matrix

- Help entries for the switch and for one-handed play: one sentence for
  what it is, one for the tradeoff; durations via derivation callbacks.
- The activity log records switches and denied switches (with the
  gate's reason) - the route by which a player learns the mechanic
  exists, alongside witnessing the AI do it.
- The suitability matrix test from `guard-positions` extends across
  handling modes: the full worked example (direct thrust effective,
  cuts slow, contact lost, strain over time; a lighter or
  closer-balanced blade fares measurably better) pinned from the
  derivations, never from names.

## 6. Out of scope

- Di Grassi's in-flight release (starting a thrust two-handed and
  releasing mid-strike for extension): a named technique with its own
  trajectory - belongs to the future named-techniques work, not here.
- Off-hand use (dagger, buckler, grappling) - `offHand` stays inert
  data.
- Attribute asymmetry (a weak fighter denied the one-handed longsword
  entirely) - the gate exists, the roster to exercise it does not yet.

## 7. Playtest

Play longsword, switch one-handed at wide measure, and fish with the
Terza thrust; then get greedy and hold it. What must feel right: the
reach steal genuinely lands from a measure your two-handed grip could
not touch, exactly once per opponent lesson; the strain and the first
lost bind teach you to switch back; the AI punishes a switch thrown in
narrow measure. What would look wrong: a switch that
feels free (no window, no cost), a one-handed bind that holds its own,
or the AI never switching and never punishing yours - either would mean
the derivations or the policy branches are not carrying the design.
