# parry-rise: The guard takes time to form

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

The parry is the only action in the engine with no travel. A step moves `x` over
`stepDuration`. An attack spends `windup` plus `beat` before the edge is anywhere.
The parry alone is fully formed and fully effective on the tick the keypress is
accepted.

That is the anti-pattern `AGENTS.md` names, one layer below the two cases it
lists. Those were presentation firing at input time. This is the **simulation**
treating a keypress as a finished endstate: the hand starts and the blade is
already there.

This spec gives the guard a rise. The blade is visible from the press and
effective only after `parryRiseMs`. Nothing else changes.

**Delivers:** parries (part 1 of 2; per-line coverage is `attack-lines`).

**Depends on:** `2026-08-02-fighter-state-tracks.md`, which has fully landed -
§8.1's windup cancel in `6daf017` and §8.2's rule D in `dca98c5`. So this spec
builds on shipped code rather than on a plan: `ParryTrack { t: number }`,
`parry: ParryTrack | null` and `parryMeetsAttack` all exist as assumed here, and
§2.2's claim that the track needs no new field is verified rather than
predicted.

---

## 1. Why this is first

§8.1 of the state-tracks spec, the windup cancel, has shipped (`6daf017`). It is a
feint that works by provoking a parry and punishing its recovery, and against an
instantaneous parry it has nothing to eat: a defender can always wait until the
cancel window has closed and still catch the blade. It will therefore read as a
dead mechanic in play, and §8.1's own note names the knob that will get turned in
response ("if `feintRecoveryMs` is too short, every windup becomes a free probe").

Turning that knob would be treating the symptom. The cancel is correct; what is
missing is any reason for the defender to commit early enough to be baited. This
spec supplies it. Here is the arithmetic, longsword cut with the AI telegraph, so
`strikeStart` is 700 ms and the meetable window is 700 to 890.

Write P for the tick the defender presses parry. The AI can only cancel while
`P + AI_REACTION_MS < strikeStart`, so it feints anything pressed before 520.

| | Guard effective over | Viable press window | Unfeintable band |
|---|---|---|---|
| Instantaneous parry (today), `parryWindowMs` 260 | [P, P+260] | [440, 890] | [520, 890], 370 ms wide, every press in it fully covered |
| `parryRiseMs` 220, `parryWindowMs` 480 | [P+220, P+480] | [220, 670] | [520, 670], and presses past ~610 buy under 60 ms of overlap |

The rise adds no feint mechanic. It gives the feint already specified in §8.1
something to eat, and it turns the defender's timing into a real choice: commit
early and be readable, or commit late and be right by a hair.

This spec is therefore the next thing to land, and §8.1 should be judged in play
only after it. A verdict on the windup cancel gathered against an instantaneous
parry is a verdict on this missing piece, not on the cancel.

---

## 2. Data model

### 2.1 Weapon profile

```ts
interface WeaponProfile {
  // ...
  parryWindowMs: number;   // existing; retuned in §5
  parryRiseMs: number;     // NEW: travel before the guard is effective
  parryRecoveryMs: number; // existing
}
```

### 2.2 Parry track

Unchanged. `ParryTrack { t: number }` already carries everything needed; the rise
is a comparison against `t`, not new state.

```ts
/** The guard is formed and can meet a blade. Before this it is only visible. */
function guardEffective(f: Fighter): boolean {
  return f.parry !== null && f.parry.t >= f.weapon.parryRiseMs;
}
```

---

## 3. The rule

One condition is added inside `parryMeetsAttack`, the single site §3.3 of the
state-tracks spec reserves for exactly this:

```ts
function parryMeetsAttack(attacker, defender, gap) {
  return defender.parry !== null
    && defender.parry.t >= defender.weapon.parryRiseMs   // NEW
    && attacker.state.elapsedMs <= attacker.state.timeline.parryableUntil
    && gap <= attacker.weapon.reach;
}
```

Nothing else in the engine learns about the rise. `markMetBlades` stays a thin
caller. The parried branch, the penalties and the early release of the guard are
untouched.

### 3.1 The invariant that keeps the guard readable

