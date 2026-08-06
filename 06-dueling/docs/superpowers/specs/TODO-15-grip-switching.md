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
transition and its vulnerability, mode-resolved realization morphs
(Pflug <-> Terza), AI switching policy, help entries, the extended
suitability matrix tests.

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

```
switchMs(f, w, guard) =
  max( off-hand travel to/from its grip socket,
       primary-hand travel between the two realizations,
       weapon rotation between them (profileTime, as guard transitions),
       torso adjustment )
  + SETTLE
```

The duration prices every motion the switch actually interpolates -
the same `profileTime` model as `guard-positions` transitions, so the
slowest-moving part sets the tempo. Within one family the realizations
are close and the off-hand's travel usually dominates; the formula, not
that assumption, is normative.

Mid-switch control is defined, not improvised: a
`secondaryHandEngagement` in [0,1] follows the off-hand's travel
fraction, and the shared control-torque derivation
(`physical-foundations` 4.1) accepts it - the couple term scales by
engagement, so completed one-handed and two-handed modes are exactly
its 0 and 1 endpoints. "Met weakly mid-switch" below means this
number, nothing scripted.

The switch interpolates the WHOLE realization - primary hand, weapon
orientation, secondary hand joining or leaving its socket, torso pose -
between the same guard family's two mode realizations. **The guard
family never changes** (`guard-positions`: the slot map does not depend
on mode); only the realization's display name may, where traditions
name the same geometry differently (Langort <-> Terza in the longpoint
family).

There is no scripted vulnerability. **Coverage follows the
interpolated blade geometry through the same derivation as always** -
taking the off-hand away does not move the point out of the line, so a
switch inside an extended guard largely keeps covering, and the
simulation never declares a visibly-in-line blade absent. What the
switch actually costs, all emergent:

- **tempo**: no attack, feint, or guard change may start while the
  hands rearrange (steps may continue - the hands, not the feet, are
  busy);
- **contact resistance**: any contact during the switch reads the
  momentary control torque, which is one-handed at best mid-rearrange -
  a parry or bind met mid-switch is met weakly;
- being struck mid-switch is being struck: no special state, the
  existing rules apply to whatever the interpolated geometry covers.

On completion the fighter stands in the same family's realization for
the new mode. Reach, control torque, inertia handling, bind quantities
and strain rate all re-derive from the new mode on the completion
tick - nothing is cached.

## 3. Emergent consequences (already derived, now reachable)

None of these are new rules; they are `physical-foundations` and
`guard-positions` derivations becoming playable, and the matrix test
extension (section 5) pins each:

- One-handed longsword in Terza (the longpoint family's one-handed
  realization): the profiling bonus adds derived reach the opponent's
  two-handed measure reads did not price, and the thrust preparation is
  near-direct - a real ambush at long measure. The exact reach number
  is calibration, pinned by the matrix, promised nowhere.
- The same posture held: strain accrues (wrist-only sustain torque
  against a cantilevered 1.5 kg blade), slowing every later transition.
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
