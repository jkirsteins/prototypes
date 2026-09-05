# Survidle: the first producers

The producers slot of the roadmap (`2026-09-03-survidle-realism-roadmap.md`,
"The eight sub-projects, in order"), specced 2026-09-05: reading water and
the basket trap from C, the turf hut and the water store from 3, and the
capability spine's coverage test. It follows F's core and precedes B.

## 1. Why now, and the bar

F's core measured every heir dying inside 40 days. Read closer (the F row's
measurement paragraph), the heir never went to the old camp and its landing
shore had no rock; the reference heir now walks home first, and all four
heirs die of the ancestor's cause: starvation on days 36 to 53, snares over
band, fish in band, 950 to 2,600 kcal eaten a day against 3,500 to 3,700
burned. Cold sits under band through September on every heir. So the trap
is what moves the heir gate, the hut is what carries the survivor past it
into the snow, and the trough answers the away rows that die of thirst.
That is the order inside the slot: trap, hut, trough, and the roadmap's
build-order paragraph is rewritten to say so.

The bar is the heir gate: `npm run reference -- --heir`, four seeds, the
heir alive and fed at the first snow, 4 of 4. The April gate stays green.
Horizon rows 4 and 5 are added and read as findings, steered by and not
hit, as every band is.

## 2. Decisions taken

By the user, 2026-09-05, not to reopen:

- The trap needs a read shore. Reading water (Fishing 3) comes into this
  item rather than waiting for C.
- The hut is roofed in bark now. Turf, its item, its cutting task and the
  heath rule arrive with 3's siting, where "where bark or turf is within
  reach" becomes a choice the player makes.
- The capability spine's coverage test lands with this item.
- A read shore fishes at one and a half times today's odds; an unread shore
  fishes as today (approach A of the design conversation). The April gate
  was calibrated on today's odds and is not moved by a tier above it.

Mine, for the record:

- The hut includes its smoke hole. A fire lit inside warms and fills no
  room with smoke; no separate hearth. The cabin keeps its hearth rule.
- One trap per region. Fish stay alive in the basket; nothing rots in it;
  it stops catching at 5 kg. The bottleneck is emptying and the rack's
  6 kg, which is what the spine row says it leaves limiting.
- Observations live on the person, not the world. The heir reads the
  water again, an hour, until F's tree decides what Knowledge carries.
- The trough is a hollowed log, not a barrel: one log, an axe and bark.

## 3. Reading water, Fishing 3

**The task.** `read`, "Read the water", at any waterside cell, 60 minutes,
a Fishing task (`skillOf("read")` is fishing, mastery key `read`). It is in
`LOCATED`, its ground is `shore`, and it is offered wherever fishing is.
It needs no tool. Rain and night do not block it; ice does: a shore under
`ICE_SHORE_CM` says "the water is under ice".

**The observation.** `state.player.known: Record<number, Observation>`,
keyed by cell, on the person half:

```ts
interface Observation { minute: number; fish: Species[] }
```

`fish` is the fish species that live in this region whose water matches
this cell (`waterOf(s)` against `watersideCell(world, cell, kind)`), with
capacity here, whether or not they are present this season. A cell is
"read" when it has an observation; a read does not expire in this item.
`state.player.known` is emptied with the rest of the person at death and
starts empty for the heir.

**What it says.** The log line names each fish and where it lies, from a
new `lie` word per fish species in `species.ts`: perch "along the reeds",
roach "in the shallows", pike "in the reeds", whitefish "off the point",
char "in the deep water", trout "at the inflow", burbot "on the bottom",
cod and saithe "off the rocks". "You read the water at Hareskog shore:
perch along the reeds, whitefish off the point; the burbot are away until
October." A species absent now is named with its `absence` reason. A shore
with nothing in it: "You read the water: nothing lives in this water." and
the observation is written with an empty list, so the trap cannot be set
there. The region card's Fish line stays as it is, the species of the
region; the read is what this shore holds and at what rate.

