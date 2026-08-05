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
the payoff (one-handed longsword reach 245 via the profiling bonus) and
the price (wrist-only control torque, strain in extended guards); the
switch makes both reachable in play.

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
switchMs(f, w, from, to) derived from hand travel to/from the hilt
(handSpeed, strain-scaled) + a settle constant
```

During the switch the fighter is committed and exposed, matching the
physical truth of rearranging hands on a live blade:

- **coverage is suspended** - the current guard's covered line reads as
  none until the switch completes (the settle clock restarts);
- **no attack, feint, or guard change may start**; steps may continue
  (the hands, not the feet, are busy);
- being struck mid-switch is being struck: no special state, the
  existing hit rules apply to an uncovered fighter.

On completion the fighter stands in the same slot's realization for
the new mode. For the low-extended slot that is the Pflug <-> Terza
morph (`guard-positions` section 2); every other slot swaps to its
other-handed realization of the same family. Reach, control torque,
inertia handling, bind quantities and strain rate all re-derive from
the new mode on the completion tick - nothing is cached.

## 3. Emergent consequences (already derived, now reachable)

None of these are new rules; they are `physical-foundations` and
`guard-positions` derivations becoming playable, and the matrix test
extension (section 5) pins each:

- One-handed longsword in Terza: longest reach in the game (245),
  near-direct thrust preparation - a real ambush at long measure.
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
reach steal genuinely outranges the rapier's answer once; the strain
and the first lost bind teach you to switch back; the AI punishes a
switch thrown in narrow measure. What would look wrong: a switch that
feels free (no window, no cost), a one-handed bind that holds its own,
or the AI never switching and never punishing yours - either would mean
the derivations or the policy branches are not carrying the design.