> **`parryRiseMs >= AI_REACTION_MS`** for every weapon.

A guard becomes effective `parryRiseMs` after it becomes visible, so this
guarantees that nothing is ever stopped by a guard the attacker had no time to
see coming: every parry that works was readable for at least one full reaction
time first. It is a test, not a feel judgement (§7).

What it does **not** guarantee - an earlier draft overclaimed this - is that
every successful parry can be reactively feinted. The feint's deadline is
commitment (`strikeStart`, per `line-feints`), not `parryableUntil`, so a parry
pressed within `AI_REACTION_MS` of commitment is visible but unanswerable: that
is the late, thin-margin band the table in §1 already prices. Readability is
what the invariant buys; feintability is bought separately, by the defender
committing early.

### 3.2 What the rise does not do

- It does not shorten the effective guard: `parryWindowMs` grows by exactly the
  rise, so the effective span equals today's (§5). What the rise does cost the
  defender - the honest accounting - is the **tail**: the last press that can
  catch a given blade moves `parryRiseMs` earlier. The span is preserved; the
  deadline is not.
- It does not gate acceptance. A parry is still accepted from `ready` with
  `parryRecoveryMs === 0`; the rise is inside the window, not before it.
- It does not affect the guard's early release on a successful parry. That still
  fires from the engine's parried branch and still charges `parryRecoveryMs`.

---

## 4. Presentation

### 4.1 Sprites: no new art

Measured from `public/sprites/sword-attack.png` (6 frames, 64x64):

| Frame | Pose |
|---|---|
| 0 | blade drawn back low |
| 1 | blade swept up overhead, motion arc trailing behind it |
| 2 | held high, angled forward, arc settled at the apex |
| 3 | the descending arc |
| 4 | delivered low |
| 5 | back to stance |

`pickFrame` currently renders `parry` as **frame 1**, the frame with the trailing
arc. It has been drawing a blade in motion for a state the engine treats as
instantaneous. The mapping is therefore already half-correct and needs one branch:

```ts
case "parry":
  return { sheet: "swordAttack", frame: guardEffective(f) ? 2 : 1, flip };
```

Rise renders frame 1 (blade travelling to the guard). Set renders frame 2 (held
at the apex).

**Known ambiguity, accepted.** Frames 1 and 2 are also the cut's late windup and
its stillness, so a set guard and a loaded cut look alike. This is already true
today, it is historically true (a Versetzen and a preparation are meant to look
alike), and it is resolved by the other two channels: the HUD names the track
state, and a windup fires the rise cue while a parry never does. A dedicated
guard pose is art debt, not a blocker.

### 4.2 HUD

Row 2 (the defence track, per §6 of the state-tracks spec) gains a segmented bar
using the idiom `drawStrikeTiming` already established for the strike: the rise
portion dim, the effective portion bright, a cursor riding `parry.t`. The label
reads `guard rising` then `guard up` then `recovering`.

This is the same "one idiom per track" rule; it adds a segment, not an idiom.

### 4.3 Audio

Silent. A parry is an input-acceptance event and stays unmapped in
`EVENT_SOUNDS`, per the contract in `manifest.ts`. The rise is a visual tell and
must stay one, or a feint could be defeated by ear.

The `met` clash cue is unchanged and still fires at blade arrival.

### 4.4 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is the player-facing statement of the engine's
rules and is updated **in the same commit**. The rise changes what the parry
entry means: the guard is no longer up when you press it. One sentence for what
happens, one for what the player must do, with `parryRiseMs` derived from
`WEAPONS` through a callback rather than written as a literal.

---

## 5. Numbers

Starting values. Both are playtest knobs; the invariants in §3.1 and §7 are not.

| Weapon | `parryRiseMs` | `parryWindowMs` (was) | Effective span | `parryRecoveryMs` |
|---|---|---|---|---|
| Longsword | 220 | 480 (260) | 260 ms, as today | 340, unchanged |
| Rapier | 190 | 390 (200) | 200 ms, as today | 400, unchanged |

