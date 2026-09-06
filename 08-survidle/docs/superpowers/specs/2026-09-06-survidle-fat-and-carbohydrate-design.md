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

On `survidle/fat-and-carbohydrate` with the nine runner fixes below, the
four reference seeds, `npm test` green at 954 tests. Every reading is from
`.superpowers/sdd/2026-09-06-survidle-fat-and-carbohydrate/runs3/`.

The four gates, seed by seed:

| gate | 17 | 19 | 42 | 79 | reading |
|---|---|---|---|---|---|
| April, alive and fed on day 20 | pass; the life dies day 23, starved | pass; day 24, starved | pass; day 36, starved | pass; day 31, starved | **4 of 4** |
| Winter, the stocked December camp alive on 1 March | alive | alive | alive | alive | **4 of 4** |
| Year at level 20, alive on 1 April | day 84, starved | day 305, froze | **alive a year** | day 186, starved | **1 of 4** |
| Lineage, a year within six lives | 23, 37, 50, 37, 80, 30 | 24, 44, 88, 19, 54, 50 | 36, 56, 47, 78, 96, 112 | 31, 55, 97, 3, 11, 106 | **0 of 4** |

Against the tables audit's main (April 3 of 4, winter 4 of 4, year 2 of 4,
lineage 0 of 4): April and winter are at or above it, the lineage is level,
the year is one below. Seed 42 is the first seed on this branch to live a
whole year, and seed 19 reaches 305 days and then freezes rather than
starves. The level-10 year probe reads 140, 119, 263 and 246 days.

**The lean ceiling is what binds now, and no starvation week is a lean-wall
week.** Lean intake over a level-20 year sits at 1,579, 1,588, 1,592 and
1,587 kcal a day against the 1,600 ceiling on all four seeds - the survivor
is at the wall every day - while lean-wall days read 0 of 7 at both
starvation deaths and 1 and 2 of 7 on the two seeds that got through the
summer. Both readings are true and they say different things: the ceiling
is reached daily, and the survivor always has something non-lean beside it
to eat, so no death is the audit's lean-wall death of a body sitting beside
meat with nothing else. What kills is that the non-lean side runs 899 to
1,955 kcal a day where the shortfall is 400 to 1,100 (finding F4).

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

- **Seed 17, day 84, starved, lean-wall 0 of 7.** Unexploited: roots 127.3
  kg, pine ground reachable, oily fish read at the shore. It hunts - five
  ptarmigan and three reindeer, 1,957 kcal a day of large game, over the
  expert band - and takes no elk. Over its life it gathers 3,905 kcal a
  day, eats 2,477 and burns 3,605, with lean at 1,579 and non-lean at 899.
  This is the seed with no jackpot: a hunter on small and lean game, at the
  ceiling every day, 1,100 kcal a day short on the side the ceiling does
  not touch.
- **Seed 19, day 305, froze, lean-wall 2 of 7.** It has ten elk, 11,601
  kcal a day of large game, and dies in late January with 829,835 kcal at
  camp - 745,965 of it dried meat - beside 36 kg of firewood and three
  logs. Nothing about this death is food. The winter-stock keeps, 600 kg
  of split wood and 300 logs, sit below the food rows and never get their
  turn (F2).
- **Seed 42, alive a year.** Twelve elk, 11,355 kcal a day of large game,
  1.1 million kcal at camp on 1 February. This is the jackpot working.
- **Seed 79, day 186, starved, lean-wall 0 of 7.** Unexploited: roots 55.3
  kg, spawning fish read roe at the shore. It dies on 3 October **with
  184,205 kcal at camp, 183,095 of it dried meat**. Its last week eats
  2,984 against a 3,491 burn with lean at the ceiling and berries, roots
  and marrow beside it. This is the tables audit's finding restated in the
  item's own terms: the ceiling holds, the survivor eats what non-lean food
  it has, and the non-lean sources cannot find the last five hundred
  calories while a fifth of a tonne of dried meat lies at the fire.

kcal a day by source over the whole level-20 year, to the death:

| seed | fish | snare | hunt | marrow | eggs | roe | roots | berries | gross | eaten | lean | non-lean | burn |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 17 | 871 | 251 | 1,980 | 159 | 159 | 46 | 169 | 0 | 3,905 | 2,477 | 1,579 | 899 | 3,605 |
| 19 | 928 | 446 | 11,860 | 788 | 27 | 15 | 131 | 119 | 14,379 | 3,542 | 1,588 | 1,955 | 3,838 |
| 42 | 1,121 | 564 | 11,633 | 865 | 18 | 21 | 163 | 188 | 14,626 | 3,285 | 1,592 | 1,693 | 3,416 |
| 79 | 972 | 291 | 5,156 | 348 | 36 | 25 | 268 | 299 | 7,502 | 2,984 | 1,587 | 1,397 | 3,491 |

