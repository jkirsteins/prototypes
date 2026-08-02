# pressure-and-winding: Pressure and winding

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

## Overview

`sustained-bind` gives the longsword a held beat of contact with no decision in
it. This spec puts the decision in: three choices inside the bind - hold, press,
wind - resolved as a simultaneous mixup in which the right move depends on what
the opponent chooses, and the pressure you can feel tells you their incentives,
never their action.

This is *Fühlen* and *Winden*, the centre of the Liechtenauer system and the
reason the longsword is the doc's richest weapon.

**Delivers:** binds (part 2 of 2), pressure, winding.

**Depends on:** `sustained-bind`.

---

## 1. Pressure is derived, never rolled

Each fighter has a `firmness` in [0, 1], computed **from the contact snapshot
`sustained-bind` stored on the entry tick**. The states firmness describes - the
attack timeline, the parry track - are discarded when the bind begins, so it
cannot be recomputed later; it is derived once, at contact, and lives on
`duel.bind`. Nothing is random: pressure is a consequence of the choices both
fighters already made.

```ts
function firmness(c: BindContact, w: WeaponProfile): number;
```

**From a `strike` snapshot:** `progress`, how far through the travelling half
the blade was when met. The further into the strike, the more of the body is
behind the blade. A blade met at the start of its travel is soft; one met just
before arrival is hard.

**From a `guard` snapshot:** `min(1, settledMs / GUARD_SETTLE_MS)`, with
`GUARD_SETTLE_MS = 160`. A guard that became effective one tick before contact
is barely there. A settled guard is braced.

### 1.1 What this does to the parry timing choice

`parry-rise` made the defender choose between committing early (readable,
feintable) and committing late (unreadable, thin margin). Late was strictly
safer against everything except a feint.

Now it is not. An early guard is **firm** in the bind; a late guard is **soft**.
The same decision trades on two axes in opposite directions, which is the shape
a real decision has:

| Guard timing | Against a feint | In the bind |
|---|---|---|
| Early | readable, feintable | firm |
| Late | hard to react to | soft |

No new input and no new number produced this. It falls out of the two mechanics
already built, which is the sign the model is holding together.

---

## 2. The bind mixup

Three choices. **Hold** is the default - it is what pressing nothing means - so
the input adds two intents, on the attack keys, no new bindings:

```ts
type Intent = ... | "press" | "wind";
```

| Choice | Historical shape | What it is |
|---|---|---|
| `press` | pushing through; *Oberhau* from the bind | drive through their blade with strength |
| `wind` | *Winden* | yield, keep contact, go around their pressure |
| hold | remaining in the bind | keep cover, give no pressure, wait |

### 2.1 Resolution: a cycle, not an answer key

An earlier draft judged each fighter's single choice against the opponent's
**visible** firmness: press beat soft, wind beat hard. The correct button was
therefore fully determined by state both players could see, which made the bind
a solved reaction test - dead at exactly the skill level it was aimed at.
Resolution now depends on **both choices**:

| | they hold | they press | they wind |
|---|---|---|---|
| **you hold** | neutral | they win | **you win** |
| **you press** | **you win** | firmer wins; within `FIRMNESS_EPSILON`, neutral | they win |
| **you wind** | they win | **you win** | neutral |

- **Press beats hold:** a static blade is shoved aside.
- **Wind beats press:** their pressure is redirected past you - the harder they
  drive, the further through they fall.
- **Hold beats wind:** winding needs pressure to work around. Against a blade
  giving none, the wind surrenders contact for nothing and opens the winder.
- **Press against press** is the war of strength, and this is where the stored
  firmness decides: the firmer fighter wins, and within `FIRMNESS_EPSILON`
  (0.15) it is a neutral grind.
- **Wind against wind** and **hold against hold** break neutral.

No choice dominates at any firmness, so the bind cannot be solved by looking.
What firmness does is set the **stakes and the incentives**: a fighter who
arrived firm can afford the press-war, a soft one cannot, and both of you can
see it. Reading the bars is reading what the opponent can afford - which is
what *Fühlen* actually is - while the choice itself stays a mixup.

### 2.2 Locking and hiding

`press` or `wind` locks on the keypress: once each, irrevocable, and **hidden
until resolution**. This is the one hidden value in the game, and it is
deliberate: a visible choice collapses the matrix back into the reaction test
§2.1 exists to remove. Firmness is visible because it is feel; intent is hidden
because it is intent.

Resolution fires at `BIND_MS`, or earlier on the tick both fighters have locked
a key choice. Hold is the absence of a lock, so any pairing involving hold
resolves only at `BIND_MS`. Locking early gains nothing and risks nothing - the
opponent cannot see it - so the timing of your press carries no tell.

### 2.3 What winning is worth

Both halves of the outcome are concrete state, defined here:

