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
   project must never do. Player attacks currently receive less
   preparation than identical AI attacks, because only the AI pays
   `telegraphMs` - the player's thrust shows 200/260ms of windup where
   the same weapon in AI hands shows 340/440; the AI, reading honestly
   through a human-like reaction, correctly cannot answer the shortened
   version.
2. **The defender's readiness ignores the resting blade.** A cold parry
   pays the full rise as if the sword hung at the fighter's knees. But a
   sword is never fully lowered: the stance height and `guardSide`
   already place the blade IN a line at all times. A fighter holding low
   and attacked low is substantially ready; the engine charges them as
   if they were unarmed.

This spec fixes both. Preparation becomes a property of the weapon,
shown identically by both fighters; guard formation becomes the physical
distance between where the blade already rests and where the threat is.
The reaction matrix is computed from the shared properties and pinned -
and where this spec names desired matchup shapes, those are **playtest
targets, not weapon-identity rules**: timing values may be tuned for
gameplay, tests never branch on weapon names, and no tuning happens
silently (§4).

**Delivers:** the symmetry doctrine (enforced and documented), symmetric
attack preparation, resting-line guard readiness, the visible resting
line, the recomputed reaction matrix.

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
emergent-outcomes rule.

The enforcement is precise, not a blanket grep - side comparisons are
legitimate for orientation, ownership and opponent selection:

- A test pins timeline symmetry directly: the same weapon and attack
  produce byte-identical attack timelines whichever fighter throws it.
- Controller-dependent **timing inputs** are prohibited structurally:
  `telegraphMs` is deleted from the profile, `attackTimeline` loses its
  bonus parameter, and `applyIntent` loses `windupBonusMs` - the
  channels by which per-side timing could exist are gone, not guarded.

AI reaction emulation stays where it lives today - in `ai.ts`, as policy
(delayed reads, drawn reactions, delayed in-bind observations). Policy
may differ per controller; physics may not.

---

## 2. Symmetric preparation: the pure fold

`telegraphMs` is deleted. Each attack's windup becomes the whole
preparation, shown by everyone who throws that attack. The fold is pure -
today's AI totals, unmodified - so nothing the player has learned to
read changes, and no number is nudged in the same motion that removes
the asymmetry (any retune is a separate, §4-governed decision):

| | today (player / AI) | folded (both) |
|---|---|---|
| longsword cut windup | 420 / 600 | **600** |
| longsword thrust windup | 260 / 440 | **440** |
| rapier cut windup | 320 / 460 | **460** |
| rapier thrust windup | 200 / 340 | **340** |

Emergent corrections the fold carries with it, all wanted:

- The engine's side-conditional disappears entirely.
- `duelistCooldown` derives from thrust timings that now include the
  preparation, so the pulse's floor grows by the folded amount - the old
  floor under-counted the AI's real commitment.
- Redirect and feint windows widen for both fighters equally (the windup
  is longer, and the windup is where lies live). Feints get stronger on
  both sides of the board - this is the attacker's counterweight in the
  §4 matrix, not an accident.
- The bind winner's advantage thrust is untouched: `bindTimeline` has no
  windup to fold into.

---

## 3. Readiness: the blade was never down

The flat rise is re-founded, and **renamed** - keeping the old name
would preserve the old false model:

```ts
parryRiseMs -> firmUpMs
```

`firmUpMs` is the small motion that turns a blade already resting in a
line into an engaged, braced guard - grip, structure, point orientation.
The travels keep carrying the real cost of being wrong about the line:

```ts
guardFormationMs(f, aim) = max(firmUpMs, heightTravelMs(f, aim), sideTravelMs(f, aim))
```

The shape already exists - `guardFormationMs` is shared by the engine's
parry acceptance, the duelist's policy and the matrix test, which is
exactly why this change is one property's meaning and no new code paths.
Proposed values, playtest knobs both:

| | firmUpMs (was parryRiseMs) |
|---|---|
| longsword | **110** (was 220) |
| rapier | **85** (was 190) |

The resting line is what the simulation already tracks: stance height
plus `guardSide`. No new state, no new properties - readiness is DERIVED
from where the blade demonstrably is, per the emergent-outcomes rule.
The rename sweeps code, tests and the help panel's derivations;
historical DONE specs keep the old name as a record of what they built.

What this deliberately does not touch: `heightChangeMs`, `sideChangeMs`,
`guardShiftMs`, the rising/held/shifting parry track, held-guard
lifecycles, `parryRecoveryMs`, and `PARRYABLE_FRACTION`. A guard that
must travel still pays the same travels; only the fiction of hauling the
sword up from the ground is gone.

---

## 4. The matrix, computed - findings and playtest targets

