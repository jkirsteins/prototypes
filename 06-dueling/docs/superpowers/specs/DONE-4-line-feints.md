# line-feints: Line-changing feints

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

§8.1 of the state-tracks spec gives the attacker one deception: cancel the windup
into a short recovery, provoking a parry and punishing its cooldown. It deceives
about **when**. §10 records that it cannot deceive about **where**, because
attacks had no lines.

`attack-lines` gave them lines, on two axes. This spec lets an attack in flight change
either axis, and gives the defender the answer, because a feint with no answer is
not a mixup, it is a win button.

**Delivers:** feints (line-changing); line-changing feints.

**Depends on:** `attack-lines`.

---

## 1. Two axes, two lies

A parry covers one complete snapshotted line (`attack-lines` §3). Two
travelling blades must match on both axes (`blade-contact` §2.1). So a redirect
on **either** axis escapes a committed guard, and a side redirect additionally
uncrosses a counter-attacker's blade.

| Redirect | Beats | The defender's answer |
|---|---|---|
| Height | a parry covering the old height; a counter-attack at it | shift the guard's height (arrow) |
| Side | a parry covering the old side; a counter-attack crossing on it | retarget the guard's side (press parry again) |
| Both | a parry unless it corrects both axes | both inputs together |

The parry stays on the line it snapshotted until a shift *completes* - it never
tracks the blade on its own. That is what makes both lies real: a guard that
followed the attack automatically could not be deceived, and this spec would
have nothing to do.

### 1.1 Kept distinct from the windup cancel

| | §8.1 cancel | This spec's redirect |
|---|---|---|
| Input | dedicated cancel key | arrow (height) or the other attack key (side) |
| Legal during | `windup` only | anywhere in the windup, before `strikeStart` |
| Result | attack ends, short `feintRecoveryMs` | attack continues on a new line |
| Deceives about | when | where |
| Costs | a truncated recovery | a redirect interval plus a whole new strike |

Both stay. Bailing out and lying are different plays and should feel different.

---

## 2. The rule

Legality, all three required:

1. `elapsedMs < timeline.strikeStart`. **Commitment is the windup-to-strike
   transition** - the state-tracks spec's own invariant, and an earlier draft of
   this spec broke it by allowing redirects into the travelling half of the
   strike. Once the blade travels, no input steers it; that is the same rule
   that makes the whiff honest, and the feint gets no exemption from it.
2. `redirected === false`. One redirect per attack, or an attacker could stall
   forever and the tempo economy collapses.

An earlier draft added a third condition - legal only after `riseEnd`, "the
sold half" - and playtesting removed it: the beat is 60-100ms, a window a
human cannot press inside, which made the feint AI-only in practice. The
whole windup is legal now, mirroring the F-cancel's door. Nothing needed the
old bound: an early redirect is a WEAK feint, not a free one - the true line
telegraphs longer and the arrival still pays the full redirect cost - so the
sold-half concept survives as strategy (late lies are better lies) rather
than as law.

A consequence worth naming: contact exists only inside the strike, so no legal
redirect can ever follow `met`. The seam `sustained-bind` needs - steel touched
means committed - holds by construction rather than by a fourth condition.

Triggering:

- an arrow during the window changes the attack's **height**
- the other attack key changes its **side**, which also swaps to that kind's
  timings
- both on the same tick changes both

One redirect either way. A height redirect also moves the fighter's stance to the
new height on completion, because the body went there; the stance is not a
separate thing that stayed behind.

### 2.1 Timeline replacement

The attack keeps its identity and its clock. Only the future is rewritten,
atomically, per §2.3 of the state-tracks spec:

```ts
s.attack = toKind;               // unchanged on a height-only redirect
s.height = toHeight;             // unchanged on a side-only redirect
s.redirected = true;
const d = redirectCost(w, changedHeight, changedSide);   // §3
s.timeline = {
  ...s.timeline,                                 // riseStart, riseEnd stay in the past
  strikeStart:    s.elapsedMs + d,
  parryableUntil: s.elapsedMs + d + t2.strike * PARRYABLE_FRACTION,
  strikeEnd:      s.elapsedMs + d + t2.strike,
  recoveryStart:  s.elapsedMs + d + t2.strike,
  recoveryEnd:    s.elapsedMs + d + t2.strike + t2.recovery,
};
// s.phase is already "windup": the blade never left preparation
```

