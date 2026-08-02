# TODO-5: The sustained bind

## Overview

Blade contact currently resolves in the same instant it happens. The blades touch,
`met` is set, penalties are applied at `strikeEnd`, and the fighters move on. That
is a *deflection*, and it is the right model for some weapons. It is the wrong
model for the longsword, where contact is the beginning of the fight rather than
the end of an exchange.

This spec makes contact persist, for the weapons whose physics support it.

**Delivers:** binds (part 1 of 2), sustained binds.

**Depends on:** TODO-4, whose condition 3 (`met === false` blocks a redirect)
already declared that contact is a commitment.

---

## 1. Which contacts persist

From the design doc, and it is physics rather than style: a bind needs a blade
that can exert and receive lateral force without buckling. Longswords are stiff,
broad and two-handed, so pressure transmits and the contact is stable. Rapiers are
thin and one-handed; both blades flex and slide off, and the correct follow-up is
to go around rather than to wrestle.

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
asymmetry TODO-2 §1.1 relied on now applies specifically to the exchanges the
rapier is in, where "bad in the bind" reads correctly as "worse when its blade is
knocked off line".

The result is two genuinely different games. Longsword against longsword fights
in contact. Anything involving a rapier fights around it.

---

## 2. The bind state

```ts
type FighterState =
  | ...
  | { kind: "bind"; t: number; partner: 0 | 1 }
  | ...;

export const BIND_MS = 500;
```

Entering: on the tick contact is detected between two bind-capable weapons, both
fighters' body states are replaced with `bind`. The attacker's attack ends here;
its timeline is discarded rather than replaced, because the attack is over. A
defender's `ParryTrack` is consumed and cleared.

During: neither fighter moves, accepts an intent, or resolves anything. Both are
committed. `x` is frozen; the `MIN_GAP` clamp still runs and is a no-op.

Exiting: at `t >= BIND_MS` both return to `ready` and both seed
`BIND_RECOVERY_MS` = 180, a shared constant rather than a weapon field, because
both weapons in a bind are by definition the same bind-capable class. In this
spec the exit is **neutral and symmetric**: the bind
ends the exchange with no winner, and the next tempo belongs to whoever reads the
new position first. Deciding the bind is TODO-6.

A neutral resolution is worth shipping on its own. It changes a longsword clash
from an instant ping into a held beat, which is a large change to how the fight
reads, and it lets the pose freeze in §4 be judged before a mini-game is built on
top of it.

### 2.1 Why the bind is one state on both fighters, not a pair of states

The bind is a single physical event with one clock. Modelling it as two
independent timers invites them to drift, and the first bug would be one fighter
leaving the bind a tick before the other. Both `bind` states are created on the
same tick with the same `t`, both tick with the same `dt`, and a test asserts they
release on the same tick.

`partner` exists so a bind is self-describing when read from either side, and so
a future third fighter does not silently break the assumption.

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
fairness arithmetic in TODO-1 §3.1 and TODO-4 §4.1 would quietly stop holding.

`BIND_MS` is 500 ms of real time, which is 30 ticks: room enough for a decision.
If TODO-6's window proves too fast to read, the lever is `BIND_MS`, not a time
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
which is the visual assertion that §2.1 holds.

### 4.3 Audio

The `met` clash already fires at the contact instant and is unchanged, so an
attack that ends in a bind still resolves to exactly one sound. The bind itself
adds no cue: it is a held state, not a moment, and `AGENTS.md` maps cues to
moments.

No sustained scrape or drone. The bind is 500 ms; a bed under it would be
ambience, and this project does not do ambience.

### 4.4 Row 3 and the help panel

Row 3 shows the line the bind formed on, as `LOW OUTSIDE (bind)`. Both fighters
are on it by definition, so both rows read the same, which is the visual
statement that the two blades are in one place.

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
worth deriving a bind term into the cooldown until TODO-6 gives the bind an
outcome worth pacing around.

---

## 6. Tests

- **Capability gate:** longsword against longsword produces a bind; every pairing
  involving a rapier produces the deflection path with unchanged penalties and
  unchanged timings. Table-driven over both contact kinds.
- **Symmetric entry and exit:** both fighters enter `bind` on the same tick with
  equal `t`, and both reach `ready` on the same tick. Asserted per tick, not per
  millisecond.
- **Frozen:** `x` does not change during a bind; no intent is accepted; no
  `strikeEnd`, `whiff`, `parried` or `hit` is emitted from inside one.
- **Attack is over:** a bound attack never resolves. No `parried` event, no
  `parriedPenalty`, no recovery from the discarded timeline.
- **Guard consumed:** a defender entering a bind has `parry === null` on exit and
  a charged `parryRecoveryMs`.
- **One sound:** exactly one `met` fires for a contact that becomes a bind, on the
  same tick it fired before this spec. Existing AGENTS.md assertions from TODO-2
  must pass unedited for the bind path.
- **Determinism:** the oscillation in §4.1 is renderer-only. The golden replay
  projection must not include it, and a test asserts the projection hash is
  identical with the renderer stubbed out.
- **Golden replay:** hash re-recorded.

---

## 7. Out of scope

- Any decision inside the bind. Pressure, winding, pushing through: TODO-6.
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
  the disengage from TODO-4 as its natural answer.

What would look wrong: the freeze reading as a hitch or a dropped frame. That
means the pose stand-in in §4.1 has run out and the crossed-blades art has to
come before TODO-6, not after it.