The window grows by exactly the rise, so the effective span is unchanged and the
rise's whole cost is the earlier deadline (§3.2). An earlier draft grew the
window by less than the rise and still claimed the span was "comparable"; it was
not - it had quietly cut the longsword's effective guard from 260 ms to 160.

**Watch in play:** total parry commitment is now `parryWindowMs +
parryRecoveryMs`, 820 ms for the longsword. If defending feels like drowning,
`parryRecoveryMs` is the knob, not the rise.

### 5.1 The rapier consequence, decided deliberately

A defender cannot reactively parry a tell-less rapier thrust. Its meetable window
is 260 to 370 ms after the attack becomes visible; a defender reacting at
`AI_REACTION_MS` = 180 has an effective guard at 180 + `parryRiseMs`, which is
400 at a rise of 220. It misses by 30 ms.

This is a choice, not an accident. A human needs 200 to 250 ms against 260 ms of
preparation and cannot do it either, and the design doc calls the rapier the
fastest weapon to land a clean attack. The answers to that thrust are the carried
guard from §8.2 (raise before it starts), the void, and the counter-attack that
`blade-contact` makes viable. Tune the margin, do not tune it away.

---

## 6. AI

`ai.ts` mode 1 (the parry dummy) currently targets "guard up when the strike
begins". It must now target "guard **effective** when the strike begins", so its
lead time grows by `parryRiseMs`:

```ts
const untilStrike = timeline.strikeStart - elapsed;
if (elapsed >= AI_REACTION_MS && untilStrike <= self.weapon.parryRiseMs + slack) ...
```

Consequence: mode 1 stops parrying the fastest attacks, per §5.1. That is the
intended reading of mode 1 as a dummy, not a regression. A test pins which
(weapon, attack) pairs it can and cannot answer, so the set changes visibly
rather than silently.

Modes 2 and 3 are unaffected as attackers by this spec.

---

## 7. Tests

- **Invariant:** for every weapon, `parryRiseMs >= AI_REACTION_MS`. One
  assertion, no tuning judgement.
- **Invariant:** for every weapon, `parryWindowMs - parryRiseMs >= 120`, so a
  retune can never leave a guard that is never effective.
- **Rise boundary:** a parry raised at `t` such that it becomes effective one
  tick after `parryableUntil` does not meet; one tick before, it does. Both
  directions, per weapon.
- **`parryMeetsAttack` contract:** the existing per-condition falsification tests
  from §7.3 of the state-tracks spec gain a fourth condition, falsified
  independently while the other three hold.
- **Mode 1 coverage:** an explicit table of which (defender weapon, attacker
  weapon, attack) pairs the dummy can still meet. §5.1's rapier thrust appears in
  it as a documented failure.
- **Presentation:** `pickFrame` returns frame 1 before `parryRiseMs` and frame 2
  after, asserted at the boundary tick.
- **Help panel:** the rendered panel cites the shipping `parryRiseMs` and says
  the guard is not up on the press. The existing length bound still passes.
- The AGENTS.md describe block gains nothing: no new cue fires here.

---

## 8. Out of scope

- Per-line parry coverage, and the height dimension of the guard. `attack-lines` adds a
  stance whose travel time combines with the rise through a `max`, and the
  reaction matrix that checks the pair. This spec's numbers are chosen so that
  matrix comes out right, but it is not asserted until `attack-lines`.
- Any change to what a successful parry *pays*. Penalties are untouched.
- A holdable guard replacing `parryWindowMs`. That only becomes safe once feints
  can deceive about *where* rather than *when*, so it is specified in
  `held-guard`, sequenced after `line-feints`.
- A dedicated guard sprite.

---

## 9. Playtest gate

Play it before §8.1. What to look for:

- Pressing parry on reaction to a longsword cut still works and feels like a
  read, not a reflex.
- Pressing parry on reaction to a rapier thrust fails, and failing feels like the
  rapier being fast rather than the guard being broken.
- The two-segment guard bar makes the rise legible without having to know it
  exists.

What would look wrong: the guard reading as unresponsive rather than travelling,
which would mean the rise frame is not distinct enough and the sprite ambiguity
in §4.1 has stopped being acceptable.