`elapsedMs` is never reset, so every mark stays absolute and every consumer keeps
reading one clock against one snapshot. There is no second time origin to get
wrong. This is the restructure paying for itself.

### 2.2 What it costs

The redirect always delays arrival. Against an opponent who was not going to
defend it is pure loss: you hand them the tempo. Against one who committed, it
wins the exchange. That asymmetry is the mechanic and it needs no extra penalty.

---

## 3. Numbers

```ts
redirectCost(w, height, side) =
  height && side ? max(w.redirectHeightMs, w.redirectSideMs)
  : height       ? w.redirectHeightMs
  :                w.redirectSideMs;
```

| Weapon | `redirectHeightMs` | `redirectSideMs` | `guardShiftMs` (height) | `sideChangeMs` (from `attack-lines`) |
|---|---|---|---|---|
| Longsword | 380 | 300 | 180 | 120 |
| Rapier | 350 | 220 | 150 | 100 |

The defender's side retarget introduces no new constant: it is the same
`sideChangeMs` rotation `attack-lines` defined for the initial press, because
it is the same physical motion - the blade crossing to the other side of the
line. Only `guardShiftMs` is new here, the formed guard travelling between
heights.

Changing height is a larger motion than going around a blade at the point, so
it costs more - on both sides of the exchange. The attacker's height redirect
is slower than its side redirect, and the defender's height shift (the blade
travels) is slower than its side retarget (the blade rotates). The rapier
changes side fastest: it is the weapon built to defeat contact by disengaging,
and with its worse `parriedPenalty` from `blade-contact` the two weapons sit at
opposite ends of one axis. The longsword wins where steel meets; the rapier
wins where it does not.

**These numbers are load-bearing.** §4.1 derives the defender's answers from
them, and §5 makes the inequalities tests.

---

## 4. The defender's answer: shifting the guard

Without this section a reactive redirect on either axis beats every parry
unconditionally, and mode 3 becomes unbeatable rather than unpredictable.

A raised guard may **shift its covered line once per raise**. Call it the
**guard shift** - changing the parry line - and nothing grander: winding is
worked *from blade contact*, so the word *Winden* stays reserved for
`pressure-and-winding`, where contact exists. An earlier draft borrowed the
term for this motion and was wrong to.

**The controls, explicitly - nothing retargets automatically:**

- **An arrow** while the parry is up shifts the guard's **height**, over
  `guardShiftMs`. (These are the keys `attack-lines` refuses while a parry is
  up; from this spec they perform the shift instead.) The shift also moves the
  fighter's stance, for the same reason a height redirect moves the attacker's.
- **Pressing parry again** while the parry is up retargets the guard's
  **side**, over `sideChangeMs`, to the side of the currently visible
  attack - the same inference and the same simulated rotation as the original
  press, reading only what is visible on that tick.
- **Both on the same tick** shifts both axes in one motion, over the larger of
  the two durations.

```ts
interface ParryTrack {
  elapsedMs: number;      // since first raised; expires at parryWindowMs
  fromLine: Line;         // covered while a shift is in motion: the old line
  targetLine: Line;       // forming toward this; covered once effective
  effectiveAtMs: number;  // when targetLine is covered; a shift moves it forward
  shifted: boolean;       // one shift per raise, whichever kind
}
```

A shift reuses `attack-lines`' track shape rather than adding one: it sets
`fromLine` to the line the guard was covering, `targetLine` to the corrected
line, and `effectiveAtMs` to `elapsedMs` plus the shift's duration.

The rules, each one a test (§7):

- **The old line holds until the shift completes.** While `elapsedMs <
  effectiveAtMs` the guard covers `fromLine` - a blade arriving on the old
  line mid-shift is still met - and covers `targetLine` from `effectiveAtMs`
  on. The guard never covers the destination early, and never covers nothing.
  (This is the one place `fromLine` carries contact meaning: at the initial
  press nothing was covered yet, so there it is only where the blade started.)
