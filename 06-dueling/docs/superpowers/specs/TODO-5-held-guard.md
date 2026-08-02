# held-guard: The guard stays as long as you hold it

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

> **Distinction to preserve** (added with the threat-latched parry): a TAP
> against a visible attack latches onto that one attack and ends with it;
> the HELD guard this spec builds exists independently of any attack and
> remains until released or consumed. Both must survive side by side - the
> latch is the reactive answer bound to a threat, the hold is a stance-like
> commitment bound to a key. Nothing in this spec may collapse the tap's
> attack-bound lifetime into the hold's key-bound one.

## Overview

The parry is a timed action. The state-tracks spec named it so deliberately:
"named `parry`, not `guard`: it expires and cools down". Today it runs:

```text
press parry
-> rise
-> effective window
-> automatic expiry
-> recovery
```

This spec replaces the automatic expiry with the player's own hand:

```text
press and hold parry
-> rise
-> held guard
-> release parry
-> recovery
```

The guard may be held indefinitely. There is no stamina drain and no timer.
The costs are the ones the earlier specs already built: a held guard covers
exactly one line, moving that line takes real travel time, and every way of
leaving the guard charges `parryRecoveryMs`. If playtesting proves those costs
insufficient, §13 names the knobs to turn first - stamina and expiry are not
among them.

**Delivers:** the held guard - the parry's final form.

**Depends on**, all four, each for a stated reason:

- `parry-rise` - the guard's physical travel. The blade is visible from the
  press and effective only after `parryRiseMs`, and §3.1's readability
  invariant (a guard is seeable at least a reaction time before it can stop
  anything) is what keeps an indefinitely held guard honest to attack into.
- `attack-lines` - the guard's coverage. A guard covers one complete line,
  height from the defender's stance and side inferred from the visible
  threat. Without this, a held guard would be a universal wall.
- `blade-contact` - what contact means. Arrival, deflection and the
  `parriedPenalty` economy are the events that consume a held guard.
- `line-feints` - the reason holding is safe to allow at all. A redirect on
  either axis defeats a static guard, so camping one line is a readable,
  punishable choice rather than a dominant one. This spec also inherits its
  shift machinery: `guardShiftMs`, `sideChangeMs`, and the old-line-holds
  rule.

---

## 1. Why fifth: safe only now, needed next

**After `line-feints`.** A permanent guard is safe for the game only after
attacks can change lines. Before redirects, a guard held on the right line
would stop that line forever, and the only counter would be attacking a
different line from launch - readable off the stance before the attack even
starts. With redirects, a held guard is a standing invitation: the attacker
sells one line, watches the guard sit on it, and goes around. `line-feints`
§8 said exactly this when it deferred the holdable guard to the next spec.

**Before `sustained-bind`.** The bind consumes the defender's guard at entry
and snapshots how settled it was. Both rules only mean something once the
guard is holdable: "consumed" must be defined against a key that is still
physically down, and "settled" must be a clock this spec defines (§2), not a
fraction of a lifetime that no longer exists. `sustained-bind` reads both
definitions from here.

**What replaces the timing economy.** `parry-rise` §1 priced the press: early
was readable and feintable, late was right by a hair, and the expiry made
early presses die on the vine. With no expiry, an early press no longer
expires - so its price moves entirely onto the line axis. A guard raised
early is readable and feintable for longer, and the §8.1 windup cancel
changes diet: it can no longer punish an expiry-recovery that no longer
exists, but it can sell a line, bait the guard onto it (a raise or a shift),
and attack the line the guard left. The mixup survives; only its currency
changes from *when* to *where*.

---

## 2. Data model

### 2.1 Weapon profile

```ts
interface WeaponProfile {
  // ...
  parryRiseMs: number;     // unchanged, same values
  parryRecoveryMs: number; // unchanged, same values
  // parryWindowMs          REMOVED
}
```

`parryWindowMs` is deleted, not renamed. Its two consumers were the expiry
check and row 2's window cursor, and both are gone with it; nothing else
reads it, so keeping the field under any name would only imply a timed guard
that no longer exists. `parry-rise`'s `parryWindowMs - parryRiseMs >= 120`
invariant test is deleted with the field (§11 lists every retirement).

`parryRiseMs` keeps its shipping values (longsword 220, rapier 190). The rise
is what makes a guard readable before it is effective, and nothing in this
spec changes that arithmetic.

### 2.2 Parry track

