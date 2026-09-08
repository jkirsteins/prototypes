# Fire keeping - design

A fire becomes something you start once and keep, rather than something you
light again every time you turn your back. Embers hold the fire between
feedings; three goals name the keeping without explaining it.

## Why

The fire is a boolean. It burns fuel at a rate, and at zero fuel it dies:

```
if (outOfFuel || drownedLow) { st.fire.lit = false; ... "The fire has gone out." }
```

Relighting is the whole chain again - a drill, and in rain a one-in-three
failure. Auto-feed only runs `atCampHere`, so the fire burns down unattended the
moment the player leaves, and leaving is what the game asks them to do. The
2026-09-07 playtest's first survivor died of cold at camp beside 20 kg of his
own firewood; the fire chain took him two runs and a death to solve. Making him
solve it again every time he walks to the forest is not difficulty, it is
repetition of a lesson already learned.

One full load of 36 kg lasts:

| ambient | open fire | turf hut | cabin hearth |
|---|---|---|---|
| 0 C | 12.0 h | 30.0 h | 44.4 h |
| -10 C | 6.0 h | 15.0 h | 22.2 h |
| -20 C | 4.0 h | 10.0 h | 14.8 h |

At -20 C an open fire is gone in four hours. Any errand outrun by that number
ends in a cold camp.

## Embers

Real banked fire holds live coals for eight to twelve hours; both sources this
project already leans on treat banking as the ordinary way to keep fire
overnight, and rekindling from coals is tinder and breath rather than a drill.

**The shape.** `fire.lit` is read in fourteen files. Turning it into a
three-valued union would touch all fourteen and invite a missed case in each.
Instead the fire gains one field:

```ts
fire: { lit: boolean; fuelKg: number; wetKg: number; indoors: boolean; unattended: number; embers: number };
//                                                                                          ^ minutes of ember life left
```

Every existing `fire.lit` read stays correct, because embers are not lit: the
warmth bonus, the map's `F` marker, the soundscape and the camp light all go
quiet on their own without being told. Only three places learn the new thing.

**1. The fire step (`camp.ts`).** Fuel reaching zero sets `lit = false` and
`embers = EMBER_MINUTES` instead of ending the fire. Embers count down by `dt`.
At zero they are out. Rain with no roof eats them at double rate; a roof
preserves them. A fire drowned by heavy rain (`drownedLow`) leaves no embers -
it was put out, not banked.

**Embers are the nightly cycle, not an edge case.** A tended fire burns down to
coals every night while the survivor sleeps and is rekindled in the morning. A
state the player meets daily has to be legible, so embers are shown wherever the
fire is already shown: the HERE panel gains a third word between "burning" and
"cold"; the map keeps a dimmed marker with no ring rather than dropping to
nothing - `EMBER_LUX` sits under the 5-lux firelit band, so a glow that finds
nothing by is a glow that reaches no cell beyond its own; the night fire banks
down rather than going dark. Without that a banked
fire is pixel-identical to a dead one, and the playtest is explicit about what an
interface that hides its state does - the player concludes the fault is theirs.

**2. Warmth and light (`fire.ts`, `light.ts`).** Embers give a small warmth
bonus, `EMBER_WARMTH`, well under a lit fire's 7, and a faint `EMBER_LUX` well
under a lit fire's 20.

Be exact about what the light is worth, because it is easy to overclaim.
Firelight was never enough for handwork: `craft`, `repair` and `mend` need 200
lux in `NIGHT_WORK` and a lit fire gives 20, so those are already at reduced odds
at night beside a blazing fire. What a fire's 20 lux really buys is the 20-lux
tier - finding sticks, dead wood and bark at camp in the dark. Embers at
`EMBER_LUX` of 2 sit under that tier and under the 5-lux `firelit` band, so a
banked fire is a visible glow that you cannot forage by. That is the honest cost
and it is the reason embers are not simply a free fire.

**3. Lighting (`tasks.ts`).** A `light` on a fire with embers is a rekindle: a
few minutes, no fire drill consumed or worn, and no failure roll whatever the
weather. Embers are already fire; the hard part was making them.

The relit fire keeps its `indoors` flag, since the ground has not moved.

## What this does not change

Auto-feed stays gated on being at camp. Embers do not make a fire self-tending;
they widen the window in which a returning survivor still has one. A player who
leaves a fire with two kilos on it and walks 5 km still comes home to cold
coals or a dead pit, which is the right lesson and the one the playtest's
2.4 km walk for sticks was really about.

Burn rates are untouched. This changes how a fire *ends*, not what it costs.

## The goals

Three, all destinations, none naming the route. They slot into the existing
ladder rather than forming a group.

