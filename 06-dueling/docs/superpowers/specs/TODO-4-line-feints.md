# line-feints: Line-changing feints

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

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

## 1. Two axes, two victims

A parry covers its height on **both** sides. Two travelling blades must match on
**both** axes. Those two rules are not the same shape, so changing height and
changing side deceive different people.

| Redirect | Beats | Does not beat |
|---|---|---|
| Height | the guard, which chose a height | nothing relevant |
| Side | a counter-attacker, whose blade no longer crosses yours | the guard, which spans sides |
| Both | both | |

That is two distinct lies out of one mechanic, which is more than the single-axis
version of this spec had. Against a defender who parries you change height;
against one who trades blades with you, you change side.

### 1.1 Kept distinct from the windup cancel

| | §8.1 cancel | This spec's redirect |
|---|---|---|
| Input | dedicated cancel key | arrow (height) or the other attack key (side) |
| Legal during | `windup` only | `riseEnd` through `strikeStart`: the sold half of the windup |
| Result | attack ends, short `feintRecoveryMs` | attack continues on a new line |
| Deceives about | when | where |
| Costs | a truncated recovery | a redirect interval plus a whole new strike |

Both stay. Bailing out and lying are different plays and should feel different.

---

## 2. The rule

Legality, all three required:

1. `elapsedMs >= timeline.riseEnd`. Before the stillness the pose has not been
   sold, so there is nothing to lie about.
2. `elapsedMs < timeline.strikeStart`. **Commitment is the windup-to-strike
   transition** - the state-tracks spec's own invariant, and an earlier draft of
   this spec broke it by allowing redirects into the travelling half of the
   strike. Once the blade travels, no input steers it; that is the same rule
   that makes the whiff honest, and the feint gets no exemption from it.
3. `redirected === false`. One redirect per attack, or an attacker could stall
   forever and the tempo economy collapses.

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

| Weapon | `redirectHeightMs` | `redirectSideMs` | `guardShiftMs` |
|---|---|---|---|
| Longsword | 380 | 300 | 180 |
| Rapier | 350 | 220 | 150 |

Changing height is a larger motion than going around a blade at the point, and it
is priced accordingly. The rapier changes side fastest: it is the weapon built to
defeat contact by disengaging, and with its worse `parriedPenalty` from `blade-contact`
the two weapons sit at opposite ends of one axis. The longsword wins where steel
meets; the rapier wins where it does not.

**These numbers are load-bearing.** §4.1 derives the defender's answer from
them, and §5 makes that a test.

---

## 4. The defender's answer: shifting the guard

Without this section a reactive height redirect beats every parry
unconditionally, and mode 3 becomes unbeatable rather than unpredictable.

A raised guard may **shift** to the other height once per raise, at
`guardShiftMs`. This is cheaper than `attack-lines`'s `heightChangeMs` cold stance move
because the blade is already formed and only has to travel; that is exactly what
*Winden* is, and `pressure-and-winding` builds on the same motion.

The shift input is the arrows - the same keys that move the stance, which
`attack-lines` refuses while a parry is up. From this spec they stop being
refused and perform the shift instead.

```ts
interface ParryTrack {
  elapsedMs: number;   // since first raised; expires at parryWindowMs
  shiftMs: number;     // since the current height was chosen
  shifted: boolean;    // one shift per raise
}

guardEffective(f) =
  f.parry !== null
  && f.parry.shiftMs >= (f.parry.shifted ? f.weapon.guardShiftMs : f.weapon.parryRiseMs)
  && f.parry.elapsedMs < f.weapon.parryWindowMs;
```

The guard's expiry does **not** refresh on a shift. Shifting late means the new
height may never become effective. One shift answers one redirect: a single lie
corrected once, not a wrestling match of key presses.

The shift also moves the fighter's stance, for the same reason a height redirect
does.

### 4.1 The answer window, checked

Defender sees the redirect at R, reacts at `R + PLAYER_REACTION_MS` (250), and
the guard is effective `guardShiftMs` later. The redirected blade is meetable
until `R + redirectHeightMs + strike * PARRYABLE_FRACTION`.

Worst case is the fastest redirected attack, the thrust:

| Weapon | Guard effective | Meetable until | Margin |
|---|---|---|---|
| Longsword | R + 430 | R + 510 | 80 ms |
| Rapier | R + 400 | R + 460 | 60 ms |

Reading a feint and correcting the guard is possible and hard, which is the right
difficulty for the highest-skill defensive play in the game. As an invariant:

