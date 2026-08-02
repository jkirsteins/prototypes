# attack-lines: Attack lines - height stance and blade side

> Specs cite each other by **slug**, never by path. Resolve one with
> `ls docs/superpowers/specs/*<slug>*`. A `TODO-N-` filename prefix means not
> yet implemented, and the number is the order; both are dropped on completion,
> so only the slug is stable and only the slug may be referenced.

## Overview

Blade contact is currently universal: a raised guard stops any attack whose
timing and reach line up, and after `blade-contact` any two travelling blades meet
regardless of where they are aimed. §3.3 and §10 of the state-tracks spec name
this as the MVP limitation and reserve `parryMeetsAttack` as the extension point.

This spec adds the geometry. A line is a **pair**: a height and a side.

**Delivers:** attack lines; parries (part 2 of 2).

**Depends on:** `blade-contact`, which built the contact module the line conditions are
added to.

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

Stance changes are accepted in `ready`, during `stepRecoveryMs`, and while a parry
is up. They are refused during `attack`, `void`, `hitstun` and `dead`: those
commit the body, and the whole point of committing is that you cannot re-aim.

An attack **snapshots** its height into the timeline at launch, alongside every
other mark. Changing stance afterwards does not steer a blade already in the air;
only `line-feints`'s redirect does that.

### 2.1 Input

Arrows are unused in `main.ts` today, so nothing is displaced:

| Key | Was | Is |
|---|---|---|
| Arrow up / down | unused | raise / lower the stance |
| `j` / `k` | cut / thrust | unchanged; they now carry `outside` / `inside` |
| `l` | parry | unchanged, single key |

An earlier draft of this spec split the parry across two keys. That is withdrawn:
the parry takes its height from the stance, so one key is correct and the second
was a duplicate of the arrows.

---

## 3. What a parry covers

**Height must match. Side is free.**

A raised guard covers its stance height against an attack on either side. The
defender's job is to be at the right height; finding the blade once you are there
is what a guard does.

```ts
// contact.ts
function parryMeetsAttack(attacker, defender, gap) {
  return ...existing conditions from `parry-rise` and `blade-contact`...
    && lineOf(attacker).height === defender.height;      // NEW; side not tested
}

function bladesCross(a, b, gap) {
  return ...existing conditions...
    && lineOf(a).height === lineOf(b).height             // NEW
    && lineOf(a).side   === lineOf(b).side;              // NEW
}

function lineOf(f: Fighter): Line;  // height from the attack's snapshot, side from its timings
```

Two travelling blades must match on **both** axes, because two blades genuinely
have to be in the same place to touch. A guard is a defensive position rather
than a point, so it spans the side axis at its height.

That asymmetry is the source of the interesting cases:

- A cut and a thrust at the same height **pass each other**. If both are in reach
  at their own `strikeEnd`, both fighters die. The mutual kill now has a cause a
  player can name: you both attacked, at the same height, on different sides, and
  neither of you defended.
- A guard at the right height stops either of them.
- A guard at the wrong height stops nothing.

---

## 4. Reaction budgets, checked rather than asserted

The defender's cost of being on the wrong height and the cost of forming a guard
do not add. They are the same motion: moving your blade to a new height *is*
forming a guard there. So:

```ts
/** The tick a guard becomes able to meet a blade. */
guardEffectiveAt = max(parryPress + parryRiseMs, heightArrival)
```

with the invariant, alongside `parry-rise` §3.1's:

> **`heightChangeMs > parryRiseMs`** for every weapon, or standing on the wrong
> height costs nothing.

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

Rapier defender (190 / 260) has the same shape and the same single failure.

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
| Parry up | `LOW ANY (parry)` |
| Neither | `LOW (stance)`, or `LOW to HIGH (stance)` while a transition runs |

Heights render from the full enum, so `MIDDLE` appears the day a third stance is
enabled with no HUD change.

The parry reads `ANY` on the side axis because that is literally the rule in §3,
and printing it is cheaper than a player inferring it from three deaths. The
stance case is not in your original list of two but is required: the stance is the
read the opponent has to make, so it cannot be invisible while it is the only
thing happening.

Both fighters get the row. The AI's line must be as legible as the player's or
none of the reads in this chain of specs are available.

### 5.2 The blade zone: a box over the sprite

Attack animations do not change. A high cut and a low cut play the same sheet, and
no amount of HUD text fixes a player who is watching the fighters. The answer is
not to redraw the sheets for this spec. It is to draw the thing the sheets cannot:
**a bar over each fighter marking where their blade threatens or guards.**

- **Horizontal extent:** from the fighter's body centre outward by `reach`, the
  same value `drawMeasureBands` already draws on the floor. This is the blade
  zone, lifted off the floor to its line's height.
- **Vertical position:** one band per `Height`, positions computed from the enum,
  so enabling `middle` moves nothing in the renderer.
- **Side:** filled for `inside`, hollow outline for `outside`. Height uses the
  spatial axis because height is what the defender must match; side gets the
  cheaper encoding because a guard spans it anyway.
- **Colour, reusing the existing palette:** `#e6c229` while the blade is meetable,
  `#6b2f2c` once delivered (both already mean exactly this on the strike bar),
  `#9b8cff` for an effective guard, dimmed for a guard still rising or a stance
  with nothing happening.

