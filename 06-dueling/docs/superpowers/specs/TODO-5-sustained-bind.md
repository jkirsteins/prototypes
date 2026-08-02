# sustained-bind: The sustained bind

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

## Overview

Blade contact currently resolves in the same instant it happens. The blades touch,
`met` is set, penalties are applied at `strikeEnd`, and the fighters move on. That
is a *deflection*, and it is the right model for some weapons. It is the wrong
model for the longsword, where contact is the beginning of the fight rather than
the end of an exchange.

This spec makes contact persist, for the weapons whose physics support it.

**Delivers:** binds (part 1 of 2), sustained binds.

**Depends on:** `line-feints`. Its redirect window closes at commitment
(`strikeStart`), so by the time steel can touch steel no input can steer either
blade - contact lands on fighters who are already committed, which is what lets
the bind seize both bodies without stealing a choice either still had.

---

## 1. Which contacts persist

From the design doc: a *sustained* bind needs a blade that can exert and receive
lateral force without buckling. Longswords are stiff, broad and two-handed, so
pressure transmits and the contact is stable. Rapier contact is transient - the
blades flex and slide, and the follow-up is to go around rather than to wrestle.

**`bindCapable: false` is an abstraction, and the spec says so.** A real rapier
does bind - opposition along the forte is core to its system - but it cannot
*sustain* pressure the way two longswords can, so the game rounds its contact
down to instant deflection. That is a modelling rule with a gameplay purpose
(two weapons that play differently), not a claim that rapier steel cannot touch
steel. If a rapier bind game is ever wanted, the field becomes a depth or a
duration rather than a boolean; nothing downstream may assume the boolean means
"cannot bind at all".

```ts
interface WeaponProfile {
  // ...
  bindCapable: boolean;   // longsword true, rapier false
}
```

| Contact | Both `bindCapable` | Otherwise |
|---|---|---|
| Parry meets attack | **bind** | deflection, exactly as today |
| Two blades cross | **bind** | deflection, exactly as today |

Deflection is unchanged behaviour: `met` is set, the attack resolves to `parried`
at its own `strikeEnd`, and each weapon pays its own `parriedPenalty`. The
asymmetry `blade-contact` §1.1 relied on now applies specifically to the exchanges the
rapier is in, where "bad in the bind" reads correctly as "worse when its blade is
knocked off line".

The result is two genuinely different games. Longsword against longsword fights
in contact. Anything involving a rapier fights around it.

---

## 2. The bind state

```ts
interface Duel {
  // ...
  bind: BindState | null;
}

interface BindState {
  t: number;                        // the one clock; owned by the duel
  /** The actual contact line, saved at entry. For two crossing attacks it
   *  is their shared line; for a parried attack it is the attack's line,
   *  which the full-match rule (`attack-lines` §3) guarantees equals the
   *  parry's coveredLine - so there is exactly one honest value to save,
   *  and every bind presentation shows this saved line, never a live
   *  recomputation from states that may since have moved. */
  line: Line;
  /** Contact snapshot, captured on the entry tick BEFORE the attack and parry
   *  states are discarded. `pressure-and-winding` derives firmness from this;
   *  it cannot be recomputed later, because the states it reads are gone. */
  contact: [BindContact, BindContact];
}

type BindContact =
  | { kind: "strike"; progress: number }    // 0..1 through the travelling half
  | { kind: "guard"; settledMs: number };   // effective time before contact

type FighterState = | ... | { kind: "bind" } | ...;

export const BIND_MS = 500;
```

Entering: on the tick contact is detected between two bind-capable weapons, the
duel stores the `BindState` - snapshot included, read from the still-live attack
and parry states - and only then are both fighters' body states replaced with
the `bind` marker. The attacker's attack ends here; its timeline is discarded,
because the attack is over. A defender's `ParryTrack` is consumed and cleared.

During: neither fighter moves, accepts an intent, or resolves anything. Both are
committed. `x` is frozen; the `MIN_GAP` clamp still runs and is a no-op.

Exiting: at `bind.t >= BIND_MS` both return to `ready` and both seed
`BIND_RECOVERY_MS` = 180, a shared constant rather than a weapon field, because
both weapons in a bind are by definition the same bind-capable class. In this
spec the exit is **neutral and symmetric**: the bind
ends the exchange with no winner, and the next tempo belongs to whoever reads the
new position first. Deciding the bind is `pressure-and-winding`.

A neutral resolution is worth shipping on its own. It changes a longsword clash
from an instant ping into a held beat, which is a large change to how the fight
reads, and it lets the pose freeze in §4 be judged before a mini-game is built on
top of it.

### 2.1 Why the bind lives on the duel, not on the fighters

The bind is a single physical event with one clock. An earlier draft mirrored a
timed `bind` state onto both fighters and pinned their lockstep with a test.
That is the bug-shaped version: two copies of one fact, kept equal by
discipline. The shared object cannot drift, needs no `partner` field to
self-describe, and gives the contact snapshot exactly one home. The fighters'
`bind` marker carries no data because nothing about a bind is per-fighter:
everything about it is about the pair.

### 2.2 Death during a bind

A fighter cannot be struck during a bind: neither is attacking. If a bind is
somehow entered while the duel is already over, the bind is not created. The
`dead` and `hitstun` states continue to take precedence over everything.

---

## 3. No time dilation

The design doc suggests a slow-motion state for the bind. This spec deliberately
does not add one.

The simulation is a fixed 60 Hz tick and every AI decision is expressed in real
milliseconds, `AI_REACTION_MS` above all. A time scale inside the bind would make
that constant mean one thing outside the bind and another inside it, and the
fairness arithmetic in `parry-rise` §3.1 and `line-feints` §4.1 would quietly stop holding.

