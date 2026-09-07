# Survidle: fat and carbohydrate

The tables audit (`2026-09-06-survidle-tables-audit-design.md`) left one
finding above the others: a lone survivor has no fat or carbohydrate path
outside big game and the berry season. Meat and fish feed nothing past
1,600 kcal in a day (the lean ceiling, Kochanski's rabbit starvation), a
working body burns 3,500 to 4,500, and the game's only uncapped foods are
the fat item a big-game kill drops and the berries of July to October. So
every April first life starves in 24 to 35 days, and a level-20 camp with
a lean-only larder starves in winter with 165,000 kcal of dried meat at
its fire. That is not the north: a hunter eats marrow before meat, char
and herring carry oil, spring has eggs and roe, and the plants the Swedish
handbook budgets three hours a day for exist.

This item adds the sources and nothing else. The nutrition model stays
what the audit made it: kilocalories are the one reserve, and a daily
ceiling on lean food is the one rule. What changes is that a kill, a
catch, a shore and a pine stand each offer something the ceiling does not
touch, each in its season and at its own labour, so that a starvation
death traces to luck or strategy rather than to a simulation with no
non-lean calories in it.

Extends the tables audit (section 3, the lean ceiling and the foods;
section 5, the trap line), `2026-09-03-survidle-species-and-sound-design.md`
(the species table, its yields and mastery extras) and
`2026-09-03-survidle-standing-orders-design.md` (the runner's body tier,
the reference list). The roadmap's E (hides and clothing) keeps its
tallow as a later, third fat source and does not move.

## Decisions confirmed with the author

- **One slot, all of it.** Fat and carbohydrate in one spec, one plan,
  one branch, measured once at the end.
- **The model does not grow.** No protein, carbohydrate or micronutrient
  reserves; the lean share is an anti-overconsumption rule, not
  chemistry. The mapping is explicit (section 1).
- **Big game is the jackpot and stays so.** A peak autumn elk carries
  about 135,000 kcal of fat and that is meant to change a winter; it is
  balanced by hunting odds, spoilage and transport, never by making the
  animal lean.
- **Marrow keeps the bone.** Cracking a long bone gives marrow and
  cracked bone; the fragments still make small tools. Marrow depletes
  with the animal's condition on a 1 / 0.75 / 0.4 curve, not a floor of
  a half.
- **Fish are two classes, and the oily one is not a lump of fat**: about
  1,500 kcal/kg with a 0.4 lean share; herring, char, salmon when it
  lands, and trout; whitefish stays lean, at 0.9. Roe at a tenth of the catch in
  the spawning window, a deliberate shortcut.
- **Eggs as written**: a finite annual nest stock per region, May and
  June, half a kilo an hour.
- **Roots get a rate and a stock**: about 0.3 kg cooked-equivalent an
  hour, 0.1 in winter, a regional stock that resets each spring.
- **Sap is a half hour, not two**, with a regional cap, and never sized
  to a test.
- **Auto-eat closes the day with fat rather than hoarding it**: capped
  and perishable foods first, lean food to the ceiling, fatty food for
  what is left, surplus fat preserved.
- **Measurement is criteria, not a pass count.** The gates stay the
  instrument; "done" is that no starvation death is a lean-wall death,
  that an experienced survivor with sensible choices usually passes the
  spring bottleneck, and that no single resource is mandatory.
- **Out of scope as proposed**: nuts and acorns (the south), honey,
  mushrooms and greens, shellfish, smoking, the cellar, drying fish,
  animal condition beyond the seasonal curve, E's tallow.

## Sources

- Försvarsmakten, *Handbok Överlevnad* (1988): the 500 kcal a day
  carbohydrate ration and "count on about three hours a day to gather and
  prepare the plants you need"; birch sap at 20 g of sugar a litre, 6 to
  7 litres for the ration, 2 to 3 litres from a birch in a couple of
  hours, the rise in early May at this latitude until the leaves open;
  cattail rhizome at 210 g of starch a kilo, reed root-shoots at 5 percent,
  dandelion root at 23 percent, "15 pieces for the ration"; pine inner
  bark "time-consuming, low nutrition", usable all year, easiest on young
  branches in spring; eggs and young birds "easy to get"; berries not
  over two litres a day; the prisoner-of-war note on frozen lingonberries
  under the snow.
- Kochanski, *Northern Bushcraft*: marrow from the larger bones; the
  cambium of pine, spruce and aspen scraped in late spring and early
  summer and dried for later; a litre of sap a day from a tap; hare at
  1,000 kcal/kg and rabbit starvation.
- The author's brief (2026-09-06), which ranked the sources: fat and
  marrow essential, oily fish essential, roe and eggs high, berries the
  seasonal carbohydrate, inner bark the important fallback, roots high
  where the habitat allows, sap and seaweed low to moderate, mushrooms
  and greens not calorie sources.

## 0. Measured before

On main at b3b717c (the tables audit merged), the four seeds 17, 19, 42
and 79, `npm test` green at 907 tests:

- April, alive and fed on day 20: 3 of 4. Seed 19 eats 414 kcal a day
  against the 500 clause. First lives starve on days 24, 25, 28 and 35.
- Winter, the stocked December camp alive on 1 March: 4 of 4, on a stock
  that carries 20 kg of rendered fat because a lean-only larder starved
  all four.
- Year at level 20, alive on 1 April: 2 of 4. Seed 17 starves on day 310
  with 165,000 kcal of dried meat and 3 kg of fat at camp, the lean wall;
  seed 19 starves on day 148.
- Lineage, a year within six lives: 0 of 4; lives run 10 to 66 days.
- Kills at level 20: 4,100 to 11,600 kcal a day of large game, three to
  eight times the expert band, so the fat those kills carry is not the
  shortage; what the survivor eats of it is.

### Measured after

On `survidle/fat-and-carbohydrate` with the eleven runner fixes below, the
four reference seeds, `npm test` green at 959 tests. Every reading is from
`.superpowers/sdd/2026-09-06-survidle-fat-and-carbohydrate/runs5/`.

The four gates, seed by seed:

| gate | 17 | 19 | 42 | 79 | reading |
|---|---|---|---|---|---|
| April, alive and fed on day 20 | pass; the life dies day 23, starved | pass; day 24, starved | pass; day 36, starved | pass; day 31, starved | **4 of 4** |
| Winter, the stocked December camp alive on 1 March | alive | alive | alive | alive | **4 of 4** |
| Year at level 20, alive on 1 April | day 89, starved | day 328, froze | **alive a year** | **alive a year** | **2 of 4** |
| Lineage, a year within six lives | 23, 37, 50, 37, 112, 225 | 24, 44, 59, 54, 54, 66 | 36, 56, 47, 76, 3, 127 | 31, 55, 206, 10, 6, 81 | **0 of 4** |

Level with the tables audit's main on every gate: April above it (4 against
3), winter and the year level, the lineage level. Two seeds live the whole
year and the lineage's longest life is 225 days. The level-10 year probe
reads 155, 280, a whole year and 313 days, 1 of 4.