Inner bark is zero on every seed: the row left the list (R8) and the task
stays for hand play. Sap and seaweed are zero as before - no reference
seed's home region holds a birch cell, and none of the four camps is on the
sea - so neither is measured by these gates at all (F8).

The winter camp's fat: the December stock's 20 kg stands at 9.0, 7.8, 9.1
and 0.7 kg on 1 March, so the ninety days drew 11.0, 12.2, 10.9 and 19.3 kg
of it. The stock's fifth spare is what carried seed 79, and only just.

The without table, `npm run year -- --without=<source>` at level 20, days
survived by seed, against a baseline of 84, 305 (froze), a whole year, and
186:

| source shut | 17 | 19 | 42 | 79 | reading |
|---|---|---|---|---|---|
| none | 84 | 305 froze | 366 | 186 | 1 of 4 |
| marrow | 75 | 128 | 104 | 164 | **0 of 4**; the year seed loses 262 days |
| oilyFish | 54 | 123 | 247 | 186 | **0 of 4** |
| roe | 51 | 135 | 329 froze | 259 | **0 of 4** |
| eggs | 87 | 276 froze | 366 | 254 | 1 of 4 |
| roots | 54 | 272 | 186 | 116 | **0 of 4**; halves seed 17 and 42 |
| bark | 84 | 305 froze | 366 | 186 | 1 of 4; identical, the row is off the list |
| sap | 84 | 305 froze | 366 | 186 | 1 of 4; identical, the source never fires here |
| seaweed | 84 | 305 froze | 366 | 186 | 1 of 4; identical, the source never fires here |

**The criterion fails on four sources.** Marrow, oily fish, roe and roots
each take the level-20 year from 1 of 4 to 0 of 4. The instrument is weak -
one seed reaches a year, so any source that seed leans on reads as
mandatory - but the direction is not in doubt: with the survivor at the
lean ceiling every day, every non-lean source is load-bearing, and the four
that fire on these seeds all are. It is the same reading as F4 from the
other end. Finding F10.

The kills line, level 20:

| seed | kills | large game kcal a day |
|---|---|---|
| 17 | ptarmigan 5, reindeer 3 | 1,957 (over) |
| 19 | squirrel 71, elk 10, mallard 72, deer 42 | 11,601 (over) |
| 42 | hazel grouse 86, deer 49, squirrel 121, elk 12, mallard 39, willow grouse 2 | 11,355 (over) |
| 79 | capercaillie 10, squirrel 24, deer 7, beaver 10, mallard 18, elk 2 | 3,142 (over) |

The jackpot criterion passes now. First hang falls on days 44, 12, 8 and
11; every seed that takes an elk renders its fat and dries its meat, and
the two that take ten and twelve of them stand on 800,000 to 1.1 million
kcal at midwinter. Seed 17, which takes none, is the seed that starves in
June - which is the criterion as the spec wrote it: one that does not take
an autumn elk lives on fish, marrow and the plants or does not live.

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
   species in its shore's read and cooked oily fish never once at camp:
   raw oily fish is in no auto-eat order and rots in a day and a half.
   Test: `tests/list.test.ts`.
4. `dcd7dfe`, the plant band is hours a day and not kilos at camp (R7). The
   plant keeps and their cook keeps fed each other and took four and a half
   to seven and a half hours a day; three of four level-20 seeds killed
   nothing at all. Roots, eggs and seaweed became counted jobs given afresh
   each morning, PLANT_HOURS_PER_DAY split across the three rows the band
   holds. Alone it was a regression - 71, 66, 97 and 69 days - and it is
   the change the next two needed. Test: `tests/list.test.ts`, two cases.
5. `2bca00e`, inner bark leaves the standing list (R8). The without probe
   read it: shutting it lengthened the year by 38 days on seed 17 and 52 on
   seed 79, since 275 kcal an hour is an hour taken off fishing at 420 and
   root digging at 414. The task and its wantOpen branch stay for hand
   play. Test: `tests/list.test.ts`.
6. `b336750`, the hang grind waits for meat that will rot and waits above
   the plant band (R9). Seed 42 stood on 13,200 kcal of raw meat on 1 July
   beside the rack it had built and held 890 on 1 August: first hang never.
   The threshold is derived from raw meat's spoil hours against the lean
   ceiling at raw meat's kcal a kilo, so a hare opens nothing and an elk
   opens it at once. Test: `tests/list.test.ts`.
7. `9c52611`, a winter roots order walks to the open ice hole (R5, R10).
   `wantOpen` had opened the winter row since the roots went in and
   `resolveCell` sent the dig to the frozen bog, so it was refused every
   winter day and never once ran. Test: `tests/roots.test.ts`.
