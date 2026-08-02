# TODO-3: Attack lines and per-line parry coverage

## Overview

Blade contact is currently universal: a raised guard stops any attack whose
timing and reach line up, and after TODO-2 any two travelling blades meet
regardless of where they are aimed. §3.3 and §10 of the state-tracks spec name
this as the MVP limitation and reserve the extension point.

This spec adds the geometry. An attack occupies a **line**, a parry covers one
line, and blades only meet on a shared line.

**Delivers:** attack lines; parries (part 2 of 2).

**Depends on:** TODO-2, which built the contact module the line condition is
added to.

---

## 1. The axis, and why there is only one

Real fencing has at least two axes: high/low and inside/outside. The renderer is
a flat side view at a fixed vertical, so inside and outside cannot be drawn.
High and low can, and the sheets already draw them.

```ts
type AttackLine = "high" | "low";
```

Measured from the sprites:

| Sheet | Pose | Line |
|---|---|---|
| `swordAttack` | blade raised overhead, descending arc to head and shoulder | `high` |
| `swordStab` | body drops into a crouched lunge, point out at waist height | `low` |

The two existing attack animations *are* a high line and a low line. This costs
no art.

### 1.1 Line is a property of the attack, not of the kind

```ts
interface AttackTimings {
  windup: number; beat: number; strike: number; recovery: number;
  line: AttackLine;   // NEW
}
```

In this iteration longsword and rapier both declare `cut.line = "high"` and
`thrust.line = "low"`, so line and kind happen to coincide. Declaring it on the
timings rather than deriving it from `AttackKind` is what makes the axis real: a
future Unterhau is a cut with `line: "low"` and needs one sheet, not a new
concept. Nothing may read `attack === "cut"` to infer a line.

---

## 2. Parry coverage

```ts
interface ParryTrack {
  t: number;
  line: AttackLine;   // NEW: what this guard covers
}

type Intent = ... | "parryHigh" | "parryLow";   // replaces "parry"
```

A guard covers exactly one line. The other line is open. There is no partial
coverage and no adjacency: with two lines, softening the miss would mean the
choice barely matters.

**Input.** `main.ts` currently maps `j` to cut, `k` to thrust and `l` to parry.
`j` and `k` are unchanged and now carry the lines implicitly. The single parry key
splits into `o` for the high guard and `l` for the low guard, which are vertically
stacked on QWERTY so the physical key positions match the lines, and `l` keeps the
role it already has for anyone with the muscle memory.

The help overlay spec (`2026-08-02-help-overlay.md`) is updated in the same
change. A control that exists and is undocumented is the failure mode that spec
was written to prevent.

Everything else about the parry is unchanged: raised from `ready`, rises over
`parryRiseMs`, expires at `parryWindowMs`, charges `parryRecoveryMs`, and after
§8.2 persists through a step.

---

## 3. The rule

One condition, added to both entry points of the contact module in the same edit,
exactly as §10 of the state-tracks spec promised:

```ts
// contact.ts
function parryMeetsAttack(attacker, defender, gap) {
  return ...existing conditions...
    && defender.parry.line === lineOf(attacker);      // NEW
}

function bladesCross(a, b, gap) {
  return ...existing conditions...
    && lineOf(a) === lineOf(b);                       // NEW
}

function lineOf(f: Fighter): AttackLine;  // f.weapon.attacks[f.state.attack].line
```

Consequences:

- A high guard against a low thrust does nothing. The thrust passes and wounds.
- Two cuts cross. A cut and a thrust pass each other, and if both are in reach at
  their own `strikeEnd`, both fighters die. TODO-2's mutual kill becomes
  reachable again, on a specific and legible cause: **you both attacked, on
  different lines, and neither of you defended.** That is the historical double,
  and it now has a reason a player can name.

### 3.1 Why this is a read and not a guess

The defender must be right about line *and* time, which is a 50/50 on top of a
timing window if the line is hidden. It is not hidden. The two sheets diverge at
frame 0 of the windup: one raises overhead, the other drops into a crouch. The
line is legible from the tick the attack starts.

Timing check, longsword cut with the AI telegraph: the pose is legible from
`elapsedMs = 0`, and TODO-1 §1 puts the viable parry press between 320 and 670
ms. The read is available for the entire press window, with the telegraph and the
whole windup to spare.

