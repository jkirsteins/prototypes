# attack-lines: Attack lines - height stance and blade side

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` prefix means not yet
> implemented, `DONE-N-` implemented; N is the order. Prefixes change as work
> lands, so only the slug is stable and only the slug may be referenced.

## Overview

Blade contact is currently universal: a raised guard stops any attack whose
timing and reach line up, regardless of where either blade is aimed. §3.3 and
§10 of the state-tracks spec name this as the MVP limitation and reserve
`parryMeetsAttack` as the extension point.

This spec adds the geometry. A line is a **pair**: a height and a side.

**Delivers:** attack lines; parries (part 2 of 2).

**Depends on:** `parry-rise`. This spec is deliberately sequenced **before**
`blade-contact`: blades carry a line before they learn to cross, so the crossing
rule can require line agreement from its first version instead of shipping a
universal-clash interim in which every same-tempo trade rang steel.

---

## 1. The model

```ts
type Height = "high" | "middle" | "low";
type Side   = "inside" | "outside";

interface Line { height: Height; side: Side; }
```

Two axes, modelled fully in the engine, exposed to gameplay only in part:

| Axis | How it is chosen | Reachable today |
|---|---|---|
| Height | a **stance** the fighter holds, moved with the arrow keys | `high` and `low` |
| Side | declared per attack: thrust is `inside`, cut is `outside` | both, but coupled to the attack key |

`middle` is declared and currently unreachable. That is deliberate: the label
vocabulary, the contact rules and the HUD are all written over the full enum, so
enabling a third stance is a change to how far the arrows travel plus one guard
pose, not a change to the model. It is not enabled now because it would halve the
value of the feint answer in `line-feints` (§7).

### 1.1 Why the axes are declared, never inferred

```ts
interface AttackTimings {
  windup: number; beat: number; strike: number; recovery: number;
  side: Side;    // NEW: thrust "inside", cut "outside"
}
```

Height comes from the stance at launch; side comes from the attack's own
declaration. **Nothing in the engine or renderer may read `attack === "cut"` to
infer a side, or read the attack kind to infer a height.** An outside thrust, an
inside cut, or a slice with its own side is then a data change and a sheet, not a
new concept. A fixture weapon in the tests proves this by declaring an inside cut.

---

## 2. The stance track

One height per fighter, shared by attack and defence. Your attacks launch from
where you stand and your guard covers where you stand. Moving the stance to
threaten high also tells the opponent where you will defend, which is the tension
worth having and the reason it is one value rather than two.

```ts
interface Fighter {
  // ...
  height: Height;              // where the stance is now
  heightTo: Height | null;     // where it is going, null when settled
  heightT: number;             // ms into the transition
}
```

**Changing stance is not instantaneous.** Arrow up and arrow down start a
transition lasting `heightChangeMs`. During it:

- the fighter's height is still the **old** value for every contact decision. A
  stance in motion covers nothing new until it arrives.
- the transition is visible on the HUD (§5) and in the pose, so an opponent can
  read it and react to it. That legibility is the entire reason it takes time.
- a second arrow press reverses or redirects it, restarting `heightT`.

Stance changes are accepted in `ready` and during `stepRecoveryMs`. They are
refused during `attack`, `void`, `hitstun` and `dead` - those commit the body,
and the whole point of committing is that you cannot re-aim - and refused while
a parry is up: a formed guard is committed to its height in this spec.
`line-feints` is where moving a raised guard becomes possible, priced as the
guard shift.

An attack **snapshots** its height into the timeline at launch, alongside every
other mark. Changing stance afterwards does not steer a blade already in the air;
only `line-feints`'s redirect does that.

### 2.1 Input

Arrows are unused in `main.ts` today, so nothing is displaced:

| Key | Was | Is |
|---|---|---|
| Arrow up / down | unused | raise / lower the stance |
| Left Shift | unused | cycle the stance - a toggle while two heights exist |
| `j` / `k` | cut / thrust | unchanged; they now carry `outside` / `inside` |
| `l` | parry | unchanged, single key |

Left Shift is input sugar: it resolves at the keypress to the same
`stanceUp`/`stanceDown` intents the arrows send, aimed away from wherever the
stance is or is heading, so the simulation never learns a new verb. The arrows
stay - they are the aimed form, and the day `middle` becomes reachable they
address it directly while Shift cycles through it.

An earlier draft of this spec split the parry across two keys. That is withdrawn:
the parry takes its height from the stance, so one key is correct and the second
was a duplicate of the arrows.

---

## 3. What a parry covers

**A parry covers one complete line. Height and side must both match the
parry's snapshotted covered line.**

The player chooses the height through the stance. The game infers the side from
the visible threat. Both are fixed at the press:

```ts
interface ParryTrack {
  elapsedMs: number;
  /** Where the blade physically stood at the press: current height, guardSide. */
  fromLine: Line;
  /** The one complete line this parry is forming toward, fixed at the press. */
  targetLine: Line;
  /** When targetLine is covered: max of the rise, the side rotation, and the
   *  height arrival, computed once at the press. Before this, nothing is. */
  effectiveAtMs: number;
}