`line-feints`' `ParryTrack` is replaced. Same facts, one new clock, no
expiry:

```ts
interface ParryTrack {
  phase: "rising" | "held" | "shifting";
  coveredLine: Line;   // covered while phase != "rising"; never an unarrived destination
  targetLine: Line;    // where it is going; equals coveredLine while "held"
  phaseMs: number;     // ms into the current phase
  settledMs: number;   // ms coveredLine has been effective; 0 while rising
}
```

This is `attack-lines`' target-versus-coverage split with the phase made
explicit: `rising` is the interval before its `effectiveAtMs` (nothing
covered), `shifting` is `line-feints`' old-line-holds interval (`fromLine`
covered), and `held` is the state that used to end at `parryWindowMs` and no
longer ends at all. The exact field shape may follow the shipped track; the
facts it must preserve, whatever the final names:

- Coverage is one complete line: one height and one side.
- The line is snapshotted when the guard starts, exactly as `attack-lines` §3
  chooses it: height from the defender's stance (a press mid-transition
  targets the destination), side inferred from the opponent's currently
  visible attack (falling back to `guardSide` when nothing is visible). Only
  information visible on that tick is read.
- The guard never reads future attack state and never automatically follows
  a redirect. Coverage changes only when a guard shift completes (§6).

`settledMs` is the clock `sustained-bind` snapshots and
`pressure-and-winding` turns into firmness. It counts while `coveredLine` is
effective - including through a shift, because the old line's coverage is
unbroken (§6) - and resets to 0 on the tick a shift completes, because the
new line is freshly set.

```ts
/** Formed and able to meet a blade, on coveredLine only. */
function guardEffective(f: Fighter): boolean {
  return f.parry !== null && f.parry.phase !== "rising";
}
```

The rise's duration is unchanged from `attack-lines` §4: the three-way `max`
of `parryRiseMs`, the side travel when the target side differs from
`guardSide`, and the height transition's arrival. `rising` ends when the
last of them arrives; `phase` becomes `held` and `settledMs` starts.

---

## 3. Input lifecycle

The project already has the idiom for a held key: `state.held` in `main.ts`
carries `advance` and `retreat`, keydown sets a flag behind the global
`if (e.repeat) return` guard, keyup clears it, and the per-tick input step
reads the flags. The parry joins that structure - a controller-held flag -
plus one new intent for the edge the engine must see:

```ts
type Intent = ... | "parryRelease";
```

**Parry key down** (fresh keydown, never an auto-repeat):

- sets `held.parry` and issues the existing `parry` intent. Acceptance is
  unchanged: from `ready` or during `stepRecoveryMs`, with
  `parryRecoveryMs === 0`. The covered line snapshots as before.
- a keydown while a guard already exists cannot happen on the same key and is
  ignored if synthesized. Shifts have their own inputs (§6); the parry key
  never requests them. `line-feints` bound the side retarget to "press parry
  again", which was legal while the parry was a tap; a held key has no second
  press, so that input moves to the horizontal arrows (§6).

**Parry key held:** nothing, per tick. The guard is not restarted, refreshed
or re-issued. The flag exists so the engine's `parry !== null` state and the
physical key agree, and for the consumed-guard rule below.

**Parry key up:**

- clears `held.parry` and issues `parryRelease` on that tick.
- `parryRelease` with a guard up, in any phase: the guard lowers, the
  `ParryTrack` is cleared, and `parryRecoveryMs` starts. With no guard up it
  is a no-op.
- a `parry` intent still sitting in the input buffer when the release
  arrives is cancelled. Without this rule a tap during a buffering state
  would raise a guard after the key is gone, with no keyup ever coming to
  lower it - a stuck guard. A parry that buffers and fires while the key is
  still down raises normally, on the buffer-fire tick.

**A consumed guard does not re-form from the held key.** When a deflection
or a bind spends the guard (§7) while the key is still physically down,
nothing re-raises when `parryRecoveryMs` ends. Raising requires a fresh
keydown. Otherwise holding the key would be a standing order for infinite
guards, and the recovery would gate nothing.

**Auto-repeat and focus.** The `e.repeat` guard already at the top of the
keydown handler is what keeps repeat events from restarting the guard or
spamming shifts; a test pins it for the parry specifically. On window blur
the input layer clears every `held` flag and synthesizes the release,
because no keyup will arrive for a key let go on another window.