`BIND_MS` is 500 ms of real time, which is 30 ticks: room enough for a decision.
If `pressure-and-winding`'s window proves too fast to read, the lever is `BIND_MS`, not a time
scale.

---

## 4. Presentation

### 4.1 Sprites: freeze at contact, no new art

Each fighter holds the pose they were in when the blades touched:

| Role at contact | Held frame |
|---|---|
| Attacker, cut | `swordAttack` 3, the travelling frame, mid-arc |
| Attacker, thrust | `swordStab` **4**, the extended frame |
| Defender with a guard up | its guard's set frame (`swordAttack` 2 or `swordStab` 3) |

The thrust is a deliberate exception. Its travelling frame is `swordStab` 3, a
coiled pose with the point still back, which does not read as a blade in contact
with anything. Frame 4 is the extension. The bind is a frozen instant of
presentation, not a claim about which half of the strike the simulation is in, so
the frame that reads as contact is the right one to hold. `parryableUntil` and
every other timing are untouched by this choice, and a comment at the frame plan
says so, because the frame plan otherwise carries a strict rule that its strike
frames mirror the engine's meetable check.

Both held frames then carry a blade extended into the contact, so the two sprites
read as crossed steel at the gap the bind froze at.

A small deterministic oscillation is added on top: a sub-pixel horizontal offset
derived from `d.time`, opposite in phase between the two fighters, so they
visibly strain against each other rather than standing as a screenshot. This is
renderer-only and reads from `d.time`, so it stays deterministic and never enters
the simulation.

**Art debt, named:** there is no crossed-blades frame in the template, and the
freeze is a stand-in. It is enough to judge the mechanic. It is not enough to
ship the bind as the longsword's signature moment.

### 4.2 HUD

The body row shows `bind` with a progress bar over `BIND_MS`, using the same
idiom as every other timed state. Both fighters show it, both fill together,
driven by the one shared clock (§2.1).

### 4.3 Audio

The `met` clash already fires at the contact instant and is unchanged, so an
attack that ends in a bind still resolves to exactly one sound. The bind itself
adds no cue: it is a held state, not a moment, and `AGENTS.md` maps cues to
moments.

No sustained scrape or drone. The bind is 500 ms; a bed under it would be
ambience, and this project does not do ambience.

### 4.4 Row 3 and the help panel

Row 3 shows the saved `bind.line` - the contact line captured at entry - as
`LOW OUTSIDE (bind)`. Both fighters are on it by definition, so both rows read
the same, which is the visual statement that the two blades are in one place.
The label reads the snapshot, not the fighters' current stances, for the same
reason the firmness does: the states that formed the contact are gone.

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit: the bind is a new
state, so an undocumented one fails the build, and the entry must also say which
weapons can enter it.

---

## 5. AI

No decisions are made inside a bind in this spec, so no AI changes are required.

One consequence to watch: mode 3 with a longsword will now enter binds against a
parrying player and lose 500 ms of its cycle to them. `duelistCooldown` is derived
from the thrust's whiffed commitment and does not account for this, so its
approach-strike-retire pulse will stretch. That is acceptable, and it is not
worth deriving a bind term into the cooldown until `pressure-and-winding` gives the bind an
outcome worth pacing around.

---

## 6. Tests

- **Capability gate:** longsword against longsword produces a bind; every pairing
  involving a rapier produces the deflection path with unchanged penalties and
  unchanged timings. Table-driven over both contact kinds.
- **One clock:** both fighters enter the `bind` marker on the contact tick and
  both return to `ready` on the tick `duel.bind.t` crosses `BIND_MS`; there are
  no per-fighter timers to drift, and `duel.bind` is `null` again after exit.
- **Contact snapshot:** entering a bind stores each side's `BindContact` with
  the values the live states held on the entry tick, asserted against
  hand-computed fixtures - and the snapshot remains readable after the attack
  timeline is discarded.
- **Frozen:** `x` does not change during a bind; no intent is accepted; no
  `strikeEnd`, `whiff`, `parried` or `hit` is emitted from inside one.
- **Attack is over:** a bound attack never resolves. No `parried` event, no
  `parriedPenalty`, no recovery from the discarded timeline.
- **Guard consumed:** a defender entering a bind has `parry === null` on exit and
  a charged `parryRecoveryMs`.
- **One sound:** exactly one `met` fires for a contact that becomes a bind, on the
  same tick it fired before this spec. Existing AGENTS.md assertions from `blade-contact`
  must pass unedited for the bind path.
- **Determinism:** the oscillation in §4.1 is renderer-only. The golden replay
  projection must not include it, and a test asserts the projection hash is
  identical with the renderer stubbed out.
- **Golden replay:** hash re-recorded.

---

## 7. Out of scope

- Any decision inside the bind. Pressure, winding, pushing through: `pressure-and-winding`.
- Asymmetric bind outcomes. Both fighters currently leave equal.
- Binds between more than two blades.
- A crossed-blades sprite. Named as debt in §4.1.
- Deriving a bind term into `duelistCooldown`. See §5.
- Grappling, half-swording, pommel strikes, closing to the *Krieg*. The doc's
  close-measure layer is a separate direction and does not belong under contact.

---

## 8. Playtest gate

Longsword mirror against mode 3, then the same fight with a rapier.

What to look for:

- The held beat reads as two fighters locked, not as the game stuttering.
- Losing 500 ms to a bind feels like a consequence you caused.
- The rapier fight feels measurably different: quick deflections, no lock, and
  the disengage from `line-feints` as its natural answer.

What would look wrong: the freeze reading as a hitch or a dropped frame. That
means the pose stand-in in §4.1 has run out and the crossed-blades art has to
come before `pressure-and-winding`, not after it.