So the defender's job is: see the line, choose the matching guard, commit early
enough to have risen. Feints exist to make that read unreliable, and until TODO-4
they cannot lie about line - which is the whole reason TODO-4 follows this.

---

## 4. Presentation

### 4.1 Guard sprites: no new art

| Guard | Rising | Set |
|---|---|---|
| High | `swordAttack` frame 1 (blade sweeping up, arc trailing) | `swordAttack` frame 2 (held at the apex) |
| Low | `swordStab` frame 1 (dropping into the crouch, blade coming back) | `swordStab` frame 3 (crouched, blade low across the body) |

`swordStab` frames 2 and 3 are near-identical, which is why TODO-1's two-frame
rise pattern transfers cleanly: 1 reads as travel, 3 reads as arrival.

The two guards are unmistakable from each other at a glance, which is the
property that matters. Each remains ambiguous with its own sheet's windup, the
known and accepted ambiguity from TODO-1 §4.1.

### 4.2 HUD

The defence row's label gains the line: `high guard rising`, `low guard up`. The
segmented bar from TODO-1 is unchanged.

The body row gains the line on attack phases: `windup (high)`. This is the read
the player is being asked to make, so it is stated while they are learning it,
the same way `drawStrikeTiming` states the meetable window.

### 4.3 Audio

Silent. No new cue. Line is a visual read by construction: an audible line would
let a player defend correctly without watching, and would make TODO-4's
line-changing feint defeatable by ear.

The `met` clash is unchanged. A pass-through (two attacks on different lines)
produces no contact sound at all, and each attack resolves to its own whiff or
hit as usual, so the one-sound-per-attack rule holds without amendment.

---

## 5. AI

**Mode 1, the parry dummy.** Reads `lineOf(opponent)` and raises the matching
guard. It was already reading the attack; it now reads one more field. The
coverage table from TODO-1 §6 is re-recorded.

**Mode 2, the drill metronome.** Its strict alternation between thrust and cut
now alternates low and high as a side effect, which makes it a better drill: the
player practises both guards. Worth stating in its comment so a later retune does
not accidentally make it single-line.

**Mode 3, the duelist.** Its coin-flip between cut and thrust becomes a coin-flip
between lines. It gains nothing else here. Its reactive feint is TODO-4.

---

## 6. Tests

- **Line condition falsified independently** in both contact functions, while
  every other condition holds. Both must fail closed.
- **Agreement:** a table-driven test asserting that for every (weapon, attack)
  pair, `lineOf` matches the sheet the frame plan selects. This is the same
  class as the existing travelling/delivered frame agreement test, and it is what
  stops a future low cut from being animated overhead.
- **Wrong guard:** a high guard against a low thrust produces a `hit`, not a
  `parried`, at the correct tick.
- **Right guard:** unchanged timing behaviour from TODO-1, per line.
- **Cross-line double:** a cut and a thrust, both in reach, both resolving,
  produce `winner === "draw"`.
- **No inference from kind:** a grep-style assertion, or a test weapon whose
  `cut.line` is `"low"`, proving nothing in the engine or renderer derives line
  from `AttackKind`. The second is better: define a fixture weapon with an
  inverted cut and assert contact and frames follow the declared line.
- **Golden replay:** hash re-recorded.

---

## 7. Out of scope

- Inside/outside lines. The renderer cannot draw them.
- Attacks that change line. TODO-4.
- Any weapon actually declaring a low cut or a high thrust. The field exists so
  it can, and the fixture weapon in §6 proves it works, but no shipped weapon
  uses it yet.
- Guard *positions* (longpoint, vom Tag). Still reserved, per §10 of the
  state-tracks spec. A line is what a guard covers, not where the blade rests.

---

## 8. Playtest gate

What to look for:

- You can tell high from low during the windup without reading the HUD. If you
  cannot, the read is not available and everything after this is a guess.
- Choosing the wrong guard feels like being wrong, not like being cheated.
- Cross-line doubles happen sometimes and feel like a mutual mistake.

What would look wrong: reaching for the guard keys feeling like a stab in the
dark, which would mean the windup poses need longer on screen before commitment
is due, not that the lines were a bad idea.