The AI issues `parry` and `parryRelease` intents like the player. No mode
holds a guard by flag-writing; the same lifecycle applies to everyone.

---

## 4. The three phases

```text
rising:   visible, not effective. Ends at the three-way max (§2.2).
held:     effective on coveredLine. Indefinite.
shifting: still effective on coveredLine - the OLD line - until the
          shift's duration elapses (§6).
```

The rise is unchanged in duration and meaning: a guard is never effective on
the press tick, and everything `parry-rise` §3 says about the rise still
holds. What is gone is the far edge. There is no tick at which a held guard
stops being effective on its covered line except the tick the player leaves
it or contact consumes it.

Sprites are `parry-rise` §4.1's mapping, unchanged: frame 1 while rising,
frame 2 while held and while shifting - the shift's motion is carried by the
line bar sliding between bands, `attack-lines` §5.2's idiom, exactly as the
stance change and the height redirect already draw it.

---

## 5. Defeating the held guard

A held guard must not be universal, and it is not: the coverage rule is
`attack-lines` §3, unchanged. This spec changes how long a guard lives, not
what it covers. An attack gets past a held guard when either axis differs:

```text
attack height != guard height   -> the guard misses
or attack side != guard side    -> the guard misses
```

The cases, restated over a held guard:

```text
Guard: high inside.  Attack: high inside   -> contact (timing and reach holding)
Guard: high inside.  Attack: high outside  -> guard misses, attack proceeds
Guard: high inside.  Attack: low inside    -> guard misses, attack proceeds
```

And the play this whole chain was built for:

```text
attacker presents high inside
-> defender raises and holds a high-inside guard
-> attacker redirects to high outside before commitment (line-feints §2)
-> the held guard remains high inside; nothing retargets it
-> the defender shifts in time (§6), or is hit
```

The redirect never moves the guard - `attack-lines`' snapshot rule - and the
guard never inspects a redirect that has not happened. Both were already
tests; they are re-pinned here against a guard that has been held far past
the old window, because "the guard is stale" is now a state that can last
whole seconds.

---

## 6. Guard shifts

A held guard may move to another line, and moving takes time. The shift
machinery is `line-feints` §4 with the window scaffolding removed.

**The inputs - nothing retargets automatically:**

- **Height shift:** arrow up / arrow down while the guard is up, over
  `guardShiftMs` (longsword 180, rapier 150). The shift moves the fighter's
  stance too, unchanged from `line-feints`.
- **Side shift:** arrow left or arrow right while the guard is up, over
  `sideChangeMs` (longsword 120, rapier 100). Either horizontal arrow means
  the same thing: retarget the side to what a fresh press would infer -
  `attack-lines` §3's inference, the currently visible attack's side, reading
  only that tick. It is refused as a costless no-op when no attack is
  visible or when the inferred side is already covered or already the active
  shift's target. The horizontal arrows were unused; they become the side
  retarget because the parry key, now held, has no second press.
- **Combined shift:** a height arrow and a side arrow on the same tick move
  both axes in one motion, over the larger of the two durations - which is
  `guardShiftMs`, by `line-feints`' `sideChangeMs < guardShiftMs` invariant.

**The rules, each one a test:**

- **Only one shift may be active at a time.** Any shift input during an
  active shift is refused. A second input cannot reverse, redirect or
  restart the motion in flight; you finish the travel you started.
- **Refused while rising.** The line is chosen at the press; the guard forms
  before it moves.
- **The shift does not reset the rise.** A formed guard stays formed;
  `phase` goes `held -> shifting -> held`, never back through `rising`.
- **The old line holds until the shift completes.** While `shifting`, the
  guard is still effective on `coveredLine`; a blade arriving on the old
  line mid-shift is met. `coveredLine` becomes `targetLine` only when the
  duration elapses. The guard never covers the destination early and never
  covers nothing. This is `line-feints`' rule, kept verbatim - it survives
  the window's removal.
- **There is no expiry to refresh.** The rule and its test in `line-feints`
  ("the expiry does not refresh") are retired as vacuous.
- **Repeated completed shifts are allowed while the guard is held**, each
  paying its full travel time, and `settledMs` resets on each completion.
  The once-per-raise cap is retired: its job was to stop a wrestling match
  inside one timed window, and the window is gone. What stops mashing now is
  physics - one shift at a time, no reversal, full cost per shift - and
  economics: a shifting guard is a guard whose settled clock keeps
  re-zeroing, which `pressure-and-winding` will price as soft.
