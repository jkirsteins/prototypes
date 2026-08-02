# pressure-and-winding: Pressure and winding

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

## Overview

`sustained-bind` gives the longsword a held beat of contact with no decision in it. This
spec puts the decision in: you feel how hard the other blade is pressing, and you
either push through it or go around it.

This is *Fühlen* and *Winden*, the centre of the Liechtenauer system and the
reason the longsword is the doc's richest weapon.

**Delivers:** binds (part 2 of 2), pressure, winding.

**Depends on:** `sustained-bind`.

---

## 1. Pressure is derived, never rolled

Each fighter carries a `firmness` in [0, 1], computed from the state they were in
when the blades touched. Nothing is random. Pressure is a *consequence* of the
choices both fighters already made, which is what makes reading it a skill rather
than a lottery.

```ts
function firmnessAt(f: Fighter): number;
```

**A fighter whose blade was travelling** (in `strike`):

```
(elapsedMs - strikeStart) / (parryableUntil - strikeStart)
```

The further into the strike, the more of the body is behind the blade. A blade
met at the very start of its travel is soft; one met just before it arrives is
hard.

**A fighter whose guard was up:**

```
min(1, (parry.riseMs - parryRiseMs) / GUARD_SETTLE_MS)     // GUARD_SETTLE_MS = 160
```

A guard that became effective one tick ago is barely there. A settled guard is
braced.

### 1.1 What this does to the parry timing choice

`parry-rise` made the defender choose between committing early (readable, feintable)
and committing late (unreadable, thin margin). Late was strictly safer against
everything except a feint.

Now it is not. An early guard is **firm** in the bind; a late guard is **soft**
and gets pushed through. The same decision now trades on two axes in opposite
directions, which is the shape a real decision has:

| Guard timing | Against a feint | In the bind |
|---|---|---|
| Early | readable, feintable | firm |
| Late | hard to react to | soft |

No new input and no new number produced this. It falls out of the two mechanics
already built, which is the sign the model is holding together.

---

## 2. The two actions

```ts
type Intent = ... | "press" | "wind";
```

Reusing the two attack keys (`j`, `k`) while in a bind, so no new bindings are
introduced and the hand stays where it is. The help overlay is updated in the
same change.

| Action | Historical name | Wins when the **opponent** is |
|---|---|---|
| `press` | pushing through, *Oberhau* from the bind | soft (`firmness < 0.5`) |
| `wind` | *Winden*, yield and go around | hard (`firmness >= 0.5`) |

You read *their* bar, not yours. Yielding against a hard blade turns their own
commitment past you; shoving a soft blade aside works because there is nothing
behind it.

The decision is locked on the first press and cannot be changed. Choosing nothing
is legal and common: the bind then breaks neutrally at `BIND_MS`, exactly as
`sustained-bind` already does.

### 2.1 Resolution

Each fighter's choice is judged independently against the opponent's firmness.

| | Outcome |
|---|---|
| Exactly one fighter chose correctly | that fighter **wins** the bind |
| Both chose correctly | neutral break |
| Neither chose correctly | neutral break |
| Nobody chose by `BIND_MS` | neutral break |

Resolution happens on the tick the second fighter commits, or at `BIND_MS`,
whichever is first. A fighter who commits early does not get to see the other's
choice: it resolves when both are in, so the second mover gains nothing by
waiting except less time.

Both-correct breaking neutrally is deliberate. The reward is for being the only
one who read it, not for reading it.

### 2.2 What winning is worth

The loser enters `exposed` for `BIND_LOSS_MS` and cannot act.

The winner returns to `ready` with `BIND_ADVANTAGE_MS` on the clock. While that
timer runs, any attack they start **begins at `strikeStart`**: the windup and the
stillness are skipped, because the blade is already in contact and does not have
to be gathered. That is *Absetzen*, thrusting from the bind without giving up
contact, and it is the reward the whole mechanic exists for.