The rule, stated once: **the matrix is computed from shared properties.
Named matchup outcomes are playtest targets, not weapon-identity rules.
Timing may be tuned for gameplay, but tests do not branch on weapon
names, and no value is changed silently to make prose true - every
retune is a documented decision against the computed table.**

Computed at the proposed numbers (pure fold, firmUpMs 110/85; formation
same-line = firmUp, wrong-height = max(firmUp, heightChange), wrong-side
= max(firmUp, sideChange); cost = reaction + formation vs. deadline =
windup + beat + strike/2). P = parryable, `-` = escapes; `!` marks a
verdict within one tick of its deadline:

| defender vs attack | deadline | floor 200 | mean 310 | ceil 420 |
|---|---|---|---|---|
| LS vs LS cut, any line | 890 | P | P | P |
| LS vs LS thrust: same / wrongH / wrongS | 630 | P / P / P | P / P / P | P / - / P |
| LS vs R cut: same / wrongH / wrongS | 690 | P / P / P | P / P / P | P / - / P |
| LS vs R thrust: same / wrongH / wrongS | 510 | P / P!10 / P | P / - / P | - / - / - |
| R vs LS cut, any line | 890 | P | P | P |
| R vs LS thrust: same / wrongH / wrongS | 630 | P / P / P | P / P / P | P / - / P |
| R vs R cut: same / wrongH / wrongS | 690 | P / P / P | P / P / P | P / P!0 / P |
| R vs R thrust: same / wrongH / wrongS | 510 | P / P / P | P / - / P | P!5 / - / -!10 |

**Findings, stated plainly:**

1. **Same-line readiness holds everywhere**: every attack into the
   resting line is parryable at floor and mean, for every pairing.
   "Holding low, attacked low - naturally I'd be ready." This is the
   spec's core promise and the primary playtest target.
2. **The longsword attacker has no mean-reaction escape at any line,
   against either defender.** Its thrust aimed off-height clears only
   slow (ceiling-ish) reads. The earlier draft's invariant ("every
   pairing keeps an off-line attack that escapes a mean guard") is
   FALSE at these numbers and is withdrawn, not tuned into truth. The
   longsword attacker's wins must come from draw variance, tempo
   (attacking a committed or recovering body), feints (now stronger,
   §2), and the bind. Whether that is enough - or whether the longsword
   thrust needs a justified trim - is a playtest question, decided
   against this table, in the open.
3. **Only the rapier thrust aimed off-height escapes mean reads.** The
   thrust specialist keeps a true tempo weapon; its identity line stays
   honest.
4. **Four boundary verdicts sit within one tick** (flagged `!` above),
   and they are ACCEPTED as deterministic - no value changes for them,
   and none is deferred to implementation. The justification is not
   tolerance but arithmetic: reactions are drawn from a CONTINUOUS band,
   so the matrix's floor/mean/ceiling are probe points on a continuum,
   and a small margin at a probe point is not a coin flip anywhere in
   the simulation - it only marks where inside the band the flip point
   sits ("P by 5ms at the ceiling" means parryable across essentially
   the whole band; "miss by 10ms" means parryable up to a 410ms draw).
   The shared derivation is exact and the engine is deterministic, so
   the pins are stable; the test pins each verdict WITH its margin, so
   any future retune that flips or tightens one fails visibly instead
   of silently, and the engine's own behavior at an exact boundary (the
   0ms case) is pinned by a dedicated tick-ordering test.

---

## 5. What the AI does with it - nothing new

No policy changes. The duelist's guard answer already calls
`guardFormationMs` and already downgrades honestly, so it starts
parrying same-line thrusts the moment the arithmetic allows it - the
playtest complaint this spec was born from resolves without touching
`ai.ts`. Mode 1's dummy likewise begins meeting same-line thrusts after
its reaction, which makes the drill able to teach thrust-parries for the
first time. The `duelist-defence` feasibility-matrix test is recomputed
against the new numbers, and its temporal invariant is superseded by
§4's computed-table-plus-targets rule.

---

## 6. Presentation: the resting line must be readable

The resting line now decides reaction timing before any parry exists, so
it must be VISIBLE - for both fighters, at all times. A hidden
`guardSide` deciding who can parry what would be worse than the model it
replaces. Requirement:

- The player can look at either fighter and know their resting height,
  their resting side, and therefore which attacks that fighter is
  currently prepared to answer quickly.
- The REQUIRED mechanism is the HUD: the status rows show the resting
  line for both fighters whenever no guard is up - `READY: LOW INSIDE` -
  and a test pins its presence and correctness against the fighter's
  height and `guardSide`. Placing the blade's rendered rest pose at the
  resting line is an optional art improvement on top, never the
  requirement's carrier. Stance height is already visible; the side
  axis is the new obligation.
