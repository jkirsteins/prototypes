# Fighter state tracks - Spec

## Overview

The fighter is modelled as one flat `FighterState` union of 8 kinds plus a 5-value
`AttackPhase`, giving 12 labels. Problems: two concepts that are timers are modelled
as states, two attack phases carry no combat invariant of their own, one attack
timeline is re-derived in three places, and the HUD has grown three unrelated idioms
for "a timed thing is happening".

This spec restructures the fighter into **explicitly separated tracks**, reduces the
attack cascade to `windup -> strike -> recovery`, replaces the timer-shaped states
with timers, and makes the attack timeline an atomic snapshot. Presentation moments
that used to be phase transitions (the rise cue, the pre-strike stillness) become
**timeline marks**; every emitted `DuelEvent` keeps its exact current timing.

The phase criterion this spec enforces: **a phase exists only if it owns a distinct
combat invariant** (what is meetable, what is cancellable, what is accepted). An
audio or animation boundary alone never justifies a phase; those are marks on the
timeline. Otherwise every keyframe could become an `AttackPhase`.

Two gameplay changes are specified in §8. They are sequenced after the restructure
and must not land with it. The help overlay is a separate spec:
`2026-08-02-help-overlay.md`.

---

## 1. Current state

`src/combat/fighter.ts:7-24`

```ts
type FighterState =
  | { kind: "idle" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "pause"; t: number }
  | { kind: "void"; t: number }
  | { kind: "attack"; attack: AttackKind; phase: AttackPhase; t: number;
      recoveryMs: number; tell: boolean; met: boolean }
  | { kind: "parry"; t: number }
  | { kind: "hitstun"; t: number }
  | { kind: "dead"; t: number };
```

`src/combat/types.ts:3`

```ts
type AttackPhase = "pretempo" | "windup" | "beat" | "strike" | "recovery";
```

### 1.1 Problems, with evidence

| # | Problem | Evidence |
|---|---|---|
| P1 | `pause` is a timer modelled as a state | Created at one site (`fighter.ts:119`), lasts `stancePause`, exists only to cap step-chaining cadence |
| P2 | `parry` is a timed action occupying the body track, so it cannot coexist with locomotion | `fighter.ts:62-64` refuses parry unless `pause` |
| P3 | The attack timeline is encoded three times | `fighter.ts:165-189`, `ai.ts:84-91`, `frames.ts:95-99` - the last carries a comment warning it "must mirror the engine's meetable check" |
| P4 | `pretempo` and `beat` are phases with no combat invariant | During both, the fighter is committed, immobile, unmeetable - identical to `windup`. Their boundaries matter only to audio (`windup` event, rise/stillness) and one held frame |
| P5 | Three HUD idioms for one concept | `drawPhaseLabel` (label, no bar), `drawStrikeTiming` (segmented bar, strike only), `drawGuardState` (small label + fill bar, parry cooldown only) |
| P6 | `PHASE_COLORS` is `Record<string, string>` | `draw.ts:26` - any rename compiles clean and silently renders grey |
| P7 | Names mislead | `pause` collides with time-control `state.paused` (`main.ts:47`); `parryCd` does not say what it gates; `idle` understates "combat ready" |

### 1.2 Constraints this spec must preserve

- **The audio contract** (`AGENTS.md`): every cue fires on the tick the simulation
  reaches the physical moment. The `windup` DuelEvent fires when the blade starts
  rising - for a telegraphed AI attack, `telegraphMs` after acceptance
  (`engine.test.ts:203`). The `swing` DuelEvent fires when the blade starts
  travelling (`engine.test.ts:171`). The rise sound's length is `timings.windup`
  and the stillness before the strike lasts `timings.beat`
  (`src/audio/manifest.ts:49-53`). All of these are **timings**, not phases; §3.2
  keeps every one of them to the tick.
- **The step/parry exclusion is deliberate**, not a flattening artifact
  (`fighter.ts:57-61`). Changing it is a gameplay decision, specified in §8.2.
