# disarming: Taking the sword instead of the life

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

A won bind currently has one conversion: the thrust, which kills. This spec
adds the second conversion the sources are full of: the disarm, which wins
without a wound. The shape is deliberately narrow:

```text
bind advantage
-> the winner chooses a conversion: thrust or disarm
-> committed attempt, guaranteed like the thrust
-> duel ends: killed, or disarmed
```

(As reviewed, second revision - the first draft made firm grips resistable:
a `gripped` state, a resist press, fail recoveries, a whole timed save beat.
Review killed it with the draft's own §6: the AI was FORBIDDEN from drawing
a resistable disarm because it hands the opponent a save and the initiative
for the same victory the thrust takes outright - and a choice the policy
must refuse as self-sabotage is a trap when a player takes it. A won bind
is a won position. The two conversions differ in OUTCOME - the life or the
sword - never in reliability. The loser's agency was the bind itself,
exactly as it is against the advantage thrust. The resist and everything
serving it are deleted; §3 records the reasoning and the one seam where a
resist could honestly return.)

The last line of the shape is what keeps the spec small. A disarm that ends
the duel needs one new beat and one new terminal state. A disarm the fight
survives needs unarmed behaviour, weapon recovery, secondary weapons and a
defence rulebook for a fighter with no blade - four specs pretending to be
one. The narrow version ships first and earns the wide one, or does not.

**Delivers:** the disarm - a guaranteed bloodless win from a won bind,
twin to the thrust.

**Depends on:** `sustained-bind` (the contact snapshot the grip reads),
`pressure-and-winding` (the advantage the attempt consumes),
`duelist-defence` (the conversion policy this spec extends).

---

## 1. Where the disarm lives - and the two places it does not

The disarm is an **advantage consumer**, beside the thrust from
`pressure-and-winding` §7. It exists exactly while `bindAdvantageMs > 0`,
which settles its availability without a new rule: advantage only comes from
a won bind, binds only form where `canBind` sustains the contact (stiffnesses
within the band - under the shipping numbers both mirrors, never the mixed
pairing), so the disarm reaches exactly the pairings that bind, for free, and
"when the position permits it" means precisely "when you hold the advantage" -
blade control and leverage, already won, never asserted.

Two places it deliberately does not live:

- **Not in the four-answer defence menu.** `duelist-defence` §4.2 stays four
  answers with the same weights. A defender answering an incoming attack has
  no blade control to spend; pricing a grab into that menu would reprice all
  four answers around an option that is physically absent. The menu is not
  touched by this spec.
- **Not a third verb inside the bind.** `pressure-and-winding` §11 keeps
  the in-bind vocabulary at two committed actions - the pressure pulse and
  the yield - and the refusal of more stands. The disarm begins only after
  the control contest resolves.

This ordering is also why the spec sits after `duelist-defence`.
`duelist-defence` wrote its policy over the complete kit, and this spec
changes the kit, so it must also extend that policy - which it does in one
section (§5), against a finished surface.

### 1.1 The input: a dedicated key

**I** - a fresh binding, beside the attack cluster the right hand already
owns (J cut, K thrust, L parry). While `bindAdvantageMs > 0`, I consumes the
advantage and starts the disarm; at any other time it does nothing.

**Obligation on `gamepad-support`:** that spec promises the pad as a
complete second first-class device, so when this spec lands, the disarm
joins its contract in the same change or the promise is broken: a
`"disarm"` `ActionId`, keyboard and pad labels, a pad binding, prompt and
help resolution through the shared label layer, and the routing tests.
Whichever spec lands second carries the integration - stated here so
neither can claim the other owned it.

