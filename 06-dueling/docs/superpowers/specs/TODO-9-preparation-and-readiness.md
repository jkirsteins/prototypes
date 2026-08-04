# preparation-and-readiness: One simulation, and the blade that was never down

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

Playtesting `duelist-defence` surfaced that the duelist never parries
thrusts, and the defence of that outcome ("by design") did not survive
first principles. Two model errors were found, one on each side of the
exchange:

1. **The attacker's preparation is side-conditional.** The engine grants
   every AI attack `telegraphMs` of extra windup and the player none
   (`engine.ts`, `side === 1 ? telegraphMs : 0`). That is a physics
   difference keyed on who holds the controller - the one thing this
   project must never do. A player thrust is currently a thrust with
   zero visible preparation, which is not a fast attack, it is an
   unphysical one; the AI, reading honestly through a human-like
   reaction, correctly cannot answer it.
2. **The defender's readiness ignores the resting blade.** A cold parry
   pays the full `parryRiseMs` as if the sword hung at the fighter's
   knees. But a sword is never fully lowered: the stance height and
   `guardSide` already place the blade IN a line at all times. A fighter
   holding low and attacked low is substantially ready; the engine
   charges them as if they were unarmed.

This spec fixes both. Preparation becomes a property of the weapon,
shown identically by both fighters; guard formation becomes the physical
distance between where the blade already rests and where the threat is.
Thrust parries then EMERGE where the mental model says they should: an
attack into the line the defender's blade rests in is parryable at
ordinary reactions, an attack aimed away from it restores the race.
Nothing is hardcoded per side, and no outcome is asserted - the
feasibility matrix is recomputed from the retuned properties and pinned.

**Delivers:** the symmetry doctrine (enforced and documented), symmetric
attack preparation, resting-line guard readiness, the recomputed
reaction matrix and its positional invariant.

**Depends on:** `duelist-defence` (supersedes its §5 invariant), and
through it the chain.

---

## 1. The doctrine

> **One simulation for both fighters. The only permitted asymmetry is
> that the AI emulates reaction time, because it has none naturally. No
> phase, duration, capability or timeline may condition on which side
> controls a fighter. An AI's signal is a human's signal.**

This was always the project's intent (`AGENTS.md`'s emergent-outcomes
rule is its sibling), but it was never written down as a constraint on
the ENGINE, and exactly one violation existed: the `telegraphMs` windup
bonus. Implementation adds the doctrine to `AGENTS.md` beside the
emergent-outcomes rule, and a test pins the engine's symmetry: the same
weapon, attack and tick produce byte-identical attack timelines for side
0 and side 1.

AI reaction emulation stays where it lives today - in `ai.ts`, as policy
(delayed reads, drawn reactions, delayed in-bind observations). Policy
may differ per controller; physics may not.

---

## 2. Symmetric preparation: the fold

`telegraphMs` is deleted. Each attack's windup becomes the whole
preparation, shown by everyone who throws that attack:

| | today (player / AI) | proposed (both) |
|---|---|---|
| longsword cut windup | 420 / 600 | **600** |
| longsword thrust windup | 260 / 440 | **420** |
| rapier cut windup | 320 / 460 | **460** |
| rapier thrust windup | 200 / 340 | **340** |

The AI's attacks keep (almost) their current totals, so nothing the
player has learned to read changes; the player's attacks gain the
preparation they were skipping. The longsword thrust folds to 420
rather than 440: §4's boundary-margin rule - the cross-height answer at
the mean reaction would otherwise land within 3ms of the deadline, and
a documented failure must fail (the precedent is the existing
"270, not 260" comment on `heightChangeMs`).

Emergent corrections the fold carries with it, all wanted:

- `attackTimeline`'s `windupBonusMs` parameter and the engine's
  side-conditional disappear entirely.
- `duelistCooldown` derives from thrust timings that now include the
  preparation, so the pulse's floor grows by the folded amount - the old
  floor under-counted the AI's real commitment.
- Redirect and feint windows widen for both fighters equally (the windup
  is longer, and the windup is where lies live). Feints get stronger on
  both sides of the board - this is the attacker's §4 counterweight, not
  an accident.
- The bind winner's advantage thrust is untouched: `bindTimeline` has no
  windup to fold into.

---

## 3. Readiness: the blade was never down

`parryRiseMs` is re-founded. Today it models raising a sword from
nothing (220/190ms) and is charged flat. It becomes the **firm-up**: the
small motion that turns a blade already resting in a line into an
engaged, braced guard - grip, structure, point orientation. The travels
keep carrying the real cost of being wrong about the line:

```
guardFormationMs(f, aim) = max(firmUp, heightTravel(f, aim), sideTravel(f, aim))
```

The shape already exists - `guardFormationMs` is shared by the engine's
parry acceptance, the duelist's policy and the matrix test, which is
exactly why this change is one number's meaning and no new code paths.
Proposed values, playtest knobs both:

| | firmUp (was parryRiseMs) |
|---|---|
| longsword | **110** (was 220) |
| rapier | **85** (was 190) |

The resting line is what the simulation already tracks: stance height
plus `guardSide`. No new state, no new properties - readiness is DERIVED
from where the blade demonstrably is, per the emergent-outcomes rule.

What this deliberately does not touch: `heightChangeMs`, `sideChangeMs`,
`guardShiftMs`, the rising/held/shifting parry track, held-guard
lifecycles, `parryRecoveryMs`, and `PARRYABLE_FRACTION`. A guard that
must travel still pays the same travels; only the fiction of hauling the
sword up from the ground is gone.

