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
  1,500 kcal/kg with a 0.6 lean share; herring, char, salmon when it
  lands, and trout; whitefish stays lean. Roe at a tenth of the catch in
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

On `survidle/fat-and-carbohydrate` with the three runner fixes below, the
same four seeds, `npm test` green at 948 tests. Every reading is from
`.superpowers/sdd/2026-09-06-survidle-fat-and-carbohydrate/runs2/`.

The four gates, seed by seed:

| gate | 17 | 19 | 42 | 79 | reading |
|---|---|---|---|---|---|
| April, alive and fed on day 20 | pass; the life dies day 24, starved | pass; day 24, starved | pass; day 39, starved | pass; day 31, starved | **4 of 4** |
| Winter, the stocked December camp alive on 1 March | alive | alive | alive | alive | **4 of 4** |
| Year at level 20, alive on 1 April | day 107, starved | day 164, starved | day 177, starved | day 111, starved | **0 of 4** |
| Lineage, a year within six lives | 24, 45, 65, 41, 64, 36 | 24, 93, 56, 52, 171, 132 | 39, 90, 96, 166, 102, 270 | 31, 80, 73, 7, 3, 96 | **0 of 4** |

Before the fixes, on the same HEAD, the year read 98, 133, 129 and 82 days
and the lineage's lives ran 24/42/44/52/53/53, 25/44/60/48/92/95,
35/74/74/50/171/158 and 31/62/83/5/16/75. The lineage's longest life goes
from 171 days to 270. Its trend gate, which asks that each life reach at
least the one before, falls from 1 of 4 to 0 of 4: the lives are longer
and less orderly. The level-10 year probe reads 87, 147, 129 and 152 days.

**No gate week anywhere is a lean-wall week.** Lean-wall days are 0 of 7 at
every April checkpoint, in every winter month and at two of the four year
deaths; seeds 19 and 42 carry 1 of 7 in the week they died. Lean intake
over a level-20 year runs 997 to 1,211 kcal a day against the 1,600
ceiling, so the ceiling is not what the survivor stands at when it falls.
That is this item's own criterion and it is met: the wall the tables audit
found is gone.

Every starvation death, April, the first lives. All four die of a plain
shortfall in the fourth or fifth week, eating 800 to 2,100 kcal a day
against a 4,100 to 4,500 burn.

| seed | day | lean-wall days | unexploited |
|---|---|---|---|
| 17 | 24 | 0 of 7 | bones uncracked 1, roots 140.1 kg, pine ground reachable, oily fish read at the shore, spawning fish read roe at the shore |
| 19 | 24 | 0 of 7 | roots 239.0 kg, pine ground reachable, oily fish read at the shore, spawning fish read roe at the shore |
| 42 | 39 | 0 of 7 | roots 121.5 kg, pine ground reachable, oily fish read at the shore, spawning fish read roe at the shore |
| 79 | 31 | 0 of 7 | nests 11.2 clutches, roots 98.4 kg, pine ground reachable, spawning fish read roe at the shore |

Every starvation death, the year at level 20:

| seed | day | lean-wall days | unexploited |
|---|---|---|---|
| 17 | 107 | 0 of 7 | pine ground reachable, oily fish read at the shore |
| 19 | 164 | 1 of 7 | oily fish read at the shore, spawning fish read roe at the shore |
| 42 | 177 | 1 of 7 | oily fish read at the shore, spawning fish read roe at the shore |
| 79 | 111 | 0 of 7 | bones uncracked 1, pine ground reachable |

Each line reads what section 1 asked of it - a stock above zero in its
season, a species standing in the shore's read - and not what the survivor
did about it. Every line above names a source the survivor was already
working: seed 19's April line names 239 kg of roots in a week whose ledger
credits 656 kcal a day of them, and "oily fish read at the shore" stands
on a year death whose June and September camp lines both hold cooked oily
fish. Finding F7 is what that costs the line as an instrument.

kcal a day by source, April, the week before day 20:

| seed | fish | trap | snare | marrow | bark | roots |
|---|---|---|---|---|---|---|
| 17 | 0 | 257 | 377 | 206 | 0 | 73 |
| 19 | 0 | 286 | 0 | 0 | 107 | 656 |
| 42 | 0 | 0 | 189 | 51 | 149 | 1,464 |
| 79 | 0 | 143 | 189 | 51 | 160 | 546 |

kcal a day by source over the whole level-20 year, to the death:

