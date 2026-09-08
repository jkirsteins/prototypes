# The body's fat - design

The fat reserve stops being a tank with a lid and becomes what a body actually
has: a floor it dies at, a range it drifts in, and an appetite that argues
harder the emptier it gets than the fuller.

## Why

Three separate faults, found together while fixing the 2026-09-07 playtest's
eating notes. Each is small on its own; they share a cause.

**`fatFull` is a cap, and bodies have no cap.** A survivor starts at
`d.fatFull` and can never exceed it. Nothing in physiology corresponds to
this. What a body has is a *floor* - essential fat, below which organs and
nerves fail - and above that, no ceiling at all: surplus keeps depositing.

**The cap is load-bearing in ways that hid the fault.** `starvation()` returns
`1 - fat / fatFull`, and that 0..1 is the input to three live mechanics:
insulation (`felt -= 4 * starvation`), work speed (`*= 1 - 0.5 * starvation`)
and the thin/ribs/wasting/starving warnings. So the cap is not decoration -
it is the denominator the body reads itself through, and removing it without
a replacement reference removes all four.

**Fat cannot be gained in ordinary play, and that is a mechanism fault, not a
tuning one.** `autoEat` is `while (kcal < HUNGRY_LINE) eat one portion`. It
eats the least it can to clear the line and stops. The largest single portion
in the game is rendered fat at 900 kcal, so from just under 1,800 it reaches
2,699 against a 3,000 stomach - **auto-eat can never overfill, so it can never
bank fat**, however deep the larder. Measured:

```
auto-eat from the line: kcal 2294 of 3000, fat 4.44 kg -> 4.44 kg   (unchanged)
six portions by hand:   kcal 3000 of 3000, fat 4.44 kg -> 4.91 kg
```

"Eat well in autumn so you carry fat into winter" is a core survival fantasy
and it is currently reachable only by clicking `eat` repeatedly while already
full. Moving the hunger line does not fix this on its own, which is the trap
this design exists to avoid walking into.

## The physiology, and what is deliberately not claimed

Regulation is **asymmetric**, and the two directions are not even the same
system. Leptin is secreted in proportion to fat mass and governs the *lower*
end: when fat falls, leptin falls and hunger rises hard. Defence against
weight *gain* is a separate, non-leptin graded anorexia, and it is much
weaker. Speakman's dual intervention point model puts a lower and an upper
intervention point around a **settling zone** in which weight is not tightly
regulated at all.

So this design models a defended lower range, not a thermostat. A body that
loses fat fights to get it back. A body gaining fat is only gently
discouraged, and can keep gaining if food allows.

What this design does **not** claim is where any of those points sit in a real
human. Their location varies substantially between individuals, and the game
needs one number where the literature offers a range. **The four landmarks
below are game parameters, tuned against the simulation.** They are named
after physiology because that is what they represent; they are not presented
as measured constants, and no comment in the code should claim they are. The
one figure taken from the literature as a shape rather than a value is that
the essential floor is a substantially larger share of a woman's mass than a
man's, which is why sex enters here and not elsewhere.

Sources for the shape, not the numbers: Speakman's set/settling point review
(PMID 22065844), the dual intervention point discussion in *Models of body
weight and fatness regulation* (PMC10475878), and *Evidence for a non-leptin
system that defends against weight gain in overfeeding* (PMC6082718).

## The four landmarks

Fat is a scalar in kilocalories, as today. Four levels are derived per body,
from lean mass and sex, in ascending order:

```ts
interface FatLandmarks {
  /** Death. Essential fat: the reserve that is structure, not fuel. */
  floor: number;
  /** starvation() reaches 1 here and 0 above; below it the body is failing. */
  lower: number;
  /** Where a survivor lands, and the middle of the range fat drifts in. */
  typical: number;
  /** Above here appetite is suppressed - gently. No ceiling follows it. */
  upper: number;
}
```

- `floor` is the death boundary and is **sex-specific**: a materially larger
  share of mass for a woman than a man.