**The lean ceiling is what binds, and no starvation week is a lean-wall
week.** Lean intake over a level-20 year sits at 1,544, 1,575, 1,555 and
1,559 kcal a day against the 1,600 ceiling on all four seeds - the survivor
is at the wall daily - while lean-wall days read 0 of 7 at every level-20
death and every April checkpoint. Both readings are true and say different
things: the ceiling is reached every day, and the survivor always has
something non-lean beside it, so no death is the audit's lean-wall death of
a body sitting beside meat with nothing else. The non-lean side now runs
1,036 to 2,183 kcal a day, against 899 to 1,799 before the fat was kept
(F4).

**Raw fat gone off: 0.0 kg on all four seeds.** Until the eleventh fix three
quarters of every carcass's fat rotted at the fire - 48.8 kg of 69.2 on seed
19, 53.7 of 65.7 on seed 42, 31.6 of 42.0 on seed 79 - and the record said
it was rendered. It is now.

Every starvation death, April, the first lives. All four die in the fourth
or fifth week of a plain shortfall, eating 800 to 2,100 kcal a day against
a 4,100 to 4,500 burn, with lean-wall days 0 of 7 at every checkpoint:

| seed | day | unexploited |
|---|---|---|
| 17 | 23 | roots 144.0 kg, pine ground reachable, oily fish read at the shore, spawning fish read roe at the shore |
| 19 | 24 | roots 243.6 kg, pine ground reachable, oily fish read at the shore, spawning fish read roe at the shore |
| 42 | 36 | nests 3.1 clutches, roots 153.9 kg, pine ground reachable, oily fish read at the shore, spawning fish read roe at the shore |
| 79 | 31 | roots 108.6 kg, pine ground reachable, spawning fish read roe at the shore |

Every death, the year at level 20, and what each one names:

- **Seed 17, day 89, starved, lean-wall 0 of 7.** Unexploited: roots 125.9
  kg, pine ground reachable, oily fish read at the shore. Five ptarmigan and
  four reindeer, 2,463 kcal a day of large game, over the expert band, and
  no elk. It gathers 4,431 kcal a day, eats 2,580 and burns 3,626, with lean
  at 1,544 and non-lean at 1,036. The seed with no jackpot: a hunter on
  small and lean game, at the ceiling every day and a thousand kcal short on
  the side the ceiling does not touch.
- **Seed 19, day 328, froze, lean-wall 0 of 7.** Five elk, 4,877 kcal a day
  of large game, eating 3,758 against a 3,828 burn with 2,183 of non-lean -
  the best-fed of the four. It dies of cold in late February, five weeks
  from the thaw. The wood side, not the food side (F2).
- **Seeds 42 and 79, alive a year.** Three elk each, 3,224 and 2,507 kcal a
  day of large game, 1,589 and 1,912 kcal a day of non-lean food. The whole
  chain working: the hang keeps the meat, the render keeps the fat, the
  larder gate turns the hunter into a woodcutter, and the winter is cut.

kcal a day by source over the whole level-20 year, to the death:

| seed | fish | snare | hunt | marrow | eggs | roe | roots | berries | gross | eaten | lean | non-lean | burn |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | 827 | 297 | 2,485 | 202 | 150 | 43 | 172 | 0 | 4,431 | 2,580 | 1,544 | 1,036 | 3,626 |
| 19 | 303 | 702 | 5,003 | 606 | 25 | 10 | 170 | 319 | 7,200 | 3,758 | 1,575 | 2,183 | 3,828 |
| 42 | 251 | 792 | 3,306 | 613 | 17 | 15 | 192 | 296 | 5,536 | 3,145 | 1,555 | 1,589 | 3,245 |
| 79 | 346 | 564 | 3,326 | 420 | 18 | 12 | 191 | 268 | 5,200 | 3,471 | 1,559 | 1,912 | 3,523 |