- The AI already reads this from the observable projection; this section
  makes the human's access equal, which is the doctrine again from the
  other side.

The player's attacks start later after the keypress (longsword thrust:
strike begins ~500ms after input, was 320; longsword cut: ~700, was
520; rapier thrust: ~400, was 260; rapier cut: ~540, was 400). This is
preparation made visible, not input lag - the rise cue and the windup
animation begin on acceptance exactly as today, and the frame spans
stretch automatically since `frames.ts` scales poses to phase durations.
The `frames.ts` comment asserting a thrust "cannot be parried on
reaction" is rewritten to §4's computed truth: same-line attacks are
parryable at ordinary reactions; wrong-height rapier thrusts may
escape; wrong-side attacks are generally still answerable. The help panel's durations are derived from `WEAPONS` and
follow by themselves; its parry entry gains the resting-line sentence if
it fits the length budget.

---

## 7. Tests

- **Symmetry pin:** identical attack timelines for both sides, same
  weapon and attack; `attackTimeline` has no bonus parameter and
  `applyIntent` no `windupBonusMs`; no `telegraphMs` on any profile.
  (No blanket `side ===` grep: orientation, ownership and opponent
  selection legitimately compare sides.)
- **The matrix, recomputed:** every (defender, attacker, attack,
  resting-line relation in {same, wrong-height, wrong-side}, reaction in
  {floor, mean, ceiling}) through `guardFormationMs`, pinned verdict AND
  margin per entry (§4's finding 4: boundaries are deterministic and
  accepted; the pinned margins make any future flip or tightening fail
  visibly). No branch on weapon names anywhere.
- **Boundary tick-ordering:** a scenario constructed at the 0ms-margin
  entry (rapier mirror, wrong-height ceiling read) pins which way the
  engine's own contact arithmetic resolves an exact-deadline formation,
  so the model's boundary convention and the engine's are demonstrably
  the same.
- **Same-line readiness target:** asserted per pairing from the computed
  table: every same-line attack parryable at floor and mean.
- **The litmus: thrust parry-ability.** This spec's acceptance
  criterion, layered so the physics is never gated on policy knobs:
  1. *Physics (mode 1, deterministic):* at the mean reaction, every
     same-line thrust against a ready dummy is parried; across seeded
     reactions, outcomes match the computed matrix. The band edge,
     stated exactly: a longsword defender (firm-up 110) parries the
     same-line rapier thrust (deadline 510) on reaction draws up to
     400ms and misses above; a rapier defender (firm-up 85) parries it
     across the full 200-420ms band. At the mean, a wrong-height
     rapier thrust is not met by a guard formed after visibility (at
     the 200ms floor the table says it can be - the pin is per-seed:
     parried exactly when that seed's drawn reaction fits the
     arithmetic).
  2. *Symmetry:* run the same attack and parry intent ticks with
     controller ownership swapped - both sides scripted, no AI policy
     in the loop. The contact outcome and the timelines must be
     identical. Parry-ability may never depend on who holds the
     controller.
  3. *Policy band (mode 3, drift alarm):* same-line thrusts against a
     ready duelist end parried in a wide pinned band - nonzero, not
     dominant - proving the physics reaches live play through the
     menu without freezing the menu weights.
  Implementation of this spec is DONE only when all three layers pass;
  §9's felt version is the fourth, human layer.
- **Rename sweep:** no `parryRiseMs` remains in src or tests.
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
- Rebalancing the bind, measure, or footwork numbers - only the fold,
  the rename, and §4-documented tuning decisions move values.

---

## 9. Playtest gate

Longsword mirror first, then rapier against longsword, both seats of
the asymmetry gone.

- Can you read either fighter's resting line at a glance - height AND
  side - without a guard being up? If not, §6 failed and the mechanic
  is a hidden stat.
- Thrust at the height their blade rests in: sometimes met by steel now,
  at human-looking speeds - and when it is, you can name what you did
  wrong (you attacked into their guard's home).
- Thrust at the other height: the race, still winnable - cleanly with
  the rapier, only against slow reads with the longsword. Does the
  longsword attacker still have enough ways in (tempo, feints, the
  bind), or does §4's finding 2 need a documented trim?
- Your own attacks feel weightier - the preparation is real. If the game
  reads sluggish rather than deliberate, the windups are the knob and
  the doctrine is not.
- The duelist visibly parries; the drill can teach a thrust-parry.
- Feints matter more on both sides. If every exchange becomes
  feint-first, defence got too strong: thrust windups down, firmUp up,
  travels last.

What would look wrong: any exchange where who-controls-the-fighter
explains an outcome difference. That is now the one unforgivable bug.