```ts
// The loser: a body-track state, the same shape as hitstun but nonlethal.
type FighterState = | ... | { kind: "exposed"; t: number } | ...;
// Accepts no intents; at t >= BIND_LOSS_MS it transitions to ready.

// The winner: a decaying timer on the fighter, the same idiom as
// stepRecoveryMs and parryRecoveryMs.
interface Fighter {
  // ...
  bindAdvantageMs: number;   // > 0: the thrust from the bind is available
}
```

`bindAdvantageMs` is seeded with `BIND_ADVANTAGE_MS` on the resolution tick and
decays in the `tickFighter` preamble alongside the other two timers - the
established "time until X changes" idiom, not a new mechanism.

While it is positive, exactly one thing consumes it: **starting a thrust.** The
thrust zeroes the timer and launches on `bindTimeline`, beginning at
`strikeStart` - the point is already in contact and on line, so there is
nothing to gather. Every other accepted intent - a cut, a step, a void, a
parry - **clears the timer to zero and proceeds on its normal rules.** The
advantage is the contact; leaving it is choosing safety over the opening, and
it does not survive in your pocket. That answers the survival questions
directly: it does not survive stepping, it is consumed by the thrust, and it
expires on its own if you admire it.

The cut deliberately gets nothing. A cut must gather the blade up and away from
the bind, which is exactly the preparation the advantage lets you skip; only
the thrust's geometry matches the position the win left you in. (The shape
resembles the sources' *Absetzen*, but the reward does not claim the name - a
distinct *Absetzen* choice remains out of scope, §6.)

```ts
function bindTimeline(w: WeaponProfile): AttackTimeline;   // thrust only
// riseStart = riseEnd = strikeStart = 0; strike and recovery from w.attacks.thrust
```

| Constant | Value |
|---|---|
| `BIND_LOSS_MS` | 320 |
| `BIND_ADVANTAGE_MS` | 200 |
| `GUARD_SETTLE_MS` | 160 |
| `FIRMNESS_EPSILON` | 0.15 |

The arithmetic the first two are chosen for: a longsword thrust from the bind
resolves in 260 ms, inside the loser's 320 ms of exposure, so **taking the
opening immediately kills**. Hesitating 100 ms puts it at 360 ms, and the loser
is back and can void or counter. Winning the bind is decisive and expires if you
admire it.

The winner is not forced to thrust. Stepping out of measure is legitimate and
sometimes better - it spends the advantage on safety instead, since a whiff is
still fatal.

### 2.4 The rise cue is not skipped, it does not exist

The thrust launched on `bindTimeline` has `riseStart === riseEnd === strikeStart
=== 0`, so no `windup` DuelEvent fires and no rise cue plays. This is not a
special case in the audio layer: the mark-based emission from §3.2 of the
state-tracks spec produces nothing because there is no interval to cross. The
blade was never gathered, so there is no rising tone. The `swing` event fires as
normal at `strikeStart`, silent as always.

---

## 3. Presentation

### 3.1 HUD: the pressure bars

Two bars during a bind, one per fighter, in the defence row's position, same
segmented idiom. Each shows that fighter's firmness with a mark at the
`FIRMNESS_EPSILON` band around the opponent's value - the zone where a
press-war grinds neutral. The **opponent's** bar is drawn bright, because their
firmness is what sets your incentives; yours is dimmed.

Making a tactile sense visible is the honest way to model *Fühlen* in a video
game. Hiding it would not simulate feel, it would remove it. What stays hidden
is intent (§2.2), never pressure.

The label reads `bind: they are hard` or `bind: they are soft`, with the bar
underneath for the margin. Prose for the read, bar for the confidence.

### 3.2 Sprites

Both fighters hold `sustained-bind`'s frozen contact poses through the decision.
On a decisive resolution:

- the winner plays their sheet's travelling frame if they attack, or the normal
  transition to `ready` if they do not
- the loser holds their contact frame through `exposed`, which reads as being
  turned out of the bind and unable to recover

The oscillation from `sustained-bind` §4.1 gains an amplitude term from the
firmness difference, so a lopsided bind visibly leans before it resolves.
Renderer-only, derived from `d.time` and the stored firmness pair, outside the
simulation.

### 3.3 Audio

One new DuelEvent, `bindBreak`, emitted **only on a decisive resolution** and
mapped to the existing clash samples.

A neutral break is silent. That is the point: a second clash means somebody won,
and silence means the bind went nowhere. The sound carries information, which is
the same argument that keeps `swing` unmapped.

This does not violate the one-sound-per-attack rule. The attack that entered the
bind already resolved to its single `met` clash at contact and is over; the bind
is a separate event with its own moment. The moment is the resolution tick, not
the keypress that locked the choice, per `AGENTS.md`.

### 3.4 Row 3 and the help panel

Row 3 keeps showing the bind's line from `sustained-bind` §4.4, and on a
decisive resolution the winner's row 3 switches to their new attack's line -
the moment the opening becomes visible.

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. Three
sentences: the choices cycle (press beats hold beats wind beats press), the
press-war goes to the firmer blade, and only an immediate thrust spends the
winner's advantage. `exposed` is a new state, so the typed `HELP` record makes
an undocumented one fail the build.

