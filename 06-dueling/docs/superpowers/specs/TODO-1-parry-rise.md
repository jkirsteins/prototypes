# TODO-1: The guard takes time to form

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

**Delivers:** parries (part 1 of 2; per-line coverage is TODO-3).

**Depends on:** `2026-08-02-fighter-state-tracks.md` through step 3 of its §9,
which extracts `parryMeetsAttack`. §8.2 (defence track) is not required but is
assumed by the numbers in §5.

---

## 1. Why this is first

§9 of the state-tracks spec sequences `§8.1, played, then §8.2, played`. §8.1 is
the windup cancel: a feint that works by provoking a parry and punishing its
recovery. Played against an instantaneous parry it will read as a dead mechanic,
and §8.1's own note names the knob that will get turned in response ("if
`feintRecoveryMs` is too short, every windup becomes a free probe").

That would be tuning the wrong thing. The cancel is fine; the defender has no
reason to be baited. Here is the arithmetic, longsword cut with the AI telegraph,
so `strikeStart` is 700 ms and the meetable window is 700 to 890.

Write P for the tick the defender presses parry. The AI can only cancel while
`P + AI_REACTION_MS < strikeStart`, so it feints anything pressed before 520.

| | Guard effective over | Viable press window | Unfeintable band |
|---|---|---|---|
| Instantaneous parry (today), `parryWindowMs` 260 | [P, P+260] | [440, 890] | [520, 890], 370 ms wide, every press in it fully covered |
| `parryRiseMs` 220, `parryWindowMs` 380 | [P+220, P+380] | [320, 670] | [520, 670], and presses past ~610 buy under 60 ms of overlap |

The rise adds no feint mechanic. It gives the feint already specified in §8.1
something to eat, and it turns the defender's timing into a real choice: commit
early and be readable, or commit late and be right by a hair.

**Amendment to `2026-08-02-fighter-state-tracks.md` §9:** this spec lands between
step 7 and step 8, and is played before §8.1.

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

### 3.1 The invariant that makes reaction possible

The latest parry that can still work is pressed at
`parryableUntil - parryRiseMs`. An attacker who wants to react to it must do so
before `parryableUntil`. Subtracting, the attacker's worst-case budget is exactly
`parryRiseMs`. Therefore:

> **`parryRiseMs >= AI_REACTION_MS`** for every weapon.

Any parry that could possibly succeed becomes visible at least one reaction time
before it could matter. This is what makes a *reactive* feint reachable rather
than a blind guess, for the AI and for the player alike. It is a test, not a
feel judgement (§7).

### 3.2 What the rise does not do

- It does not shorten the effective guard: `parryWindowMs` is retuned so the
  effective span stays comparable to today's (§5).
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

---

## 5. Numbers

Starting values. Both are playtest knobs; the invariants in §3.1 and §7 are not.

| Weapon | `parryRiseMs` | `parryWindowMs` (was) | Effective span | `parryRecoveryMs` |
|---|---|---|---|---|
| Longsword | 220 | 380 (260) | 160 ms | 340, unchanged |
| Rapier | 190 | 330 (200) | 140 ms | 400, unchanged |

The window grows by roughly the rise so the effective guard stays close to
today's, rather than the rise arriving as a pure nerf.

**Watch in play:** total parry commitment is now `parryWindowMs +
parryRecoveryMs`, 720 ms for the longsword. If defending feels like drowning,
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
TODO-2 makes viable. Tune the margin, do not tune it away.

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
- The AGENTS.md describe block gains nothing: no new cue fires here.

---

## 8. Out of scope

- Per-line parry coverage. TODO-3.
- Any change to what a successful parry *pays*. Penalties are untouched.
- A holdable guard replacing `parryWindowMs`. That only becomes safe once feints
  can deceive about *where* rather than *when*, so it is revisited no earlier
  than TODO-4.
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