- **Parry interrupts the post-step pause today** (`fighter.ts:62-64`). The
  pause-to-timer conversion must keep this exception or it is not
  behavior-preserving; see §3.4.

---

## 2. Data models

### 2.1 Fighter

```ts
interface Fighter {
  x: number;                    // cm along the piste
  facing: 1 | -1;
  weapon: WeaponProfile;

  state: FighterState;          // body track (§3.1)
  parry: ParryTrack | null;     // defence track (§3.3) - only after §8.2
  buffered: Intent | null;      // one slot, last input wins

  stepRecoveryMs: number;       // > 0: non-parry actions buffer instead of starting
  parryRecoveryMs: number;      // > 0: parry specifically is unavailable
}
```

Both timers are named for **what they gate**. `stepRecoveryMs` defers non-parry
actions; `parryRecoveryMs` blocks only the parry. The asymmetry is why they are two
fields, and it is what the HUD must keep legible (§6).

### 2.2 Body track

```ts
type FighterState =
  | { kind: "ready" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "void"; t: number }
  | { kind: "attack"; attack: AttackKind; phase: AttackPhase; elapsedMs: number;
      timeline: AttackTimeline; met: boolean }
  | { kind: "parry"; t: number }   // removed by §8.2
  | { kind: "hitstun"; t: number }
  | { kind: "dead"; t: number };

type AttackPhase = "windup" | "strike" | "recovery";
```

Changes from current: `pause` removed (becomes `stepRecoveryMs`), `idle` renamed
`ready`, `tell` and `recoveryMs` removed (absorbed into `timeline`), `pretempo` and
`beat` removed from the phase union (become timeline marks). The attack's clock is
`elapsedMs`, not `t`: absolute milliseconds since attack start, one meaning only
(§3.2).

### 2.3 Attack timeline

```ts
interface AttackTimeline {
  riseStart: number;      // ms from attack start; == windupBonusMs; windup event + rise cue
  riseEnd: number;        // riseStart + timings.windup; stillness begins (presentation mark)
  strikeStart: number;    // riseEnd + timings.beat; swing event; commitment boundary
  parryableUntil: number; // strikeStart + timings.strike * PARRYABLE_FRACTION
  strikeEnd: number;      // strikeStart + timings.strike; resolution
  recoveryStart: number;  // == strikeEnd normally; §8.1 cancellation moves it earlier
  recoveryEnd: number;    // recoveryStart + recovery, as resolved (see below)
}
```

Computed once in `startAction`, stored on the attack state, consumed by the walker,
the AI, and the renderer. Agreement by construction.

**The object is never mutated in place.** At strike resolution - the single write
site, in the engine's `strikeEnd` handling - it is **replaced atomically**:

```ts
s.timeline = { ...s.timeline, recoveryEnd: resolved };
// whiff:   recoveryStart + base * whiffRecoveryFactor
// parried: recoveryStart + base + parriedPenalty
// hit/clean: unchanged (no replacement)
// §8.1 cancel is the one case that also moves recoveryStart - see §8.1
```

`recoveryStart` exists so recovery progress is always well-defined: the HUD bar is
`(elapsedMs - recoveryStart) / (recoveryEnd - recoveryStart)` whether the recovery
began at `strikeEnd` or at a §8.1 cancel. `riseEnd` has no combat meaning; it
exists so audio/animation can place the stillness without re-deriving weapon
timings. `strikeStart` is where `windup` ends, where `strikeBegin`/`swing` fire,
and (after §8.1) where cancellation closes.

### 2.4 Weapon profile renames

| Current | New | Reason |
|---|---|---|
| `pretempo` | `telegraphMs` | It is the AI's tell budget, not a tempo concept |
| `stancePause` | `stepRecoveryMs` | Names the source of the restriction |
| `parryCooldown` | `parryRecoveryMs` | Gates only the parry; say so |
| `parryWindow` | `parryWindowMs` | Unit suffix, consistent with the above |

`AttackTimings` keeps `windup`, `beat`, `strike`, `recovery` as **timing
components**: `beat` is the pre-strike stillness length the audio layer depends on.
They feed the timeline; only the phase union stops naming them.