Inner bark is zero on every seed: the row left the list (R8) and the task
stays for hand play. Sap and seaweed are zero as before - no reference seed
holds a birch cell in its home region and none of the four camps is on the
sea - so neither is measured by these gates at all (F8). The plant band is
the handbook's three hours split across three rows, and seaweed never opens
off the sea while eggs open only in May and June, so on most days the band
the runner actually works is one hour of roots.

The winter camp's fat: the December stock's 20 kg stands at 11.2, 8.0, 18.4
and 0.0 kg on 1 March, so the ninety days drew 8.8, 12.0, 1.6 and 20.0 kg of
it. Seed 42 draws almost none, hunting and rendering its own; seed 79 empties
it and its last week reads 6 of 7 lean-wall days, alive on 36 kg of wood. The
stocked camp begins exactly at the larder gate, so its hunt and fish rows are
shut until the larder falls under.

The without table, `npm run year -- --without=<source>` at level 20, days
survived by seed, against a baseline of 89, 328 (froze) and two whole years:

| source shut | 17 | 19 | 42 | 79 | reading |
|---|---|---|---|---|---|
| none | 89 | 328 froze | 366 | 366 | 2 of 4 |
| marrow | 119 | 358 | 109 | 366 | 1 of 4 |
| oilyFish | 305 froze | 293 froze | 366 | 366 | 2 of 4 |
| roe | 51 | 366 | 366 | 366 | 3 of 4 |
| eggs | 196 | 319 froze | 366 | 329 froze | 1 of 4 |
| roots | 54 | 366 | 366 | 366 | 3 of 4 |
| bark | 89 | 328 froze | 366 | 366 | 2 of 4; identical, the row is off the list |
| sap | 89 | 328 froze | 366 | 366 | 2 of 4; identical, the source never fires here |
| seaweed | 89 | 328 froze | 366 | 366 | 2 of 4; identical, the source never fires here |

**No single resource is mandatory: the criterion passes.** The lowest
reading with a source shut is 1 of 4 (marrow, eggs), never 0. Marrow and
eggs cost a seed a year each; roe and roots cost seed 17 its summer and
nothing else. Two seeds swing a long way in either direction (seed 17 lives
to 305 with the oily fish shut and 89 with them open; seed 42 dies on 109
with the marrow shut), which is the elk draw by midsummer and not the
source: the instrument's noise is one animal, and it is why the table is
read for a floor and not for a ranking.

The kills line, level 20:

| seed | kills | large game kcal a day |
|---|---|---|
| 17 | ptarmigan 5, reindeer 4 | 2,463 (over) |
| 19 | squirrel 26, elk 5, deer 19, mallard 35 | 4,877 (over) |
| 42 | hazel grouse 21, deer 21, squirrel 35, mallard 14, elk 3 | 3,224 (over) |
| 79 | capercaillie 8, squirrel 21, deer 10, beaver 8, mallard 9, elk 3, ptarmigan 3, reindeer 1 | 2,507 (over) |

The jackpot criterion passes. First hang falls on days 44, 12, 8 and 11, and
every kilo of every carcass's fat is rendered. Seed 17, which takes no elk,
is the seed that starves in June - which is the criterion as the spec wrote
it: one that does not take an autumn elk lives on fish, marrow and the
plants or does not live.

The runner changes, and the death or reading that asked for each:

1. `4f7d7e9`, a floating-point residue is not stock. Seed 79 at level 20,
   day 82: 2e-13 kg of roots at camp, `consume` stops at 1e-9 and takes
   nothing, so the cook finished, left the residue and was legal again the
   same minute - 22,053 cooks of a minute each, six hours a day. Test:
   `tests/tasks.test.ts`.
2. `29deb1f`, the rack and the twenty-snare line outrank the gathering
   keeps, and the rack waits for meat. All four level-20 seeds, dying on
   days 98 to 133 having set three snares in a hundred days and never dried
   a kilo. Tests: `tests/list.test.ts`, two cases.
3. `62fad75`, a cook keep for the oily catch. Every seed died with an oily
   species in its shore's read and cooked oily fish never once at camp: raw
   oily fish is in no auto-eat order and rots in a day and a half. Test:
   `tests/list.test.ts`.
4. `dcd7dfe`, the plant band is hours a day and not kilos at camp. The
   plant keeps and their cook keeps fed each other and took four and a half
   to seven and a half hours a day; three of four level-20 seeds killed
   nothing at all. Roots, eggs and seaweed became counted jobs given afresh
   each morning, PLANT_HOURS_PER_DAY split across the three rows the band
   holds. Alone it was a regression - 71, 66, 97 and 69 days - and it is
   the change the next two needed. Tests: `tests/list.test.ts`, two cases.
