# TODO-4: Line-changing feints

## Overview

§8.1 of the state-tracks spec gives the attacker one deception: cancel the windup
into a short recovery, provoking a parry and punishing its cooldown. It deceives
about **when**. §10 records that it cannot deceive about **where**, because
attacks had no lines.

TODO-3 gave them lines. This spec adds the second deception: an attack that sells
one line and arrives on the other. It also gives the defender the answer, because
a feint with no answer is not a mixup, it is a win button.

**Delivers:** feints (line-changing); line-changing feints.

**Depends on:** TODO-3.

---

## 1. Two feints, kept distinct

| | §8.1 cancel | This spec's redirect |
|---|---|---|
| Input | dedicated cancel key | the other attack key |
| Legal during | `windup` only | `riseEnd` through `parryableUntil`, while not `met` |
| Result | attack ends, short `feintRecoveryMs` | attack continues on the other line |
| Deceives about | when | where |
| Costs | a truncated recovery | `redirectMs` plus a whole new strike |

Both stay. Bailing out and lying are different plays and should feel different.

---

## 2. The rule

```ts
// On an attack state, while phase is windup-past-riseEnd or strike-not-yet-arrived,
// met === false, and redirected === false:
redirectAttack(f, toKind);
```

Legality, all four required:

1. `elapsedMs >= timeline.riseEnd`. Before the stillness the pose has not been
   sold, so there is nothing to lie about. Redirecting earlier is simply a
   different attack and should be refused rather than silently allowed.
2. `elapsedMs <= timeline.parryableUntil`. Past that the blade has arrived.
3. `met === false`. **Once steel has touched steel you are committed.** This is
   the seam TODO-5 grows the bind out of, and it is why the condition is written
   now rather than discovered later.
4. `redirected === false`. One redirect per attack, or an attacker could stall
   forever and the tempo economy collapses.

### 2.1 Timeline replacement

The attack keeps its identity and clock. Only the future is rewritten, atomically,
per §2.3 of the state-tracks spec:

```ts
s.attack = toKind;
s.redirected = true;
s.timeline = {
  ...s.timeline,                                  // riseStart, riseEnd stay in the past
  strikeStart:    s.elapsedMs + w.redirectMs,
  parryableUntil: s.elapsedMs + w.redirectMs + t2.strike * PARRYABLE_FRACTION,
  strikeEnd:      s.elapsedMs + w.redirectMs + t2.strike,
  recoveryStart:  s.elapsedMs + w.redirectMs + t2.strike,
  recoveryEnd:    s.elapsedMs + w.redirectMs + t2.strike + t2.recovery,
};
s.phase = "windup";   // the blade is travelling to the new line, not yet dangerous
```

`elapsedMs` is never reset, so every mark stays absolute and every consumer keeps
reading one clock against one snapshot. There is no second time origin to get
wrong. This is the restructure paying for itself.

The new marks come from `toKind`'s timings, not the original's. A cut redirected
into a thrust arrives with the thrust's strike and recovery, and carries the
thrust's line.

### 2.2 What it costs

The redirect always delays the arrival. Against an opponent who was not going to
defend, it is pure loss: you hand them the tempo. Against one who committed a
guard, it wins the exchange. That asymmetry is the whole mechanic and it needs no
extra penalty on top.

Worked example, longsword cut redirected into a thrust at the last legal instant:
890 + 300 + 260 + 300 = 1750 ms from attack start, against 1500 ms for the
committed cut. A feint is roughly 250 ms slower at worst.

---

## 3. Numbers

| Weapon | `redirectMs` |
|---|---|
| Longsword | 300 |
| Rapier | 220 |

The rapier is the weapon built to defeat contact by going around it, so it
changes line fastest. Paired with its worse `parriedPenalty` from TODO-2, the two
weapons now sit at opposite ends of one axis: the longsword wins the exchange
where steel meets, the rapier wins the exchange where it does not.

**These numbers are load-bearing, not cosmetic.** §4.1 derives the defender's
answer window from `redirectMs`; shortening it without rechecking that arithmetic
makes the feint unanswerable.

---

## 4. The defender's answer: changing the guard's line

Without this section, a reactive redirect beats every parry unconditionally, and
mode 3 becomes unbeatable rather than unpredictable.

```ts
interface ParryTrack {
  elapsedMs: number;   // since first raised; expires at parryWindowMs
  riseMs: number;      // since the current line was chosen; effective at parryRiseMs
  line: AttackLine;
  changed: boolean;    // one line change per raise
}

function guardEffective(f) {
  return f.parry !== null
    && f.parry.riseMs >= f.weapon.parryRiseMs
    && f.parry.elapsedMs < f.weapon.parryWindowMs;
}
```

Pressing the other guard key while a parry is up **changes its line**: `line`
switches, `riseMs` resets to 0, `changed` becomes true, and `elapsedMs` continues
untouched. The guard must rise again, and it still expires when it always would
have. Changing line late means the new guard may never become effective at all.

One change per raise, matching the attacker's one redirect per attack. The
exchange is a single lie answered by a single correction, not a wrestling match
of key presses.

### 4.1 The answer window, checked

Defender sees the redirect at instant R. The redirected blade is meetable from
`R + redirectMs` until `R + redirectMs + parryable`. For a longsword redirecting
into a thrust that is `R + 300` to `R + 430`. The defender must press by
`R + 430 - parryRiseMs` = `R + 210`.