| seed | fish | snare | hunt | marrow | eggs | roe | bark | roots | berries | gross | eaten | burn |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | 445 | 382 | 11 | 161 | 125 | 6 | 424 | 1,144 | 0 | 2,909 | 2,720 | 3,602 |
| 19 | 1,007 | 427 | 1 | 199 | 51 | 7 | 279 | 1,275 | 6 | 3,434 | 3,019 | 3,591 |
| 42 | 1,318 | 418 | 2,156 | 332 | 37 | 7 | 302 | 778 | 67 | 5,525 | 2,920 | 3,447 |
| 79 | 565 | 452 | 56 | 178 | 61 | 21 | 538 | 873 | 0 | 2,923 | 2,622 | 3,464 |

Sap and seaweed are zero on all four seeds. No reference seed's home
region holds a birch cell - `tests/reference.test.ts` has to scan the
whole terrain grid to find one anywhere in the world - and none of the
four camps is on the sea, so neither source fires on these gates at all.
That is a property of the seeds and not of the sources, and it is why both
read as free in the without table.

The winter camp's fat: the December stock's 20 kg stands at 9.2, 12.2,
10.3 and 2.1 kg on 1 March, so the ninety days drew 10.8, 7.8, 9.7 and
17.9 kg of it. The fifth spare the stock was sized with is what carried
seed 79.

The without table, `npm run year -- --without=<source>` at level 20, days
survived by seed:

| source shut | 17 | 19 | 42 | 79 | reading |
|---|---|---|---|---|---|
| none | 107 | 164 | 177 | 111 | 0 of 4 |
| marrow | 92 | 146 | 155 | 92 | 0 of 4; 15 to 22 days off every seed |
| oilyFish | 113 | 150 | 129 | 111 | 0 of 4; 14 and 48 days off 19 and 42 |
| roe | 121 | 162 | 120 | 119 | 0 of 4; 57 days off 42 |
| eggs | 89 | 149 | 161 | 113 | 0 of 4; 18 days off 17 |
| roots | 59 | 58 | 76 | 60 | 0 of 4; halves every life |
| bark | 145 | 166 | 154 | 163 | 0 of 4; 38 and 52 days longer on 17 and 79 |
| sap | 107 | 164 | 177 | 111 | 0 of 4; identical, the source never fires here |
| seaweed | 107 | 164 | 177 | 111 | 0 of 4; identical, the source never fires here |

No source's removal takes the year from its reading to 0 of 4, because the
reading is already 0 of 4: the criterion is met and says nothing. Read on
the days instead, roots are close to mandatory and inner bark is worse
than nothing (F3, F5).

The kills line, level 20:

| seed | kills | large game kcal a day |
|---|---|---|
| 17 | ptarmigan 3 | 0 (under) |
| 19 | squirrel 1 | 0 (under) |
| 42 | hazel grouse 5, deer 5, mallard 7, elk 1, squirrel 3 | 2,108 (over) |
| 79 | mallard 4, capercaillie 1 | 0 (under) |

The jackpot criterion fails on the one seed that can test it: seed 42
takes its elk on day 64, stands on 1 July with 30,370 kcal at camp -
14,580 of rendered fat and 13,200 of raw meat - and on 1 August holds 890.
`first hang never`. The fat side of the carcass works; the meat side rots
where it lies (F1).

The runner changes, and the death that asked for each:

1. `4f7d7e9`, a floating-point residue is not stock. Seed 79 at level 20,
   day 82: 2e-13 kg of roots at camp, and `consume` stops at 1e-9 and takes
   nothing, so the cook finished, left the residue where it was and was
   legal again the same minute - 22,053 cooks of a minute each, six hours
   a day, with the whole list under the cook keep waiting. The epsilon is
   named once beside `consume`'s own limit and the four stock guards read
   it instead of zero. Test: `tests/tasks.test.ts`.
2. `29deb1f`, the rack and the twenty-snare line outrank the gathering
   keeps. All four level-20 seeds, dying on days 98 to 133 having set three
   snares in a hundred days, never built a rack and never dried a kilo,
   while digging rhizomes three hours a day. A keep measured in food at
   camp can never read met while the body eats what it brings home - the
   reason the list already gives for where the log keep and the hang grind
   sit - and the gathering block went in above two standing producers. The
   rack's hour is real and a beginner has no kill to dry, so its want opens
   on raw meat in reach, which is what the list's comment always claimed
   and the code never did: built on nothing it cost seed 19 the woodpile
   and a cold death on day 22. Tests: `tests/list.test.ts`, two cases.
3. `62fad75`, a cook keep for the oily catch. Every reference seed died
   with an oily species standing in its shore's read and cooked oily fish
   never once at camp: the split gave the catch two items and the list one
   cook keep, and raw oily fish is in no auto-eat order and rots in a day
   and a half. Test: `tests/list.test.ts`.

Their effect on the level-20 year, in days: 98/133/129/82 before,
98/133/128/105 after the residue fix, 91/160/158/111 after the ranking
fix, 107/164/177/111 with the oily cook keep. April held 4 of 4 through
all three and the winter gate never moved.