5. `2bca00e`, inner bark leaves the standing list. The without probe read
   it: shutting it lengthened the year by 38 days on seed 17 and 52 on seed
   79, since a level-20 strip hour books about 275 kcal of flour on the
   ledger (0.7 kg of fresh bark an hour at the skill's 1.5 yield factor,
   dried three to one, at 800 kcal/kg; 187 at level 1, and less again once
   the grinding hour is counted) against fishing's 420 and root digging's
   414 on the same ledger. Test: `tests/list.test.ts`.
6. `b336750`, the hang grind waits for meat that will rot and waits above
   the plant band. Seed 42 stood on 13,200 kcal of raw meat on 1 July beside
   the rack it had built and held 890 on 1 August: first hang never. The
   threshold is derived from raw meat's spoil hours against the lean ceiling
   at raw meat's kcal a kilo. Test: `tests/list.test.ts`.
7. `9c52611`, a winter roots order walks to the open ice hole (ruling R5).
   `wantOpen` had opened the winter row since the roots went in and
   `resolveCell` sent the dig to the frozen bog, so it was refused every
   winter day and never once ran. It has no gate reading of its own: no seed
   lived to a winter dig when it landed. Test: `tests/roots.test.ts`.
8. `9613bc8`, the hunt keep sits above the plant band and the fish keep.
   With the band capped the freed hours went to the fish keep, the same
   never-met shape, and the hunt keep under it got nine minutes to an hour
   and twenty a day while three of four seeds killed no large game. A large
   kill meets a hunt keep for days, which a fish keep never is. The bow and
   the arrows stay below, since lifted with it they cost seed 19 the
   woodpile and a cold death on day 22 of the April gate. Test:
   `tests/list.test.ts`.
9. `98512e1`, an unload that moves nothing is not a step taken. A hunt with
   a bow keeps its arrows, so `dropEverything` can never empty its pack, and
   the delivery branch claimed that empty unload as a step and took it again
   every minute after. A level-20 camp on seed 19 stood at its own fire for
   fourteen hours a day "unloading at camp": it worked 1.3 hours a day for
   six weeks, gathered 5,645 kcal a day with an elk down on day 10, ate 483
   and starved on day 42. Test: `tests/intent.test.ts`.
10. `d0eebce`, the hunt and the fish shut once the larder is a winter's
    worth. Seed 19 froze on day 305 with ten elk behind it, 829,835 kcal at
    camp and three logs: both rows are promises about raw food at camp,
    neither reads met while there is meat to hang, and the woodpile keeps
    beneath them never ran. The line is WINTER_FOOD_KCAL, the kcal of the
    winter stock's own 80 kg of dried meat and 20 kg of fat, derived. No
    April life or heir comes near it and no seed reaches it before
    midsummer. Test: `tests/list.test.ts`.
11. `1fb14fb`, the fat renders as a grind gated on raw fat in reach. A keep
    of one kilo of rendered fat reads met the moment the first kilo is off
    the fire, and camp fat is drawn only by auto-eat, last in the order, at
    a fifth of a kilo a day - so an elk's nine to fifteen kilos of raw fat
    sat beside the fire and rotted in three days with the row reading met.
    Three quarters of every seed's fat went that way, 483,000 kcal on seed
    42 in the year it lived, while this record said it was rendered. The
    crack and hang shape, gated on TRACE_KG, no new constant. Test:
    `tests/list.test.ts`.