---

## 3. Systems

### 3.1 Body track

**Responsibilities:** position, committed action, what intents are accepted.
**Inputs:** `Intent`, `dt`. **Outputs:** `FighterEvent[]`, mutated `x`.

| State | Duration | Transitions to | Accepts intents |
|---|---|---|---|
| `ready` | untimed | any action | see §3.4 acceptance rules |
| `step` | `stepDuration` | `ready`, seeds `stepRecoveryMs` | buffers non-parry (one slot); parry ignored |
| `void` | `voidDuration` | `ready` | none (committed) |
| `attack` | timeline | `ready` | none; §8.1 adds cancel, during windup only |
| `hitstun` | `HIT_STUN_MS` = 350 | `dead` | none |
| `dead` | terminal | none | none |

### 3.2 Attack phase cascade

`windup -> strike -> recovery -> ready`

| Phase | Ends at | Combat invariant |
|---|---|---|
| `windup` | `timeline.strikeStart` | not dangerous, not meetable; locked before §8.1, cancellable after it |
| `strike` | `timeline.strikeEnd` | meetable while `elapsedMs <= parryableUntil`; resolves at `strikeEnd` |
| `recovery` | `timeline.recoveryEnd` | exposed; nothing accepted |

**Commitment is the `windup -> strike` transition.** Not a phase, not a flag, not a
stored timestamp. Before §8.1 lands nothing is cancellable, so the boundary is
latent; §8.1 makes it real.

**One meaning for time.** The attack's clock is `elapsedMs`: absolute milliseconds
since attack start, incremented by `dt` every tick, never reset and never reduced.
There is no phase-local time. The phase advances by comparing `elapsedMs` against
the absolute marks, so tick quantisation cannot accumulate - there is nothing to
carry. Every consumer (walker, AI, renderer, HUD, §8.1 cancellation) reads the same
clock against the same marks.

**Event emission from marks.** `FighterEvent`s fire when `elapsedMs` crosses a mark,
at the exact tick the current phase transitions produce:

- `strikeBegin` (-> engine `swing`): crossing `strikeStart`, i.e. leaving `windup`.
- `strikeEnd`: crossing `strikeEnd`, i.e. leaving `strike`.
- The engine's `windup` DuelEvent: currently a before/after `inWindup` comparison
  (`engine.ts:84-92`) because windup begins three ways. The predicate becomes
  `inRise(f) = attack && phase === "windup" && elapsedMs >= timeline.riseStart`;
  the comparison mechanism stays. Player attacks (`riseStart === 0`) fire on the
  acceptance tick, telegraphed AI attacks fire the tick `elapsedMs` crosses
  `telegraphMs`, buffered attacks when the buffer fires - all exactly as today.

**Resolution barrier:** recovery completion must not be evaluated on the tick
`strikeEnd` fires - the engine may replace the timeline (whiff, parried) in
response to that event before the next tick reads `recoveryEnd`.

### 3.3 Defence track (only after §8.2)

```ts
interface ParryTrack { t: number }
```

Raised (`t = 0`) -> expires at `parryWindowMs` -> seeds
`parryRecoveryMs = weapon.parryRecoveryMs`. A successful parry releases it early
(engine parried branch), same charge.

**Whether a parry meets an attack is decided in exactly one place:**

```ts
/**
 * True if the defender's raised parry meets this attack on this tick.
 * MVP limitation: coverage is universal - a raised parry stops any cut or
 * thrust whose timing and reach line up. Attacks do not yet have lines
 * (high/low, inside/outside), so a feint can provoke an early parry and
 * punish its recovery, but cannot deceive the defender about where the
 * real attack arrives. When lines land, they become one more condition
 * HERE - attack.line in parry.coveredLines - and nowhere else.
 */
function parryMeetsAttack(
  attacker: Fighter,   // state.kind === "attack", phase === "strike"
  defender: Fighter,
  gap: number,
): boolean;
```