function parryMeetsAttack(attacker, defender, gap) {
  return ...existing conditions from `parry-rise`, including
         parry.elapsedMs >= parry.effectiveAtMs...
    && lineOf(attacker).height === defender.parry.targetLine.height   // NEW
    && lineOf(attacker).side   === defender.parry.targetLine.side;    // NEW
}

function lineOf(f: Fighter): Line;  // height from the attack's snapshot, side from its timings
```

The target and the coverage are deliberately separate fields, for the same
reason the press and the formed guard are separate moments: at the press the
track holds a target the blade has not reached. **Only `targetLine` past
`effectiveAtMs` is covered.** Naming the unarrived target "covered" would be
the instantaneous parry's lie moved one level down.

**The press also latches.** A parry pressed against a visible attack
snapshots that attack's identity (the absolute time it began) as
`targetAttackStartTime`, and a latched parry has NO timed expiry: it waits for
that attack and ends with it - contact, miss, cancellation, or the attacker
struck down - at the normal recovery price. Only the predictive cold press,
with no attack to wait for, runs `parryWindowMs`. The latch never retargets:
a later redirect leaves the guard covering the line it snapshotted, which is
what makes deception possible at all. This preserves the early-late tradeoff
in its honest form: early forms safely but stands readable (and, from
`line-feints`, feintable); late risks not forming.

**How the covered line is chosen, at the press:**

- **Height** comes from the defender's stance - and a press during a stance
  transition **targets the destination**, `heightTo`. The distinction is the
  same as the side's: the parry may *target* a height the body has not
  reached, but that height is not *covered* until the arrival, which is one
  of the three terms in `effectiveAtMs`. A stance in motion still counts as
  its old height for everything else (§2).
- **Side is inferred immediately, but covered only after its travel.** The
  target side comes from the opponent's currently visible attack: if the
  opponent is in `windup` or `strike`, the parry targets that attack's declared
  side. Only information visible on that tick is read - the inference must
  never inspect a redirect that has not happened yet or any hidden final line.
  If the target differs from the fighter's standing `guardSide`, the blade must
  travel for `sideChangeMs` (a new weapon field: longsword 120, rapier 100;
  `heightChangeMs` is longsword 300, rapier 270)
  before that side is covered; if it matches, there is nothing to travel.
- **If no attack is visible**, the target side is `guardSide` itself: a field
  on the fighter, initial value `inside`, updated to the new side whenever a
  parry's side travel completes (at the press when no travel was needed). Your
  guard defaults to where it last was.

The inferred line is the parry's **target**, fixed at the press. The guard
never automatically follows the attack afterwards: if the attack changes line
after the press (a `line-feints` redirect), the parry keeps its target, and
misses. That is the entire point - a guard that tracked the blade could never
be deceived, and the side axis would do no work against defenders.

**Inference is input; coverage is simulation.** This is `CLAUDE.md`'s
keypress-is-only-input rule applied to targeting. The inference is syntactic
sugar for the human controller - it answers "which side did I mean?" without a
dedicated side key - and it costs nothing because choosing costs nothing. What
can never be instantaneous is the *outcome*: the blade physically standing on
the covered side. If the blade is on the wrong side, it travels there, over
`sideChangeMs`, on the simulation's clock, exactly as the rise and the stance
transition already do. No input ever teleports steel.

The coverage cases, exhaustively:

| Attack vs covered line | Result |
|---|---|
| Same height, same side | parried (timing and reach holding) |
| Same height, different side | hit |
| Different height, same side | hit |
| Different height, different side | hit |

An earlier draft ruled that a parry covers both sides at its height, on the
argument that the defender had no side input. The inference resolves that
objection: the side *is* chosen by the defender - implicitly, by when they
press. Pressing against a visible thrust covers inside because that is what
answering a thrust means. What the defender does not get is a guard that keeps
covering everything a feint could turn the attack into.

Attacks still do not interact with each other - that is `blade-contact`, which
requires agreement on **both** axes for two travelling blades, because two
blades genuinely have to be in the same place to touch.

---

## 4. Reaction budgets, checked rather than asserted

The defender's cost of being on the wrong height and the cost of forming a guard
do not add. They are the same motion: moving your blade to a new height *is*
forming a guard there. So:

```ts
/** The tick a guard becomes able to meet a blade: every travel must have
 *  arrived - the rise, the side rotation (when the target side differs from
 *  guardSide), and the height transition. They run concurrently; none adds
 *  to another. */