- **`guardSide` updates when a side shift completes**, exactly as it updates
  when a press's side travel completes (`attack-lines` §3).

**The answer windows are untouched.** `line-feints` §4.1's margins - the
height answer against every weapon, the side answer against the longsword,
the rapier's disengage deliberately below the line - depend only on the
shift durations and redirect costs, and none of those numbers change. Its
invariants keep passing unedited.

---

## 7. Leaving the guard

Every interaction, explicitly. "Drops" means: `ParryTrack` cleared,
`parryRecoveryMs` charged, on the tick named.

```text
Step (a/d):        allowed; the guard stays raised and effective. The
                   carried-guard rule (state-tracks §8.2, rule D) is
                   unchanged. Holding the flag through the step does not
                   restart anything.

Attack (j/k):      accepted from a held guard; coverage is gone on the
                   acceptance tick and the attack launches undelayed, on
                   its normal, full timeline. parryRecoveryMs runs
                   concurrently with the attack and gates only the next
                   guard. The primary cost is losing defence, not a
                   slower strike. (Acceptance change: an attack while a
                   parry was up used to be refused.)

Void:              accepted from a held guard; same shape as the attack:
                   coverage gone on the acceptance tick, normal timing,
                   undelayed, recovery concurrent.

Release (keyup):   drops the guard, any phase (§3).

Hit or death:      clears the guard. hitstun and dead take precedence
                   over everything, as always; parryRecoveryMs is charged
                   for uniformity and is moot under either state.

Deflection:        a successful parry consumes the guard, exactly as the
                   engine's parried branch does today: ParryTrack cleared,
                   parryRecoveryMs charged, on the same tick it fires now.
                   The still-held key does not re-raise (§3).

Bind entry:        consumes the guard at entry; parryRecoveryMs is charged
                   at bind EXIT, not entry - see §8 and sustained-bind §2.
```

Attacking while retaining active guard coverage is not allowed, from any
input, in any state. A technique that genuinely combines attack and defence
in one tempo (the Meisterhaue of the design doc) would be its own spec with
its own price; nothing here grants cover for free during a strike.

---

## 8. Recovery

`parryRecoveryMs` begins on:

- voluntary release (any phase, including rising and shifting),
- attacking from the guard,
- voiding from the guard,
- a successful deflection,
- interruption by a hit (moot under hitstun, charged for uniformity),
- and, for a bind, **on the bind's exit tick**.

The bind case is the one that needs a decision, so it is decided: charged at
entry, the whole recovery (340/400 ms) would decay to nothing inside
`BIND_MS` (500 ms) and a consumed guard would cost nothing. Charged at exit,
it runs concurrently with `BIND_RECOVERY_MS` and the defender re-guards
late in the post-bind scramble, which is the consequence a spent guard
should have. `sustained-bind` §2 states the same rule from its side.

While `parryRecoveryMs > 0` the guard cannot be raised. That is the existing
semantics - the timer gates only the parry - and it is unchanged: attacks,
steps and voids during parry recovery follow their own rules. The timer never
delays the action that dropped the guard; it runs concurrently with it and
prices only how soon the guard can return.

---

## 9. AI

Each mode updated deliberately. No mode gets automatic line tracking, none
reads input buffers, and none inspects a redirect that has not happened -
every decision is a function of the same observable state row 3 prints,
delayed by `AI_REACTION_MS` like every other read.

**Mode 1, the parry dummy.** Moves its stance to the incoming attack's
height, presses, and now **holds** through the attack instead of timing a
window. The half-window margin in its press lead dies with the window: with
no expiry there is nothing to centre, so it presses as soon as it has
reacted and its stance has arrived. The rise and the stance travel still
decide which attacks it can answer, so the documented failures (the rapier
thrust) stay failures. A deflection consumes its guard by itself; on any
other outcome (a whiff, a hit on a line it did not cover) it releases
`AI_REACTION_MS` after the attack resolves, recovers, and is ready for the
next rep.

**Mode 2, the drill metronome.** Unchanged. It does not parry.