- `lower` is the lower intervention point. `starvation()` is 0 at or above it,
  rising to 1 as fat falls to `floor`. This is what keeps a naturally lean
  survivor from reading as partly starved - the fault in measuring starvation
  from a set point.
- `typical` sits inside the settling zone. A new survivor starts here, not at
  a boundary and not at a "full" value, so they begin with real stored energy
  and real room to fatten before winter.
- `upper` is the upper intervention point. Above it appetite falls
  progressively. **It is not a cap.** Given absurd quantities of calorie-dense
  food a player can still gain past it; it just gets steadily harder.

Sexes are placed at different body-fat shares but at **comparable positions
within their own settling zones**, so neither begins the game advantaged.

`FAT_FULL` and `Derived.fatFull` are deleted. Nothing keeps a ceiling.

## Hunger and satiety are two numbers

This is the architectural change, and it is what makes the rest work.

Today one constant answers two different questions, which is why fat never
accumulates:

- **`HUNGRY_LINE`** - *when eating begins*. The mark drawn on the Food bar.
- **`SATIETY_TARGET`** - *when eating stops*. Today this is the same number,
  so the body stops the instant hunger does.

`autoEat` becomes: begin when the reserve falls below the hunger line, eat
until the reserve reaches the satiety target or nothing edible remains. The
gap between them is a meal.

Both respond to the reserve, asymmetrically:

| reserve | hunger line | satiety target |
|---|---|---|
| below `lower` | rises - eats sooner | rises well past baseline: compensatory hyperphagia, banks fat, regains |
| the settling zone (`lower`..`upper`) | flat at baseline | flat, a modest surplus - **permitted, not guaranteed** |
| above `upper` | drifts down | falls - the graded-anorexia brake, deliberately weak |

The response curve is **nonlinear**: fairly flat across the settling zone,
steepening sharply as the reserve approaches `floor`, and only gently
downward above `upper`. Strong starvation hunger without making a well-fed
survivor impossible to fatten on purpose.

In the settling zone the target permits a surplus but does not deliver one:
whether the survivor actually reaches it is decided by what food is present,
the gut caps and the lean ceiling. Abundance fattens; an ordinary day does
not.

**The mark on the Food bar moves with the hunger line.** `HUNGRY_LINE` is
explicitly a behavioural threshold - "this is where he decides to eat" - so a
mark that drifts is the honest reading of it, and teaches that appetite
changes with reserves. The bar will also visibly oscillate between the mark
and a higher peak rather than sitting in today's narrow 1800-2295 band, which
makes the meal legible as an event.

## Fat has weight

`massKg` becomes lean mass plus fat mass. Lean mass comes from `build` as
`massKg` does today; fat is `p.fat / FAT_KCAL_PER_KG`.

**Work that moves the body burns for the fat it carries; it does not slow for
it.** Carrying another 5-15 kg costs real energy on a day's walk, and the burn
must charge for it. Speed is untouched on purpose: no locomotion penalty, no
slower route, so fattening before winter never makes the survivor worse at
moving - only hungrier for having done it.

Not every task moves a body, though. Chopping, carving and sewing do not cost
more because the body doing them is heavier, and a blanket `massKg` multiplier
over all activity would claim they do. So this follows the convention
`NIGHT_WORK` already sets in `light.ts` - a sparse table keyed by `TaskId`,
where **absence means the effect does not apply**:

```ts
/**
 * The share of a task's burn that is the body being moved, and so scales with
 * total mass. Walking is all of it. A task absent from this table does not
 * scale with mass at all - work done standing in one place costs what it
 * costs whoever is doing it.
 */
export const ON_THE_FEET: Partial<Record<TaskId, number>> = { ... };
```

Walking is the always-on case, since moving the body is the whole of what it
is. Hauling and the ranging hunts take a share; bench work takes none.

### Load is not the same as mass, and the repo already knows it

The tempting simplification is one total - lean plus fat plus carried load -
scaling one term. **It would contradict a sourced number already in the
tree.** `LOAD_KCAL_PER_HOUR` cites the Swedish handbook: 545 kcal/h at 4 km/h
with 27 kg against 240 unloaded. That is +305 kcal/h for 27 kg, about
11.3 kcal/h per kilo carried. A term proportional to body mass would give
27/72 of 240, roughly 90 kcal/h, or 3.3 kcal/h per kilo.