| Position | Title | Credited by |
|---|---|---|
| after "Cook something over it" | Keep a fire alive overnight | a fire lit at dusk still lit or in embers at dawn |
| after "Get off the cold ground" | Keep a fire burning for three days without letting it go out | seventy-two hours with the fire never reaching `out` |
| after "Put a roof over your head" | Keep a fire through a day of rain | twenty-four hours of rain with the fire never reaching `out` |

**Why the overnight goal comes before any shelter.** Kochanski opens his fire
chapter by calling fire the most useful and important skill in bush living,
particularly in the cold, and the axe is only the most important *tool* once
fire is set aside as the exception. This is the source the project already takes
its fuel-per-shelter ratios and bough-bed life from, so the ladder follows it:
fire, then held fire, then the ground, then the roof. The Swedish handbook does
not disagree.

That handbook also supplies the argument for embers in a line: it calls the
belief that fire comes easily from rubbing two sticks together a misconception.
If starting fire is genuinely hard, keeping it is what people did, and a game
that makes the player start it afresh every errand has the difficulty in the
wrong place.

None of them says bank it, cover it, or feed it. The third sits deliberately
after the roof exists: it is reachable then, and the player discovers that the
roof they built for themselves was also for the fire. That discovery is the
whole design in miniature - the goal names where to go, and the mechanism is
found rather than told.

**On the rejected shape.** "Have a fire going for X days while feeding it only
once" was considered and does not survive two facts. The arithmetic above makes
X of 2 unreachable in winter with a log cabin, and winter is when fire matters
most. And `autoFeed` defaults on, topping the fire up whenever the player is at
camp and it falls below 3 kg - so the feed count is driven by a system the
player never consciously operates, and the goal would fail for reasons invisible
to them. Measuring continuity keeps the intent (a fire is kept, not restarted)
and drops the ambiguity.

**Tracking.** Each of the three needs a clock rather than an instant, so the
region's fire carries the spans it needs:

```ts
/** Minute the fire last went fully out here; a run of keeping is measured from it. */
litSince: number | null;
/** Minutes of rain this fire has stayed alive through, reset when it goes out. */
rainHeld: number;
```

`litSince` is set when a fire is lit from cold and cleared when it reaches
`out`; embers do not break the run. The overnight goal reads the calendar's
dusk and dawn rather than a fixed span, since a Norwegian April night and a
December night are not the same length.

## Goal 1 changes what it counts

Separately, and folded in here because it touches the same file: goal 1 credits
delivery to the camp pile today, which has two faults. It counts kilos crossing
a line into a pile with no memory of where they came from - so taking firewood
*out* of camp and putting it back credits it, an over-credit accepted at the
time and documented rather than fixed. And it points at nothing: the playtest's
complaint was that the action space is invisible, and a goal credited by arriving
somewhere with weight in the pack does not point at the list where the discovery
lives.

Crediting the **gather** fixes both. `deadwood`, `sticks` and `split` produce
firewood at a definite moment that cannot be replayed by shuffling inventory,
and the goal then points at an action on the Do list.

- Title becomes `Gather 10 kg of firewood`.
- Credit moves from the `delivered` deed to firewood produced by a gather.
- The `delivered` deed and its seams in `actions.ts` and `intent.ts` go, unless
  something else still needs them - check before deleting, and say which.
- The accepted over-credit note goes with them.

## Testing

- **Embers.** A fire running out of fuel goes to embers, not out. Embers count
  down and then it is out. Rain with no roof halves the ember window; a roof
  does not. A drowned fire leaves no embers.
- **Rekindling.** A light with embers costs no drill durability, cannot fail in
  heavy rain, and takes the short duration. A light with no embers still needs
  the drill and can still fail - the existing test must keep passing.
- **Warmth and light.** Embers warm less than a lit fire and add no lux, so
  `workLight` at an ember camp is below the handwork band.
- **The goals.** Each of the three credits on its real condition and not before:
  a fire that dies at 03:00 does not credit the overnight goal; a run broken on
  day two does not credit the three-day goal; rain that stops does not.
  **Every seam gets a mutation check** - delete the emission, watch the test
  fail, restore. The goals branch shipped four unpinned seams because the
  coverage test synthesised deeds by hand; that mistake is not to be repeated.
- **Goal 1.** Gathering credits it; delivering to camp does not; taking wood out
  of the camp pile and putting it back credits nothing.

Then `npm test`, `npm run build`, and the browser pass.

## Balance

This makes fire cheaper to keep, and the December fuel numbers are the tightest
in the game. `npm run year`, `npm run december` and the slow gates are run
**before and after**, and both readings are recorded. If the winter or year gate
moves, the reading is reported rather than the rule bent - a correct rule is
never withdrawn to keep a gate green, and `EMBER_MINUTES` is a real-north number
from the sources, not a dial to turn until the gate passes.
