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
-> seeded choice to attempt disarm
-> committed attempt
-> success or resistance
-> duel ends on successful disarm
```

The last line is what keeps the spec small. A disarm that ends the duel needs
one new beat (the attempt and its resist) and one new terminal state. A disarm
the fight survives needs unarmed behaviour, weapon recovery, secondary
weapons and a defence rulebook for a fighter with no blade - four specs
pretending to be one. The narrow version ships first and earns the wide one,
or does not.

**Delivers:** the disarm - a bloodless win from a won bind, and the resist
that denies it.

**Depends on:** `sustained-bind` (the contact snapshot the grip reads),
`pressure-and-winding` (the advantage the attempt consumes),
`duelist-defence` (the completed defence policy this spec extends).

---

## 1. Where the disarm lives - and the two places it does not

The disarm is an **advantage consumer**, beside the thrust from
`pressure-and-winding` §2.3. It exists exactly while `bindAdvantageMs > 0`,
which settles its availability without a new rule: advantage only comes from
a won bind, binds only form between bind-capable weapons, so the disarm is a
longsword mechanic for free, and "when the position permits it" means
precisely "when you hold the advantage" - blade control and leverage, already
won, never asserted.

Two places it deliberately does not live:

- **Not in the four-answer defence menu.** `duelist-defence` §4.2 stays four
  answers with the same weights. A defender answering an incoming attack has
  no blade control to spend; pricing a grab into that menu would reprice all
  four answers around an option that is physically absent. The menu is not
  touched by this spec.
- **Not a fourth choice inside the bind.** `pressure-and-winding` §6 already
  refused a fourth in-bind choice, and the refusal stands. The mixup stays
  hold / press / wind; the disarm begins only after it resolves.

This ordering is also why the spec sits after `duelist-defence`.
`duelist-defence` wrote its policy over the complete kit, and this spec
changes the kit, so it must also extend that policy - which it does in one
section (§6), against a finished surface, instead of forcing
`duelist-defence` to anticipate a mechanic that did not exist yet.

### 1.1 The input: the cut key, while the advantage runs

No new binding. `pressure-and-winding` §2.3 gave the cut from the advantage
nothing, deliberately: it must gather the blade up and away from the contact,
and its full timeline never resolves inside the loser's exposure, so the cut
key was already the wrong button in that window. This spec makes it the other
right one:

| Intent while `bindAdvantageMs > 0` | Was (`pressure-and-winding` §2.3) | Now |
|---|---|---|
| thrust | consumes the advantage, launches on `bindTimeline` | unchanged |
| cut | clears the timer, normal cut | **consumes the advantage, starts the disarm attempt** |
| step, void, parry | clears the timer, proceeds normally | unchanged |

The two attack keys become the two conversions: the thrust takes the life,
the cut key's gathering wrench takes the sword. After the advantage expires
the cut key is a normal cut again. The "advantage cleared by anything else"
test in `pressure-and-winding` §5 loses its cut row to this spec, explicitly.

---

## 2. The attempt

### 2.1 What the grip knows: the loser's firmness, saved at resolution

How hard a sword is to strip is how firmly it was held, and the game already
computed that number: the loser's firmness, derived at contact by
`pressure-and-winding` §1 and shown on the pressure bars all bind long. It is
saved beside the advantage timer on the resolution tick, for the same reason
the bind snapshot exists - the states it derives from are gone:

```ts
interface Fighter {
  // ...
  bindAdvantageMs: number;      // pressure-and-winding §2.3
  /** The bind loser's firmness, saved on the resolution tick beside the
   *  timer. Read once, if the advantage converts to a disarm attempt;
   *  meaningless and unread otherwise. */
  bindAdvantageGrip: number;
}
```

No new bar, no new read: the number that decides whether a disarm can be
resisted is the number both players have been staring at. A soft opponent is
strippable; a braced one is not. The winner's own firmness plays no role.

### 2.2 The state

One physical event, one clock, owned by the duel - `sustained-bind` §2.1's
argument, applied unchanged:

```ts
interface Duel {
  // ...
  disarm: DisarmState | null;
}

interface DisarmState {
  t: number;            // the one clock
  durationMs: number;   // fixed at the attempt's start, from the saved grip
}

type FighterState =
  | ...
  | { kind: "disarming" }   // the attacker: committed, accepts nothing
  | { kind: "gripped" }     // the victim, once exposed ends: accepts only the resist
  | { kind: "disarmed" }    // terminal, like dead
  | ...;