**A carried kilo costs about 3.4x what a kilo of body mass costs** - which is
right, and well attested: body mass is carried efficiently, a pack on the back
is not. So the two stay separate terms:

- **Body mass** - lean plus fat - scales the burn of tasks in `ON_THE_FEET`,
  proportionally, the same shape `baseBurn` already uses.
- **Carried load** keeps its existing step model against `packComfortableKg`
  and `packHardKg`, with its handbook citation intact, and applies on top.

Collapsing them would quietly make hauling a third as expensive as the
handbook says.

### Magnitude

The effect should be noticeable and not dominant, and proportionality delivers
that without a tuning knob:

| fat gained on a 72 kg body | walking burn |
|---|---|
| +5 kg | +7% |
| +10 kg | +14% |
| +15 kg | +21% |

At rest the same 10 kg is about +233 kcal a day through `baseBurn`, which
already scales with mass today.

### What the code does today

The implementation adds this rather than inheriting it:

- `baseBurn` scales with mass (`person.ts:86`). **Today this is the only bucket
  that does.**
- The walk bucket is `WALK_KCAL_PER_HOUR / speedOf(terrain)` - **no mass term
  at all**.
- The activity bucket above base is scaled by `workBurn`, derived from
  `strength`, not mass. It stays that way: work above base is effort, and
  `strength` is the axis that belongs there. `ON_THE_FEET` is what introduces
  mass to it, per task, and only where a body is being moved.

This is a second balance event on top of the reserve change. It moves every
walking reading in every gate, and walking is a large share of the burn in the
reference runs. It is in this spec rather than deferred because deferring it
would ship a body that stores fat for free.

Note that mass is still not a meaningful brake on fat: a kilo stores
9,000 kcal and costs roughly 23 kcal a day at rest, paying for itself for the
better part of a year even with the walking term added. Appetite is the brake.
Mass is honesty about the cost.

Deposition stays **1:1**. Surplus banks as fat without a conversion loss. The
real coefficient depends on whether the surplus is dietary fat or
carbohydrate, and once food scarcity, gut caps, the lean ceiling and appetite
feedback are all present it is invisible bookkeeping.

## What re-bases onto the landmarks

Every present use of `fatFull` is replaced, not deleted:

| today | becomes |
|---|---|
| `starvation() = 1 - fat/fatFull` | `clamp((lower - fat) / (lower - floor), 0, 1)` - 0 at or above `lower` |
| `p.kcal <= 0 && p.fat <= 0` is death | `p.kcal <= 0 && p.fat <= floor` |
| `clamp(fat - shortfall, 0, fatFull)` | no upper clamp; the lower bound stays 0 so the floor is a death test, not a wall |
| `clamp(fat + surplus, 0, fatFull)` | no clamp at all |
| `fat: d.fatFull` at new game | `fat: landmarks.typical` |
| `FAT_THIN/RIBS/WASTING` as 0.75/0.5/0.25 of `fatFull` | shares of the `lower`..`floor` span, so the words track the failing range rather than the whole tank |
| `p.fat / fatFull` for the bar fill | see below |

`felt -= 4 * starvation(state)` and `workSpeed *= 1 - 0.5 * starvation(state)`
are unchanged in form. They keep working because `starvation()` keeps its 0..1
meaning; a survivor anywhere in the settling zone reads 0 and takes no
penalty, which is correct and is not true today.

## Interface

The Fat bar has no maximum, so its fill needs a reference rather than a
denominator. It draws:

- the fill scaled against `upper` and clamped at full, so a reserve past
  `upper` simply reads as a full bar - being off the end of the Fat bar is a
  good problem and needs no state of its own;
- **the `floor` as a mark**, drawn the same way the Food bar's meal line is,
  so the bar says where death is rather than implying it is at zero;
- the label stays kilos, which is the number a player can reason about.