**Mode 3, the duelist.** May hold a guard while it waits - once it has a
reason to raise one. Today it never defends; the trigger that decides when
it parries is deliberately not this spec's problem and arrives in
`duelist-defence`, the last spec in the chain. What this spec defines is the
lifecycle that trigger will drive: raised per the player's own rules, held
for a seeded duration drawn from the existing rng (bounded, on the order of
half a second to a bit over one), then released or attacked out of per a
seeded draw. While holding,
it shifts by `line-feints` §6's reactive rule and nothing more: a shift only
in answer to visible state, at least `AI_REACTION_MS` old, with the same
costs the player pays. As an attacker it already redirects reactively; it
additionally reads a standing guard's visible covered line when choosing its
launch line, which is the counter this spec is about - and it is a read of
row-3 information, not a peek. All draws come from the seeded rng, so
replays stay reproducible.

---

## 10. Presentation

### 10.1 HUD row 2

The defence row's states and labels:

```text
GUARD RISING                              bar over the rise (three-way max)
GUARD HELD: HIGH INSIDE                   no bar
GUARD SHIFTING: HIGH INSIDE -> HIGH OUTSIDE   bar over the shift duration
RECOVERING                                bar over parryRecoveryMs, as today
```

The held state deliberately has no bar. A bar is the idiom for a duration,
and holding has none; a full static bar would imply a deadline that does not
exist. The old expiry cursor is retired with the window.

Bars appear only for rise, shift and recovery.

Row 3 keeps printing the **actual covered line** - `coveredLine`, straight
from the snapshot, per `attack-lines` §5.1. During a shift that is still the
old line, and stays so until the shift completes; the destination appears
only in row 2's `SHIFTING` label. The display never presents an intention as
coverage.

The sprite holds the set-guard frame the whole time the input is held, so a
guard that reads as up on the HUD reads as up on the fighter. The line bar
stays bright (the effective-state channel) through `held` and `shifting`,
and slides between bands over the shift, `attack-lines` §5.2 unchanged.

### 10.2 Audio

No looping guard sound - a held guard is a state, not a moment, and
`AGENTS.md` maps cues to moments (the same argument that kept the bind
silent). Nothing else changes:

- no sound on the press, per `parry-rise` §4.3;
- the `met` clash still fires when the blade arrives at the guard;
- the release is silent. There is no physical sound asset for lowering a
  blade, and inventing one would let feints be answered by ear.

### 10.3 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is updated in the same commit. The parry
entry is rewritten: hold to keep the guard up, release to lower it, recovery
on any way out. The shift entry gains the horizontal arrows. Every duration
comes from `WEAPONS` via callbacks, and the deleted `parryWindowMs` can no
longer be cited because it no longer exists. The phase union changed shape,
so the typed `HELP` record fails the build until the entries agree.

---

## 11. What this spec retires

Landing this spec deletes, by name:

- `parryWindowMs`, from `WeaponProfile`, `WEAPONS` and the help panel.
- The expiry transition and its recovery charge (release and consumption
  charge it instead).
- `parry-rise`: the `parryWindowMs - parryRiseMs >= 120` invariant test, and
  §5's window-growth accounting (historical once the window is gone).
- `line-feints`: the "expiry does not refresh" rule and test, the
  once-per-raise cap and its test, and the parry-key side retarget input
  (moved to the horizontal arrows). Its shift durations, old-line-holds
  rule, answer-window inequalities and the disengage exception all stand.
- Mode 1's half-window press margin (`ai.ts` computes its lead from
  `parryWindowMs`); the lead keeps only the rise and the stance travel, §9.
- Row 2's expiry cursor.

Everything else in `parry-rise` survives: the rise, its values, its
readability invariant, the silent press, the frame mapping.

---

## 12. Tests

Lifecycle:

- The guard is ineffective before the rise completes and effective on the
  tick it does - re-pinned from `parry-rise`, now phase-based.
- The guard is still effective long after the old windows would have
  expired: held 2000 ms, a matching attack is still `parried`.
- The guard stays up while the input is held; no per-tick refresh or restart
  is observable in the track's clocks.
- Release clears the guard and starts `parryRecoveryMs` - from `held`, from
  `rising` and from `shifting`.
- A `parry` intent during `parryRecoveryMs` is refused; on the first tick
  after, accepted.
- A parry tapped and released while the intent is buffered never raises a
  guard; held through the buffer firing, it raises on the fire tick.
- A guard consumed by deflection while the key stays held does not re-form
  when recovery ends; a fresh press after release does.
- Synthetic auto-repeat keydowns produce no raise, no shift and no clock
  reset.

Coverage:

- Same full line -> `parried`. Different height -> `hit`. Different side ->
  `hit`. The `attack-lines` §3 table, re-run against a long-held guard.