Human reaction is roughly 200 to 250 ms. So reading a feint and correcting the
guard is possible and hard, which is the correct difficulty for the highest-skill
defensive play in the game. If play says it is impossible rather than hard, the
lever is `redirectMs` upward, not `parryRiseMs` downward, because `parryRiseMs`
carries the invariant from TODO-1 §3.1.

---

## 5. Presentation

### 5.1 Sprites

The redirect swaps sheets: an attack that began on `swordAttack` continues on
`swordStab`, or the reverse. During `redirectMs` the fighter holds the new
sheet's **loaded** frame (`swordStab` frame 2, or `swordAttack` frame 0), which
reads as the blade being pulled off its line and re-set. The new strike then
plays its normal travelling and delivered frames.

The sheet swap is abrupt. That is acceptable and arguably correct: a line change
is a discontinuity in the blade's path, and the player must be able to see it in
one frame to have any chance at §4.1's window. Smoothing it would hurt.

### 5.2 Audio: silent, deliberately

No cue fires at the redirect. The `swing` event is already unmapped for the same
reason, and here it is stronger: **a feint you can hear is not a feint.** An
audible redirect would let a player answer correctly without watching, which
defeats the entire mechanic and would make the line read in TODO-3 pointless.

The attack still resolves to exactly one outcome sound at its new `strikeEnd`, so
the one-sound-per-attack rule in `AGENTS.md` holds unchanged. A redirect emits no
second rise cue: the blade never returns to a windup pose, it travels sideways.

### 5.3 HUD

The body row's progress bar redraws against the replaced timeline, which it
already does for §8.1's cancel. The label shows the new line immediately:
`strike (low)` where it read `windup (high)`.

The defence row shows the rise restarting on a line change, with the expiry
cursor visibly **not** resetting. That the window did not refresh is the cost, so
it must be the visible thing.

---

## 6. AI

Mode 3 gains the reactive redirect, which is the whole reason this chain of specs
exists.

```
While attacking, if:
  - the redirect is legal (§2), and
  - the opponent has a parry up whose line matches this attack's line, and
  - that parry has been visible for at least AI_REACTION_MS
then redirect to the other line.
```

Purely reactive, no rng draw, so a seeded replay stays reproducible. It is
deterministic *and* unpredictable, because what it does depends on what the
player did.

TODO-1 §3.1's invariant is what makes this reachable: any parry that could
succeed became visible at least `AI_REACTION_MS` before it mattered.

**Mode 3 is now beatable in four ways**, which is the answer to "the duelist is
solved":

- do not parry, and counter-attack into it (TODO-2)
- parry late, inside the thin band where reaction cannot reach you (TODO-1 §1)
- parry, read the redirect, and change line (§4)
- void, and punish the recovery

Mode 1 and mode 2 do not feint. Mode 1 is a defensive dummy; mode 2's
predictability is its purpose.

---

## 7. Tests

- **Legality:** each of the four conditions in §2 falsified independently while
  the other three hold. `met === true` refusing the redirect gets its own test,
  since TODO-5 depends on that edge.
- **One redirect:** a second redirect on the same attack is refused.
- **Timeline replacement:** after a redirect, every mark equals `elapsedMs +
  redirectMs +` the new kind's timings; `riseStart` and `riseEnd` are unchanged
  and in the past; `elapsedMs` is monotonic across the redirect.
- **The lie lands:** high guard up and effective, cut redirected to thrust, result
  is `hit` and not `parried`.
- **The answer works:** same setup, defender changes line within §4.1's window,
  result is `parried`. Same setup, defender changes one tick too late, result is
  `hit`. These two are the spec.
- **Window does not refresh:** a guard that changes line still expires at its
  original `parryWindowMs`.
- **Feint costs tempo:** against an opponent who never parries, a redirected
  attack resolves strictly later than the committed one.
- **AI determinism:** the same seed and the same input script produce the same
  redirect ticks.
- **Audio contract:** a redirect emits no `windup`, no `met` and no extra sound;
  exactly one outcome sound fires, at the new `strikeEnd`. Belongs in the
  "presentation events follow the simulation, not the input" describe block.
- **Golden replay:** hash re-recorded.

---

## 8. Out of scope

- Redirecting after contact. Blocked by condition 3; that is TODO-5 and TODO-6.
- Chained redirects.
- Feinting a **step** (drawing a counter-attack with false footwork).
- Cancelling into a parry or a void. §10 of the state-tracks spec deferred it and
  nothing here changes that argument.
- A holdable guard replacing `parryWindowMs`. It becomes arguable **after** this
  spec, since a held guard is now exactly what a feint eats, but it is a separate
  change and should be judged on play evidence from here.

---

## 9. Playtest gate

Play mode 3 with each weapon, then play the same fight refusing to parry at all.

What to look for:

- Getting feinted feels like being read, not like being cheated. You should be
  able to say afterwards what you did that told the AI to feint.
- Correcting the guard after spotting a redirect works often enough to be worth
  attempting, and rarely enough to feel earned.
- Feinting into an opponent who was not defending feels like a wasted tempo.

What would look wrong: the redirect being invisible until it lands. That means
§5.1's loaded-frame hold is too short to register, and the fix is a longer
`redirectMs`, not a sound.
