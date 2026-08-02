# TODO-2: Two blades meet

## Overview

Today a blade can only be met by a raised parry. Two attacks never interact: if
both strikes resolve on the same tick in reach it is a mutual kill, and otherwise
the earlier `strikeEnd` simply kills the other fighter mid-attack.

That is backwards relative to the source material. In Liechtenauer longsword the
defence *is* an attack: the Meisterhaue displace the incoming blade and threaten
in the same tempo, and a pure parry that only blocks is the beginner's option
because it costs a tempo and returns nothing. Blades meeting is the normal case;
the standalone parry is the secondary one.

This spec makes any two travelling blades meet, and promotes blade contact from
one function to a small module with two entry points.

**Delivers:** attacks-on-attacks, simple blade contact.

**Depends on:** TODO-1. (Strictly it only needs step 3 of the state-tracks §9,
which extracts `parryMeetsAttack`, but it is sequenced after TODO-1 so the
contact module is built once, with the rise already inside it.)

---

## 1. The rule

Two attacks meet when both blades are travelling in the same space at the same
time.

```ts
/**
 * True if two travelling blades cross on this tick. Symmetric in its
 * arguments: neither fighter is the defender.
 */
function bladesCross(a: Fighter, b: Fighter, gap: number): boolean;
```

Conditions:

1. Both are `attack` in phase `strike`.
2. Both have `elapsedMs <= timeline.parryableUntil`. A blade past that mark has
   arrived; it is no longer travelling and no longer meets anything.
3. `gap <= a.weapon.reach + b.weapon.reach`.

Condition 3 is the **sum**, not each fighter's own reach and not the larger of the
two. `reach` is body centre to point at full extension, so A's blade occupies
`[0, reachA]` and B's occupies `[gap - reachB, gap]`. Those overlap exactly when
`gap <= reachA + reachB`. At 200 plus 240 that is 440 cm, well beyond narrow
measure, so **two blades thrown at each other inside fighting measure essentially
always meet**.

That is the correct outcome and it is worth stating plainly: two people cutting
at each other on the same line bind, every time. The interesting gate is not
distance, it is condition 2 (do the travel intervals overlap) and, after TODO-3,
whether they are on the same line. Distance only decides the case where one
fighter is far enough out that no blade could reach any other blade.

A consequence to expect: a rapier can meet a longsword blade at a gap where the
longsword's own attack would whiff. The long blade is present in the space; the
short one is not. That is the reach difference doing its job.

### 1.1 Outcome

Both attacks are marked `met`. Neither can wound. Each resolves to `parried` at
its own `strikeEnd` and pays **its own weapon's** `parriedPenalty`.

That is 290 ms for the longsword against 360 ms for the rapier, so after a mutual
clash the longsword is free 70 ms earlier and owns the next tempo. "Strong in the
bind" and "bad in the bind" fall out of numbers that already exist. No new stat
is invented for it.

### 1.2 The double kill survives, and improves

A mutual kill now requires the parryable intervals **not** to overlap: you threw
late into a blade already past meeting range, or one of you was out of measure
when the other was in it. That is the historical double, earned rather than
decided by which `strikeEnd` happened to fire first.

Existing draw handling in the engine is unchanged. Only its reachability changes.

---

## 2. Module shape

`src/combat/contact.ts` becomes the single home for blade contact:

```ts
export function parryMeetsAttack(attacker: Fighter, defender: Fighter, gap: number): boolean;
export function bladesCross(a: Fighter, b: Fighter, gap: number): boolean;
```

`markMetBlades` in the engine becomes a thin caller of both and owns no
conditions of its own:

```ts
function markMetBlades(d: Duel): void {
  const gap = gapOf(d);
  if (bladesCross(d.f[0], d.f[1], gap)) { setMet(d.f[0]); setMet(d.f[1]); return; }
  for (const side of [0, 1] as const) {
    if (parryMeetsAttack(d.f[side], d.f[1 - side], gap)) setMet(d.f[side]);
  }
}
```

**Why one module rather than one function.** §10 of the state-tracks spec
promises that attack lines arrive as one added condition in one place. With two
kinds of contact there are two places, and the only way to keep that promise is
to make them siblings that are read together. TODO-3 adds the line condition to
both in the same edit; a test asserts they agree (§5).