- A redirect does not move the guard: held guard on the old line, attack
  redirected away, `hit` - with the guard held far past the old window.

Shifts:

- A completed height shift changes coverage; a completed side shift changes
  coverage; a completed combined shift changes both, over `guardShiftMs`.
- A late shift fails: the blade arrives on the new line before the shift
  completes, `hit`.
- The old line holds mid-shift: a blade arriving on `coveredLine` during the
  travel is `parried`.
- Only one shift at a time: height-then-side and side-then-height second
  inputs mid-shift are both refused.
- Three consecutive completed shifts on one raise all take effect, each
  paying its full duration - the retired cap stays retired.
- A shift is refused while `rising`, and no shift path re-enters `rising`.
- `settledMs` resets on each shift completion and keeps counting through a
  shift - asserted against the values `sustained-bind` will snapshot.
- A side shift with no attack visible, or toward the already-covered side,
  is a no-op with no state change.

Leaving:

- A step preserves the held guard (carried-guard rule intact).
- An attack from guard removes coverage on the acceptance tick and launches
  with no added delay - its timeline marks equal a from-`ready` attack's;
  a void likewise; both charge `parryRecoveryMs`, and the timer decays
  during the action rather than after it.
- A hit clears the guard.
- A deflection consumes it on the same tick it does today.
- Bind coordination - guard consumed at entry, recovery charged in full on
  the exit tick - lives in `sustained-bind` §6 and is named here so neither
  spec assumes the other tested it.

AI and presentation:

- AI reads no future: two duels identical up to tick T, differing only in
  the attacker's inputs after T, produce identical AI decisions through T.
- Mode 3's hold durations and exits are seeded: same seed, same script,
  same ticks.
- Mode 1 holds through the incoming attack and releases only after it
  resolves.
- Row 2 renders all four labels; the held state renders no bar.
- Row 3 shows the old covered line throughout a shift; the destination
  appears only in the row 2 label.
- The help panel cites the shipping rise, shift and recovery values from
  `WEAPONS` and does not mention a window.
- Golden replay: hash re-recorded. This changes outcomes; that is its job.

---

## 13. Out of scope

- **Stamina drain, chip damage, or any automatic expiry.** Only if the §14
  gate fails, and only after the existing knobs are exhausted: line-shift
  durations up, redirect durations down, recovery after dropping guard up,
  movement restrictions while guarded. Those change the fight's reads; a
  stamina bar adds a resource game this design has avoided everywhere else.
- **Attacking while covered.** §7's rule stands until a later technique
  explicitly buys attack-and-defence in one tempo.
- **Explicit player selection of inside or outside.** Deferred. The engine
  models both sides, but reactive parries and shifts currently infer the
  target side from the visible attack (`attack-lines` §3).
- A reachable `middle` height (`attack-lines` §7) - three-line guards would
  change the shift guess, and that decision still belongs to the spec that
  enables the third line.
- Guard *positions* (vom Tag, longpoint). A line is what a guard covers, not
  where the blade rests.
- Per-weapon hold asymmetries (a rapier that cannot hold, a longsword that
  holds cheaper). One rule for both until play demands otherwise.

---

## 14. Playtest gate

Play this before `sustained-bind` is started. All three modes, both weapons.

What to look for:

- Holding one line feels safe but not universal: you can feel the other
  three lines being open.
- Changing line reliably defeats a static guard, and the kill reads as "the
  guard was elsewhere" - you can say which axis beat you.
- Guard shifts are readable and can be too late; winning one feels earned.
- Holding forever does not stalemate: an attacker with redirects always has
  a move against a camper, and the camper knows it.
- Stepping with a held guard does not make approaching risk-free - the
  carried guard still covers only one line while the body closes distance.
- Dropping the guard to attack feels like a real commitment: uncovered for
  the whole strike, with the guard unavailable until `parryRecoveryMs` runs
  out - the price reads as lost defence, never as a delayed attack.

If permanent guarding produces passive play, tune in this order: line-shift
durations, attack redirect durations, recovery after dropping guard,
movement restrictions while guarded. Do not reach for stamina or expiry
before those four have been tried - they are the costs this chain of specs
already built, and the gate exists to find out whether they are enough.

What would look wrong: both fighters settling into held guards and waiting.
That is the line economy failing to price the hold, and the first knob is
the cost of being read - redirect durations and shift durations - not a
timer on the guard.