```ts
function bindTimeline(w: WeaponProfile, a: AttackKind): AttackTimeline;
// riseStart = riseEnd = strikeStart = 0; the rest follows the kind's timings
```

Numbers:

| Constant | Value |
|---|---|
| `BIND_LOSS_MS` | 320 |
| `BIND_ADVANTAGE_MS` | 200 |
| `GUARD_SETTLE_MS` | 160 |

The arithmetic these are chosen for: a longsword thrust from the bind resolves in
260 ms, inside the loser's 320 ms of exposure, so **taking the opening
immediately kills**. Hesitating 100 ms puts it at 360 ms, and the loser is back
on their feet and can void or counter. Winning the bind is decisive and expires
if you admire it.

The winner is not forced to attack. Stepping out of measure with the advantage is
a legitimate and sometimes better play, particularly at low health-free stakes
where a whiff is fatal.

### 2.3 The rise cue is not skipped, it does not exist

An attack launched on `bindTimeline` has `riseStart === riseEnd === strikeStart
=== 0`, so no `windup` DuelEvent fires and no rise cue plays. This is not a
special case in the audio layer: the mark-based emission from §3.2 of the
state-tracks spec produces nothing because there is no interval to cross. The
blade was never gathered, so there is no rising tone. The `swing` event fires as
normal at `strikeStart`, silent as always.

---

## 3. Presentation

### 3.1 HUD: the pressure bars

Two bars during a bind, one per fighter, drawn in the defence row's position and
using the same segmented idiom. Each shows that fighter's own firmness with a
mark at the 0.5 threshold. The **opponent's** bar is the one drawn bright, since
that is the one being read; your own is dimmed.

Making a tactile sense visible is the honest way to model *Fühlen* in a video
game. Modelling it as a hidden value the player must guess would not be
simulating feel, it would be removing it.

The label reads `bind: they are hard` or `bind: they are soft`, with the bar
underneath for the margin. Prose for the read, bar for the confidence.

Row 3 keeps showing the bind's line from `sustained-bind` §4.4, and on a decisive
resolution the winner's row 3 switches to their new attack's line, which is the
moment the opening becomes visible.

### 3.4 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. `press` and
`wind` are new acceptance rules inside a state, and `BIND_LOSS_MS` and
`BIND_ADVANTAGE_MS` are timings, so all of it is in scope for the panel. Two
sentences: what pressure means, and that you read theirs rather than yours.

### 3.2 Sprites

Both fighters hold `sustained-bind`'s frozen contact poses through the decision. On a
decisive resolution:

- the winner plays their sheet's travelling frame if they attack, or the normal
  transition to `ready` if they do not
- the loser holds their contact frame through `exposed`, which reads as being
  turned out of the bind and unable to recover

The oscillation from `sustained-bind` §4.1 gains an amplitude term from the firmness
difference, so a lopsided bind visibly leans before it resolves. Renderer-only,
derived from `d.time` and the two firmness values, outside the simulation.

### 3.3 Audio

One new DuelEvent, `bindBreak`, emitted **only on a decisive resolution** and
mapped to the existing clash samples.

A neutral break is silent. That is the point: hearing a second clash means
somebody won, and silence means the bind went nowhere. The sound carries
information, which is the same argument that keeps `swing` unmapped.

This does not violate the one-sound-per-attack rule. The attack that entered the
bind already resolved to its single `met` clash at contact and is over; the bind
is a separate event with its own moment. The moment is the resolution tick, not
the keypress that chose the action, per `AGENTS.md`.

---

## 4. AI

**Mode 3, the duelist.** After `AI_REACTION_MS` from the bind's start, reads the
opponent's firmness and chooses the correct action, with a seeded error rate:

```ts
const wrong = nextRandom(ai) < DUELIST_BIND_ERROR;   // 0.25
```

Deterministic from the seed, beatable by design. A perfect bind reader would make
the longsword mirror unplayable, since the correct answer is fully determined by
visible state.

