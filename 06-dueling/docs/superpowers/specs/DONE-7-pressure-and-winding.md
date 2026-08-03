# pressure-and-winding: Pressure and winding

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

`sustained-bind` gives matched steel a held beat of contact with no decision
in it. This spec puts the decision in: a **continuous, visible contest over
blade control**. Either fighter can apply pressure; pressure moves a shared
control marker along one axis; the fighter being pushed can yield at the
right moment and redirect the incoming force past themselves. The bind ends
when pressure reaches an endpoint, a yield completes, or - on an even
contest - its clock drains and both fighters shove each other apart (§6).

This is *Fühlen* and *Winden* as a physical tug rather than a guessing game.
(As built, second revision - the first shipped version resolved the bind as
a hidden simultaneous mixup: hold / press / wind locks judged on a
rock-paper-scissors matrix with firmness breaking the press-war. Play showed
it read as a coin flip: the choice was blind, so being outguessed felt like
luck, not like being read. The matrix, the hidden locks, `FIRMNESS_EPSILON`,
the early both-locked resolution and the neutral break are all removed by
this revision; what survives is everything the matrix sat on - the entry
snapshot, derived firmness, `canBind`, the winner's advantage and the
loser's exposure.)

**Delivers:** binds (part 2 of 2), pressure, winding.

**Depends on:** `sustained-bind`.

---

## 1. Firmness is derived, never rolled

Unchanged from the first revision. Each fighter has a `firmness` in [0, 1],
computed **from the contact snapshot `sustained-bind` stored on the entry
tick**; the states it reads are discarded at entry, so it is derived once
and lives on `duel.bind`.

```ts
function firmness(c: BindContact, w: WeaponProfile): number;
```

**From a `strike` snapshot:** `progress` - how far through the travelling
half the blade was when met. **From a `guard` snapshot:**
`min(1, settledMs / GUARD_SETTLE_MS)` with `GUARD_SETTLE_MS = 160`.

What changes is what firmness is *for*. It no longer breaks a press-war
tie; it sets the **starting position and the drift** (§3.1, §6). Since the
force-into-force revision only CROSSINGS bind, so in practice both entry
snapshots are strikes and firmness is travel progress: the standing,
delivered blade enters firm, the arriving one soft. (The guard snapshot
and its `GUARD_SETTLE_MS` derivation remain modelled - `BindContact`
keeps both kinds - against parry-entry ever returning; nothing reaches
them today.)

---

## 2. The bind is a control contest

### 2.1 One shared value

```ts
interface BindState {
  // ... entry snapshot fields from sustained-bind unchanged ...
  /** The contest. -1: side 0 wins by pressure; +1: side 1 wins; 0 neutral. */
  control: number;
  /** Per-side physical action track: ready, press phases, yield, recovery. */
  action: [BindAction, BindAction];
  /** Yield-zone widths in control units, derived at entry (§5.1). */
  yieldZone: [number, number];
  /** Sign of the last non-zero net force, for the §6 tie rule. */
  lastForceSign: -1 | 0 | 1;
  /** Anti-stall drift direction, derived at entry (§6). */
  driftSign: -1 | 1;
}
```

The bind owns `control` because it describes one shared physical
relationship - the same argument that put the clock and the snapshot on the
duel in `sustained-bind` §2.1. Side s wins by pressure when `control`
reaches s's endpoint (side 0 at -1, side 1 at +1); side s's **danger zone**
is therefore the band next to the *opponent's* endpoint.

### 2.2 Input, during a bind only

No new bindings: the attack keys are the bind keys.

| Key | Intent | Meaning in a bind |
|---|---|---|
| J (cut key) | `press` | start one pressure pulse |
| K (thrust key) | `yield` | start a committed yield attempt |
| nothing | - | hold: stay ready, give no force |

Bind inputs are **fresh keydowns only**: OS auto-repeat is discarded
(`e.repeat`) and holding a key issues nothing further. An input arriving
while that side's action track is busy waits in a **one-slot grace buffer**
(`BIND_INPUT_GRACE_MS`): it fires the moment the track is ready, the last
input wins the slot, and it expires unfired past the grace - so spamming
still cannot queue a train of actions. (As built, tap-tempo revision: the
first cut dropped busy-period inputs outright, which silently ate taps
misaligned to the 200ms action cycle - felt as an unresponsive mash, and
for K as a yield that never happened - while the AI pressed on exact
ready-ticks like a machine.) Every other intent from a bound fighter is
dropped: no step, void, attack, parry or voluntary disengage leaves a
bind. Input starts physical actions; whether and when anything happens to
`control` is decided by the simulation ticking forward, per `AGENTS.md`.

---

## 3. Weapon properties and the shared derivations

Three handling properties join `bladeStiffness` on the profile. They are
physical facts, not capabilities - no `canPressure`, no `canYield`, no
weapon-ID branch, no pair table:

```ts
interface WeaponProfile {
  // ...
  bladeStiffness: number;    // sustains contact at all (canBind, unchanged)
  bindAuthority: number;     // force one pressure pulse transmits
  bindHandling: number;      // how quickly pressure is applied and recovered
  rotationalControl: number; // how quickly the blade yields around contact
}
```

Shipping values: longsword 1.0 / 0.7 / 0.7, rapier 0.55 / 1.15 / 1.1. The
longsword's two-handed leverage presses hard and recovers slowly; the
rapier's light blade presses weakly, recovers fast and rotates best. These
are inputs; every in-bind consequence is derived in `src/combat/bind.ts`,
in shared functions the engine, the AI and the tests all call:

| Derivation | From | Result |
|---|---|---|
| `deriveInitialBindControl` | both firmnesses, both authorities | starting `control` (§3.1) |
| `deriveBindDrift` | both leads, contacts, tie rules | `driftSign` (§6) |
| `derivePressurePulse` | own authority and handling | commit / active / recovery ms, peak force (§4) |
| `pulseForce` | one action track | that side's current force |
| `netBindForce` | both action tracks | signed force on `control` |
| `deriveYieldZone` | own rotational control, opponent authority | zone width (§5.1) |
| `deriveYieldDuration` | own rotational control | yield motion ms (§5.2) |
| `resolveBindTick` | the bind, both weapons, dt | control integration, outcomes |

A future sword slots into every one of these by its numbers alone.

### 3.1 The starting position

Both sides do not always enter equal, so `control` does not always start at
0. Each side's **lead** is `firmness * bindAuthority` - how much of the
body and the weapon's leverage arrived behind the contact - and the start
is the normalised difference, capped so no entry begins inside a danger
zone:

```ts
control0 = clamp(0.5 * (lead1 - lead0) / max(lead0, lead1), -0.35, +0.35)
```

A standing, delivered blade against a barely-launched one starts the
contest most of the way toward the stander's win (capped); two blades that
met evenly start at 0.

---

## 4. Pressure

A `press` intent from an action-ready fighter starts one **pressure
pulse** - a committed physical action with a force curve, never an instant
push:

```text
commit    PULSE_COMMIT_BASE_MS / bindHandling   force 0 (gathering)
active    PULSE_ACTIVE_MS                       force = peak * sin(pi * t/active)
recovery  PULSE_RECOVERY_BASE_MS * peak / bindHandling   force 0 (spent)
```

with `peak = bindAuthority`. During commit, active and recovery the fighter
can neither press again nor yield - **applying pressure spends your
readiness to yield**, which is the central decision of the bind. The sine
curve means force rises and dies smoothly.

(As built, tap-tempo revision: the first cut used heavier pulses -
~180ms of force, half-second cycles, ~0.25 of the bar per press - and
played as press-and-wait. Playtest wanted a TAP-FAST tug, so a pulse is
now a quick micro-shove: the whole cycle is ~200ms for the longsword,
each tap moves ~0.08 of the bar, and the contest's weight lives in tap
rate, initiative and the yield threat rather than in any single press.
`BULLET_TIME_SCALE` rose in the same revision - deep slow-motion was
stretching the tap cooldown into multi-second wall waits.)

**THE BEAT IS EXCLUSIVE** (a further playtest revision): only one pulse
may be committed or active at a time. Whoever presses first claims the
beat and their shove moves the marker WHOLE; the opponent's press during
a claimed beat is a lost turn - forfeited outright, never queued - and
their answer comes in the claimant's recovery. With simultaneous opposing
pulses, a counter-press a few ms behind the first nearly cancelled it and
the marker only ever wiggled; now the tug is a race for beats, which the
AI's jittered cadence makes winnable and every won beat makes visible.
Contested same-tick presses are arbitrated with full information
(`applyBindInputs` - sequential handling silently handed every race to
side 0) and ALTERNATE against the last claimant; the first ever contested
beat goes to the side that entered without the initiative. `netBindForce`
therefore always carries a single side's force; equal effort produces a
visible oscillation that nets nothing, not a frozen marker.

The marker integrates the claimed force:

```ts
netForce = pulseForce(action[1]) - pulseForce(action[0])   // + pushes toward +1
control += (CONTROL_GAIN * netForce + drift) * dt
```

One side presses while the other holds: control moves toward the holder's
loss. Both press: the forces subtract, and near-equal authority mostly
stalls the marker while both burn their readiness. Neither presses: only
the §6 drift moves it, slowly.

One structural term shapes the integration: **endpoint resistance**.
Motion pushing further toward the nearer endpoint, once past
`ENDPOINT_RESIST_START`, scales down linearly to
`1 - ENDPOINT_RESIST_FACTOR` at the endpoint; motion away is never
scaled. The losing structure fights the last stretch, which is what makes
the yield zones - which live in that stretch - answerable by timing
instead of by frame-perfect reaction. Without it a single committed pulse
crossed a whole zone faster than any human or AI reaction.

---

## 5. Yield

Yield is not a counter button. It is a committed attempt to redirect real
incoming force, and it can fail three ways.

### 5.1 The zone and the opportunity

Each side has a **yield zone**: the band of `control` next to its loss
endpoint, width derived at entry from the yielding blade's rotation against
the opponent's authority:

```ts
width = clamp(YIELD_ZONE_BASE * rotationalControl_self
              * (0.75 + 0.25 * bindAuthority_opp), 0.12, 0.40)
```

A **yield opportunity** (the HUD's YIELD NOW) exists while: control is
inside the zone, and the OPPONENT'S gross pulse force is either flowing
now (above `YIELD_FORCE_MIN`) or flowed within the last `YIELD_MEMORY_MS`.
Gross, not net - your own simultaneous press opposes their push but does
not make it uncatchable. The memory is what makes the window humanly
hittable at tap tempo: raw force flickers on and off five times a second
(an unhittable strobe when the window was instantaneous), but a committed
push does not vanish between micro-shoves, so the band stays SOLIDLY lit
while the opponent genuinely presses and goes dark only when they
genuinely stop. No `canYield` flag exists anywhere - the opportunity is
this condition, evaluated live, and since the snapshot revision below it
IS the success condition, the lit band is an honest promise by
construction.

### 5.2 The attempt

A `yield` intent from an action-ready fighter **always** starts a committed
attempt - an early press is never silently dropped, because ignoring it
would make mashing K free. The attempt runs for
`YIELD_BASE_MS / rotationalControl_self` ms; while it runs the fighter
cannot press, yield again or cancel, and incoming force drives control at
only `YIELD_DRIVE_FACTOR` of its normal effect (the turning blade sheds
the push).

**Success is the snapshot of §5.1's window at the press** - caught force
inside your own zone - resolved when the motion completes. (As built,
third revision: the first control-contest cut integrated redirected
impulse across the motion and required half an opposing pulse's worth,
which meant success depended on the opponent CONTINUING to press - play
showed the counterplay was simply to stop, the band baited doomed
presses, and the bookkeeping was unexplainable at tap tempo. The
accumulation model, `deriveYieldRequirement` and its constants are
deleted; one sentence now covers the rule: tap K while your band
flashes.)

Three outcomes:

| Outcome | Condition | Result |
|---|---|---|
| missed | the press caught no window - outside the zone, or no real force flowing | the whole motion still commits, then fails: control jolts `YIELD_FAIL_PENALTY` toward the yielder's loss - deep in the zone that crosses the endpoint and loses the bind outright - then `YIELD_FAIL_RECOVERY_MS` of recovery |
| caught | the press landed inside the lit window | **the yielding fighter wins the bind** when the motion completes |
| too late | control reaches the endpoint mid-motion (the opponent's continued taps outran the turn) | the pressing fighter wins by pressure; the yield never finishes |

Endpoint crossings are checked before yield completion within a tick, so
the boundary tick goes to the presser.

---

## 6. The anti-stall drift and the bind clock

There is no voluntary exit, so a bind that nobody decides must still end.
Two mechanisms close it, one for each kind of stalemate.

**The drift, for passive stalemates.** The bind tracks its **calm time** -
ms both action tracks have stood ready, reset the moment either side
commits to anything. After `DRIFT_GRACE_MS` of calm a small deterministic
drift is added to the integration, growing the longer the calm lasts:

```ts
drift = driftSign * min(DRIFT_BASE + DRIFT_RAMP * (calm - GRACE) / 1000, DRIFT_MAX)
```

`driftSign` points toward the win of the fighter who entered with greater
effective contact initiative - the same `firmness * bindAuthority` lead as
§3.1. When the leads are exactly equal, one documented cascade of contact
facts decides, never weapon identity and never randomness: the direction of
the last non-zero net force; failing that, the fighter whose blade had
greater travel progress at contact (a guard counts as 0 - a position, not
travel); failing that, the fighter whose strike began later - the blade
whose travel completed the contact, the same comparison the entry event
already makes. The drift resolves as a normal **pressure win** at the
endpoint; there is no separate timeout outcome.

Running on calm time rather than bind time is what keeps the drift honest:
a fighter who acts suppresses it entirely - their pulses decide the bind -
while a fully abandoned bind resolves in a few seconds.

**The clock, for active stalemates.** (A playtest revision: the first cut
of this spec forbade any timeout, and two fighters trading equal pulses
could bind forever.) The bind carries a hard clock, `BIND_TIME_LIMIT_MS`,
drained visibly on the HUD (§8.1). At expiry - checked after everything
play could still decide that tick, so a winner on the expiry tick still
wins - the bind breaks **neutral**: no winner, no advantage, no exposure.
Both fighters shove each other apart into an involuntary retreat step
through their own step machinery (their weapon's step distance and
duration, footfall and settle included - simulated travel, never a
teleport), and a consumed guard still pays `parryRecoveryMs`. The break
is deliberately silent: no bindBreak ring means nobody won, and the
opening gap carries the rest. The drift decides passive binds well inside
the clock, so expiry is reached only by sustained, evenly matched play.

---

## 7. What winning is worth

The shape is the first revision's, whichever way the bind was won:

- the **loser** enters `exposed` - body-track, nonlethal, accepts nothing,
  `BIND_LOSS_MS = 520` - frozen in the pose the bind held them in;
- the **winner** exits `ready` carrying `bindAdvantageMs =
  BIND_ADVANTAGE_MS = 240`. While positive, exactly one thing consumes it:
  an immediate thrust, launching on `bindTimeline` (`riseStart = riseEnd =
  strikeStart = 0` - no rise cue, because no interval exists, not because
  audio special-cases it). Every other accepted intent clears the timer and
  proceeds on normal rules. The cut deliberately gets nothing: from the
  advantage a longsword cut launches on its full 900ms timeline, arrives
  380ms after the exposure ends, cannot be reactively parried but is
  cleanly voided, and its whiff hands the tempo straight back.

The numbers are sized so the timer is an HONEST promise, per pairing and
test-pinned: `BIND_ADVANTAGE_MS + bindTimeline(w).strikeEnd <=
BIND_LOSS_MS`, so a thrust launched on the advantage's LAST tick still
resolves inside the exposure and kills. (As built, reaction revision: the
first pair, 320/200, made only the first 60ms of the "200ms advantage"
lethal - 133 wall ms under bullet time, humanly unreactable, and the timer
claimed more than it gave. 520/240 puts the whole window at ~530 wall ms
under the aftermath's slowed clock, and the HUD spells the conversion out
- OPENING, K thrusts - while it drains.) A successful yield wins the
bind, never the duel - it enters this same reward.

(A fighter whose guard the entry consumed would pay `parryRecoveryMs` on
the resolution tick - unreachable while only crossings bind, kept for the
day parry-entry returns. `BIND_RECOVERY_MS` is gone with the neutral exit
that seeded it.)

| Constant | Value |
|---|---|
| `BIND_LOSS_MS` | 520 |
| `BIND_ADVANTAGE_MS` | 240 (advantage + thrust strike <= exposure, per pairing) |
| `GUARD_SETTLE_MS` | 160 |
| `CONTROL_GAIN` | 1.4 /s per unit force |
| `PULSE_COMMIT_BASE_MS` | 20 |
| `PULSE_ACTIVE_MS` | 100 |
| `PULSE_RECOVERY_BASE_MS` | 50 |
| `ENDPOINT_RESIST_START` / `ENDPOINT_RESIST_FACTOR` | 0.6, 0.65 |
| `YIELD_ZONE_BASE` | 0.40 (clamped 0.12..0.45) |
| `YIELD_BASE_MS` | 120 (about one tap cycle) |
| `YIELD_DRIVE_FACTOR` | 0.35 |
| `YIELD_FORCE_MIN` | 0.25 |
| `YIELD_MEMORY_MS` | 160 (longer than a mash's longest force-free stretch) |
| `BIND_INPUT_GRACE_MS` | 120 |
| `YIELD_FAIL_PENALTY` | 0.18 (under a zone's width: shallow in-zone fails survive, deep ones cross the endpoint) |
| `YIELD_FAIL_RECOVERY_MS` | 200 |
| `DRIFT_GRACE_MS` | 600 (of calm) |
| `DRIFT_BASE` / `DRIFT_RAMP` / `DRIFT_MAX` | 0.2 /s, +0.25 /s per calm s, 0.8 /s |
| `BIND_TIME_LIMIT_MS` | 5000 |

---

## 8. Presentation

### 8.1 The shared bind bar

One horizontal bar, centre screen, from the tick sustained contact locks to
the tick it resolves. It reads **live simulation values only** - `control`,
the action tracks, the derived zones - never a presentation copy that could
drift:

```text
PLAYER <-----------|-----------> ENEMY
                O
```

- the line is the control range, a centre mark at neutral, a circle at
  the marker position - which maps control to the WORLD: pressure moves
  the marker in the presser's facing direction (`bindMarkerOffset`,
  derived from the enemy's facing, never a screen convention), so the
  enemy pressing drives the marker toward the player's side - being
  pushed into your own territory is losing. (As built, revised: the first
  cut fixed player-left/enemy-right in control space, and the enemy's
  pressure moved the marker toward the enemy, backwards to the eye.)
- filled end caps are the pressure-win endpoints, each tinted by the
  fighter who WINS there - the far cap, whose territory the marker was
  driven through;
- shaded bands mark each side's yield zone, each on its owner's OWN side
  of the bar - the band lights as its owner is pushed back into it, and
  the label - YIELD NOW - carries the same information, never colour
  alone;
- the instruction line above the bar ALWAYS teaches the keys (escalating
  to the yield call while the window is live) and never swaps to a status
  readout - the per-side labels carry status;
- chevrons beside the marker show the current net force direction; the
  headline reads BIND: NEUTRAL / PLAYER PRESSURE / ENEMY PRESSURE;
- the bind clock drains under the range, symmetrically toward the centre
  (echoing the shove-apart it ends in), reddening near empty;
- under each end, that fighter's action state (READY / PRESSING / PRESS
  RECOVERY / YIELD NOW / YIELDING / YIELD FAILED / HOLDING) with a small
  recovery bar while one runs.

Nothing hidden is shown: every label reports a physical action already
begun, which since this revision is *all* the bind state there is - the
hidden intent died with the matrix.

### 8.2 Sprites and audio

Both fighters hold `sustained-bind`'s frozen contact poses; the strain
oscillation now leans with the live net force (renderer-only, pure in its
inputs). A yielding fighter gets a simple curved arc at the contact,
renderer-only, while the attempt runs.

Audio keeps the one-sound-per-event rules: `bindBreak` fires only on a
DECISIVE resolution tick, never on a keypress, and the clock's neutral
expiry is silent (§6). A failed yield emits a logged, unmapped `yieldFail`
DuelEvent; the log is the development-mode explanation of every lost
bind. Pulses and yields add no sounds of their own: they are held
motions, not moments, and the resolution is the moment.

### 8.3 Help panel

Per `CLAUDE.md`, `src/ui/help.ts` updates in the same commit. The bind
entry: pressure moves the marker, yield redirects committed pressure when
your band lights, pressing spends your readiness to yield. `exposed` is
unchanged.

---

## 9. AI

The duelist (modes 3 and 4) plays the same contest through the same
intents - `press` and `yield` - paying the same commitment and recovery,
with no error-rate flag anywhere. Its constraints:

- it reads only the **delayed observable bind state**: each tick's
  control, net force and own-zone flag enter a ring buffer, and decisions
  read the newest sample at least its drawn reaction (the existing seeded
  `AI_REACTION_*` draw) old - never the current tick, never any future
  input;
- at bind entry it draws a seeded **temperament** (pulse cadence and
  counter-pressure willingness), so across seeds it sometimes leans on
  sustained pressure, sometimes probes with spaced pulses, sometimes holds
  yield-ready; its cadence is never metronomic - the base sits NEAR the
  pulse cycle rather than at it, every gap is jittered, and a seeded
  breather interrupts the bursts, because a machine-perfect presser was
  unbeatable in the beat race by any human;
- it attempts a yield when its delayed read shows its own opportunity
  live, or when the trajectory of two delayed samples extrapolates into
  its zone with force still incoming - timing, the way a player watches
  the marker glide toward the band, built only from old samples; the
  reaction delay plus any commitment it already spent is exactly how it
  misses yields - emergent lateness, never scripted failure;
- every draw comes from the existing seeded rng, so replays reproduce.

Modes 1 and 2 hold: they never press and never yield. Against them the
drill is unchanged in spirit - punish passivity, now by pressing the
marker home instead of picking press in a menu.

---

## 10. Tests

Deterministic, computed from `WEAPONS` and the shared derivations - no
test may branch on a weapon ID to decide an interaction result:

- **Entry:** only a crossing binds - a matched-steel parry still deflects
  with met, parried and the penalty; initial control derives from both
  snapshots (a standing blade against an arriving one leans toward the
  stander; even entries start at 0); zone widths and pulse shapes match
  the derivations for every pairing `canBind` sustains.
- **Pressure:** one pulse moves control the right way; opposing pulses
  subtract; equal authority stalls within tolerance; commitment blocks
  yield; recovery blocks the next pulse; forces follow the sine curve.
- **Input integrity:** fresh keydown required, auto-repeat creates no
  pulse; the grace slot holds ONE input (last wins), fires it exactly
  once at readiness, and expires stale ones - a K mid-own-recovery rides
  the grace and still catches; no normal combat intent exits a bind.
- **Yield:** outside the zone fails with penalty and recovery; inside the
  zone without real incoming force fails; a caught window wins and enters
  the §7 reward, and the catch survives the opponent easing off
  mid-motion; the endpoint mid-motion is a pressure win for the opponent;
  the lit band is pinned honest - lit at the press means the yield wins.
- **Resolution:** an endpoint is a pressure win; every resolution seeds
  the winner's advantage and the loser's exposure; the consumed guard's
  recovery charges on the resolution tick; `bindBreak` fires on the
  resolution tick, never a keypress tick.
- **Anti-stall:** two passive fighters resolve through the drift toward
  the derived initiative; the tie cascade is exercised on constructed
  equal-lead contacts.
- **The clock:** an active stalemate (equal pulses in lockstep) expires at
  `BIND_TIME_LIMIT_MS` into the neutral shove-apart - both fighters step
  apart, the gap grows, no bindBreak, no advantage, no exposure, the
  consumed guard still charged; the timer fraction the HUD drains is a
  pure read; and the drift resolves passive binds before the clock, so
  the golden replay's drift resolutions are unchanged by its existence.
- **AI:** same seed, same fight; decisions read the delayed buffer (a
  change on the current tick cannot alter this tick's decision); over
  seeds the duelist presses, holds and yields; it pays commitment like the
  player.
- **HUD:** the bar, zones, chevrons, labels and recovery bars are pure
  functions of live simulation state.
- **Golden replay:** hash re-recorded, cause documented.

---

## 11. Out of scope

- **Directional winding.** The yield is one motion; when winding forks on
  contact geometry, `sustained-bind` §2.3's reserved blade relation is its
  data. Unchanged from the first revision.
- *Duplieren*, *Mutieren*, multiple exchanges in one bind, re-binding from
  a bind.
- Grappling, half-swording, the *Krieg*.
- Simulation-level slow motion. The sim-side knobs are the pulse and drift
  constants, never a time scale. (Wall-clock bullet time - the eased
  accumulator feed in `src/ui/bullettime.ts`, with its enter/exit cues -
  is presentation, exists, and is invisible to the simulation;
  `sustained-bind` §3 owns that argument.)
- Retuning the mixed pairing: it deflects under the shipping stiffnesses
  and never reaches this spec; if that changes, it changes through
  `canBind`'s numbers.

---

## 12. Playtest gate

Both mirrors, long sessions, against mode 3.

- The central decision bites: you catch yourself holding fire because your
  own danger window is near, and pressing anyway when the marker favours
  you. If you always press or always hold, the pulse cost or the zone
  width is mistuned.
- A won yield feels like using their strength - you saw the chevrons, you
  turned it. A failed one reads its reason from the log and the labels.
- Losing traces to something visible: their pressure, your spent recovery,
  your late yield. Nothing should feel like a hidden roll - there is none.
- The mirrors feel different in the hand: the longsword bind is a slow
  heavy argument, the rapier bind a twitchy scramble.
- Watch the risk list: passive-yield camping, pulse spam, K-mashing, a
  solved fixed rhythm, one stat deciding everything, binds overstaying
  their welcome. The knobs are §7's table; the structure is not a knob.