---

## 4. AI

**Mode 3, the duelist.** Plays a seeded **mixed strategy**, not a read. Base
weights `hold 0.4 / press 0.3 / wind 0.3`, tilted by the visible incentives:
weight shifts toward `press` with its own firmness advantage and toward `wind`
with the opponent's, a few tenths at the extremes. The draw and the lock tick
both come from the seeded rng, so a replay is reproducible, the choice is
unpredictable, and the AI conditions on exactly the information the player has.

The earlier design gave the AI a firmness read plus an error rate. With the
matrix there is nothing to be "right" about before the opponent moves, so
`DUELIST_BIND_ERROR` does not exist; the mixup carries the uncertainty.

**Mode 1, the parry dummy.** Always holds. Every bind against it is won by
pressing - that is the drill: punish a passive bind.

**Mode 2, the drill metronome.** Does not parry, binds only when the player
counter-attacks into it, and always holds.

---

## 5. Tests

- **Firmness is a pure function of the snapshot:** table-driven over
  constructed `BindContact` values, including boundaries - first-tick strike
  near 0, last-parryable-tick strike near 1, one-tick guard 0, settled guard 1
  and capped at 1.
- **All nine matrix cells**, constructed explicitly, including press-press in
  both firmness orders and inside the epsilon band.
- **Hidden intent:** before the resolution tick, the opponent-observable
  projection of the duel is identical whether or not a choice is locked. This
  is the inverse of the golden-replay projection test: the projection must
  *exclude* the locked choice.
- **Resolution timing:** two locked choices resolve on the second lock's tick;
  any pairing with hold resolves at `BIND_MS`; `bindBreak` fires on the
  resolution tick, never on a keypress tick - the exact class of bug
  `AGENTS.md` was written about.
- **Locks are irrevocable:** a second press or wind from the same fighter is
  ignored.
- **The reward window:** a thrust started on the tick the bind is won kills;
  the same thrust started 7 ticks later does not, because `exposed` has ended.
  Both directions, since this pair of numbers is the balance of §2.3.
- **Advantage decay and consumption:** a thrust started on the last positive
  tick of `bindAdvantageMs` launches on `bindTimeline`; one tick later it
  launches on the normal timeline. The thrust zeroes the timer, so a second
  thrust is normal.
- **Advantage cleared by anything else:** cut, step, void and parry each zero
  `bindAdvantageMs` and behave exactly as they would without it, asserted per
  intent. In particular the cut launches on its full normal timeline.
- **`exposed`:** accepts no intents for its whole duration, lasts exactly
  `BIND_LOSS_MS`, transitions to `ready`, and cannot be wounded into a second
  state by anything that is not a strike resolution.
- **`bindTimeline`:** every mark before `strikeStart` is 0; no `windup`
  DuelEvent; `swing` at `strikeStart`; exactly one outcome sound at
  `strikeEnd`. In the AGENTS.md describe block.
- **Neutral break is silent:** no `bindBreak` event at all.
- **AI determinism and coverage:** same seed and input script, same choices and
  lock ticks; over a long seeded run all three choices occur.
- **Golden replay:** hash re-recorded.

---

## 6. Out of scope

- **A fourth, geometry-flavoured choice** (*Absetzen* as a distinct option,
  going around on the side axis). Hold already gives the matrix its third pole;
  a fourth arrives only if blade geometry deepens enough to distinguish it from
  `wind`, and only with play evidence from this version.
- *Duplieren* and *Mutieren*. Follow-ups within a continuing bind; this bind
  resolves in one exchange.
- Multiple exchanges in one bind, or re-entering a bind from a bind.
- Rapier bind behaviour. `bindCapable: false` stays, as the abstraction
  `sustained-bind` §1 documents; the rapier's answer is the disengage from
  `line-feints`.
- Grappling, half-swording, and the close-measure *Krieg*.
- Slow motion during the decision. `sustained-bind` §3 argues against it and
  that argument is unchanged: `BIND_MS` is the lever.

---

## 7. Playtest gate

This is the last spec in the chain, so play the whole thing, not just the bind.

What to look for:

- You catch yourself conditioning on the bars: pressing because they are soft
  *and likely to hold*, winding because they are firm enough to want the
  press-war. If the bars never change your choice, firmness is decoration and
  the epsilon or the settle constant needs work.
- Getting outguessed feels like being read, not like losing a coin flip you had
  no hand in.
- The early-versus-late guard choice from §1.1 bites: you commit guards earlier
  against a longsword than against a rapier, because you want to be firm where
  binds happen.
- Across a session against mode 3: are you losing to feints, to binds, or to
  measure? All three should happen. If one dominates, that is where the next
  spec goes.

What would look wrong: one choice dominating at your own skill level - hold
especially, since its win condition is the narrowest. The knob is the matrix's
mirrored outcomes (a hold-versus-wind win could be demoted to a lesser reward)
before it is the reward constants, because the reward is the reason the
mechanic exists.