It owns the timing check (`elapsedMs <= timeline.parryableUntil`), the reach check
(`gap <= attacker.weapon.reach`), and the blade-contact check (defender's parry
raised). `markMetBlades` becomes a thin caller that sets `met`; nothing else may
re-derive these conditions. The rule itself is unchanged.

Named `parry`, not `guard`: it expires and cools down, so it is a timed action.
`guard` stays reserved for weapon positions (longpoint, vom Tag).

### 3.4 Timers and acceptance rules

Both timers decay in the `tickFighter` preamble, unconditionally, in every state.

Acceptance from `ready` - this is where behavior preservation lives:

| Intent | `stepRecoveryMs === 0` | `stepRecoveryMs > 0` |
|---|---|---|
| step / void / cut / thrust | accepted | **buffered** (one slot, last wins) |
| parry | accepted if `parryRecoveryMs === 0`, else ignored | **same - the timer does not gate parry** |

The parry exception preserves today's rule that a parry may interrupt the post-step
pause (`fighter.ts:62-64`). Without it, converting `pause` to a timer would remove
a defensive option and silently change gameplay.

**Buffer flush:** fires on the tick `stepRecoveryMs` reaches 0 **only if the body
state is `ready`**. A parry raised during the interval leaves the buffer in place
past the flush moment, exactly as today (parry expiry does not flush; keyup clears
the buffer in `main.ts:122-126`).

**Remainder at step end is load-bearing:** a step overrunning its duration by `r` ms
seeds `stepRecoveryMs = weapon.stepRecoveryMs - r`, not the full value, or the step
cycle gains up to one tick.

---

## 4. Interfaces

```ts
function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { windupBonusMs?: number },
): "accepted" | "buffered" | "ignored";

function tickFighter(f: Fighter, dt: number): FighterEvent[];

function attackTimeline(
  w: WeaponProfile,
  a: AttackKind,
  windupBonusMs: number,
): AttackTimeline;

function parryMeetsAttack(
  attacker: Fighter,
  defender: Fighter,
  gap: number,
): boolean;   // §3.3 - the single site deciding blade contact
```

`opts.tell` is replaced by `opts.windupBonusMs`. The behavior layer supplies it
(`engine.ts`: `side === 1 ? weapon.telegraphMs : 0`); the fighter simulation never
learns who controls it. Precondition `windupBonusMs >= 0`; invariant
`timeline.riseStart === windupBonusMs`.

---

## 5. Determinism

Fixed 60 Hz tick, `TICK = 1000 / 60`. AI seeded (mulberry32, `ai.ts:57-64`,
`?seed=`). Time control gates the accumulator only (`main.ts:138-145`).

Reproducibility guarantee: a given `(seed, weapon pair, intent script)` produces an
identical per-tick **observable** sequence, defined in §7.1.

---

## 6. HUD: one idiom per track

Replaces `drawPhaseLabel` + `drawStrikeTiming` + `drawGuardState` with two rows,
identical style, font and width:

- **Row 1, body track.** Current state or phase, plus a progress bar. `windup`,
  `strike`, `recovery`, `step`, `void`, `hitstun` all get one. `ready` gets a bar
  only while `stepRecoveryMs > 0`.
- **Row 2, defence track.** Parry window draining while up; `parryRecoveryMs`
  filling while recovering; nothing when available.