The level-20 year in days as the fixes landed: 98/133/129/82 at the start of
the audit, then 98/133/128/105, 91/160/158/111, 107/164/177/111, 71/66/97/69,
71/65/82/65, 83/70/89/84, 84/43/366/186, 84/305/366/186, 84/281/366/186 and
89/328/366/366. Fix 7 has no reading of its own, for the reason given above.
April held 4 of 4 from the second fix on and the winter gate never moved.
The findings run F2, F3, F4, F5, F7, F8 and F11: F1 and F6 closed with fixes
6 and 7, F10 closed with fix 11 (the without table's floor is 1 of 4, not 0),
and there was never an F9.

The findings left for the author:

**F2. The food rows still outrank the woodpile whenever the larder dips.**
The larder gate closes them at a winter's food and reopens them under it,
which is what lets a seed stock 500 to 600 kg of firewood and 140 to 165
logs by midwinter. But the gate is a step, not a band: seed 19 burns its
autumn pile, its larder settles under the line, the hunt row opens again and
the camp is out after game with nothing to burn. It froze on day 328, five
weeks from the thaw. A hysteresis band would answer it and would be a new
constant, so it is left. Underneath is the same shape as ever: a keep
measured in food at camp cannot read met, and everything below it waits.

**F3. Inner bark is worse than the hour it costs.** At the handbook's
yield a strip hour is 0.7 kg of fresh bark, 0.23 kg of flour after the
three-to-one drying, 187 kcal at 800 a kilo, before the grinding hour is
counted; the ledger's level-20 reading of about 275 carries the skill's
1.5 yield factor, against fishing's 420 and root digging's 414 on the same
ledger. The row is off the list and the task stays.

The author's answer, after review: the yield and the April-to-July window
stay as the handbook gives them, and neither is buffed to compete with
fish or roots, since bark that made sense as everyday food would lose what
makes it interesting. Pine bark is an inefficient but storable emergency
carbohydrate: harvested when the tree allows it, in the peeling window,
and kept for the winter, so summer labour becomes winter insurance rather
than the best thing to eat today. It does not belong on a calorie-
maximising standing list, and if autonomous play ever needs it the shape
is a winter-stock target ("store 3 kg of bark flour"), harvested to a
bound in season and then stopped, not a wantOpen row. A player should
read it as bad food economics that February may make them wish they had
stored.

**F4. The lean ceiling is what a level-20 survivor stands at, every day.**
Lean intake sits within 56 kcal of the 1,600 ceiling on all four seeds, in
the year they live and the year they do not. With the fat kept the non-lean
side reaches 1,036 to 2,183 kcal a day, and that is the difference between a
seed that lives a year and one that does not: seed 17 at 1,036 dies in June,
seeds 19, 42 and 79 at 1,589 to 2,183 reach February or the whole year. So
the sources are enough when the animals are there and not otherwise, and the
question the author is left is narrower than it was: not whether the ceiling
is too low, but whether a survivor who draws no elk in a summer should have
a third fat source (E's tallow is the named candidate) or should die. Two of
the three readings the earlier record put here - that a carcass carries too
little fat, and that the item's sources come to under 1,800 - were the
runner throwing the fat away, and are withdrawn.

The author's answer, after review: both fish classes were leaner than the
fish. Char, trout and herring in condition are 8 to 12 percent fat by
weight, so most of their calories come as fat, and the oily class's lean
share is 0.4 rather than 0.6; pike, perch and whitefish carry a percent or
two of fat, so the lean class is 0.9 rather than 1.0. Measured on the
level-20 year with only those two numbers moved: seed 17 lives through the
summer and the autumn on its fish and fourteen reindeer and freezes on day
284, the F2 shape and not the ceiling; seeds 19, 42 and 79 live the year;
the gate reads 3 of 4, from 2. April holds 4 of 4 on days 24, 24, 33 and
29, and the lineage reads 1 of 4 within six lives, from 0: seed 42's
fifth life reaches the year. The tables above were measured at 0.6 and
1.0 and are left as they were; F4 closes, and what remains of a summer
with no elk is F2's freeze.

**F5. Roots are close to mandatory for a seed with no elk, and the stock is
finite.** Shutting them takes seed 17 from 89 days to 54 and costs the other
three nothing. A level-20 camp digs its regional stock out and the task
refuses with "the ground is dug out"; the 2026-09-05 ruling says a food
population cannot be emptied, and the root stock is the one that can.

The author's answer, after review: roots are a renewable local resource
rather than a regional stock. A cell holds what its stand carries - a reed
or cattail fringe at the water, a wet cell's margins, a meadow's sparse
taproots, about 810, 1,350 and 90 kg against a dig of 0.3 kg an hour - and a
dig draws from the cell under foot, so a patch dug below half of what it
holds digs slower and reads dug over, an emptied one is dug out, and half of
what a cell is short comes back across each growing season. Measured on the
level-20 year with the dig rate, the cooked value and the season untouched:
the year gate holds 3 of 4 on the same days, seed 17 freezing on day 284;
April holds 4 of 4 on days 24, 24, 33 and 29; the lineage holds 1 of 4,
seed 42's fifth life reaching the year. Roots run 164 to 191 kcal a day over
the year, and each seed digs one cell and leaves it at 92 to 94 percent of
full, so no cell on any seed reads dug over or dug out on any day. The
source still matters: shut for the year it costs seed 17 and seed 19 their
winters, which freeze on days 287 and 315, and the gate reads 2 of 4. The
older without-roots reading (54, 280, 281, 116) was taken before the fish
carried their real fat, so it and this one are not the same instrument. F5
closes, and what a dug-out patch means now is that the next patch is a walk
away.

**F7. The unexploited line reads a stock, not an omission.** It cannot tell
"there were roots and the survivor ignored them" from "there were roots and
the survivor dug 172 kcal a day of them and 126 kg were still in the
ground", and every camp on a shore with a char in it reads "oily fish read
at the shore" forever. It also cannot see what rotted before the death,
which is why it never named the fat that fix 11 answered. If it is to keep
deciding whether a death is a hole it wants a second half: what was taken
from each source in the week before.

**F8. Sap and seaweed are untested by this instrument.** Neither fires on
any reference seed - no birch in reach, no sea camp - so both read as free
in the without table for want of an opportunity rather than for want of
value.

**F11. The lineage is the gate that has not moved.** Its lives run 3 to 225
days and the trend gate is 0 of 4. A list that ranks hunting first suits a
level-20 camp with a bow and a rack; an heir landing in October with an
arrival kit is a different player, and the reference list is one list. The
survivor ladder puts a full year at rows 4 to 6, reached by a lineage, so
this is the gate that most wants a list of its own.

**For the author's list beside F4: a hare's bone is an elk's.** `crack`
gives MARROW_KG_PER_BONE (0.1 kg, 900 kcal) a bone whatever the animal, so a
hare's single bone carries three quarters of its meat's calories. It is what
section 2 wrote and Kochanski wrote "the larger bones", so it is recorded
and not changed. Marrow is 202 to 613 kcal a day on these seeds, which is
where it lands.

## 1. The model

Kilocalories stay the one reserve. Each food carries a lean share, the
part of its kcal that counts toward `LEAN_KCAL_PER_DAY` (1,600). The
share is a number per food in `FOODS` (`leanShare`, replacing the
`LEAN_FOODS` set), and `creditLean` books `gain * leanShare` rather than
the whole gain:

| food | kcal/kg | lean share |
|---|---|---|
| raw meat, cooked meat | 1,100 | 1.0 |
| dried meat | 3,300 | 1.0 |
| lean fish, cooked | 1,000 | 0.9 |
| oily fish, cooked | 1,500 | 0.4 |
| roe | 1,600 | 0.5 |
| eggs | 1,500 | 0.4 |
| fat (rendered), marrow | 9,000 | 0 |
| berries | 450 | 0 |
| bark flour | 800 | 0 |
| roots, cooked | 850 | 0 |
| seaweed | 200 | 0 |

A portion whose lean part would cross the ceiling is credited only the
room left, as today, and the refusal, the log line and the Do row's
reason are unchanged. The berry gut rule becomes a per-food ceiling
table, `GUT: Partial<Record<FoodId, { fullCreditKg, refuseKg }>>`, with
berries at 1.2 and 2 as today, bark flour at 0.5 and 1, seaweed at 2 and
2; the counter on the player becomes a record by food. Nothing else about
the body changes: no new reserve, no condition, no vitamins.

The lean ceiling is the rule the whole item answers to, so the report
gains two readings beside the gate week. **Lean-wall days**: the days the
week's lean intake sat at the ceiling with lean food at camp and no fat,
roe, eggs or plant food eaten. And for every starvation death, an
**unexploited line**: the non-lean calories that were accessible in the
last week and not taken, read from the state at the death: fat, roe or
eggs lying at camp or in the pack; raw fat unrendered; bones uncracked at
camp; a nest stock above zero in its season in the region; a root stock
above zero in its season with a shore, bog or meadow cell reachable;
pine ground in the region in the strip season; an oily species in the
shore's read; sap in its window on birch ground; seaweed on a sea shore.
The line names each with its kcal or kilos, or reads "none". A death
with a non-empty line is a hole, in the food system or in the runner; a
death whose line reads "none" is luck or strategy. Section 7 says what
each means for done.

## 2. The carcass

A kill yields meat, fat, bone and sinew as today. Two things change.

**Fat by season.** The species' `fatKg` is its peak, and a curve per
class scales it by month:

| class | Aug to Nov | Dec to Feb | Mar to May | Jun to Jul |
|---|---|---|---|---|
| ungulates (deer, reindeer, elk) | 1.0 | 0.5 | 0.2 | 0.6 |
| bear | 1.0 (Sep, Oct) | denned | 0.3 (Apr, May) | 0.6 |
| beaver | 0.8 all year | | | |
| the rest (fox, wolf, wolverine) | 0.5 all year | | | |

Peak values move to the animals the handbooks describe: roe deer 2 kg,
reindeer 6, elk 15, bear 25, beaver 3. The fat figure abstracts suet,
depot fat and other fatty tissue; other edible offal is in the meat
figure. No new item.

**Fat spoils until it is rendered.** A kill's fat comes off as `rawFat`,
perishable like cooked meat (72 warm hours, half rate to -10 C, keeps
under it); "render fat" at a lit fire, ten minutes a kilo, turns it into
the `fat` item, which keeps as today. The runner's cook keep takes raw
fat the way it takes raw meat. This is the storage lever the author named:
an autumn elk is 15 kg of raw fat that must be carried home and rendered
inside three days, or it is gone.

**Marrow.** "Crack bones", a camp task with a stone or the axe in reach,
twenty minutes a bone: each bone gives `MARROW_KG_PER_BONE` (0.1) of
marrow, credited and stored as `fat` (rendered; marrow keeps), and one
`crackedBone`. Marrow follows the animal's condition on the same month
curve as its fat, mapped 1 / 0.75 / 0.4 at curve values 1 / 0.5 / 0.2
(linear between), so a March elk's bones still give 40 percent. The
needle recipe accepts a bone or a cracked bone (`alt`); the hook and the
awl are not built here. A bone cracked is a bone the survivor chose
marrow over, and it still makes a needle.

## 3. Fish and roe

Fish split into two items by species, at the catch: `fish` (lean) and
`oilyFish`, with `cookedFish` and `cookedOilyFish`. The class is defined
once, in `FOODS`: 1,500 kcal/kg and a 0.4 lean share for the oily item,
1,000 and 0.9 for the lean one. A species carries nothing nutritional of
its own: only `oily: true` (herring, arctic char, brown trout, and salmon
when the rivers item lands; perch, pike, burbot, cod and whitefish stay
lean) and a spawning window `spawn: [from, to]` in months (0-based):
perch and pike April to May, whitefish October to November, char and
trout September to October, burbot January to February, herring and cod
March to April. The trap draws whichever it holds. A catch inside its
window also yields `roe` at a tenth of the catch weight, perishable as
fish is (36 warm hours), eaten raw or cooked at the same value. No sex,
maturity or gonad state: the tenth is the shortcut, and no later species
gets a nutrition line of its own.

The manual's food line becomes "you need fat: marrow, oily fish, eggs and
roe in their season".

## 4. Eggs

A nest stock per region, set on 1 May from the nesting birds' density:
`nests = sum over waterfowl and grouse present of capacity * density /
4`, a clutch `EGG_CLUTCH_KG` (0.4). "Gather eggs" is a Foraging task at
the shore (waterfowl) or the heath (grouse), sixty minutes, taking
`EGG_KG_PER_HOUR` (0.5) while the stock lasts and refused with "the nests
are empty" after; open in May and June (`EGG_FROM_DOY` 120, `EGG_TO_DOY`
181), the stock cleared on 1 July. Eggs 1,500 kcal/kg, lean share 0.4,
perishable at ten days above zero. A region with a lake and a heath holds
some 20 to 40 clutches, 8 to 16 kg, 12,000 to 24,000 kcal a spring: worth
the hours, gone by midsummer.

## 5. The plant row

Five Foraging tasks, each with the handbook's number and a reason it is
not a potato field.

- **Berries under the snow.** The pick task opens from November to April
  at `BERRY_WINTER_SHARE` (0.2) of the summer rate, only where the snow
  is under `DEEP_SNOW_CM`; the Do row reads "frozen lingon under the
  snow". Not dependable, by design; the winter-berries clause in the
  tables' plants row.
- **Pine inner bark.** "Strip inner bark" on pine ground with a knife,
  sixty minutes for `BARK_FRESH_KG_PER_HOUR` (0.7) of `freshBark`, at
  full from April to July (young branches and the sap rise, the
  handbook's easiest time) and half otherwise; it dries by the wood
  rule (a lit fire or a cabin 2 kg an hour, dry weather 0.5) into
  `driedBark` at three to one, and "grind bark" with a stone, twenty
  minutes a kilo, makes `barkFlour` at 800 kcal/kg, full credit to 0.5 kg
  a day and refused past 1. Each kilo stripped draws `BARK_TREE_SHARE`
  (1/20) of a tree from the region's felling stock, checked in the plan
  against that stock's regrowth (60 trees a forest cell, half a tree a
  cell a year): a camp stripping a kilo a day loses a tree every three
  weeks. About 200 kcal an hour of work over the three steps: the help
  nobody wants to live on.
- **Roots and rhizomes.** "Dig roots" at a shore or bog cell (cattail
  and reed rhizome) or a meadow cell (dandelion root) with a stick in the
  pack, sixty minutes for `ROOT_KG_PER_HOUR` (0.3) of `roots` from April
  to October and `ROOT_WINTER_KG_PER_HOUR` (0.1) from November to March
  through an ice hole at the shore; roots must be cooked (the cook task
  takes them, `cookedRoots` at 850 kcal/kg), and eaten raw they credit
  half. Identification is a recommended Foraging level of 3: below it a
  dig spoils half its kilos the way an under-level craft spoils. Around
  255 kcal an hour in season, 85 in winter, before the Foraging yield
  factor.

  Availability is per cell and renewable. A cell is 300 m on a side, nine
  hectares, and it holds its own stand: `RHIZOME_KG_PER_M2` (3, fresh
  mass at the low end of published below-ground biomass for a Phragmites
  or Typha stand, 1 to 3 kg dry the square metre at about three times dry)
  over the stand's share of that ground - `STAND_SHARE_SHORE` (0.03, a
  10 m reed fringe along a 300 m water edge), `STAND_SHARE_BOG` (0.05, a
  wet cell's open-water margins and hollows) or `STAND_SHARE_MEADOW` (0.1)
  at `MEADOW_ROOT_KG_PER_M2` (a thirtieth of the density, for dandelion,
  bistort and silverweed) - times `ROOT_HARVEST_FRACTION` (0.1) for the
  share a digging stick lifts, the rest being too deep, too small or left
  for the stand. That is about 810 kg at a shore, 1,350 on wet ground and
  90 on a meadow, against a dig of 0.3 kg an hour; ground that is both
  waterside and wet takes the larger figure, not the sum. Every share is
  coarse by design. A dig draws from the cell under foot alone
  (`RegionState.rootCells`, cell index to kilos, holding only the cells
  that have been dug; an absent cell is at full), and below
  `ROOT_POOR_SHARE` (0.5) of what it holds a patch gives up its roots in
  proportion - a quarter of full digs at half rate - and its row reads
  "dug over here, the next patch is better", with the walk aimed at the
  nearest cell still above the line. Only an emptied cell is dug out.
  `ROOT_REGROWTH_SHARE` (0.5) of what a cell is short comes back across
  each growing season, `ROOT_GROWTH_FROM_DOY` (121, 1 May) to
  `ROOT_GROWTH_TO_DOY` (273, the end of September), spread over the
  window's days at the daily fraction that compounds to the season's
  share: perennial clonal rhizome rebuilds from what stays in the ground.
  So a patch goes poor and then out where you stand, temporarily and
  locally, and one survivor cannot empty a region.
- **Birch sap.** "Tap a birch" on birch ground with a knife, thirty
  minutes, in the sap rise (`SAP_FROM_DOY` 121 to `SAP_TO_DOY` 141, early
  May until the leaves open at this latitude): 2.5 litres drunk on the
  spot, water to full and `SAP_KCAL` (125) credited as carbohydrate, at
  most `SAP_TAPS_PER_DAY` (3) a day in a region. No boiling down. A
  three-week bonus, never a strategy.
- **Seaweed.** "Gather seaweed" on a sea-shore cell, sixty minutes for
  `SEAWEED_KG_PER_HOUR` (2), 200 kcal/kg, gut ceiling 2 kg a day, all
  year while the shore is open. The coastal camp's 400 kcal, no more.

None of the five is gated by a rung above jobs; roots carry the
recommended level, the rest are a beginner's work.

## 6. The runner, the list and the panel

**Auto-eat.** The rule becomes: eat capped and perishable foods first
(berries, seaweed, roots, bark flour, eggs, roe, the fish), then lean
food up to the ceiling, then fatty food for what the hungry line still
wants, and stop, so surplus fat is kept. Concretely `AUTO_EAT_ORDER`
is berries, seaweed, cookedRoots, barkFlour, eggs, roe, cookedFish,
cookedOilyFish, cookedMeat, driedMeat, fat, and `autoEat` no longer
returns after the first food that could be eaten: it walks the order
until the reserve is back over the hungry line, taking a refused lean
food as a skip, so a body at the lean wall with fat at camp eats the fat.
The hungry step's `canFeed` reads the same walk, so the runner never
starves beside fat. The away summary names what was eaten by kind.

**The reference list** gains, in the food group after the cook keeps:
`keep cook rawFat 1` (render), a `crack` grind at camp (leave), `keep
eggs 2 kg` (open May to June), `keep roots 2 kg` and `keep cook roots 1`
(open April to October, and in winter with an ice hole), `keep barkFlour
1 kg` with its strip and grind keeps (open April to July for the strip),
`tap` as a once job a day in the sap window, and `keep seaweed 2 kg` for
a coastal camp. `wantOpen` gates each by its window; the winter roots
keep opens only with an axe in reach. The cook keep for raw fat sits
above the meat cook keep, since fat is the first thing to lose.

**The Do panel** shows the five plant tasks under "gather", "crack bones"
and "render fat" under "camp", and "gather eggs" under "gather"; each row
says its season and its reason when shut ("the nests are empty", "the
sap has stopped", "the bog is dug out", "not more bark today").

**The ledger** gains sources `marrow`, `eggs`, `roots`, `bark`, `sap`,
`seaweed` and `roe`; `SOURCE_ROWS` maps marrow and roe onto the hunting
and fishing rows they came from, eggs onto birds, and the plants onto the
plants row. The April plants band for a beginner moves from 0 to 150 to
0 to 400 kcal a day and the experienced band to 200 to 800, on the
handbook's three hours a day for the 500 kcal ration; the old band was
written when the row had no task.

## 7. Measurement and done

The four gates stay the instrument, and each run's report gains the
lean-wall days beside the gate week and the kcal per source. Done is
read against criteria, not a count:

- **Every starvation death has a cause the audit can name.** For each
  gate seed that starves, the unexploited line (section 1) decides: a
  line that names accessible non-lean calories is a hole, and the hole
  is closed before the item is done - in the food model if the calories
  could not be eaten, in the runner or the list if they could and were
  not (the tables audit's rule: a runner death is fixed, in the same
  task, with the death that asked for it). A line that reads "none" is
  luck or strategy, reported and left. No gate seed may starve with its
  last week all lean-wall days and a non-empty line.
- **An experienced survivor usually passes the spring.** The level-20
  year probe and the kitted April run read 3 or 4 of 4 through May; the
  from-scratch April gate is reported, expected 3 or 4 of 4, and a
  beginner dying there is a survival story if its week is not a
  lean-wall week.
- **No single resource is mandatory.** `npm run year -- --without=<source>`
  disables one source (marrow, oilyFish, roe, eggs, roots, bark, sap,
  seaweed) and runs the level-20 year; done is that no source's removal
  takes the year from its reading to 0 of 4.
- **The jackpot is a jackpot.** A level-20 seed that takes an autumn elk
  and renders its fat carries the winter on it; one that does not lives
  on fish, marrow and the plants or does not live. The year report's
  kills line says which.
- **The lineage climbs.** Reported within six lives; if a life reaches
  a year the number of lives stays, and if not, the number of lives is
  the lever the author allowed, raised in the report and not the foods.

Nothing in the item is tuned to a seed's shortfall: sap is 125 kcal
because a litre is 20 g of sugar, not because seed 19 was 86 short.

## 8. Roadmap and docs

- The roadmap gains item K, fat and carbohydrate, after J, with the
  curve line: horizon rows 4 and 5 (a camp that holds a week on what it
  gathers), survivor rows 2 to 4; tiers Foraging 3 for roots; expected
  to move the year at level 20 and the first lives past the berries; and
  the "Measured with" paragraph in the house style.
- "What the north yields" gains the sources and the plant band's move.
- E's paragraph records that its tallow is the third fat source.
- The README's food paragraphs and the manual's food section move.

## 9. Out of scope

Nuts and acorns (the south); honey; mushrooms, greens and shoots;
shellfish and crayfish; smoking and the cellar (camp build-out); drying
fish; a condition model for animals beyond the month curve; sap boiled
down; hooks and awls from cracked bone; E's tallow.

**Built.** On `survidle/fat-and-carbohydrate`, commits b3b717c to HEAD,
the plan's twelve tasks. Section 0's "Measured after" carries the final
readings.
