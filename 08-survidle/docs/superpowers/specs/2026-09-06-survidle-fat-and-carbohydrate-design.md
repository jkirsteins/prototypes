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