- **The expiry does not refresh.** `parryWindowMs` runs from the original
  press. Shifting late means the new line may never become effective before
  the guard lapses.
- **Once per raise, whichever kind.** Height, side, or both-at-once each
  consume the single shift. One shift answers one redirect - a single lie
  corrected once, not a wrestling match of key presses.

Two of these three rules are scaffolding for the timed window, and
`held-guard` retires them with it: once the guard no longer expires, the
expiry rule is vacuous, and the once-per-raise cap is replaced by
one-shift-at-a-time with each shift paying its full travel time. The
old-line-holds rule survives unchanged. `held-guard` also moves the side
retarget off the parry key - a held key has no second press - onto the
horizontal arrows.

### 4.1 The answer windows, checked per axis

Defender sees the redirect at R, reacts at `R + PLAYER_REACTION_MS` (250), and
the corrected line is covered one shift later. The redirected blade is meetable
until `R + redirectMs + strike * PARRYABLE_FRACTION`. Worst case is the
redirect into the thrust.

**Height redirects - answerable against every weapon:**

| Attacker | Corrected at (LS / R defender) | Meetable until | Margin |
|---|---|---|---|
| Longsword (380) | R + 430 / R + 400 | R + 510 | 80 / 110 ms |
| Rapier (350) | R + 430 / R + 400 | R + 460 | 30 / 60 ms |

**Side redirects - answerable against the longsword; the rapier's is the
disengage, and it is deliberately below the line:**

| Attacker | Corrected at (LS / R defender) | Meetable until | Margin |
|---|---|---|---|
| Longsword (300) | R + 370 / R + 350 | R + 430 | 60 / 80 ms |
| Rapier (220) | R + 370 / R + 350 | R + 330 | **-40 / -20 ms** |

The rapier's side redirect cannot be answered by chasing it with the guard.
That is not a hole; it is the weapon. The disengage is what a rapier *is* - the
design doc gives it exactly this identity - and it mirrors the two documented
exceptions before it (`parry-rise` §5.1, `attack-lines` §4.1): one attack per
axis that prediction, distance or a counter must answer instead of reaction.
Your answers to it are the void, not over-committing the guard, and the
counter-attack `blade-contact` made safe.

As invariants, tested per weapon pair:

> **Height:** `redirectHeightMs + thrust.strike * PARRYABLE_FRACTION >=
> PLAYER_REACTION_MS + guardShiftMs` - for every attacker/defender pair.
>
> **Side:** the same inequality with `redirectSideMs` and `sideChangeMs` -
> for every pair **except a rapier attacker**, which must fall short: the
> disengage staying unanswerable-by-shift is asserted, not tolerated.
>
> **`guardShiftMs < heightChangeMs`**, or shifting a formed guard is not
> cheaper than a cold stance move; and **`sideChangeMs < guardShiftMs`**,
> or rotating the blade is not cheaper than travelling with it.

If play says a height answer is impossible rather than hard, the lever is
`redirectHeightMs` upward, not `parryRiseMs` downward: that number carries
`parry-rise` §3.1's readability invariant - a guard must be visible at least a
reaction time before it can stop anything - and lowering it would buy the
defender's answer by selling the attacker's ability to see guards coming at
all.

The shift durations have no floor at `AI_REACTION_MS`. They are durations of
motions, not reaction gates; the AI spends its 180 ms deciding and then shifts
like anyone else.

---

## 5. Presentation

### 5.1 Sprites

A side redirect swaps sheets: an attack that began on `swordAttack` continues on
`swordStab`, or the reverse. During the redirect the fighter holds the new
sheet's **loaded** frame (`swordStab` 2, or `swordAttack` 0), which reads as the
blade being pulled off its line and re-set.

A height redirect has no sheet to swap to, per `attack-lines` §5.2. It renders as
the line bar sliding between height bands over `redirectHeightMs`, which is the
same motion a stance change draws and is exactly the signal the defender is
racing. The body gets the matching vertical offset. Without the line bar this
would be nearly invisible; with it, the redirect is the most legible thing on
screen for the duration of the slide.

The sheet swap is abrupt, and that is correct: a line change is a discontinuity
in the blade's path, and the player must see it in one frame to have any chance
at §4.1's window. Smoothing it would hurt.