The findings left for the author:

**F1. A kill's meat cannot be kept, only its fat.** Seed 42's elk leaves
13,200 kcal of raw meat at camp on 1 July and 890 kcal at camp on 1
August. The rack stands, and the hang grind never runs: it sits in the
surplus loop at the foot of the list, and the greedy scheduler never
reaches it while a food keep above is runnable. Moving it up is not a
change to make blind - the list's own record says a hang grind above the
winter-stock keeps froze two year seeds on days 300 and 325, and no seed
now reaches day 300 for the trade to be measured. This is section 7's
jackpot criterion and it fails.

**F2. Everything below the first never-met food keep is unreachable from
May to October.** That is what a greedy top-down scheduler and a keep
measured in food at camp come to together. This item widened the band:
seven gathering rows went in above the fish keep, and with them the bow,
the arrows, the needle, the clothing, the hut group and the whole surplus
loop - the woodpile and the log keep among them - stopped being reachable
in the growing season. The fixes above lift the two most valuable
producers out of that band. The rest is the list's shape rather than this
item's, and it wants a decision: either a keep on food learns to read met
against a day's intake, or the list stops being a strict ranking.

**F3. Inner bark is worse than the hour it costs.** Shutting it lengthens
seed 17's year by 38 days and seed 79's by 52. It yields about 275 kcal an
hour against fishing's 420 and root digging's 414 at level 20, so an hour
of stripping is an hour taken off two better sources. The handbook's own
words are "time-consuming, low nutrition", so the number is likely right
and the ranking wrong: bark is what a survivor strips when the water is
iced and the ground frozen, not in July. Neither the list nor `wantOpen`
has a way to say that today - the strip season is April to July, which is
exactly the wrong half of the year for it.

**F4. A level-20 survivor gathers more than it can eat and starves
anyway.** Seed 42 gathers 5,525 kcal a day over its life and eats 2,920
against a 3,447 burn. `autoEat` tops the reserve to HUNGRY_LINE and stops,
the reserve caps at KCAL_FULL, and nothing banks a surplus but drying and
rendering. With F1 unfixed the surplus has nowhere to go. The gap between
eaten and burned at level 20 is a steady 444 to 842 kcal a day, and that
gap is the whole death.

**F5. Roots are close to mandatory, and the stock is finite.** Shutting
them halves every level-20 life. A level-20 camp digs its whole regional
stock out by early July - the task then refuses with "the ground is dug
out" - and the survivor is 1,000 to 1,300 kcal a day poorer with no
replacement. Whether one survivor should be able to empty a region's
rhizomes in ninety days is the author's call: the ruling of 2026-09-05
says a shore or a heath cannot be emptied, and the root stock is the one
food population that can.

**F6. Ruling R5's winter dig is still refused, and no death named it.**
`wantOpen` opens the winter roots row on an axe in reach, but
`resolveCell` walks to the nearest root ground rather than to the cut ice
hole, so the task refuses with "the ground is frozen; an ice hole reaches
the rhizomes" on almost every winter day. No death this task measured
falls in winter - the level-20 year now ends between June and September -
so nothing asked for the fix and it was left. It will matter the first
time a seed lives to December.

**F7. The unexploited line reads a stock, not an omission.** Section 1
defines it as what stood accessible, so it cannot tell "there were roots
and the survivor ignored them" from "there were roots and the survivor dug
1,464 kcal a day of them and 121 kg were still in the ground". Every April
death above names roots the survivor was already working, and every camp
on a shore with a char in it will read "oily fish read at the shore"
forever. As written the line is a list of what the region offers. If it is
to go on deciding whether a death is a hole, it wants a second half: what
was taken from each of those sources in the week before.

**F8. Sap and seaweed are untested by this instrument.** Neither fires on
any reference seed, so both read as free in the without table for want of
an opportunity rather than for want of value. Their numbers are unmeasured
by the gates and should not be read as balanced.

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
| lean fish, cooked | 1,000 | 1.0 |
| oily fish, cooked | 1,500 | 0.6 |
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
once, in `FOODS`: 1,500 kcal/kg and a 0.6 lean share for the oily item,
1,000 and 1.0 for the lean one. A species carries nothing nutritional of
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
  dig spoils half its kilos the way an under-level craft spoils. A root
  stock per region, `ROOT_STOCK_KG_PER_CELL` (3) for each shore, bog and
  meadow cell, set on 1 April and drawn down by every dig, with no growth
  inside the year: a dug-out bog stays dug out until the next spring, so
  it is a season's larder and never a generator. Around 255 kcal an hour
  in season, 85 in winter, before the Foraging yield factor.
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