The first draft reused the cut key, since a cut is useless inside the
advantage window anyway. Review rejected it on an accidental-input argument:
today, mashing J in the opening costs a harmless wasted cut; an overloaded J
would commit mashers to a conversion they never chose. Key overloading is
fine in a long, signposted mode (the bind's J/K precedent stands); it is a
trap in a 240ms window where the same key already means something else.
The prompt teaches the key in the moment (§4.2), so discoverability is the
prompt's job, not the binding's.

`pressure-and-winding` §7's advantage table is therefore AMENDED by one new
row, and nothing else in it changes - the cut still clears the timer and
proceeds as a normal cut, and its row in the cleared-by-anything test
stands:

| Intent while `bindAdvantageMs > 0` | Effect |
|---|---|
| thrust (K) | consumes the advantage, launches on `bindTimeline` - the kill (unchanged) |
| **disarm (I)** | **consumes the advantage, starts the strip - the sword** |
| cut, step, void, parry | clears the timer, proceeds normally (unchanged) |

---

## 2. The attempt

### 2.1 What the grip knows: the loser's firmness, saved at resolution

How hard a sword is to strip is how firmly it was held, and the game already
computed that number: the loser's firmness, derived at contact by
`pressure-and-winding` §1 and felt all bind long as the starting control and
drift it produced. It is saved beside the advantage timer on the resolution
tick, for the same reason the bind snapshot exists - the states it derives
from are gone:

```ts
interface Fighter {
  // ...
  bindAdvantageMs: number;      // pressure-and-winding §7
  /** The bind loser's firmness, saved on the resolution tick beside the
   *  timer. Read once, if the advantage converts to a disarm attempt;
   *  meaningless and unread otherwise. */
  bindAdvantageGrip: number;
  /** The winner's own contact snapshot and the bind line's side axis,
   *  saved on the same tick for the same reason: if the advantage
   *  converts to a disarm, the attempt's frozen scene (§2.2, §4.1)
   *  needs the winner's pose, and the bind that knew it is gone. The
   *  loser's half already survives inside their `exposed` state. */
  bindAdvantageContact: BindContact | null;
  bindAdvantageLineSide: Side | null;
}
```

No new derivation: a braced hand takes longer to strip than a loose one.
Since the strip is guaranteed either way (§2.2), the grip prices the
attempt's DURATION only - how long the wrestle visibly takes - never its
outcome. The winner's own firmness plays no role.

### 2.2 The state, and the twin invariant

One physical event, one clock, owned by the duel - `sustained-bind` §2.1's
argument, applied unchanged:

```ts
interface Duel {
  // ...
  disarm: DisarmState | null;
  /** How the duel ended, for the banner and the record: a kill, a draw,
   *  or a taken sword. Null while it runs. */
  outcome: "kill" | "draw" | "disarm" | null;
}

interface DisarmState {
  t: number;            // the one clock
  durationMs: number;   // fixed at the attempt's start, from the saved grip
}

// The presentation snapshot - both contact poses and the line's side
// axis, frozen through the attempt - lives ON THE TWO STATES that render
// it (as built; the review draft put it here, and the equivalent home
// won): the victim's pose rides exposed into `disarmed`, and the
// attacker's saved-at-resolution snapshot (§2.1) rides into
// `{ kind: "disarming"; contact; lineSide }`. The renderer's exposed
// arm already resolves poses exactly this way, so the frozen scene
// costs zero new plumbing. The strain oscillation is a pure function
// of the clock and needs no state.

type FighterState =
  | ...
  | { kind: "disarming" }   // the attacker: committed, accepts nothing
  | { kind: "disarmed" }    // terminal, like dead
  | ...;
```

(Kill and draw populate `outcome` too - one field, three honest values -
so the banner stops inferring the ending from `winner` alone. The existing
end-of-duel paths gain their one-line writes in this spec.)

```ts
durationMs = DISARM_SOFT_MS
           + bindAdvantageGrip * (DISARM_FIRM_MS - DISARM_SOFT_MS)
```

| Constant | Value |
|---|---|
| `DISARM_SOFT_MS` | 180 |
| `DISARM_FIRM_MS` | 260 |

The values are chosen for one inequality, the **twin of the thrust's
honesty invariant** (`pressure-and-winding`'s
`BIND_ADVANTAGE_MS + strike <= BIND_LOSS_MS`): the slowest possible strip,
started on the advantage's last live tick, still completes inside the
loser's exposure -

```ts
BIND_ADVANTAGE_MS + DISARM_FIRM_MS <= BIND_LOSS_MS   // 240 + 260 = 500 <= 520
```

- with the same 20ms margin the thrust's invariant carries, clear of the
tick boundary per the `preparation-and-readiness` §4 discipline, and
test-pinned per pairing `canBind` sustains beside the thrust's.

Both invariants are TIME guarantees. The thrust carries one further
condition the disarm does not: REACH. A crossing can bind beyond either
fighter's individual reach (the reach SUM covers wide measure), the gap
freezes there, and the opening prompt is already honest about the thrust
whiffing across it. The disarm has no reach condition to fail: the
blades are ALREADY met - the grip travels down steel that is touching
steel - so it is guaranteed from every advantage, wide binds included.
Within thrust reach, choosing between the conversions is choosing what
the win MEANS; beyond it, the disarm is the only conversion that lands,
which gives the mercy a mechanical niche no weight table has to buy.

Stated honestly, per review: under THIS spec, every pairing that can bind
can always disarm - the duration derives from the loser's grip and two
global constants, so no current weapon property can make one conversion's
invariant fail while the other's holds. If a future spec wants
weapon-shaped disarms, it must first add the deciding physical property
(a hilt's retention, a grip's leverage) and feed it into this duration
derivation - at which point the invariant becomes per-pairing arithmetic
and the matrix can honestly diverge. Never a capability boolean, and
never a sporadic failure of an offered conversion, which review
established is a trap and not a mechanic.

The attempt begins on the tick the I intent is accepted: the advantage
timer is zeroed, `duel.disarm` is created with its duration fixed from the
saved grip, and the attacker enters `disarming` - **committed**, accepting
no intents until resolution, exactly as an attack past `strikeStart` is.
Both fighters' `x` freeze at the contact gap; the `MIN_GAP` clamp still
runs and is a no-op. The victim's exposure continues unchanged and simply
never ends: the attempt resolves before it can. Nobody can be struck
during an attempt - neither fighter is attacking. `dead` and `hitstun`
keep their precedence over everything, as always.

**Resolution is atomic**, one tick, every field named:

```ts
// at disarm.t >= durationMs
victim.state = { kind: "disarmed" };     // straight from exposed, never ready
attacker.state = { kind: "ready" };      // holding the sword, free
d.disarm = null;
d.over = true;
d.winner = attackerSide;
d.outcome = "disarm";
emit(d, out, attackerSide, "disarmed", ...);  // the one logged outcome event
```

---

## 3. No resist - the reasoning, recorded

Deleted from the first draft: the `gripped` state, the resist press, both
fail-recovery constants, and the AI's resist reaction. The argument, so it
is not relitigated:

- The draft's own AI policy refused to draw a resistable disarm, naming it
  self-sabotage. An option the policy must refuse is a player trap.
- The thrust from the same position is guaranteed and nobody expects to
  parry it. The loser's say was the bind contest itself; both conversions
  inherit that settlement equally.
- Symmetry of reliability is what makes the choice meaningful: kill or
  mercy, decided by intent, not by a risk premium on mercy.

The one seam where a resist could honestly return: the wide version (a
fight that survives the disarm), as something specific weapon properties
EARN - a basket hilt, a two-handed grip - derived and pinned in the matrix,
per the emergent-outcomes rule. Never as a flat chance.

---

## 4. Presentation

### 4.1 Sprites

Both fighters hold their `sustained-bind` §4.1 contact poses through the
attempt - the freeze already reads as a wrestle. On success (as built,
playtest revision) the loser does NOT hold the contact pose: a frozen
stance implying a sword they no longer have read wrong the first time it
was seen. `disarmed` renders the pack's UNARMED idle, looping - visibly
alive, visibly beaten, visibly not dead - from the `idle` sheet added
for it; the state still carries the final contact pose as data.

**Art debt, named:** there is no grip frame and no dropped-sword frame,
so the taken sword is never seen to fall - the empty-handed idle carries
the outcome instead. Enough to judge the mechanic; the clatter and the
fall are still owed. (The pack's punch sets remain the wide version's
inventory.)

**Pacing, as built:** the aftermath - exposure, the advantage's
kill-or-disarm choice, and the strip itself - deepens the already-running
bullet time to its own floor (`BULLET_AFTERMATH_SCALE` 0.15, 3x the
bind's 0.45), scoped to exactly that beat: the bind's tap tempo is
untouched, and the 240ms window reads as ~1.6s of wall clock.
Presentation-only, per the bullet-time doctrine.

### 4.2 HUD: the opening prompt teaches both conversions

The OPENING prompt (the advantage window's existing coach, reach-honest
since `duelist-defence`) becomes the two-conversion prompt: the kill and
the sword, each with its key - the bind prompt's teach-the-keys-in-the-
moment pattern, applied to the window where the choice lives. Its
reach-honesty extends to the pair: within thrust reach it shows BOTH
conversions; on a wide bind it shows the disarm alone, because the
thrust would whiff (§2.2) and the prompt does not advertise actions that
fail. No risk annotation exists in either form - an earlier draft's
"(they can resist)" died with the resist; whatever the prompt shows is
guaranteed.

The body rows read `disarming` on the attacker with one progress bar over
`durationMs`, driven by the duel's clock - the bind bar's idiom. The grip
is visible as the bar's fill speed: a soft opponent strips fast, a braced
one slowly, and the number the player watched lean the bind now visibly
prices the wrestle. The victim's row stays `exposed` throughout.
`disarmed` renders as the terminal state it is, beside `dead` in every
respect. Row 3 is untouched: a grip has no line.

### 4.3 Audio

The attempt's start is silent. The blades are already met - the clash was
spent at contact - and a closing hand has no steel moment; the same argument
that keeps `swing` unmapped. One outcome, one sound on its resolution tick,
never on a keypress tick: `disarmed` maps to the existing clash for now,
with the debt named - a clatter sample (the sword hitting the ground) should
distinguish it. The duel-over banner lands the same frame, so the
readability loss is small and temporary.

### 4.4 The help panel

`disarming` and `disarmed` are new states, so the typed `HELP` record fails
the build until they are documented. One sentence for what is happening, one
for what to do; durations cited through the constants, never as literals,
per the existing panel test.

---

## 5. AI

`duelist-defence` §2's constitution applies unchanged: the AI reads only
the observable projection, every read is at least a drawn reaction old, it
pays every cost the player pays through the same intents, and every draw
comes from the seeded rng. No error rates, no deliberate mistiming.

### 5.1 Converting a won bind: a plan formed in the bind, fired on the win

Everything in this section applies to modes 3 AND 4 alike - mode 4 is the
duelist with the stance tell amputated, and its in-bind policy is already
mode 3's (`pressure-and-winding` §9); the conversion plan rides the same
shared block. Modes 1 and 2 draw no plans and convert nothing (§5.3).

The duelist never decides at the moment of victory, because the constitution
forbids it: the resolution tick is younger than any legal read. The answer
is the human one - anticipation. At bind entry, beside the seeded
temperament draw `pressure-and-winding` §9 already gives it, the duelist
draws one extra value: a **conversion plan**, what winning this bind would
be for. Drawn at entry, it always exists by resolution, however the contest
ends.

The disarm needs no feasibility gate - it is guaranteed from every
advantage (§2.2) - and the thrust is excluded when the entry gap exceeds
its reach; past that one arithmetic gate the draw is pure personality.
BOTH the plan and its execution delay are drawn at bind entry - the
resolution tick draws nothing, fires only what already exists:

```ts
// in AiState.bind, drawn at entry beside the temperament:
conversionPlan: "thrust" | "disarm" | "withdraw";
conversionDelayMs: number;   // seeded from DUELIST_CONVERT_DELAY_MS = [0, 60]

// on AiState itself - NOT inside ai.bind, which the policy clears the
// tick the fighter leaves the bind state; a plan stored there would die
// on the winning tick, before it could ever fire:
conversion: { plan: "thrust" | "disarm" | "withdraw"; dueAt: number } | null;
```

The lifecycle across the teardown, sequenced where it can actually run -
`aiDecide` executes BEFORE `tickDuel`, and the engine never mutates
`AiState`, so "on the resolution tick" is not a place AI code exists:

1. Bind entry draws plan and delay into `ai.bind`.
2. On the FIRST `aiDecide` after the fighter leaves the bind state,
   BEFORE clearing `ai.bind`, inspect `self.bindAdvantageMs`.
3. Positive (the bind was won): transfer -
   `ai.conversion = { plan, dueAt: d.time + conversionDelayMs }` - a copy
   of entry-drawn values, never a draw.
4. Not positive (lost, or shoved apart): discard.
5. Then clear `ai.bind`, as the policy already does.
6. A zero-delay conversion fires during that same `aiDecide` call;
   otherwise later calls fire the stored intent once `d.time >= dueAt`,
   while the advantage lives.

| Entry gap vs own thrust reach | Draw | Base weights |
|---|---|---|
| within reach | thrust / disarm / withdraw | 0.40 / 0.40 / 0.20 |
| beyond reach | disarm / withdraw | 0.40 / 0.20 renormalized (2/3, 1/3) |

The gate is §2.2's reach condition, read at entry: the gap is frozen
from the entry tick, so the bind's own snapshot - information every
delayed read already contains - decides whether a thrust could land, and
a plan the arithmetic forbids is excluded BEFORE the personality draws,
with the remaining weights renormalized. No reaction-time exception is
needed and none is taken. The weights are playtest knobs (a merciful
duelist is a personality, and `duelist-defence` §9 reserved personalities
as layered constants).
**Withdraw is the normal retreat intent**, issued as the conversion: it
spends the advantage on a step away ("advantage cleared by anything else"),
costing no new mechanics - the opponent-shaped mercy of not converting.

If the bind resolves the duelist's way, `ai.conversion.dueAt` is set from
the already-drawn delay and the plan fires when the clock reaches it -
execution jitter on a decision made at entry, a fencer who knew what the
win was for before it came. The delay ceiling plus the firmest strip still
fits the invariant (60 + 260 << 520). If the bind is lost, the plan dies
unread. **No draw of any kind happens on the resolution tick**, and a test
pins that.

**While `ai.conversion` exists it OWNS the AI's output** - checked before
every normal policy branch, or the pulse could issue a step or an attack
during the 0-60ms delay, consume the advantage through the
cleared-by-anything rule, and destroy the planned conversion:

```ts
if (ai.conversion !== null) {
  if (self.bindAdvantageMs <= 0) {
    ai.conversion = null;   // the advantage died first: plan moot
    return null;
  }
  if (d.time < ai.conversion.dueAt) return null;  // committed, waiting
  const intent =
    ai.conversion.plan === "withdraw" ? "retreat" : ai.conversion.plan;
  ai.conversion = null;
  return intent;
}
``` The plan is hidden, and legitimately so: it is a plan about the
duelist's own future action, not bind state; through the whole bind and up
to the conversion's first tick, the opponent-observable projection is
identical whichever plan was drawn.

### 5.2 As the victim, and after

Nothing to decide: the victim is `exposed` into `disarmed` with no legal
input, the same as they are against the advantage thrust. After a disarm
the duel is over and the AI treats it exactly as a death: no decisions,
nothing issued.

### 5.3 Modes 1 and 2

Mode 1 never converts (it attacks nothing, as before). Mode 2 never
converts either - the metronome holds in binds and its losses end like
anyone's. Both are one sentence because §2.2 removed everything there was
to decide; binding mode 2 (it always holds) and stripping it is the first
place the full sequence can be rehearsed, which keeps it the drill. Modes
3 and 4 are the converting modes, per §5.1.

---

## 6. Tests

- **Determinism:** same seed and input script, same conversion draws, same
  convert delays, same resolution ticks.
- **The twin invariant:** `BIND_ADVANTAGE_MS + DISARM_FIRM_MS <=
  BIND_LOSS_MS` with a margin clear of one tick, pinned per pairing
  `canBind` sustains, beside the thrust's honesty invariant in the same
  test - the two guarantees are one property and must move together.
- **The consumption amendment:** I during the advantage starts the attempt
  and zeroes the timer; the thrust is unchanged; cut, step, void and parry
  still clear the timer and proceed (the cleared-by-anything test keeps
  every row); I outside the advantage does nothing, in every state.
- **The grip is saved:** `bindAdvantageGrip` equals the loser's snapshot
  firmness on the resolution tick and is still readable after `duel.bind`
  is null; `durationMs` is fixed at the attempt's start and immune to
  anything after it. Table-driven over grip 0, 1 and the boundaries.
- **The guarantee, end to end:** table-driven over (grip, start delay)
  pairs including the extremes - firmest grip, last-tick start - the victim
  goes from `exposed` to `disarmed`, never through `ready`, and a parry key
  pressed on every tick throughout changes nothing. Every pairing `canBind`
  sustains, not only the longsword mirror.
- **Committed and frozen:** the attacker in `disarming` accepts nothing,
  neither fighter's `x` changes, and no strike event of any kind is emitted
  from inside an attempt.
- **One sound:** exactly one `disarmed` event per attempt, on the
  resolution tick, never on the keypress tick - the exact class of bug
  `AGENTS.md` was written about.
- **Terminal:** `disarmed` accepts no intents forever, the duel records a
  disarm outcome distinct from a kill, and no event follows it.
- **A plan, not a reaction:** the conversion plan is drawn at bind entry
  beside the temperament draw, and no draw of any kind fires on the
  resolution tick. Two duels identical through the bind except the
  opponent's late in-bind inputs produce identical duelist draws and rng
  stream through their divergence - only whether and when the plan fires
  differs. A lost bind leaves the plan unread.
- **The mix is real:** over seeded runs all three conversions occur; every
  convert delay falls inside `DUELIST_CONVERT_DELAY_MS`.
- **The plan survives the teardown:** the bind resolves, `ai.bind` is
  cleared, the fighter is `ready` holding the advantage - and the stored
  `ai.conversion` still fires the planned intent at its dueAt, in mode 3
  AND mode 4. A lost bind leaves `ai.conversion` null.
- **The plan owns the output:** between bind victory and the conversion's
  dueAt, `aiDecide` issues NO other intent - no pulse step, no attack,
  nothing that would consume the advantage out from under the plan -
  across seeds and both converting modes.
- **Hidden until launch:** through the whole bind and up to the
  conversion's first tick, the opponent-observable projection is identical
  whichever plan was drawn, or whether one was drawn at all - the
  inverse-projection idiom from `pressure-and-winding` §5.
- **No future information:** two duels identical through tick T and
  differing only after T produce identical duelist decisions through T -
  `duelist-defence`'s test, extended over the new decisions.
- **The prompt:** during the advantage the opening prompt names both
  conversions and their keys within thrust reach, and the disarm alone
  on a wide bind; no risk annotation exists anywhere (there is no risk
  to annotate).
- **The wide bind:** a crossing bound beyond thrust reach - the disarm
  still strips inside the invariant; the AI's entry draw excludes thrust
  and renormalizes (no seeded run from a wide entry ever plans thrust);
  the prompt shows the disarm alone.
- **Help:** the rendered panel documents the two new states and cites the
  shipping constants.
- **Golden replay:** hash re-recorded only if a scenario reaches an
  advantage; cause probed per the gate's standing rule.

---

## 7. Out of scope

- **The fight continuing after a disarm.** Unarmed behaviour, weapon
  recovery and pick-up, secondary weapons, and a defence rulebook for a
  fighter with no blade - each is a spec of its own, and together they are
  why the duel ends here instead. If play proves the bloodless win worth
  more fight, the terminal state is the seam to reopen.
- **A resist.** Deleted by review (§3). Its honest return path is a
  property-earned mechanic in the wide version, never a flat chance here.
- **Disarms from anywhere else.** No standing blade grabs, no disarms out
  of deflections, and nothing in the four-answer defence menu, which stays
  four. The advantage is the only door.
- **Geometry-flavoured disarms.** The blade relation `sustained-bind` §2.3
  reserves stays reserved; the grip reads firmness only. If winding ever
  forks on contact geometry, a directional disarm can fork with it.
- **Mixed-pairing disarms.** Rapier against longsword deflects (`canBind`),
  so no bind, no advantage, no disarm there - a derivation, not a rule. The
  rapier mirror binds and gets the same guarantee from the same invariant.
- **What a bloodless win is worth outside the duel.** Score, reputation,
  capture, a duelist who will not kill - the reasons live in a campaign
  layer this prototype does not have. Inside this spec the two conversions
  are equals by design; when a meta-layer ever arrives, the distinct disarm
  outcome §4.2 records is the hook it reads.
- **Personality knobs** beyond the conversion weights.

---

## 8. Playtest gate

Longsword mirror against mode 3, long sessions - then a rapier-mirror
session to confirm the shared arithmetic carries.

What to look for:

- The choice reads as intent, not risk management: you take the sword
  because you want to take the sword, and it lands as surely as the thrust
  would have.
- The prompt teaches the key in the moment - by the second or third
  advantage you press I without reading.
- The grip prices the wrestle visibly: a soft opponent's sword leaps away,
  a braced one's drags - and both trace back to the entry you watched.
- Being disarmed by the duelist feels like the bind loss it is, no worse
  and no cheaper than eating the thrust.
- Winning by disarm feels like a win - cleaner, not lesser.

What would look wrong: the disarm reading as a downgrade nobody picks
(the weights, or the duel-over banner underselling it, are the knobs); any
run where a conversion fails (that is the invariant broken, a bug, never
tuning); the I key doing anything outside the advantage. The constitution
in `duelist-defence` §2 and the twin invariant in §2.2 are not knobs at
all.