The mutual case is checked first and returns early because a fighter cannot both
cross a blade and be parried on the same tick.

---

## 3. Presentation

### 3.1 The clash instant

`AGENTS.md` requires every cue to fire on the tick the simulation reaches the
physical moment. The two contacts reach it differently:

| Contact | Fires at | Why |
|---|---|---|
| Parry meets attack | `attacker.timeline.parryableUntil` | Only the attacker's blade is moving. Contact is when it arrives at the standing guard. |
| Two blades cross | `max(a.timeline.strikeStart, b.timeline.strikeStart)` | Both are moving toward each other. Contact is the tick the second one starts travelling. |

**One `met` event per contact, not one per side.** Two events on the same tick
would layer two clash samples and break the one-sound-per-attack rule. The engine
emits a single `met` for the mutual case; `side` carries the fighter whose strike
started later, since that is the blade whose arrival completed the contact.

This is a new mark for the mark-emission test in §7.3 of the state-tracks spec.

### 3.2 Sprites and HUD

No new art. Both fighters are already mid-strike and render their travelling
frame; the clash reads from the two arcs overlapping. The existing strike bar on
each fighter shows both cursors inside their bright segments at the moment of
contact, which is the mechanic drawn.

The activity log gains no new kind. Both sides log `parried` as they already do,
so the reader sees two parried lines rather than one parried and one hit.

### 3.3 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. This spec
changes a contact rule, which is exactly what that panel exists to state: two
attacks can now meet each other, and a mutual kill requires their travel
intervals not to overlap.

---

## 4. AI

No change is required. Mode 3 already attacks from narrow measure and will
sometimes cross blades with a counter-attacking player, which is the new option
this spec hands the player.

One consequence worth naming: counter-attacking becomes a real answer to the
rapier thrust that TODO-1 §5.1 left unparryable. That was the intent of
sequencing this second.

---

## 5. Tests

- **Symmetry:** `bladesCross(a, b, gap) === bladesCross(b, a, gap)` for a
  generated spread of phases, elapsed times and gaps.
- **Each condition falsified independently** while the other two hold, matching
  the contract style already established for `parryMeetsAttack`.
- **Reach sum:** at a gap between the two reaches, the rapier and longsword still
  cross, including the case where the longsword's own attack whiffs at that gap.
  At a gap beyond `reachA + reachB`, they do not.
- **Interval overlap:** two attacks whose parryable intervals overlap by one tick
  clash; offset by one more tick, they do not and the earlier one resolves.
- **The double still exists:** a constructed pair with disjoint parryable
  intervals and both in reach at their own `strikeEnd` still produces
  `winner === "draw"`.
- **Penalties:** after a longsword-rapier mutual clash, the longsword reaches
  `ready` before the rapier, asserted in ticks.
- **One clash sound:** exactly one `met` event is emitted for a mutual clash,
  asserted on the returned event array, and it fires on the
  `max(strikeStart, strikeStart)` tick. This belongs in the AGENTS.md describe
  block, "presentation events follow the simulation, not the input".
- **Golden replay:** the projection hash from §7.1 of the state-tracks spec
  **changes** here. This is the first gameplay change in the sequence that alters
  outcomes, so the hash is re-recorded, not preserved.

---

## 6. Out of scope

- Contact **persisting**. Here a clash still resolves instantly at each attacker's
  own `strikeEnd`, exactly as a parry does today. The sustained bind is TODO-5.
- Any distinction between binding weapons and non-binding weapons. Every clash is
  currently the same event. `bindCapable` arrives in TODO-5.
- Lines. Two crossing blades currently always meet regardless of where they are
  aimed, the same universal-coverage limitation §3.3 of the state-tracks spec
  documents for the parry. TODO-3.

---

## 7. Playtest gate

What to look for:

- Trading attacks with mode 3 produces steel rather than a coin flip, and the
  longsword visibly gets the next move after the exchange.
- A rapier thrust met by a longsword cut no longer feels like a dice roll about
  tick order.
- The clash still sounds exactly once per exchange.

What would look wrong: blades appearing to clash across visible empty space. The
sum rule is geometrically right for a point-to-point model, but the sprites draw
a blade with a hilt and a body, so if it reads wrong the fix is a per-weapon
`bladeFrom` offset subtracted from each side, not abandoning the sum.