The survivor card says nothing about sex as a physiological difference. It
stays flavour, per the decision taken while designing this: at the intended
placement the difference sits below the `build` axis, and stating it invites
exactly the min-maxing the placement is chosen to avoid.

## Files

- `src/sim/person.ts` - `fatFull` out, `FatLandmarks` in, computed from lean
  mass and sex in `derived()`; `massKg` becomes lean, with total mass a
  function of the player's fat.
- `src/sim/player.ts` - `starvation()` re-based; the death test; the burn's
  fat clamp; the thin/ribs/wasting warnings; the mass term on `ON_THE_FEET`
  tasks;
  `FAT_FULL` deleted (it lives here, not in `items.ts`; `KCAL_FULL`, the
  stomach, is untouched).
- `src/sim/actions.ts` - the hunger/satiety split, `autoEat`'s loop, the
  appetite response curve; the surplus clamp.
- `src/sim/newgame.ts` - the survivor starts at `typical`.
- `src/ui/bars.ts`, `src/ui/panels.ts`, `src/style.css` - the Fat bar's
  reference and floor mark; the Food bar's mark reads the live hunger line
  rather than a constant.
- `src/sim/reference.ts` - `REFERENCE_TARGET_DAY` is derived from `FAT_FULL`
  today and must be re-derived from the usable span, `typical - floor`.

## Testing

- The landmarks are strictly ordered for every body and both sexes:
  `floor < lower < typical < upper`.
- `starvation()` is 0 at and above `lower`, 1 at `floor`, monotonic between,
  and never negative above `lower`.
- Death fires at `floor`, not at 0.
- A survivor with a deep larder and a reserve in the settling zone **gains
  fat over a season** - the test that would have failed today, and the reason
  this design exists.
- A survivor below `lower` with food present eats sooner and eats more than
  one in the settling zone, and regains toward `typical`.
- A survivor above `upper` eats less than one in the settling zone, and can
  still gain given calorie-dense food in quantity - the soft bound is soft.
- No path clamps fat to an upper bound.
- A walking hour costs more for a heavier body and takes the same time: the
  burn rises with fat while `baseWalkSpeed` and the route are unchanged. Both
  halves matter - a speed regression here is the perverse incentive this
  design refuses.
- A task absent from `ON_THE_FEET` costs a fat body and a lean one the same,
  so bench work is not taxed for the reserve its owner carries.
- A carried kilo still costs more than a kilo of body fat, so the handbook's
  load figures survive the change.
- The existing meal-line tests continue to hold with the line now a function
  rather than a constant.

## Gates

This moves every gate, and the spec claims no prediction about direction.
`REFERENCE_TARGET_DAY` is derived off `FAT_FULL` today, so the April gate day
changes by construction; the winter, year and lineage gates all read survival
against a reserve whose size, floor and refill behaviour are all changing at
once - and the walk bucket's mass term moves the burn side underneath all of
them at the same time. Expect to re-derive and re-read rather than to tune, and take the
readings before touching anything else, per the standing rule that gates
measure the sim rather than the sim being bent to the gates.

The April gate's derivation must be reconsidered rather than mechanically
translated: it currently assumes the whole reserve is burnable, which stops
being true the moment a floor exists.

## Open questions

These are for the author, and the plan should not proceed past them.

1. **Numerical placement and slopes.** Where `floor`, `lower`, `typical` and
   `upper` sit for each sex, and how steep the appetite response is below
   `lower` and above `upper`. Better tuned against the simulation than
   asserted as human constants - which is why they are not in this document.
2. **Whether the player gets a lever.** With satiety above hunger, abundance
   fattens on its own. If deliberate fattening should also be an *order* - an
   "eat your fill" rung in the ladder - that is a separate design and should
   not be smuggled in here.

## What this is not

Not a set point. Not a thermostat. Not a cap wearing a new name. Not an
appetite model with a hunger curve, meal preferences or cravings - one
threshold to start, one to stop, both functions of the reserve. And not a
deposition-efficiency model: surplus banks 1:1 until something in play
demands otherwise.