---

## 4. The matrix that emerges, and the new invariant

With both fixes in, the reaction arithmetic (reaction draw + formation
vs. visibility-to-`parryableUntil`) produces this structure - computed
and pinned at implementation, stated here as intent:

- **Same line as the resting blade** (right height, right side): every
  attack, thrusts included, is parryable at the mean reaction; the
  fastest thrust (rapier, 510ms window) still escapes the slowest
  draws. "Holding low, attacked low - naturally I'd be ready."
- **Wrong height**: thrusts escape ordinary reactions (the 300/270ms
  height travel eats the window); cuts remain answerable. "Attacking
  high when the sword is low - they might not have the time."
- **Wrong side, right height**: between the two - the 120/100ms side
  travel lets most attacks be answered, later.

The `duelist-defence` §5 invariant (a temporal guarantee: some attack
always outruns reaction) is SUPERSEDED by a positional one:

> **For every pairing, and every line the defender's blade can rest in,
> at least one attack aimed at a different line escapes a mean-reaction
> guard - and every attack aimed into the resting line does not.** The
> attacker's guarantee is no longer "one unanswerable attack" but "the
> defender cannot rest everywhere": win by aiming where the blade is
> not, by drawing it out of line first (feints, now stronger, §2), by
> tempo (attacking a committed or recovering body), or by outdrawing a
> slow read. The defender's guarantee is that steel resting in the
> attacked line, plus an ordinary reaction, means steel meeting steel.

**Boundary-margin rule:** no pinned pass/fail in the matrix may land
within one tick (17ms) of its deadline; where the raw fold produces
one, the nearest authored property is nudged and the nudge documented
in a comment beside the number (the `heightChangeMs` 270 comment is the
template). §2's longsword thrust trim is the first application.

Tuning risk, named honestly: this makes reactive defence broadly
stronger, on both sides. If playtest finds defence too available, the
knobs are the thrust windups (down), firmUp (up), and the travel costs -
in that order; the doctrine and the derivation are not knobs.

---

## 5. What the AI does with it - nothing new

No policy changes. The duelist's guard answer already calls
`guardFormationMs` and already downgrades honestly, so it starts
parrying same-line thrusts the moment the arithmetic allows it - the
playtest complaint this spec was born from resolves without touching
`ai.ts`. Mode 1's dummy likewise begins meeting same-line thrusts after
its reaction, which makes the drill able to teach thrust-parries for the
first time. The `duelist-defence` feasibility-matrix test is recomputed
against the new numbers and the §4 invariant replaces its old one.

---

## 6. Presentation

The player's attacks start later after the keypress (thrust: strike
begins ~480ms after input, was 320; cut: ~700, was 520). This is
preparation made visible, not input lag - the rise cue and the windup
animation begin on acceptance exactly as today, and the frame spans
stretch automatically since `frames.ts` scales poses to phase durations.
The `frames.ts` comment asserting a thrust "cannot be parried on
reaction" is rewritten to the §4 truth (same-line: yes; out of line:
no). The help panel's durations are derived from `WEAPONS` and follow by
themselves; its parry entry gains the resting-line sentence if it fits
the length budget.

---

## 7. Tests

- **Symmetry pin:** identical attack timelines for both sides, same
  weapon and attack; no caller of `attackTimeline` passes a bonus; grep
  guard: no `side ===` conditional inside the combat simulation
  (`src/combat/`, excluding `ai.ts`).
- **The matrix, recomputed:** every (defender, attacker, attack,
  resting-line relation in {same, wrong-height, wrong-side}, reaction in
  {floor, mean, ceiling}) through `guardFormationMs`, pinned, with the
  §4 positional invariant asserted per pairing and the boundary-margin
  rule asserted for every entry (no verdict within one tick of its
  deadline).
- **Emergence, both directions:** a seeded live-play probe where the
  duelist parries a same-line player thrust, and mode 1 parries one
  after its reaction; the mirror probe where a wrong-height thrust is
  never met by a guard formed after visibility.
- **Feel guards:** `duelistCooldown` still outlasts the worst-case whiff
  commitment (existing test, new numbers); the drill interval test
  likewise.
- **Golden replays:** re-recorded; every hash shift explained by
  per-tick probe before re-pinning, per the gate's standing rule.

---

## 8. Out of scope

- A middle stance, or per-line resting postures beyond height +
  `guardSide`.
- Attack-speed properties per line, opposition/blade-taking on the
  thrust (that is the bind's territory), or any new defensive verb.
- AI policy changes of any kind.
- Rebalancing the bind, measure, or footwork numbers - only windups,
  firmUp and (if the margin rule demands) named nudges move.

---

## 9. Playtest gate

Longsword mirror first, then rapier against longsword, both seats of
the asymmetry gone.

- Thrust at the height their blade rests in: sometimes met by steel now,
  at human-looking speeds - and when it is, you can name what you did
  wrong (you attacked into their guard's home).
- Thrust at the other height: the old race, still yours to win.
- Your own attacks feel weightier - the preparation is real. If the game
  reads sluggish rather than deliberate, the windups are the knob and
  the doctrine is not.
- The duelist visibly parries; the drill can teach a thrust-parry.
- Feints matter more on both sides. If every exchange becomes
  feint-first, defence got too strong: §4's knob order.

What would look wrong: any exchange where who-controls-the-fighter
explains an outcome difference. That is now the one unforgivable bug.