guardEffectiveAt = max(
  parryPress + parryRiseMs,
  parryPress + (targetSide !== guardSide ? sideChangeMs : 0),
  heightArrival,
)
```

with two invariants, alongside `parry-rise` §3.1's:

> **`heightChangeMs > parryRiseMs`** for every weapon, or standing on the wrong
> height costs nothing.
>
> **`sideChangeMs < parryRiseMs`** for every weapon, or §4.1's claim that a
> reactive press is gated by the rise alone stops being true. The side
> rotation is a smaller motion than raising the blade; the numbers must keep
> saying so.

The second invariant is a confirmed design choice, not an accident: being on
the wrong side never slows an initial reactive press, because the rotation is
real but completes inside the rise. The wrong side's cost lives only where it
belongs - cold predictive presses that guessed wrong, and (from `line-feints`)
attacks that change side after the press. If play ever wants a standing-side
timing penalty, the lever is raising `sideChangeMs` past the rise and deleting
this invariant - a deliberate act, not a retune drifting into it.

### 4.1 The matrix

`PLAYER_REACTION_MS` = 250, measured from the tick an attack becomes visible.
AI attacks carry their telegraph, which is what buys the player the room.

Time from attack-visible to `parryableUntil`:

| Attack, telegraphed | Deadline |
|---|---|
| Longsword cut | 890 ms |
| Rapier cut | 690 ms |
| Longsword thrust | 630 ms |
| Rapier thrust | 510 ms |

Longsword defender, `parryRiseMs` 220 and `heightChangeMs` 300:

| Defender's stance | Guard effective at | Answers |
|---|---|---|
| Already correct | 250 + 220 = **470** | every attack in the game |
| Wrong | 250 + 300 = **550** | everything except the rapier thrust |

Rapier defender (190 / 270) has the same shape and the same single failure -
270 rather than 260 because at 260 its wrong-stance answer to the rapier
thrust lands exactly on the deadline, and the documented failure must fail
rather than ride a tick boundary.

**The side axis adds no reaction time to a reactive press - but only because
the numbers keep it that way.** A reactive parry is pressed against a visible
attack, so the inference in §3 targets the right side for free; the side's
*travel* (`sideChangeMs`, when the blade stands on the other side) runs
concurrently with the rise and is shorter than it, so the rise dominates and
the matrix stays height-driven. That ordering is the `sideChangeMs <
parryRiseMs` invariant, not a coincidence. The side bites in two ways:
pressing with no attack visible (a predictive guard on `guardSide`, which the
opponent's other side simply beats), and, from `line-feints` on, an attack
that changes side after the press.

The design falls out of the numbers rather than being imposed on them: **from the
right height you can react to anything. From the wrong height you can answer any
cut and the longsword thrust, but not the rapier thrust.** One documented
exception, consistent with `parry-rise` §5.1, and it makes the stance a prediction
worth making rather than a free choice.

This matrix is a test (§8), not a paragraph. A retune that breaks it fails the
build.

---

## 5. Presentation

### 5.1 HUD row 3: the line labels

`drawTrackRow` established one idiom for a track: label plus bar, two rows. This
adds a **third row per fighter**, label only, no bar, because a line is a value
and not a duration.

It shows one of three things, and always says which in parentheses:

| Situation | Label |
|---|---|
| Attacking | `HIGH OUTSIDE (attack)` |
| Parry up | `HIGH INSIDE (parry)` - the complete covered line, both axes |
| Neither | `LOW (stance)`, or `LOW to HIGH (stance)` while a transition runs |

Heights render from the full enum, so `MIDDLE` appears the day a third stance is
enabled with no HUD change.

The parry's label is the snapshotted `targetLine`, never recomputed from the
opponent: what you read on row 3 is exactly what the contact rule will consult,
so a feinted-out guard visibly covers the wrong line. The stance case is not in
the original list of two but is required: the stance is the read the opponent
has to make, so it cannot be invisible while it is the only thing happening.

Both fighters get the row. The AI's line must be as legible as the player's or
none of the reads in this chain of specs are available.

### 5.2 The line bar

Attack animations do not change. A high cut and a low cut play the same sheet, and
no amount of HUD text fixes a player who is watching the fighters. The answer is
not to redraw the sheets for this spec. It is to draw the thing the sheets cannot:
**a bar beside each fighter marking the height their blade threatens or guards.**

A short **vertical** bar, fixed length, drawn **behind** the fighter.

- **Position:** `f.x * PX_PER_CM - dir * LINE_BAR_OFFSET`, where `dir` is the
  facing. It mirrors with the fighter, so it is always behind them and never
  between the two blades, which is where the eye has to be.
- **Vertical centre:** the height band. Three positions derived from the sprite
  metrics in `sheets.ts` rather than hand-placed pixels - fractions of body height
  above `ARENA.floorY`, so `high` sits at the shoulder, `middle` at the torso and
  `low` at the thigh. `middle` slots in with no renderer change.
- **Colour:** the fighter's own tint, the gold and blue `drawMeasureBands` already
  defines. Identity by colour, since the bar sits beside the fighter it belongs to.
- **Brightness is the only state channel:** dim for a stance with nothing
  happening, bright for a live attack or an effective guard.

Both fighters get one. The AI's line must be as legible as the player's, or none
of the reads in this chain are available.

#### Why not a long horizontal zone

An earlier draft of this section drew the bar at reach length, at a shared height,
so that two of them overlapping would *be* the contact rule. That was wrong.
`blade-contact` §1 establishes that `gap <= reachA + reachB` is 440 cm, which is
essentially always true inside fighting measure, so the overlap would be lit
permanently and would carry no information while covering the sprites. Reach is
already drawn, on the floor band. Drawing it twice buys nothing.

#### What it deliberately does not show

**Timing.** Row 1's strike bar already shows meetable versus delivered with a
segmented bar and a cursor. Repeating it here would give one fact two idioms.
The line bar answers *where*; row 1 answers *when*.

**Side.** It lives in row 3's text. The side matters to every contact - a parry
covers exactly one - but it is a binary with no spatial meaning in a flat side
view, so text carries it until play shows it needs more. Solid fill for
`inside` against a hollow outline for `outside` is the reserved option.

#### The slide is the point

A stance change slides the bar between bands over `heightChangeMs`. So does a
height redirect over `redirectHeightMs`, and a guard shift over `guardShiftMs`.
That slide is the single most important signal in the chain: it is mode 3's tell
before it attacks, the feint the defender is racing in `line-feints`, and the
answer to it. On a short bar a slide is unmistakable; on a long one it would be
mush. The body gets a matching vertical offset on `swordIdle` frame 0 so the
sprite does not sit still while its line moves.

**It retires the blocking half of the art debt.** The game becomes playable by
watching the fighters rather than reading labels. Height-distinct attack poses
remain worth doing, but they are polish rather than a prerequisite for
`sustained-bind`.

### 5.3 Audio

Silent. No cue for a stance change and none for a line. Height is a visual read
by construction; an audible one would let a player defend correctly without
watching and would make `line-feints`'s feint answerable by ear.

### 5.4 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is the player-facing statement of the rules and
is updated **in the same commit**. This spec adds a state (the stance
transition), an acceptance rule (when arrows are refused) and a contact rule
(a parry covers one complete line: your stance's height, and the side of the
attack you pressed against). All three get an entry, one sentence for what is
happening and one for what the player must do, and durations come from
`WEAPONS` via callbacks rather than literals.

---

## 6. AI

The duelist currently picks an attack and therefore, under this spec, would pick
a height as a side effect of that coin flip and never move its stance. It would
read as an opponent that only ever attacks low. Fixing that is part of this spec,
not a follow-up.

**Mode 3, the duelist.** Its attack decision becomes three seeded draws: the
attack kind (which sets the side), the height, and the existing wait jitter. If
the chosen height differs from its current stance it **moves the stance first**,
then attacks once the transition completes.

That ordering matters twice over. It is physically honest, and it hands the
player a second tell that is not the telegraph: a duelist raising its stance is
telling you where the next attack is coming from, and you have `heightChangeMs`
plus the telegraph to get there. The pre-attack stance move is the readable half
of an opponent whose attack choice is otherwise random.

Heights are drawn independently per attack rather than alternated, so the pattern
cannot be counted, but a short anti-repeat rule (no more than two consecutive
attacks at the same height) stops the rng from producing a run that reads as a
bug. That rule is seeded state on `AiState`, not a hidden timer.

**Mode 1, the parry dummy.** Reads the incoming attack's height and moves its
stance to match, then parries - and its press, like any press against a visible
attack, snapshots that attack's side through the same inference the player
gets. The stance move costs `heightChangeMs`, so the dummy now visibly fails
against attacks that are too fast for it to travel and guard in time. That is
the matrix in §4.1 being demonstrated rather than described, and it is the
drill: attack from a height the dummy is not standing at.

**Mode 2, the drill metronome.** Alternates height alongside its existing
attack alternation, so a full cycle drills all four reachable lines in a fixed,
countable order. Predictability remains the point.

---

## 7. Why two heights and not three, today

`middle` exists in the enum and nothing prevents the arrows from reaching it. It
is left unreachable because of `line-feints`, not because of the model.

With two heights, spotting a feint's redirect tells you the destination exactly,
and the guard shift in `line-feints` §4 is a pure reaction test. With three, spotting it
leaves you choosing between the other two, so the hardest defensive play in the
game degrades into a coin flip layered on a reaction test. Enabling `middle`
therefore requires deciding what a redirect may reach, and that decision belongs
in `line-feints`'s arithmetic rather than being inherited by accident.

---

## 8. Tests

- **Reaction matrix:** the table in §4.1 computed for every (defender weapon,
  attacker weapon, attack, stance correct or wrong) and asserted against the
  expected pass/fail pattern. The rapier thrust from the wrong stance is the only
  permitted failure, and it is named in the fixture.
- **Invariant:** `heightChangeMs > parryRiseMs` per weapon.
- **`max` rule:** a parry pressed mid-transition becomes effective at the
  transition's arrival, not at `parryPress + parryRiseMs`, when the arrival is
  later. Both orderings asserted.
- **Stance in motion covers nothing:** an attack at the destination height that
  resolves before the transition completes is a `hit`, not a `parried`.
- **The coverage table, exhaustively:** same height and same side is `parried`;
  same height with a different side, a different height with the same side, and
  both different are each `hit`. Four constructed cases, the contract of §3.
- **Height and side falsified independently** in `parryMeetsAttack` while every
  other condition holds.
- **The press targets the visible attack's side:** a parry pressed against a
  visible thrust targets `inside`; the same press against a visible cut targets
  `outside`. The inference reads only what is visible on the press tick - there
  is no redirect yet to ignore, and `line-feints` extends this test to prove
  the parry never reads one.
- **Side coverage is simulated, never instant:** with `guardSide` on the other
  side, the target side is covered only `sideChangeMs` after the press - a
  blade meetable before that, at the target side's height, is met by nothing.
  With `guardSide` already matching, coverage waits only on the rise. Both
  orderings of the three-way `max` asserted.
- **Invariant:** `sideChangeMs < parryRiseMs` per weapon, so a reactive press
  stays gated by the rise alone.
- **`guardSide` persists:** initially `inside`; it updates when a parry's side
  travel completes, and the next cold press covers where the guard last stood.
- **No inference:** a fixture weapon declaring `cut.side = "inside"` reports
  that side through `lineOf` and row 3, and a parry pressed against its visible
  cut covers `inside` - proving nothing derives side from `AttackKind`;
  `blade-contact` extends the same fixture to contact.
- **Acceptance:** arrows refused during `attack`, `void`, `hitstun`, `dead` and
  with a parry up; accepted in `ready` and during `stepRecoveryMs`.
- **Snapshot:** an attack launched at `high` resolves at `high` after the stance
  has moved to `low` mid-flight.
- **AI height distribution:** over a seeded run, mode 3's attacks are spread
  across both heights and never exceed two consecutive at the same one. This is
  the test that stops the "always attacks low" failure from returning silently.
- **AI stance ordering:** mode 3 completes its stance transition before its
  attack begins; a test asserts no attack starts while `heightTo !== null`.
- **HUD:** row 3 renders `(attack)`, `(parry)` and `(stance)` in the three cases;
  the parry case shows the complete covered line, both axes, straight from the
  snapshot; and `MIDDLE` renders correctly for a fixture fighter at that height.
- **Line bar agrees with the engine:** the band the bar renders is the height
  the contact module uses, for a stance, an in-flight attack (its snapshot, not
  the fighter's current stance) and a raised guard. Same class as the existing
  travelling/delivered frame agreement test, and it is what stops the picture and
  the rules from drifting apart.
- **Line bar mirrors:** the bar is on the opposite side of the body centre from
  `facing`, asserted for both facings.
- **Line bar slides:** during a stance transition the bar's centre interpolates
  between bands over `heightChangeMs` and arrives on the same tick the engine
  changes `height`, not before it.
- **Help panel:** the rendered panel cites `heightChangeMs` from `WEAPONS` and
  states that a parry covers one complete line, both axes.
- **Golden replay:** hash re-recorded.

---

## 9. Out of scope

- A reachable `middle` stance. §7.
- Attack sprites that distinguish height. The line bar (§5.2) makes them a
  polish item rather than a prerequisite, but they are still worth doing.
- Outside thrusts, inside cuts, slices. The axes exist for them; no shipped
  weapon declares one, and the fixture weapon in §8 proves the path works.
- Separate attack and guard heights. One shared stance is the decision.
- Guard *positions* (longpoint, vom Tag). Still reserved; a line is what a guard
  covers, not where the blade rests.
- Steering an attack in flight, and moving a raised guard's covered line (the
  guard shift and side retarget). `line-feints`.

---

## 10. Playtest gate

What to look for:

- You can see mode 3 move its stance before it attacks, and getting to that
  height in time feels like a race you can win.
- Being caught on the wrong height against a rapier thrust kills you, and it
  feels like you were out of position rather than cheated.
- A reactive parry never feels side-punished: pressing against a visible attack
  covers its side without you thinking about sides at all. If you die on the
  side axis in this spec, it should only ever be a cold, predictive press.
- Over a few minutes against mode 3, the attacks do not settle into one height.
- Row 3 answers "where is this going" without you having to think about it.

What would look wrong: needing to read row 3 to know anything at all. That means
the blade zones are not carrying the read, and the fix is their placement or
contrast, not more text. If they do carry it, row 3 becomes a confirmation rather
than the primary channel, which is the outcome to hope for.