Row 1 is the **body-action track**: while its bar runs, non-parry actions are
deferred or refused. Row 2 gates only the parry. (Row 1 cannot claim "no action is
possible" - `ready` with `stepRecoveryMs > 0` still accepts a parry, per §3.4.)

Rules:
- `strike`'s bar keeps its internal structure: meetable / delivered split at
  `PARRYABLE_FRACTION`. Everything else is a plain fill.
- `windup`'s bar may show a tick at `riseEnd` (the stillness onset) - a mark, not a
  segment boundary.
- `recovery`'s bar is `(elapsedMs - recoveryStart) / (recoveryEnd - recoveryStart)`,
  so a whiff visibly shows its 2-3x exposure, a parried attack shows
  `parriedPenalty`, and a §8.1 feint shows its short truncated recovery - all from
  the same formula.
- Derived commitment cue, **visual only**:
  `const committed = s.kind === "attack" && (s.phase === "strike" || s.phase === "recovery")`.
  No field, no flag; the phase boundary stays the single source of truth.
- Overlay-gated (backtick), as today.

`PHASE_COLORS` and `ATTACK_LISTING` must be typed
`Record<AttackPhase | FighterState["kind"], string>` so a rename is a compile error.

---

## 7. Testing strategy

### 7.1 Determinism gate (write first)

A golden-replay test: run seeded duels for N ticks and hash a **normalized
projection** per tick:

```ts
interface TickProjection {
  x: [number, number];
  over: boolean;
  winner: 0 | 1 | "draw" | null;
  events: Array<{ kind: DuelEvent["kind"]; side: 0 | 1; time: number }>;
}
```

**State kinds and phase names are deliberately excluded** - the restructure renames
them, so a hash over names cannot survive even behavior-preserving changes. Positions
and the full event stream are name-independent, and any timing drift surfaces through
them: a shifted phase boundary moves an event's `time`, a broken remainder moves
`x`.

Known gap, accepted: a buffered action's start emits no acceptance DuelEvent today
(`flushBuffer` drops events), so a regression confined to that silent path would
show up only via later events/positions - which it does, within a few ticks.

Record the hash before any change. Every restructure step must leave it unchanged.

### 7.2 Regression tests that must pass unedited

- `test/engine.test.ts` "the parryable interval" - timing expectations unedited.
- `test/engine.test.ts` "presentation events follow the simulation, not the input" -
  the AGENTS.md contract; the mark-based emission must satisfy it to the tick.
- `test/frames.test.ts:50-71` - travelling/delivered frame agreement.

Tests that construct phase names (`fighter-attack.test.ts:25` asserts
`["windup","beat","strike","recovery"]`; hand-built literals in `frames.test.ts` and
`fighter-defense.test.ts`) are updated mechanically to the new union; their timing
numbers must not change.

### 7.3 New tests

- **Timer boundary:** `step -> stepRecovery`; `stepRecovery -> ready` (flush);
  both crossed by one oversized `dt`; parry raised mid-interval strands the buffer.
- **Timeline agreement:** for every weapon and attack, walker, AI and frame plan
  read identical boundaries from one snapshot.
- **Mark emission:** `windup` event at `riseStart`, `swing` at `strikeStart`, clash
  at `parryableUntil` - same ticks as the current phase-transition emission, asserted
  against recorded times from the pre-change build.
- **`parryMeetsAttack` unit tests:** each of its three conditions (timing, reach,
  contact) falsified independently while the other two hold; these become the
  contract future line logic must keep passing.
- Per §8 when they land: §8.1 cancel inside windup truncates to recovery with
  `feintRecoveryMs`; cancel refused from `strike` on; §8.2 parry raised before a
  step persists through it, parry pressed mid-step ignored.

### 7.4 Manual

Browser pass at `http://127.0.0.1:5173/prototypes/06/`, backtick overlay. No grey
phase labels; AI telegraph still legible (rise fires after the tell, stillness before
the strike audible); two HUD rows track independently.

---

## 8. Gameplay changes (separate, sequential)

### 8.1 Cancellable windup - RESOLVED: cancel into a short feint recovery

`canCancel = phase === "windup"`. A cancel intent (dedicated key; not movement -
tapping a direction mid-windup must not abort the attack) during windup truncates
the attack:

```ts
s.phase = "recovery";
s.timeline = {
  ...s.timeline,
  recoveryStart: s.elapsedMs,
  recoveryEnd: s.elapsedMs + f.weapon.feintRecoveryMs,
};
```

This is the one case that moves `recoveryStart`; the HUD's recovery formula (§6)
then works unmodified.

No new state, no new phase; the HUD shows a short recovery. New weapon field
`feintRecoveryMs` (starting values: longsword 160, rapier 120 - tune in play).
After the feint recovery the fighter is `ready`; it does **not** convert directly
into parry, void or another attack. That keeps the feint a tempo play - you sell a
windup and regain readiness sooner than a real attack would - without making
attacking risk-free, and it is strictly simpler than direct conversion.

The rise cue chokes on cancel, reusing the existing mid-windup-death choke path
(`manifest.ts:53`).

Watch in play: if `feintRecoveryMs` is too short, every windup becomes a free probe.
The knob is per-weapon and local.

### 8.2 Parry while stepping - RESOLVED: rule D

Parry moves to the defence track (§3.3). **A parry may be raised only from `ready`;
a parry already up persists through a subsequent step.** Pressing parry mid-step
stays ignored.

You cannot react while your feet are committed - you can only carry a defence you
already chose. This preserves the reactive half of the footwork-or-blade tension
while allowing the normal-looking guarded advance.

**Intent check, resolved:** this is a deliberate departure from strict
move-or-defend (rule B). The choice becomes "pre-plan defence before moving", per
the 2026-08-02 decision that some overlap should be allowed because a carried guard
during a step is visually and historically normal. Rule B remains one deletion away
- removing this section restores the status quo; nothing in §1-§7 depends on it.

Consequences:
- `applyIntent` parry rule: unchanged from §3.4 (accepted from `ready` only).
- Starting an attack or void with the parry up drops it and seeds
  `parryRecoveryMs` - committing to your own blade abandons the defence, priced.
- `markMetBlades` calls `parryMeetsAttack`; `parryMeetsAttack` reads the
  defender's parallel parry track. The reach/interval rules are unchanged, and no
  caller bypasses the §3.3 decision point.
- Render: parry pose drives the arms, step drives the legs; HUD row 2 unchanged.
- `parryRecoveryMs` is not the balance knob here; if guarded stepping proves too
  strong the lever is rule C (shortened window) layered on D, decided by play.

---

## 9. Sequencing and concurrency

Concurrent-session audio work (`a823d65`, `dc08882`, `ec657b7`, 2026-08-02)
established the `windup`/`swing` events and the timing contract in §1.2. This
restructure touches the same files (`fighter.ts`, `engine.ts`, `types.ts`).
**Sequence, do not parallelise:** land the audio work first, then:

1. Strict typing (P6 in §6) - makes every later rename compiler-checked.
2. Golden replay (§7.1) - record the projection hash.
3. Timeline snapshot + mark-based emission (P3, §2.3, §3.2), and extract
   `parryMeetsAttack` (§3.3) reading the defender's parry from wherever it
   currently lives - hash unchanged. Cutting the seam here means §8.2 later
   changes only that function's internals, not its callers.
4. Phase fold: `pretempo`/`beat` out of the union (P4) - hash unchanged.
5. Timers and renames: `pause` -> `stepRecoveryMs` with the parry exception,
   `idle` -> `ready`, profile renames (P1, P7) - hash unchanged.
6. HUD (P5, §6) - presentation only.
7. Help overlay - separate spec, after the renames so `HELP` is written once.
8. §8.1, played, then §8.2, played.

---

## 10. Out of scope

- Weapon positions (longpoint, vom Tag, high guard); the name `guard` is reserved.
- **Attack lines** (high/low, inside/outside) and per-line parry coverage. The MVP
  parry is universal by timing alone; `parryMeetsAttack` (§3.3) is the reserved
  extension point, so lines arrive as one added condition in one function. Until
  then, line-deceptive feints (thrust feint on one line, cut on another) cannot
  exist - a §8.1 feint works purely by provoking an early parry and punishing its
  recovery. A future single-button parry will snapshot coverage inferred from the
  attack line visible when parry is pressed; it must not inspect future attack
  state or retarget automatically.
- Cancellation into parry/void or attack-to-attack feints (§8.1 chose feint
  recovery; revisit only with play evidence).
- A third parallel track for locomotion. Only the parry needed to overlap; every
  other exclusion is deliberate and comes free from the flat body track.
- AI behavior states (observing / deciding / committed). The AI remains a pure
  per-tick function; design intent noted at `ai.ts:17-25`, unimplemented.
- The help overlay content model - see `2026-08-02-help-overlay.md`.
