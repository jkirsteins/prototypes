# blade-contact: Two blades meet

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

## Overview

Today a blade can only be met by a raised parry. Two attacks never interact: if
both strikes resolve on the same tick in reach it is a mutual kill, and otherwise
the earlier `strikeEnd` simply kills the other fighter mid-attack.

That is backwards relative to the source material. In Liechtenauer longsword the
defence *is* an attack: the Meisterhaue displace the incoming blade and threaten
in the same tempo, and a pure parry that only blocks is the beginner's option
because it costs a tempo and returns nothing. Blades meeting is the normal case;
the standalone parry is the secondary one.

This spec makes travelling blades meet, and promotes blade contact from one
function to a small module with two entry points.

**Delivers:** attacks-on-attacks, simple blade contact.

**Depends on:** `attack-lines`, deliberately: blades carry a line before they
learn to cross, so the crossing rule requires line agreement from its first
version instead of shipping a universal-clash interim in which every same-tempo
trade rang steel.

---

## 1. The travel model

A strike is not a region that switches on. It is a blade moving, and the contact
rules need to know where the blade is. One function answers that:

```ts
/** How far this fighter's blade extends from their body centre, in cm. */
function extension(f: Fighter): number {
  const s = f.state;
  if (s.kind !== "attack" || s.phase !== "strike") return 0;
  const t = s.timeline;
  const travel = (s.elapsedMs - t.strikeStart) / (t.parryableUntil - t.strikeStart);
  return f.weapon.reach * Math.min(1, travel);
}
```

The blade extends linearly from the body to full `reach` across the travelling
half of the strike, and holds full extension through the delivered half until
`strikeEnd`. An earlier draft of this spec had blades collide at full reach on
the first tick both attacks were in their strike; that made contact a switch
rather than a meeting, and it made the clash tick independent of how far either
blade had actually got. Where the blades are must depend on how far they have
travelled.

Linear is an approximation - a cut's tip sweeps an arc, a thrust accelerates -
but it is monotonic, cheap, and one function, and nothing downstream cares about
the shape, only the crossing tick. Anything that is not an attack in `strike`
has extension 0: a guard is a position at the body, not a reach.

---

## 2. The two contacts

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

The mutual case is checked first and returns early because a fighter cannot both
cross a blade and be parried on the same tick. With `attack-lines`' line
conditions and this spec's travel conditions living in these two siblings, the
state-tracks spec's §10 promise - geometry arrives in one place - stays kept
with two kinds of contact.

### 2.1 bladesCross

All three required, on the same tick:

1. **Both travelling.** Both are `attack` in `strike` with
   `elapsedMs <= timeline.parryableUntil`. A blade past that mark has arrived;
   it no longer meets anything.
2. **Same line.** `lineOf(a).height === lineOf(b).height` and
   `lineOf(a).side === lineOf(b).side`, using `attack-lines`' `lineOf`. Two
   blades have to be in the same place vertically and around the blade to touch.
3. **The tips have covered the distance.** `extension(a) + extension(b) >= gap`.

Contact is the **first tick** all three hold. Consequences:

- The clash tick depends on the gap. Close fighters clash early in the strike;
  at maximum range (`gap === reachA + reachB`) the tips kiss only at full
  extension. Distance is felt, not just checked.
- The reach sum stays the outer bound, so a rapier can meet a longsword blade at
  a gap where the longsword's own attack whiffs: the long blade is present in
  the space, the short one is not.
- A cut and a thrust at the same height **pass each other** (different side).
  If both are in reach at their own `strikeEnd`, both fighters die. The mutual
  kill has a cause a player can name: same tempo, same height, different sides,
  and nobody defended.

### 2.2 parryMeetsAttack

The same physical rule with one side standing still. To the conditions
`parry-rise` and `attack-lines` already put here (guard effective, height
match), this spec adds the travel condition:

```
extension(attacker) >= gap
```

`met` latches on the first tick every condition holds - which is
`max(arrival tick, guard-effective tick)` - and can latch until the end of the
travelling half, exactly as today. What changes is the front edge: a blade is
met when it *arrives at the guard*, not merely once it is somewhere in its
strike.

### 2.3 Outcome

Both attacks in a crossing are marked `met`. Neither can wound. Each resolves to
`parried` at its own `strikeEnd` and pays **its own weapon's** `parriedPenalty`.

That is 290 ms for the longsword against 360 ms for the rapier, so after a
mutual clash the longsword is free 70 ms earlier and owns the next tempo.
"Strong in the bind" and "bad in the bind" fall out of numbers that already
exist. No new stat is invented for it.

The double kill survives and improves: it now requires the blades to have
*missed each other* - different line, or travel intervals that never overlap
with the tips covering the gap. That is the historical double, earned rather
than decided by which `strikeEnd` happened to fire first. The engine's draw
handling is unchanged; only its reachability changes.

---

## 3. Presentation