```

```ts
durationMs = DISARM_SOFT_MS
           + bindAdvantageGrip * (DISARM_FIRM_MS - DISARM_SOFT_MS)
```

| Constant | Value |
|---|---|
| `DISARM_SOFT_MS` | 200 |
| `DISARM_FIRM_MS` | 560 |
| `DISARM_FAIL_RECOVERY_MS` | 300 |
| `DISARM_RESIST_RECOVERY_MS` | 180 |

The arithmetic the first two are chosen for, against `BIND_LOSS_MS` = 320 and
the 200 ms advantage window. One inequality decides everything - an attempt
is unresistable exactly when it ends inside the loser's exposure:

```ts
startDelayMs + durationMs <= BIND_LOSS_MS   // startDelayMs from the resolution tick
```

computed by one shared helper that the engine, the AI (§6.1) and the tests
all call, never re-derived - the `guardEffectiveAt` discipline from
`duelist-defence` §5, applied here.

- **Against a soft grip the disarm is the forgiving win - and that is its
  reason to exist.** Grip 0 is a 200 ms wrench, unresistable from any start
  in the first 120 ms of the advantage: twice the thrust's 60 ms budget.
  Both conversions win the same duel, so without this asymmetry the disarm
  would be dominated - slower, deniable, worth no more - and the button
  would be dead. Past 60 ms of hesitation the thrust no longer kills, and
  against a loose sword the disarm still does: it is the one guaranteed
  conversion left to a winner who did not take the opening instantly. The
  budget shrinks as the grip firms - equal to the thrust's at grip 1/6,
  gone at grip 1/3.
- **A firm grip is always resistable.** Grip 1, even at an instant start:
  560 - 320 leaves at least 240 ms of grip still to break after the loser is
  free. Attempting it is a deliberate gamble against a braced opponent - a
  test they get to answer, never a win the arithmetic promises.

The attempt begins on the tick the cut-key intent is accepted: the advantage
timer is zeroed, `duel.disarm` is created with its duration fixed from the
saved grip, and the attacker enters `disarming` - **committed**, accepting no
intents until resolution, exactly as an attack past `strikeStart` is. Both
fighters' `x` freeze at the contact gap; the `MIN_GAP` clamp still runs and
is a no-op.

The victim's exposure continues unchanged. The attempt always starts inside
it (the 200 ms advantage window ends before the 320 ms of exposure does).
When `exposed` ends with the attempt still running, the victim enters
`gripped` instead of `ready`. If the attempt ends first, they never do - that
is the unresistable strip.

Nobody can be struck during an attempt: neither fighter is attacking. If the
duel is somehow already over, no attempt starts. `dead` and `hitstun` keep
their precedence over everything, as always.

---

## 3. The resist

The parry key, pressed fresh while `gripped` - the same hand that closes a
guard clamps the grip. `gripped` accepts exactly one intent, this one;
everything else is dropped.

Two rules, both inherited rather than invented:

- **A fresh press.** A parry key held since the bind does not resist, for
  `held-guard`'s reason: a spent input never re-forms into a new action; it
  takes a new press.
- **No buffering.** A press during `exposed` is dropped, not queued. Buffered,
  the resist would be free - mash the key while exposed and every resistable
  disarm fails - and the mechanic would be stillborn. The resist is a timed
  action like everything else in this game, and its timing is readable: your
  exposure bar empties while their grip bar is still filling, and the gap
  between those two moments is your window.

On the resist tick the attempt fails immediately. The attacker seeds
`DISARM_FAIL_RECOVERY_MS` = 300 - overextended, wrenched off balance by their
own denied pull - and the victim seeds `DISARM_RESIST_RECOVERY_MS` = 180,
both on the existing recovery-timer idiom, running concurrently. The victim
comes free with 120 ms of tempo at contact range: initiative, not a free kill
- no attack resolves from a standing start inside 120 ms, so the failed
disarmer can still be defended, but the next beat belongs to the fighter who
kept their sword.

---

## 4. Success ends the duel

At `disarm.t >= durationMs` unresisted, the victim's sword is taken. The
victim enters `disarmed` - terminal, accepting nothing, the same standing as
`dead` - and the duel is over, recorded as a disarm, not a kill: the end
banner says the sword was taken, because a bloodless win is the point of
choosing this conversion over the thrust.

Ending here is the whole first version, and §8 names everything the wide
version would owe. What the narrow version buys is that the attempt/resist
beat can be judged on its own: whether taking a sword feels like winning, and
whether keeping yours feels like a save, before any spec spends a word on
what an unarmed fighter does next.

---

## 5. Presentation

### 5.1 Sprites

Both fighters hold their `sustained-bind` §4.1 contact poses through the
attempt - the freeze already reads as a wrestle, and the deterministic
strain oscillation continues through it; this is the one state where the
strain is literal. On success the loser holds that pose into `disarmed`; on a
resist both step back into their recovery poses normally.

**Art debt, named:** there is no grip frame and no dropped-sword frame, so
the taken sword simply stops being part of the fight without being seen to
fall. Enough to judge the mechanic, not enough to ship it as the longsword's
mercy ending.

### 5.2 HUD

The body rows read `disarming` and `gripped` with one shared progress bar
over `durationMs`, both driven by the duel's one clock, the same idiom as the
bind bar. The victim's exposure bar runs out while the grip bar still fills:
that visible gap is the resist window, and the HUD is deliberately the
tutorial for it. `disarmed` renders as the terminal state it is, beside
`dead` in every respect.

Row 3 is untouched: a grip has no line.

### 5.3 Audio

The attempt's start is silent. The blades are already met - the clash was
spent at contact - and a closing hand has no steel moment; the same argument
that keeps `swing` unmapped. The attempt has exactly two outcomes and each is
one sound on its resolution tick, never on a keypress tick:

- `resisted` maps to the existing clash - it is steel wrenched off steel.
- `disarmed` also maps to the clash for now, with the debt named: a clatter
  sample (the sword hitting the ground) should distinguish it. The duel-over
  banner lands the same frame, so the readability loss is small and
  temporary.

### 5.4 The help panel

`disarming`, `gripped` and `disarmed` are new states, so the typed `HELP`
record fails the build until they are documented. One sentence for what is
happening, one for what to do; durations cited through the constants, never
as literals, per the existing panel test.

---

## 6. AI

`duelist-defence` §2's constitution applies to every word of this section
unchanged: the AI reads only the observable projection, every read is at
least `AI_REACTION_MS` old, it pays every cost the player pays through the
same intents, and every draw comes from the seeded rng. And §3's prohibition
stands: no error rates, no deliberate mistiming - uncertainty lives in the
draws and the latency, never in sabotage.

### 6.1 Converting a won bind: a plan formed in the bind, fired on the win

Mode 3 never decides at the moment of victory, because the constitution
forbids it: the resolution reveals the opponent's hidden choice, and no read
younger than `AI_REACTION_MS` may steer an action. The answer is the human
one - anticipation. At its in-bind decision tick, the same seeded moment
`pressure-and-winding` §4 already gives it, the duelist draws one extra
hidden value alongside hold / press / wind: a **conversion plan**, what
winning this bind would be for. The plan reads nothing the in-bind choice
does not already read - the same delayed observable snapshot - so its
legality is inherited, not argued fresh. And it always exists by resolution:
an early resolution needs both locks, the duelist cannot lock before it has
decided, and every pairing involving hold waits for `BIND_MS`.

If the bind resolves the duelist's way, the plan fires after a seeded delay
drawn from `DUELIST_CONVERT_DELAY_MS = [0, 60]` - execution jitter on a
decision already made, a fencer who knew what the win was for before it
came. If the bind is lost or breaks neutral, the plan dies unread. **No draw
of any kind happens on the resolution tick**, and a test pins that: the
win's content is a trigger, never an input. A wider delay band would be the
forbidden error rate wearing a costume - a duelist that planned `disarm` and
then dawdled past the budget would be mistiming a working mechanic on
purpose.

The plan's menu is gated by arithmetic before it is weighted by personality.
From its delayed read of the loser's firmness - static since the entry tick,
so the delayed read equals the value the engine will save; the delay is what
makes the read legal, and the staleness costs nothing - the duelist predicts
whether a strip would still be unresistable at the delay ceiling, through
§2.2's shared helper, never a re-derived copy:

| Predicted strip at the 60 ms ceiling | Draw | Base weights |
|---|---|---|
| unresistable (grip at most 1/6 with shipping constants - derived from the helper, never written as a literal) | thrust / disarm / withdraw | 0.40 / 0.40 / 0.20 |
| resistable | thrust / withdraw | 0.80 / 0.20 |

In the unresistable region both conversions are guaranteed wins, so choosing
between them is personality, not policy - mercy the duelist can afford, and
the weights are the knob. In the resistable region **disarm is not in the
draw at all**: a resistable attempt hands the opponent a save and the
initiative, for the same victory the thrust takes outright, and
`duelist-defence` §3 forbids self-sabotage dressed as variety. This is when
the duelist prefers taking the sword over everything else the position
offers: **when its own delayed read says the sword is already loose.** The
in-bind hold / press / wind draw is not touched.

The plan is hidden like the bind intent it rides beside: through the whole
bind and up to the conversion's first tick, the opponent-observable
projection is identical whichever plan was drawn - or whether one was drawn
at all.

### 6.2 Resisting: recognition from the projection, on the defence clock

The attempt is observable the tick it starts - the opponent's `disarming`
state is in the projection - and that tick starts the clock. Mode 3 draws a
latency from `DUELIST_DEFENCE_LATENCY_MS`, the same band as its defence menu
(this is a defensive reaction and it reacts on the defence clock), and issues
the resist intent at `max(exposureEnd, visibleTick + latency)`, if the grip
still holds.

There is no menu draw here, and that is not an exception to `duelist-defence`
§3's mixed-strategy rule - it is its boundary. `gripped` accepts exactly one
intent, so there is no alternative use of the tempo to price and nothing to
be outguessed about; a mix over one option is sabotage by another name. The
uncertainty lives where it honestly can: in the latency draw.

The consequence is the arithmetic, not a script: a firm duelist always comes
free (even the slowest draw beats a 560 ms grip), and a soft duelist stripped
promptly never does. The duelist is disarmable exactly when anyone is - it
arrived soft and you were decisive - which reads as being outplayed, never as
a scripted concession.

### 6.3 After a disarm

The duel is over, and the AI treats it exactly as it treats a death: no
decisions, no plans, nothing issued. This answer is one sentence long
because §4 made it one - the narrow scope is what keeps the policy update
manageable.

### 6.4 Modes 1 and 2

Mode 1 never attempts a disarm - it converts nothing, as before - and as a
victim it resists on the earliest legal tick, the perfect trigger that makes
it the drill: practice your grip timing against an opponent that always
answers when it can. Mode 2 never resists - a drill decision, not a
derivation: the resist is its own single-answer state, outside the defence
menu, so "mode 2 never defends" would not settle it by itself. This spec
settles it, keeping mode 2 the transparent metronome; binding it (it always
holds) and stripping it unopposed is the first place the full sequence can
be rehearsed. Mode 3 resists on its own clock. The difficulty ladder from
`duelist-defence` §6 extends itself.

---

## 7. Tests

- **Determinism:** same seed and input script, same conversion draws, same
  convert delays, same resist latencies, same resolution ticks.
- **The consumption amendment:** the cut key during the advantage starts the
  attempt and zeroes the timer; the thrust is unchanged; step, void and parry
  still clear the timer and proceed; a cut after expiry is a normal cut on
  its full timeline. `pressure-and-winding` §5's cleared-by-anything test is
  updated here, cut row only.
- **The grip is saved:** `bindAdvantageGrip` equals the loser's snapshot
  firmness on the resolution tick and is still readable after `duel.bind` is
  null; `durationMs` is fixed at the attempt's start and immune to anything
  after it. Table-driven over grip 0, 1 and the boundaries.
- **The unresistable strip:** grip 0, attempt started inside the 120 ms
  budget - the victim goes from `exposed` to `disarmed` without ever being
  `gripped`, and a parry key pressed on every tick throughout changes
  nothing.
- **The budget boundary:** table-driven over (grip, start delay) pairs one
  tick either side of `startDelayMs + durationMs = BIND_LOSS_MS`, through
  §2.2's shared helper: under strips clean, over is resisted by a
  well-timed press.
- **The window:** grip 1 - the resist is legal from the tick `exposed` ends,
  the window is at least 240 ms at an instant start; a press during
  `exposed` is dropped; a parry key held since the bind does not resist, a
  fresh press does.
- **`gripped` accepts exactly one intent:** every other intent is dropped
  without effect.
- **Committed and frozen:** the attacker in `disarming` accepts nothing,
  neither fighter's `x` changes, and no strike event of any kind is emitted
  from inside an attempt.
- **One sound:** exactly one of `resisted` or `disarmed` per attempt, on the
  resolution tick, never on the keypress tick - the exact class of bug
  `AGENTS.md` was written about.
- **Terminal:** `disarmed` accepts no intents forever, the duel records a
  disarm outcome distinct from a kill, and no event follows it.
- **Recoveries:** 300 and 180 seeded on the resist tick, concurrent, on the
  existing timer idiom.
- **A plan, not a reaction:** the conversion plan is drawn on the duelist's
  in-bind decision tick, and no draw of any kind fires on the resolution
  tick. Two duels identical through the bind except the opponent's hidden
  lock produce identical duelist draws and rng stream through resolution -
  only whether the plan fires differs. A lost or neutral bind leaves the
  plan unread.
- **The gate:** no AI-initiated attempt is ever resisted - equivalently, no
  victim of an AI disarm ever reaches `gripped`, over long seeded runs. In
  soft-grip fixtures all three conversions occur; in firm-grip fixtures only
  thrust and withdraw do. Every convert delay falls inside
  `DUELIST_CONVERT_DELAY_MS`, and the prediction is asserted to call the
  same duration helper the engine strips with - one function, not a copy.
- **AI resist:** never earlier than `max(exposureEnd, visibleTick +
  AI_REACTION_MS)`; every latency inside the band; a firm duelist always
  resists in time; a soft duelist stripped inside the budget never resists.
- **Hidden until launch:** through the whole bind and up to the conversion's
  first tick, the opponent-observable projection is identical whichever plan
  was drawn, or whether one was drawn at all - the inverse-projection idiom
  from `pressure-and-winding` §5.
- **No future information:** two duels identical through tick T and differing
  only after T produce identical duelist decisions through T -
  `duelist-defence`'s test, extended over the new decisions.
- **Modes 1 and 2:** mode 1 resists on the earliest legal tick, mode 2 never
  resists, and both decision streams are otherwise unchanged for the same
  seed.
- **Help:** the rendered panel documents the three new states and cites the
  shipping constants.
- **Golden replay:** hash re-recorded.

---

## 8. Out of scope

- **The fight continuing after a disarm.** Unarmed behaviour, weapon
  recovery and pick-up, secondary weapons, and a defence rulebook for a
  fighter with no blade - each is a spec of its own, and together they are
  why the duel ends here instead. If play proves the bloodless win worth
  more fight, the terminal state is the seam to reopen.
- **Disarms from anywhere else.** No standing blade grabs, no disarms out of
  deflections, and nothing in the four-answer defence menu, which stays four.
  The advantage is the only door.
- **A resist mixup.** No counter-disarms, no reversals; the resist is one
  timed answer, and its depth is upstream, in how you arrived at the bind.
- **Geometry-flavoured disarms.** The blade relation `sustained-bind` §2.3
  reserves stays reserved; the grip reads firmness only. If winding ever
  forks on contact geometry, a directional disarm can fork with it.
- **Rapier disarms.** No binds, no advantage, no disarm - and if a rapier
  bind game ever arrives (`sustained-bind` §1 names the seam), it brings its
  own.
- **What a bloodless win is worth outside the duel.** Score, reputation,
  capture, a duelist who will not kill - the reasons a fighter with a
  guaranteed thrust in hand chooses the sword instead live in a campaign
  layer this prototype does not have. Inside this spec the disarm earns its
  place mechanically (the wider soft-grip budget, §2.2); when a meta-layer
  ever arrives, the distinct disarm outcome §4 records is the hook it reads.
- **Personality knobs** beyond the conversion weights.

---

## 9. Playtest gate

Longsword mirror against mode 3, long sessions, entering binds both firm and
deliberately soft.

What to look for:

- You choose the disarm because the bars say soft, and it reads as taking
  what the opponent's own entry offered - the early-versus-late guard trade
  from `pressure-and-winding` §1.1 now has a third tooth.
- The hesitation save is real: you miss the thrust's instant against a soft
  grip, reach for the cut key instead, and the sword still comes away -
  §2.2's wider budget, felt in the hand.
- The resist beat is readable at speed: exposure bar out, grip bar still
  filling, press. A save feels like a save.
- Being disarmed by the duelist traces back to your own soft entry, not to a
  dice roll you never saw.
- Winning by disarm feels like a win - cleaner, not lesser, than the thrust.

What would look wrong: the disarm dominating the thrust (always the pick -
the soft-grip budget is too wide, and `DISARM_SOFT_MS` is the knob) or never
picked (dead weight - the unresistable region is too thin to visit, or the
weights bury it); the resist reading as a reflex test with no fight in it
(the window lever is `DISARM_FIRM_MS`, never a buffer). The constitution in
`duelist-defence` §2 and the unresistable-strip inequality in §2.2 are not
knobs at all.