**This is not an annotation, it is the geometry.** Contact requires
`gap <= reachA + reachB` and, now, matching heights. Two blade zones at the same
height overlap on screen exactly when those conditions hold, so **the boxes
touching is the contact rule, drawn**. The only condition not visible in space is
the timing one, and that is what the colour carries.

Because it is the geometry, the renderer reads `reach` and the height bands from
the same source the contact module does and re-derives nothing, the way the frame
plan already mirrors the engine's meetable check. A test asserts the drawn extent
and the contact predicate agree (§8).

Timing follows the timeline marks, per `AGENTS.md` applied to a visual rather than
a sound: the zone appears dim at `riseStart` (a threat forming), brightens at
`strikeStart`, darkens at `parryableUntil`, and vanishes at `strikeEnd`. A guard's
zone appears dim on the press and brightens at `parryRiseMs`.

A stance transition slides the zone between bands over `heightChangeMs`, which is
what makes the stance move readable at all, and the body gets a matching vertical
offset on `swordIdle` frame 0. Guards keep `parry-rise`'s rise-and-set frames.

**It is a bit weird, and it works.** A blade zone is a well-worn fighting-game
idea, and here it happens to be honest: it draws the simulation's own geometry
rather than a label about it. It retires the blocking half of the art debt, since
the game becomes playable by watching the fighters. Height-distinct attack poses
remain worth doing, but they are now a polish item rather than a prerequisite for
`sustained-bind`.

### 5.3 Audio

Silent. No cue for a stance change and none for a line. Height is a visual read
by construction; an audible one would let a player defend correctly without
watching and would make `line-feints`'s feint answerable by ear.

### 5.4 The help panel

Per `CLAUDE.md`, `src/ui/help.ts` is the player-facing statement of the rules and
is updated **in the same commit**. This spec adds a state (the stance
transition), an acceptance rule (when arrows are refused) and a contact rule
(height must match, side is free). All three get an entry, one sentence for what
is happening and one for what the player must do, and durations come from
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
stance to match, then parries. The stance move costs `heightChangeMs`, so the
dummy now visibly fails against attacks that are too fast for it to travel and
guard in time. That is the matrix in §4.1 being demonstrated rather than
described, and it is the drill: attack from a height the dummy is not standing at.

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
- **Height condition falsified independently** in `parryMeetsAttack`; **both**
  conditions falsified independently in `bladesCross`, while all others hold.
- **Side is free for a parry:** one stance height, both attack sides, both
  produce `parried`.
- **Cross-side double:** a cut and a thrust at the same height, both in reach,
  produce `winner === "draw"`.
- **No inference:** a fixture weapon declaring `cut.side = "inside"` makes its
  cut cross a thrust, proving nothing derives side from `AttackKind`.
- **Acceptance:** arrows refused during `attack`, `void`, `hitstun`, `dead`;
  accepted in `ready`, during `stepRecoveryMs`, and with a parry up.
- **Snapshot:** an attack launched at `high` resolves at `high` after the stance
  has moved to `low` mid-flight.
- **AI height distribution:** over a seeded run, mode 3's attacks are spread
  across both heights and never exceed two consecutive at the same one. This is
  the test that stops the "always attacks low" failure from returning silently.
- **AI stance ordering:** mode 3 completes its stance transition before its
  attack begins; a test asserts no attack starts while `heightTo !== null`.
- **HUD:** row 3 renders `(attack)`, `(parry)` and `(stance)` in the three cases,
  and renders `MIDDLE` correctly when given a fixture fighter at that height.
- **Blade zone agrees with the engine:** for a generated spread of gaps and
  heights, the two drawn zones overlap exactly when the contact module's
  geometric conditions (reach sum, matching height) both hold. This is the same
  class as the existing travelling/delivered frame agreement test, and it is what
  stops the picture and the rules from drifting apart.
- **Blade zone timing:** the zone's colour changes on the same ticks as
  `strikeStart`, `parryableUntil`, `strikeEnd` and `parryRiseMs`, asserted at the
  boundary tick, per `AGENTS.md` applied to a visual.
- **Help panel:** the rendered panel cites `heightChangeMs` from `WEAPONS` and
  states the height-must-match, side-is-free rule.
- **Golden replay:** hash re-recorded.

---

## 9. Out of scope

- A reachable `middle` stance. §7.
- Attack sprites that distinguish height. The blade zone (§5.2) makes them a
  polish item rather than a prerequisite, but they are still worth doing.
- Outside thrusts, inside cuts, slices. The axes exist for them; no shipped
  weapon declares one, and the fixture weapon in §8 proves the path works.
- Separate attack and guard heights. One shared stance is the decision.
- Guard *positions* (longpoint, vom Tag). Still reserved; a line is what a guard
  covers, not where the blade rests.
- Steering an attack in flight. `line-feints`.

---

## 10. Playtest gate

What to look for:

- You can see mode 3 move its stance before it attacks, and getting to that
  height in time feels like a race you can win.
- Being caught on the wrong height against a rapier thrust kills you, and it
  feels like you were out of position rather than cheated.
- Over a few minutes against mode 3, the attacks do not settle into one height.
- Row 3 answers "where is this going" without you having to think about it.

What would look wrong: needing to read row 3 to know anything at all. That means
the blade zones are not carrying the read, and the fix is their placement or
contrast, not more text. If they do carry it, row 3 becomes a confirmation rather
than the primary channel, which is the outcome to hope for.