**What it is worth.** `huntOdds` for a fish task at a read cell is
multiplied by `READ_ODDS = 1.5`. At an unread cell the odds are today's.
The "any" cast at a read cell draws only from the observation's species.
The trap (4) and, later, C's net set only at a read cell. The read is
recommended at Fishing 3 (`RECOMMENDED["read"] = { fishing, 3 }`), a slowdown
below it as every recommended level is, never a gate.

**Orders.** `read` is a once job (`until: once`), placed by `resolveCell` at
the nearest waterside cell as `fish` is. `yieldItem("read")` is null: it
makes nothing countable, so it is never a keep.

## 4. The basket trap, Fishing 5

> As built, the recommended level sits on a different key than this
> section names - see the "As built" note at the head of section 7.

**The item.** Recipe `basketTrap`: 6 sticks and 3 cordage, a knife, 60
minutes, out one `basketTrap` (2 kg, a tool with no durability in this
item; 4's raiders and the ice are what end it). `RECOMMENDED["craft:basketTrap"]
= { fishing, 5 }`: a Crafting task at its Fishing tier, as the spine row says.

**Setting it.** Task `setTrap`, "Set the trap", 20 minutes, a Fishing task
(mastery key `trap`), at a read waterside cell in this region with at
least one fish in its observation, with a basket trap in reach. One per
region: `RegionState.trap: { cell: number; kg: number } | null`; a region
with a trap says "the trap is set at X already". The item is consumed.
`resolveCell` places it at the nearest read waterside cell with fish; with
none read the check says "read the water first" and the reference list's
read job sits above it for that reason. Its ground is `shore`.

**Catching.** At the dawn tick in `dailyCamp`, for every region with a
trap, alive or not, `TRAP_DRAWS` draws a day. Each draw picks one species
from the trap cell's observation that is present (`popOf >= 1`, not
`absence`) and rolls `density * def.odds * TRAP_ODDS * trapFactor`, where
`TRAP_ODDS = 0.5` and `trapFactor` is the `trap` mastery's rate step: 1 to
mastery 20, 4/3 to 50, 5/3 past it, the same steps `fishKg` uses. A catch
takes one from the population and adds the species' `meatKg` times the
survivor's `yieldFactor(fishing)` to `trap.kg`; the trap does not draw at
or above `TRAP_HOLD_KG = 5`. `TRAP_DRAWS` is 4 at Fishing 5 and grows one
per five levels to 8 at 25, the rate between tiers. With nobody home the
draws use the dead survivor's last skills as the snares use nothing: the
trap draws at the base of 4 with `trapFactor` 1 and `yieldFactor` 1.

Expected against the tables' passive fishing row: a beginner at a middling
perch and whitefish shore takes about one fish a day, 0.3 to 0.6 kg, 300
to 600 kcal cooked, inside April's beginner band of 0 to 500 and at the top
of it; a Fishing 20 survivor with the pool full takes two to three, 1.5 kg,
1,500 kcal, inside the expert band of 800 to 2,500. The reference report
judges the number.

**Emptying.** Task `emptyTrap`, "Empty the trap", 15 minutes at the trap
cell, a Fishing task (mastery `trap`), moves `trap.kg` into the pack as raw
`fish`, which spoils by `SPOIL_HOURS.fish` as fish does today. It credits
the ledger source `trap` at `kg * FOODS.cookedFish.kcalPerKg`, as the fish
task credits what it cooks to. `yieldItem("emptyTrap")` is `fish`, so
`keep("emptyTrap", 1)` is "keep camp at 1 kg of fish by emptying the
trap", and blocks harmlessly on "the trap is empty". `resolveCell` sends
it to `st.trap.cell` the way `fill` goes to the ice hole. An empty trap
says so in the check; a trap with fish shows its kilos in the camp panel
and on the region card.

**Ice.** At the dawn tick, a trap whose shore is under `ICE_SHORE_CM` is
crushed: `trap = null`, "The ice has taken the trap at X." The basket is
lost and remade in spring by the player. The reference list's craft and
set jobs are once jobs and do not run again after the ice; the gate is
read at the first snow, before any shore freezes, and a spring remake is
a list change for the calibration pass to measure, not this item's.

**The gap.** A trap standing when the survivor dies keeps drawing through
the gap at the base rate until it is full or the ice takes it. The heir
finds it with its kilos, listed in the found line.

**Ledger and tables.** `YieldSource` gains `trap`; `SOURCE_ROWS.trap` is
`["passiveFishing"]`. Late August folds passive fishing into hook-and-net
today; this item splits it out as `passiveFishing: row(band(100, 400),
band(400, 1000))` and leaves the fishing row as it stands, since the
report measures each source against its own row and the calibration pass
owns the sum. Old ledger rows gain `trap: 0` in the migration.

## 5. The turf hut, Building 5

**The row.** `STRUCTURES.turfHut`: name "turf hut", 4 logs, 20 sticks,
40 bark, 4 cordage, 1,200 minutes, desc "Poles and a low earth wall under
a bark roof, a smoke hole over the hearth. Warm, dry, and a fire inside is
allowed." `RECOMMENDED["build:turfHut"] = { building, 5 }`. It needs the
fire pit first, as the cabin does, and is built at camp. It stands beside
a lean-to or a cabin; the warmest shelter counts.

**What it gives.** `shelterBonus` returns 15 for the cabin, 10 for the hut,
5 for the lean-to. `sheltered` and the roof-over-pit test in `fire.ts`
include it, so lighting and burning in rain, and firewood drying, read as
under a roof. For exposure the hut blocks rain and snow as the cabin does:
`Exposure.cabin` is renamed `walled` and is true for either. The wind term
stays the cabin's as the body model has it today; 7 owns the difference.

**Fire inside.** `lightIndoors` is legal at a hut as at a cabin. `fireWarms`
is true for a lit fire at a hut whether or not it is indoors, and
`stepSmoke` fills only a cabin without a hearth, never a hut: the smoke
hole is part of the build. `st.fire.indoors` keeps its meaning for the
rain rules.

**Decay.** `STRUCTURE_LIFE_DAYS.turfHut = 540`, `structureAge` widened to
carry it, "needs re-roofing" past two thirds of its life in the camp
panel, and `MEND.turfHut = { 20 bark, 120 minutes }`, "Re-roof the hut".
When it falls: "The roof of the hut at X has come down." and whatever the
fire's `indoors` flag was is cleared. The lean-to's machinery, no copy.

**Map and panels.** The map's shelter glyph counts the hut with the
lean-to and cabin. The camp panel lists it and its mending state.

## 6. The water store, Building 3

**The row.** `STRUCTURES.waterStore`: name "water trough", 1 log, 8 bark,
2 cordage, 180 minutes, desc "A hollowed log lined with bark. Holds 20
litres at camp." `RECOMMENDED["build:waterStore"] = { building, 3 }`. Built
at camp, no fire pit needed, no decay in this item.

**What it gives.** `campWaterCapacity(inv)` counts `WATER_STORE_L = 20` on
top of the vessels at camp when the region's trough stands, which needs
the region state at hand: the function takes it. `pourVessels` and the
fill task's "no vessel at camp to pour into" then read the trough as room.
"Keep camp at 20 litres" becomes an order the camp can hold. The trough's
water freezes and thaws by the rule the camp pile's water follows today
(water to ice below `FREEZE_C` with no fire by, thawed at a fed fire at
the rate `water.ts` gives); the spec adds no second rule.

**What it leaves.** The walk to fill it: twenty litres is ten bucket
trips, or five with two buckets, which is the chore the spine row names.
The trough's litres also count toward the camp's freeze threshold, so a
camp with a trough standing splits its buckets less often than one
without.

## 7. The reference list, the horizon rows and the reports

> **As built.** The recommended level for the trap sits on setting it
> (`RECOMMENDED.trap`), not on the craft: `masteryKey()` gives both
> `setTrap` and `emptyTrap` the one key `trap`, and a `craft:basketTrap`
> entry would never be looked up. Every producer line - the read, the
> craft, the setting job and the empty keep - sits together below the
> hunt keep, with the empty keep beside the other three, not split
> across the rack and the bow as first drafted: the calibration pass
> measured that April only affords them once everything above is met or
> blocked. The list is 36 lines. The basket craft delivers `"leave"`, so
> it stays in the pack for the walk to the shore rather than going to
> camp first.

**The list.** The reference wants gain, in order, with the reasons a
competent player would give:

- `job("read", once)` right after the fishing spear: the spear is used the
  day it exists, and the shore is read the same day.
- `job("craft", once, "basketTrap")` and `job("setTrap", once)` after the
  read.
- `keep("emptyTrap", 1)` directly above `keep("fish", 1, "any")`: empty
  what is caught before catching more, as cook sits above fish.
- `job("bark", campHas 40)` and `job("build", once, "turfHut")` after the
  rack and its hang keep and before the bow: twenty hours of roof once
  food is running, before the hunt.
- `job("build", once, "waterStore")` and `keep("fill", 20)` after the hut.
  The `keep("fill", 2)` at the top stays: the first bucket is still the
  first thing.

The kitted camp (`kitOut`) gains the trap set at the nearest read shore,
the hut and the trough, so the kitted diagnostic reads a camp with them.

**Horizon rows 4 and 5.** `HORIZON_STAGES` gains:

- `producers`: every skill at 5, fishing and building at 10, the kitted
  camp with the trap, hut and trough, band 10 to 20 days. The idle curve's
  "heir, carried keeps and the baseline" row.
- `stocked`: the same with 10 kg of dried meat, 20 litres in the trough
  and 200 kg of firewood at camp, band 20 to 60 days, the curve's ceiling
  row. It is a ceiling: a set-up that holds forever is a finding against
  the rule that nothing holds forever.

`setUpStage` takes the structures and stocks from the stage. `npm run
horizon` prints the two new rows beside the three.

**The reports.** The reference checkpoint's yield line gains `trap`. The
heir's found line gains the hut, the trough and the trap with its kilos:
"found: firePit, turfHut, waterStore; 5 snares; trap with 3.2 kg; 0 kcal
and 60 kg of firewood at camp". `HeirReport.found` gains `trapKg: number |
null`.

## 8. Save

`SaveFile.version` goes to 6; 3, 4 and 5 still load. The migration
defaults `structures.turfHut` and `structures.waterStore` to false,
`trap` to null, `player.known` to `{}`, and adds `trap: 0` to every
ledger row. `structureAge` keeps its shape with the wider key.

## 9. UI and the browser pass

- The Do panel offers Read the water at a shore, Set the trap at a read
  shore with a basket in reach, Empty the trap at the trap, Build the turf
  hut and Build the water trough at camp, each greyed with its reason.
- The region card shows "shore read" with the fish and their lies under
  its Fish line once a shore in the region is read, and "trap: 3.2 kg" when
  one is set.
- The camp panel lists the hut with its mending state and the trough with
  its litres; the water line reads "12 of 22 litres" when the trough
  stands.
- The map marks the trap cell with a small glyph; the shelter glyph covers
  the hut.

The browser pass runs seed 17 at speed to the spear, reads the shore and
sees the line, crafts and sets the trap, comes back next morning to the
kilos in the panel, empties it and cooks; builds the hut and lights a fire
indoors with no cough; builds the trough and watches "keep camp at 20
litres" fill it; then dies, begins again, walks home and reads the found
line with the trap's kilos on the landing log. The console stays clean.

## 10. The capability spine's coverage test

> As built, a row names its RECOMMENDED key(s) on a `keys` array, not the
> single `key` field below - see the "As built" note at the head of
> section 7.

`src/sim/capabilities.ts` holds `CAPABILITIES`, one row per built
capability with the spine spec's columns:

```ts
interface CapabilityRow {
  id: string;                      // "reading water"
  tier: { skill: SkillId; level: number } | "structure" | "rung";
  key: string;                     // the RECOMMENDED key, STRUCTURES id or rung kind it names
  receives: SkillId[];             // skills outside its own it takes from; [] with `alone`
  gives: string;                   // one thing, in words
  limits: string;                  // what it leaves limiting
  alone?: string;                  // why it stands alone, when it does
  producer?: true;
}
```

`tests/capabilities.test.ts` asserts both ways, and only over the spine
spec's scope (its section 5):

- Every row's `key` exists: a `RECOMMENDED` key for a tier row, a
  `STRUCTURES` id for a structure row, a `RUNG_LEVEL` kind for a rung row.
- Every `RECOMMENDED` key that names a capability has a row; species keys
  (`hunt:`, `fish:`) are content under a class and are exempt by prefix.
- Every producer has a row marked `producer`: snares, the rack, the trap,
  the trough. The list of producers is a constant in `capabilities.ts`,
  since nothing in the code marks a structure as one.
- Every delegation rung has a row.
- Every structure that unlocks a capability has a row: all of
  `STRUCTURE_IDS` except a constant `NOT_TIERS` list, which holds the
  bough bed (defensive) and nothing else today.
- Every row names a receiving skill other than its own or carries
  `alone`; a row's `gives` is not a percentage.

Rows for this item: reading water (Fishing 3, receives D's ranges via
hunting's species table, gives the trap and the net a site and the shore
a rate, limits: nothing passive yet), basket trap (Fishing 5, receives
woodcraft and crafting, producer, gives the first food a camp makes
without you, limits: emptying, the rack's 6 kg, the ice), turf hut
(structure, receives woodcraft and foraging, gives a fire inside and a
first winter, limits: re-roofing), water trough (structure, producer,
receives woodcraft, gives a week of water at camp, limits: the walk to
fill it), plus the rows already built: the rungs, the fire pit, lean-to,
cabin, hearth, rack, snares, bow, needle and the rest of the spine's
"built" rows.

The spine spec's section 5 names `src/sim/spine.ts`; that file is the
season spine, so the section is corrected to `capabilities.ts`.

## 11. Docs

- The roadmap's build-order paragraph reads "the first producers and
  stocks (C's reading water and basket trap, then 3's turf hut, then 3's
  water store)" with the reason from section 1 in the "Why the first
  producers come before B" paragraph. The F row's measurement stays.
- The spine table's rows for reading water, basket trap, water storage and
  turf hut are marked built when they are.
- The idle curve's step 4 is unchanged; its horizon table gains nothing,
  the rows are already there.

## 12. Out of scope

- Turf as a material, the heath cutting task and the region rule: 3's
  siting.
- The net (Fishing 10), seasonal water (15), the weir (20): C.
- Raiders at the trap: 4. Rust on the basket: the corpse run.
- The smokehouse and the cellar: after the trap has made spoilage the
  measured cause, by the rhythm rule.
- The dug-out, the rock shelter, the snow shelter, the hide tent: 3 and E.
- Knowledge carrying to the heir: F's tree.
- Any change to the fishing odds at an unread shore, to the April gate's
  derivation, or to the tables' fishing rows.

## 13. Measurement and done

Done when:

- `npm test` passes with the new tests: the read's observation and odds,
  the trap's draw, cap, empty, ice and gap, the hut's warmth, fire inside
  and decay, the trough's capacity and the fill keep, the migration, the
  capabilities coverage both ways, and the reference list still opening
  as it did.
- `npm run reference` is green on the April gate.
- `npm run reference -- --heir` prints the found line with the trap and
  reads the heir gate. The target is 4 of 4; the number it reads is the
  finding, and the roadmap's F row carries it.
- `npm run horizon` prints rows 4 and 5.
- The browser pass in section 9 has run and its two or three findings are
  written down.