### 5.2 HUD

Row 3 from `attack-lines` is where a redirect becomes legible. Its label changes on the
redirect tick, from `HIGH OUTSIDE (attack)` to `LOW OUTSIDE (attack)`, and that
change is the signal the player is racing. Row 2 shows the guard's rise
restarting on a shift with the expiry cursor visibly **not** resetting, since the
window not refreshing is the cost.

### 5.3 Audio silent, log honest

The redirect writes a log line, like the abandoning feint does - the lie is
visible by design (row 3's flip is the signal the defender races), so hiding
it from the activity log protected nothing and made the player's own history
illegible. Playtesting caught exactly that. What stays silent is the AUDIO:
no cue fires at a redirect. The `swing` event is already unmapped for the same
reason, and here it is stronger: **a feint you can hear is not a feint.** An
audible redirect would let a player answer without watching, which would defeat
the mechanic and make `attack-lines`'s line read pointless.

The attack still resolves to exactly one outcome sound at its new `strikeEnd`, so
the one-sound-per-attack rule holds unchanged. A redirect emits no second rise
cue: the blade never returns to a windup pose, it travels sideways.

### 5.4 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. This spec adds
an acceptance rule (when a redirect is legal), a contact consequence (a redirect
on either axis escapes a guard's covered line) and the guard shift with its two
inputs. Durations come from `WEAPONS` through callbacks.

---

## 6. AI

Mode 3 gains the reactive redirect, which is why this chain of specs exists.

```
While attacking, if the redirect is legal (§2), and the opponent's
guard has been visible for at least AI_REACTION_MS:
  - if that guard's covered line matches this attack's line
      -> redirect the axis that escapes cheapest: side if the covered
         side matches, else height
  - else if the opponent is mid-attack, crossing on this attack's line
      -> redirect side
  - else do nothing
```

The AI reads the guard's *visible* covered line - the same row-3 information
the player has - never the defender's inputs or any pending shift's
destination.

**Two deviations, decided at implementation:** the crossing-avoidance clause
("opponent mid-attack on this line -> redirect side") is dropped - uncrossing
leaves the redirecting attacker mid-windup against a blade that now resolves
freely, which is suicide, not escape; the clause misread who benefits from a
crossing. And both-axes redirects/shifts, while supported by the engine's
cost arithmetic, are not reachable from input: the intent pipeline carries
one intent per tick, so a both-axes correction is two ticks and two separate
legality checks. Neither loss is felt: one axis always escapes a full-line
guard.

Purely reactive, no rng draw, so a seeded replay stays reproducible. It is
deterministic *and* unpredictable, because what it does depends on what you did.

The deadline is `strikeStart`, so only a guard raised at least `AI_REACTION_MS`
before commitment can be reactively feinted. A guard raised later is safe from
the feint - and pays `parry-rise`'s price for lateness, the thin overlap. That
completes the table `parry-rise` §1 started: commit early and be feintable,
commit late and be right by a hair, and the band between is where a defender
lives.

Mode 1 gains the **guard shift** as a defender, using the same rule the player
has, so the dummy can be practised against as a feint target that sometimes
recovers. Mode 2 neither feints nor shifts; its predictability is the point.

### 6.1 Mode 3 is now beatable in five ways

Which is the answer to "the duelist is solved":

- do not parry, and counter-attack into it (`blade-contact`)
- stand at the right height early, so its stance tell tells you nothing new
- parry late, inside the thin band where reaction cannot reach you (`parry-rise` §1)
- parry, read the redirect, and shift the guard (§4)
- void, and punish the recovery

---

## 7. Tests

- **Legality:** each of the three conditions in §2 falsified independently.
  **Commitment boundary:** a redirect on the tick before `strikeStart` is
  accepted; on that tick or any later one it is refused, including throughout
  the strike and the recovery.
- **One redirect:** a second redirect on the same attack is refused, including
  the case where the first changed height and the second would change side.
- **Cost selection:** height-only, side-only and both-axes redirects each take
  the duration §3 specifies.
- **Timeline replacement:** every mark equals `elapsedMs + cost +` the resulting
  kind's timings; `riseStart` and `riseEnd` are unchanged and in the past;
  `elapsedMs` is monotonic across the redirect.
- **The height lie lands:** guard covering `high inside`, attack redirected to
  `low` on the same side, result is `hit`.
- **The side lie lands:** guard covering the attack's height and `outside`,
  attack redirected to `inside` at the same height, result is `hit` - the
  parry's snapshotted side does not follow the blade.
- **The parry never reads a future redirect:** a parry pressed during the
  attacker's windup covers the side visible on the press tick; a redirect on a
  later tick does not retroactively change what was snapshotted.
- **The side lie also uncrosses a counter-attacker:** two crossing blades, one
  redirects side, they no longer cross and both resolve independently.
- **The height answer works:** defender's height shift completes within §4.1's
  window, result is `parried`; one tick later, `hit`.
- **The side answer works:** against a longsword side redirect, a retarget
  (parry pressed again) completing in time is `parried`; one tick later, `hit`.
  Against a rapier side redirect the retarget is always late - the disengage
  exception, asserted as `hit`.
- **Old line holds mid-shift:** a blade arriving on the guard's old covered
  line while a shift is in motion is still `parried`; the destination line is
  not covered until the shift's duration elapses.
- **Invariants:** the height inequality for every pair, the side inequality
  for every pair except the rapier attacker (which must fail), and both
  ordering invariants (`guardShiftMs < heightChangeMs`,
  `sideChangeMs < guardShiftMs`), per §4.1.
- **Window does not refresh:** a shifted guard still expires at its original
  `parryWindowMs`.
- **One shift per raise, whichever kind:** after a side retarget, a height
  shift on the same raise is refused, and the reverse.
- **Stance follows:** after a height redirect the attacker's stance is the new
  height; after a height shift the defender's stance is the new height.
- **Feint costs tempo:** against an opponent who never defends, a redirected
  attack resolves strictly later than the committed one.
- **AI determinism:** same seed and input script, same redirect ticks.
- **Audio contract:** a redirect emits no `windup`, no `met` and no extra sound;
  exactly one outcome sound fires, at the new `strikeEnd`. Belongs in the
  "presentation events follow the simulation, not the input" describe block.
- **Help panel:** cites the shipping redirect and shift durations and states
  that a guard covers one complete line.
- **Golden replay:** hash re-recorded.

---

## 8. Out of scope

- Redirecting after commitment. The window closes at `strikeStart`, which also
  closes it before any possible contact; binds are `sustained-bind` and
  `pressure-and-winding`.
- Chained redirects, and more than one guard shift per raise (`held-guard`
  lifts the shift cap when it removes the window).
- A reachable `middle` height. Enabling it requires deciding what a redirect may
  reach from where, and §4.1's margins recomputed for a two-way guess. `attack-lines` §7.
- Feinting a **step**, drawing a counter-attack with false footwork.
- Cancelling into a parry or a void. §10 of the state-tracks spec deferred it and
  nothing here changes that argument.
- A holdable guard replacing `parryWindowMs`. It becomes safe only after this
  spec, since a held guard is exactly what a feint eats. It is the next spec,
  `held-guard`, judged on play evidence from here.

---

## 9. Playtest gate

Play mode 3 with each weapon, then play the same fight refusing to parry at all,
then again standing at the height its stance tell predicts.

What to look for:

- Getting feinted feels like being read. You should be able to say afterwards
  what you did that told the AI to feint.
- Shifting the guard after spotting a height redirect works often enough to be
  worth attempting and rarely enough to feel earned; the side retarget (L
  again) feels like the same skill with a smaller motion.
- The two lies read differently on row 3: a height redirect slides the line
  bar, a side redirect flips the label - and your guard visibly keeps its old
  covered line until your correction lands.
- The rapier's side redirect feels like a disengage should: uncatchable by the
  guard, answered by distance or steel instead.
- Feinting into an opponent who was not defending feels like a wasted tempo.

What would look wrong: the height redirect being invisible until it lands. That
means the line bar's slide is too fast or too subtle to register, and the fix is
its contrast or `redirectHeightMs`, not a sound and not a bigger label.