8. `9613bc8`, the hunt keep sits above the plant band and the fish keep.
   With the band capped the freed hours went to the fish keep, which is the
   same never-met shape, and the hunt keep under it got nine minutes to an
   hour and twenty a day while three of four seeds killed no large game.
   The hunt keep is not that shape: a large kill meets it for days. The bow
   and the arrows stay below, since lifted with it they cost seed 19 the
   woodpile and a cold death on day 22 of the April gate. Test:
   `tests/list.test.ts`.
9. `98512e1`, an unload that moves nothing is not a step taken. A hunt with
   a bow keeps its arrows, so `dropEverything` can never empty its pack,
   and the delivery branch claimed that empty unload as a step and took it
   again every minute after. A level-20 camp on seed 19 stood at its own
   fire for fourteen hours a day "unloading at camp": it worked 1.3 hours a
   day for six weeks, gathered 5,645 kcal a day with an elk down on day 10,
   ate 483 and starved on day 42. Test: `tests/intent.test.ts`.

The level-20 year in days through the nine, in order: 98/133/129/82 at the
start of the audit, 98/133/128/105, 91/160/158/111, 107/164/177/111,
71/66/97/69, 71/65/82/65, 83/70/89/84, 84/43/366/186, 84/305/366/186.
April held 4 of 4 from the second fix on and the winter gate never moved.

The findings left for the author:

**F2. Everything below the first never-met food keep is unreachable from
May to October, and it now costs a camp its winter.** Seed 19 freezes on
day 305 with 829,835 kcal at camp and three logs beside it: the
winter-stock keeps, 600 kg of split wood and 300 logs, sit below the fish
keep and the plant band and never get a turn between the thaw and the
snow. This round lifted four rows out of that band, one at a time, each
with a reason of its own; the band is still there, and the woodpile is what
is under it. The list wants a decision the ranking cannot make: either a
keep on food learns to read met against a day's intake rather than a stock
at camp, or the seasonal wants stop being ranked against the daily ones at
all.

**F3. Inner bark is worse than the hour it costs, and its season is the
wrong half of the year.** At the handbook's own yield the strip returns
about 275 kcal an hour against fishing's 420 and root digging's 414. The
row is off the list (R8) and the task stays; whether the yield is wrong or
the April-to-July window is (a fallback belongs to the months when the
water is iced and the ground frozen) is the author's question.

**F4. The lean ceiling is what a level-20 survivor stands at, every day,
and the non-lean side cannot fill the gap.** Lean intake sits within 21
kcal of the 1,600 ceiling on all four seeds. Seed 79 dies on 3 October with
183,095 kcal of dried meat at camp, eating 2,984 against a 3,491 burn; seed
17 dies in June 1,100 kcal a day short with 899 of non-lean. The item added
every non-lean source the brief ranked and they come to 899 to 1,955 kcal a
day at level 20, against a 3,400 to 3,800 burn. Either the ceiling is too
low for a working body in the north, or a carcass carries too little fat
against its meat, or a survivor needs a fat source the item left out of
scope (E's tallow is the named candidate). This is the item's own subject
and the number the author should look at first.

**F5. Roots are close to mandatory and the stock is finite.** Shutting them
halves seed 17 and seed 42. A level-20 camp digs its regional stock out and
the task refuses with "the ground is dug out"; the 2026-09-05 ruling says a
food population cannot be emptied, and the root stock is the one that can.

**F7. The unexploited line reads a stock, not an omission.** It cannot tell
"there were roots and the survivor ignored them" from "there were roots and
the survivor dug 306 kcal a day of them and 127 kg were still in the
ground", and every camp on a shore with a char in it reads "oily fish read
at the shore" forever. If it is to keep deciding whether a death is a hole
it wants a second half: what was taken from each source in the week before.

**F8. Sap and seaweed are untested by this instrument.** Neither fires on
any reference seed - no birch in reach, no sea camp - so both read as free
in the without table for want of an opportunity rather than for want of
value.

**F10. Four sources are mandatory, and the criterion fails.** Marrow, oily
fish, roe and roots each take the level-20 year from 1 of 4 to 0 of 4. With
one seed reaching a year the instrument is weak, but the mechanism is F4:
a survivor at the ceiling every day has no slack, so every source that
feeds the non-lean side is load-bearing. The criterion cannot pass while
F4 stands.

**F11. The lineage got shorter as the year got longer.** Its lives now run
23 to 112 days where the previous HEAD ran 3 to 270, and the trend gate is
0 of 4 either way. A list that ranks hunting first suits a level-20 camp
with a bow and a rack; an heir landing in October with an arrival kit is a
different player, and the reference list is one list. The survivor ladder
puts a full year at rows 4 to 6, reached by a lineage, so this is the gate
that most wants a list of its own.

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