The reaction gate matters: it means a player who commits their bind action
immediately is choosing before the AI has read anything, which is a real option
against a duelist that reads well.

**Mode 1, the parry dummy.** Never acts in a bind. It is a defensive dummy and
does not know the bind game; every bind it enters breaks neutrally. This is the
drill: practise entering binds and taking the free advantage.

**Mode 2, the drill metronome.** Does not parry, so it binds only when the player
counter-attacks into it. It never acts in a bind either.

---

## 5. Tests

- **Firmness is a pure function** of the fighter's state at contact. Same state,
  same value, no rng draw involved. Asserted by table over constructed states.
- **Firmness boundaries:** a blade met on its first tick of travel is near 0; one
  met on the last parryable tick is near 1. A guard effective for one tick is 0; a
  guard settled `GUARD_SETTLE_MS` past effective is 1, and stays 1 beyond.
- **The four resolution cases** in §2.1, each constructed explicitly, including
  both-correct and neither-correct producing a neutral break.
- **Second mover gains nothing:** resolving on the tick the second fighter
  commits is asserted, and a test shows a fighter cannot observe the other's
  choice before committing.
- **The reward window:** a thrust started on the tick the bind is won kills; the
  same thrust started 7 ticks later does not, because `exposed` has ended. Both
  directions asserted, since this pair of numbers is the whole balance of §2.2.
- **`bindTimeline`:** every mark before `strikeStart` is 0; no `windup` DuelEvent
  is emitted; `swing` fires at `strikeStart`; exactly one outcome sound fires at
  `strikeEnd`. Belongs in the AGENTS.md describe block.
- **`bindBreak` timing:** fires on the resolution tick, not on the tick the
  action intent was accepted. This is the exact class of bug `AGENTS.md` was
  written about, so it is asserted rather than assumed.
- **Neutral break is silent:** no `bindBreak` event at all.
- **AI determinism:** same seed, same input script, same bind choices and same
  error ticks.
- **Golden replay:** hash re-recorded.

---

## 6. Out of scope

- **The doc's third bind option, "good geometry -> *Absetzen* as a distinct
  choice".** `attack-lines` gives blades a side, so the geometry this needs now half
  exists: a third option could be "go around to the other side" as distinct from
  winding over the top. It is still deferred, because a three-way inside a 500 ms
  window with one readable variable is a coin flip wearing a technical name.
  Revisit it when `wind` has been played and the pressure read is proven, and
  when the side axis has a second entry (an inside cut, an outside thrust) so
  going around means something the attacker could also have done. Until then
  `press` and `wind` are the honest pair, and *Absetzen* appears as the winner's
  reward in §2.2 rather than as a choice.
- *Duplieren* and *Mutieren*. They are follow-ups within a continuing bind, and
  this bind resolves in one exchange.
- Multiple exchanges in one bind, or re-entering a bind from a bind.
- Rapier bind behaviour. It is `bindCapable: false` and stays that way; the
  weapon's answer is the disengage from `line-feints`.
- Grappling, half-swording, and the close-measure *Krieg*.
- Slow motion during the decision. `sustained-bind` §3 argues against it and that argument
  is unchanged: `BIND_MS` is the lever.

---

## 7. Playtest gate

This is the last spec in the chain, so play the whole thing, not just the bind.

What to look for:

- The pressure bar is readable in the time available. If you find yourself
  guessing, `BIND_MS` is too short, not the bars too small.
- Winning a bind and taking the kill feels like the best moment in the game. It
  should; it is the deepest thing in it.
- The early-versus-late guard choice from §1.1 actually bites: you should catch
  yourself thinking "I need to be firm here" and committing earlier against a
  longsword than against a rapier.
- Across a session against mode 3: are you losing to feints, to binds, or to
  measure? All three should happen. If one dominates, that is where the next
  spec goes.

What would look wrong: every longsword fight ending at the first bind. That means
`BIND_LOSS_MS` is too generous relative to the thrust, and the fix is that
number, not the reward, because the reward is the reason the mechanic exists.