### 3.1 One clash, at the contact tick

Both contacts now share one definition of the moment: **the first tick the
blades occupy the same place**, which is when `met` latches. The `met` cue fires
on that tick.

This amends the shipped rule for the parry clash, and the spec says so plainly:
today the cue fires at `parryableUntil` regardless of gap. Under the travel
model that is only correct at maximum range; at any closer gap the blade arrives
at the guard earlier, and the cue moves to the arrival tick. The clash line in
`AGENTS.md` ("the end of the parryable interval") is updated in the same commit,
and the "presentation events follow the simulation, not the input" describe
block re-pins the new instants. This is the same doctrine applied harder: the
sound belongs to the physical moment, and the travel model locates that moment
better than the interval boundary did.

**One `met` event per contact, not one per side.** Two events on the same tick
would layer two clash samples and break the one-sound-per-attack rule. For a
crossing, `side` carries the fighter whose strike began later - the blade whose
travel completed the contact.

### 3.2 Sprites, HUD and log

No new art. Both fighters are already mid-strike and render their travelling
frames; the line bars from `attack-lines` sit at the same band when a crossing
is possible, which is the read. The existing strike bar shows both cursors
inside their bright segments at the moment of contact.

The activity log gains no new kind. Both sides log `parried`, so the reader sees
two parried lines rather than one parried and one hit.

### 3.3 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. Two rules for
the panel: attacks can now meet each other when thrown on the same line, and a
blade is met when it arrives, so distance decides when the clash comes.

---

## 4. AI

No change is required. Mode 3 already attacks from narrow measure and will
sometimes cross blades with a counter-attacking player, which is the new option
this spec hands the player.

One consequence worth naming: counter-attacking becomes a real answer to the
rapier thrust that `parry-rise` §5.1 left unparryable. That is why this lands
early in the chain, before the feint work builds on top.

---

## 5. Tests

- **Extension boundaries:** 0 through windup, 0 on the tick of `strikeStart`,
  `reach` at `parryableUntil`, `reach` held through the delivered half. Per
  weapon and attack.
- **Symmetry:** `bladesCross(a, b, gap) === bladesCross(b, a, gap)` for a
  generated spread of phases, elapsed times, lines and gaps.
- **Each condition falsified independently** in both functions while the others
  hold, matching the contract style `parryMeetsAttack` already has.
- **Contact tick moves with gap:** for the same two attacks, a smaller gap
  produces an earlier `met` tick, monotonically; at `gap === reachA + reachB`
  contact lands exactly when both reach full extension.
- **Parry arrival:** at `gap === reach` the clash fires at `parryableUntil`,
  pinning the old boundary as the limiting case; at half reach it fires on the
  tick `extension` crosses the gap. A guard that becomes effective after the
  blade's arrival but inside the travelling half still latches, on its
  effective tick.
- **Pass-throughs:** different side or different height produces no `met`, and
  the both-lethal case yields `winner === "draw"` (the cross-side double moves
  here from `attack-lines`, now that crossings exist to fail).
- **Interval overlap:** travel intervals overlapping by one tick with the tips
  covering the gap clash; disjoint intervals do not, and the earlier attack
  resolves alone.
- **Penalties:** after a longsword-rapier crossing, the longsword reaches
  `ready` first, asserted in ticks.
- **One clash sound:** exactly one `met` per contact, on the contact tick, in
  the AGENTS.md describe block - including a case where the crossing tick is
  strictly earlier than either attack's `parryableUntil`.
- **Fixture continuity:** the `cut.side = "inside"` fixture weapon from
  `attack-lines` now crosses a thrust, completing the no-inference proof at the
  contact layer.
- **Golden replay:** hash re-recorded. This changes outcomes; that is its job.

---

## 6. Out of scope

- Contact **persisting**. A clash still resolves instantly at each attacker's
  own `strikeEnd`, exactly as a parry does today. The sustained bind is
  `sustained-bind`, and `bindCapable` arrives there.
- Per-weapon extension shapes (an arcing cut tip, an accelerating thrust).
  Linear for everyone until play shows the difference would be felt.
- Blade-on-blade outside the strike. A guard has extension 0 by definition here;
  guard-versus-guard contact is not a thing this model produces.

---

## 7. Playtest gate

What to look for:

- Trading attacks with mode 3 produces steel rather than a coin flip, and the
  longsword visibly gets the next move after the exchange.
- Clashes feel *located*: fighters nearly chest to chest bind almost as the
  strikes start, tips kiss late at full stretch. If every clash sounds at the
  same beat regardless of distance, the travel model is not doing its work.
- The double now reads as "same height, different side, nobody home" - you
  should be able to say it after it happens.

What would look wrong: the clash sounding while the blades look apart. The
extension model measures body centre to tip while the sprites draw a hilt and a
body, so if it reads wrong the fix is a per-weapon `bladeFrom` offset subtracted
from each extension, not abandoning the travel model.