> **`redirectHeightMs + min(strike) * PARRYABLE_FRACTION >= PLAYER_REACTION_MS +
> guardShiftMs`** for every weapon.
>
> **`guardShiftMs < heightChangeMs`**, or shifting a formed guard is not cheaper
> than starting from cold.

If play says the answer is impossible rather than hard, the lever is
`redirectHeightMs` upward, not `parryRiseMs` downward: that number carries
`parry-rise` §3.1's invariant, and lowering it would make the attacker's own reactive
feint unreachable in the process of making the defender's answer reachable.

`guardShiftMs` has no floor at `AI_REACTION_MS`. It is the duration of a motion,
not a reaction gate; the AI spends its 180 ms deciding and then shifts in
`guardShiftMs` like anyone else, which is why the rapier's 150 is legal.

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

### 5.3 Audio: silent, deliberately

No cue fires at a redirect. The `swing` event is already unmapped for the same
reason, and here it is stronger: **a feint you can hear is not a feint.** An
audible redirect would let a player answer without watching, which would defeat
the mechanic and make `attack-lines`'s line read pointless.

The attack still resolves to exactly one outcome sound at its new `strikeEnd`, so
the one-sound-per-attack rule holds unchanged. A redirect emits no second rise
cue: the blade never returns to a windup pose, it travels sideways.

### 5.4 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. This spec adds
an acceptance rule (when a redirect is legal), a contact consequence (a guard
spans sides, so only height lies beat it) and the guard shift. Durations come
from `WEAPONS` through callbacks.

---

## 6. AI

Mode 3 gains the reactive redirect, which is why this chain of specs exists.

```
While attacking, if the redirect is legal (§2), and the opponent's
guard has been visible for at least AI_REACTION_MS:
  - if that guard is at this attack's height   -> redirect height
  - else if the opponent is mid-attack on this attack's side -> redirect side
  - else do nothing
```

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
- **The height lie lands:** guard up and effective at `high`, attack redirected
  to `low`, result is `hit`.
- **The side lie does not beat a guard:** guard up at the attack's height,
  attack redirected from `outside` to `inside`, result is `parried`.
- **The side lie beats a counter-attacker:** two crossing blades, one redirects
  side, they no longer cross and both resolve independently.
- **The answer works:** defender shifts within §4.1's window, result is
  `parried`. One tick later, result is `hit`. These two are the spec.
- **Invariants:** both inequalities in §4.1, per weapon.
- **Window does not refresh:** a shifted guard still expires at its original
  `parryWindowMs`.
- **Stance follows:** after a height redirect the attacker's stance is the new
  height; after a guard shift the defender's stance is the new height.
- **Feint costs tempo:** against an opponent who never defends, a redirected
  attack resolves strictly later than the committed one.
- **AI determinism:** same seed and input script, same redirect ticks.
- **Audio contract:** a redirect emits no `windup`, no `met` and no extra sound;
  exactly one outcome sound fires, at the new `strikeEnd`. Belongs in the
  "presentation events follow the simulation, not the input" describe block.
- **Help panel:** cites the shipping redirect durations and states that a guard
  spans sides.
- **Golden replay:** hash re-recorded.

---

## 8. Out of scope

- Redirecting after commitment. The window closes at `strikeStart`, which also
  closes it before any possible contact; binds are `sustained-bind` and
  `pressure-and-winding`.
- Chained redirects, and more than one guard shift per raise.
- A reachable `middle` height. Enabling it requires deciding what a redirect may
  reach from where, and §4.1's margins recomputed for a two-way guess. `attack-lines` §7.
- Feinting a **step**, drawing a counter-attack with false footwork.
- Cancelling into a parry or a void. §10 of the state-tracks spec deferred it and
  nothing here changes that argument.
- A holdable guard replacing `parryWindowMs`. It becomes arguable after this
  spec, since a held guard is now exactly what a feint eats, but it is a separate
  change and should be judged on play evidence from here.

---

## 9. Playtest gate

Play mode 3 with each weapon, then play the same fight refusing to parry at all,
then again standing at the height its stance tell predicts.

What to look for:

- Getting feinted feels like being read. You should be able to say afterwards
  what you did that told the AI to feint.
- Shifting the guard after spotting a height redirect works often enough to be
  worth attempting and rarely enough to feel earned.
- The side redirect is visibly a different play: it does nothing to a parrying
  opponent and saves you against one who trades.
- Feinting into an opponent who was not defending feels like a wasted tempo.

What would look wrong: the height redirect being invisible until it lands. That
means the line bar's slide is too fast or too subtle to register, and the fix is
its contrast or `redirectHeightMs`, not a sound and not a bigger label.
