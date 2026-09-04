# Survidle: the baseline, seven fixes and the reference player

Headless runs of the standing-orders runner (2026-09-03, seeds 17, 19, 42
and 79, 250 game days) died of thirst between day 3 and day 23 in every
set-up, and with water and fire supplied by hand they starved between day
67 and day 86 when the axe, spear and bow wore out with nothing to replace
them. No run reached winter. The roadmap
(`2026-09-03-survidle-realism-roadmap.md`, "The baseline") names seven
fixes to rules that already exist, in the order they killed those runs,
and the reference player that measures them. This spec is those eight
things. None is a new system: each is a stock, a priority or a keep the
idle loop needs before any content lands on it.

The gate: the reference player, a scripted set-up from the true arrival
kit, reaches 1 December on all four seeds. A rule gap the script finds
joins this baseline; content waits behind it.

## Decisions confirmed with the author

- **The reference player starts from scratch, by orders.** The arrival
  kit and one ranked order list a competent player would write. The
  audit's kitted camp is not a second mode; if the from-scratch run needs
  isolating, a kit is a flag on the script, not a gate.
- **Camp water is filled vessels in the camp pile.** No trough, no bare
  number. Capacity is bought with buckets, which is real; 3's storage
  extends it later.
- **Splitting waits for dry ground.** Wet wood stays a worse fuel, the
  firewood keep counts dry only, and the runner idles in rain.
- **Spare tools are countable pile items.** A tool recipe yields one item;
  a keep for it is an ordinary keep; a tool is taken up at full durability
  when needed.
- **The ice hole is a task, and it refreezes.** Twenty minutes with an axe,
  open until the next dawn tick.

## 1. Tools as items

Every `ToolId` becomes a `CountItem` as well, with the tool's kilos as its
item weight. `Recipe.out` loses its `tool` form: a tool recipe is
`out: { item: "axe", qty: 1 }` like every other recipe, so `yieldItem`
returns it and "make a stone axe, keep camp at 1 axe" is a keep with no
new order kind. Nothing else about `Recipe` changes.

**Taking up.** A tool in hand stays `Player.tools`, with its durability.
Taking up moves one item from the pack, or from the pile under foot, into
`Player.tools` at durability 100 (a vessel at 0 litres). It happens in two
places and nowhere else:

- `check` for a task that needs a tool the player does not hold looks in
  the pack and the pile under foot; if one is there, the task is allowed
  and the tool is taken up when the task starts. The row says "needs an
  axe" only when none is in reach.
- `wearTool` breaking a tool takes up a spare from the pack at once, and
  logs "The axe has broken; you take up the spare." A spare at camp is not
  fetched: the runner reaches it when the next order needing the tool
  starts at camp, or a haul brings it, as with any other stock.

A tool in hand is never put down, so durability never lives in a pile.
The crafting of a tool the player already holds yields a spare in the pack
or pile as `produce` decides, which is what "make a spare" means.

**Vessels.** A bucket or waterskin in a pile is empty and is the camp's
water capacity (section 2). A vessel in hand is the carried one, as
today. The fill task needs a vessel in hand: it is judged at the shore,
where the camp pile is out of reach, so a bucket lying at camp is
capacity only, not a vessel the fill order will fetch - with none in
hand, the order blocks on "needs a vessel".

## 2. Water at camp

### 2.1 The stock

Two new `KgItem`s, `water` and `ice`, both in litres at a kilo a litre.
They exist only in piles: the pack carries water in vessels, as today, and
`produce` never places them in the pack. `ITEM_NAMES` say "litres of
water", "litres of ice".

Camp capacity in litres is the vessels in the camp pile: 2 per bark
bucket, 3 per waterskin. `campWaterCapacity(pile)` sums them. Water and
ice together never exceed capacity; a pour that would overflow stops at
the cap and the rest stays in the carried vessel.

### 2.2 Fill vessels, and the delivery

A new task, `fill`: "Fill vessels", group camp, 5 minutes, repeatable, at
open water under foot (`waterSource`, or an ice hole, 2.4). It fills every
carried vessel. `yieldItem("fill")` is `water`, so with delivery to camp
it is an order: "fill vessels, keep camp at 4 litres of water, bringing
it to camp". Its cell resolves like fishing, to the nearest shore; with
an ice hole open in the region, to the hole.

Delivery pours: unloading at camp with delivery to camp empties every
carried vessel into the camp pile as `water` up to capacity, and keeps
the rest. The keep judges `water` in the camp pile, so "keep camp at 4
litres" with one bucket at camp (2 litres) is met at 2 and shows
"camp holds 2 litres; more vessels at camp would hold more" as its
reason: a blocked keep the player can read, not a loop.

### 2.3 Freezing and thawing at camp

At the hourly hazard roll, camp water freezes to `ice` when the ambient
is under FREEZE_C and no fire is lit at that camp, the rule carried
vessels already use; the bucket-splitting roll (one in three for a bark
bucket over half full) runs once per freeze for each bucket at camp, and
a split bucket leaves the pile with its share of the ice. Ice thaws to
`water` at a lit camp fire at 2 litres an hour while the fire is fed, no
task needed, since a bucket by the fire thaws itself; the existing `thaw`
task, "Thaw the water", also thaws camp ice in one go along with the
carried vessels.

### 2.4 The ice hole

A new task, `iceHole`: "Open an ice hole", group camp, 20 minutes, needs
an axe, allowed on a waterside cell when `iceCm >= ICE_SHORE_CM`. It
sets `RegionState.iceHole = { cell, minute }`. The hole counts as
`waterSource` for drinking and filling until the 04:00 daily tick after
it was opened, which clears it: a hole skins over by morning. A fill
order on a frozen shore opens the hole first, the way a chop order fells
before it hauls: the runner's fill branch checks for open water, and
when the shore is iced and the region has no open hole, starts
`iceHole` at the nearest waterside cell instead, then fills.

### 2.5 The thirsty step

`thirstyStep` gains two branches and keeps its order:

1. Drink from a carried vessel or open water under foot, as today.
2. Drink from camp water when at camp: `water` in the camp pile fills the
   body directly, an instant like eating.
3. Walk to a shore, or to an open ice hole, as today.
4. At camp with camp ice and a lit fire: nothing to do but wait for the
   thaw (2.3), so this step does not fire; the step below does.
5. Melt snow at the fire, as today; and now, when the fire is out, the
   thirsty step lights it first by `fireStep`, exactly as the cold step
   does, and melts once it is lit.

`canQuench` is extended to match: camp water, an open hole, and a fire
that `fireStep` could light with snow on the ground all count.

## 3. Thirst before hunger

`currentNeed` becomes:

    sleep
    storm
    cold, when campCanWarm
    thirsty, when canQuench
    hungry, when canFeed
    home

`canFeed` is true when any `AUTO_EAT_ORDER` food is in the pack, or in
the camp pile and a walk to camp can start. A hunger nothing can answer
no longer masks a thirst that can be. Thirst outranks hunger because the
empty reserve drains health twice as fast and empties in a day rather
than a week; a body at 0.9 litres with a full stomach walks to the shore
before it walks to the pile.

## 4. Arrows in the pack

`provision` pockets what the live order needs, after the food:

- Live order is a hunt and the player holds a bow: arrows from the camp
  pile up to 10 in the pack.

`dropEverything` at camp leaves arrows in the pack when the live order is
such a hunt, so a bow hunt does not block on "needs arrows in the pack"
after its first delivery. Vessels are tools on the body and need nothing.

## 5. Wet wood

`check("split")` is blocked while `splitIsWet` holds, with the reason
"waiting for dry weather". The output rule stays for a split that began
dry and finished in rain: that log comes out wet, as today. Nothing
changes in what the keep counts.

The runner reads the block as it reads any other: the firewood keep shows
"waiting for dry weather" and the next order runs. A rainy day with
nothing else to do is a day waiting at camp, which is what the runner
already does with nothing to run.

## 6. The rack as a task

`hangMeat` stops being an instant action. A new task, `hang`: "Hang meat
to dry", group camp, at camp, needs the rack, raw meat in the pack or
camp pile, and room on it; duration 5 minutes a kilo for what will fit,
`min(room, raw meat here)`. The effect moves that much onto the rack.
`yieldItem("hang")` is `driedMeat`, the eventual yield, so "hang meat,
keep camp at 10 kg dried meat" is a keep judged on dried meat at camp.
Blocked reasons: "needs a drying rack", "no raw meat here", "the rack is
full".

The rack drops dried meat into the camp pile on its own when it is done,
as today, so there is no take-down task. The roadmap named one; it would
have nothing to do.

The Camp panel's "Hang meat" button becomes the task's button, with the
order strip like every other task.

## 7. A start with a shore and an outcrop

`findStart` requires, beside its current filter, that the region's spots
include both `shore` and `outcrop`. The fallback at ring 40 stays. The
reference script prints, per seed, the ring the search stopped at, so a
seed that fell through to the fallback is seen, not guessed at. Not every
seed finds a qualifying region within those 40 rings; a seed that does
not takes the fallback and is printed as having done so, not promised a
shore-and-outcrop start it never reached.

This is the cheap insurance the roadmap describes; 3's siting is the long
answer and F's placement question waits on it.

## 8. The reference player

`scripts/reference.ts`, run as `npm run reference`, with
`npx vite-node scripts/reference.ts 17 19 42 79 250` as the long form:
seeds, then days. Defaults are those four seeds and 250 days.

**The set-up.** `newGame(seed)`, the arrival kit, and this list added in
rank order at the start camp with `addOrder`. It is the list a competent
player writes on day one; the script owns it and the plan may tune it,
but every entry must be one the panel offers.

1. Fill vessels, keep camp at 2 litres of water, bringing it to camp.
2. Gather stone, until camp has 8, bringing it to camp.
3. Gather sticks, keep camp at 10 sticks, bringing it to camp.
4. Strip bark, keep camp at 12, bringing it to camp.
5. Make cordage, keep camp at 4.
6. Build a fire pit.
7. Make a fire drill, once.
8. Light the fire, keep it lit.
9. Fell trees, keep camp at 3 logs, bringing it to camp.
10. Split a log, keep camp at 40 kg firewood.
11. Build a lean-to.
12. Make a stone knife, once.
13. Make a bark bucket, until camp has 2.
14. Make a fishing spear, once.
15. Cook fish, keep camp at 1 kg; cook meat, keep camp at 1 kg.
16. Build a drying rack; hang meat, keep camp at 10 kg dried meat.
17. Make a snare, keep camp at 1; set snares, five times.
18. Fish for anything, keep camp at 1 kg fish, bringing it to camp.
19. Make a bow, once; make arrows, keep camp at 10.
20. Hunt anything, keep camp at 2 kg raw meat, bringing it to camp.
21. Make a stone axe, keep camp at 1 axe.
22. Fell trees, forever, bringing it to camp.

The runner never gathers a prerequisite on its own, so the list is
ordered as a competent day one is: water at the top, where it waits for
its bucket; then everything a fire and a roof need, in dependency order,
with the arrival axe; then the knife and what it unlocks. The scheduler
is greedy top-down, so a competent player ranks eating what is already
caught above catching more of it: the cook keeps sit above the fish
keep, and the rack job and the dried-meat keep sit above the hunt keep,
right after the cook keeps - both block harmlessly with nothing to cook
or hang. The snare craft and its five-times build sit above the fish
keep too, right after the hang keep: snares are the passive food a
competent player sets before spending hours at the shore, and ranked
below an always-unmet fish keep they never get made at all. Tools the
survivor holds are once jobs, since the first one made is taken up and a
keep would craft a second; the axe stays a keep because the arrival axe
wears out and the spare is the point. Auto-eat,
auto-feed and auto-drink stay on, as they are for every player.

**What it prints.** Per seed, one block: the ring the start took; then a
line at day 30, 90 and 245 with kcal, water, warmth, health, and camp
stocks of water, firewood, dried meat, fish, and tools; then the outcome:
"died day N, <cause>" from the death record, or "reached 1 December,
day 245". A final line: passed N of 4. Exit code 1 when any seed fails,
so a CI job can hold the gate later.

**The gate.** All four seeds reach 1 December. When one does not, the
cause is read from the log: an order list that is wrong is the script's
to fix; a rule that kills a camp with its needs in reach is the
baseline's, and it is added to this spec as an eighth item before any
content.

**Pace.** A game day advances in about 10 ms, so the four seeds take
about 10 seconds. That is why this is a script and not a test.
`tests/reference.test.ts` imports the list from the script, asserts every
entry is added as the kind it names (a keep stays a keep), runs it three
days on seed 17 with `advance`, and asserts the survivor is alive and
the water keep is met, which is what keeps `npm test` fast and the
script honest.

## 9. Persistence

Save version 3 becomes 4. A version 3 file loads: it holds no tool items,
no water, no ice, and no `iceHole`, and the loader fills `iceHole: null`.
A live task of `hang`, `fill` or `iceHole` cannot appear in an old save.
`Recipe.out.tool` no longer exists, so any saved intent whose arg is a
tool recipe still resolves: the recipe ids do not change.

## 10. Log lines and the panel

- "The axe has broken; you take up the spare." on a take-up by breakage.
- "Camp holds N litres." is not logged; the Camp panel's stock list shows
  water and ice beside firewood, with the capacity: "water 3 of 4 litres".
- "The water at camp has frozen." once per freeze; "The ice at camp has
  thawed." once when it is all water again.
- "The ice hole has skinned over." at the dawn that clears it, only if
  the player is in that region.
- "Waiting for dry weather." is the split row's reason, not a log line.
- The hang task logs what today's action logs, on completion.

## 11. Tests

Unit, in vitest, all fast:

- A tool recipe yields a countable item; a keep on it stays a keep.
- A broken axe with a spare in the pack is replaced at once; with the
  spare at camp it is taken up when a chop starts there.
- Camp capacity sums the vessels in the pile; a pour stops at the cap.
- A fill order on an iced shore opens a hole, fills, delivers; the hole is
  gone after the 04:00 tick.
- Camp water freezes without a fire under FREEZE_C and thaws by a fed
  fire; the split-bucket roll removes a bucket and its share.
- Thirsty and hungry both due, no food anywhere, water in reach: the need
  is thirsty. Both in reach: thirsty first.
- A fire out, snow down, a fire drill and firewood at camp, thirst due:
  the step lights the fire, then melts.
- A bow hunt after one delivery still has arrows in the pack.
- Split is blocked in rain and for six hours after; the keep's row says
  why.
- Hang moves `min(room, raw)` onto the rack over its minutes; a keep on
  dried meat is met when the rack drops it.
- The five seeds the baseline runs from - 17, 19, 42, 79 and 3 - each
  start in a region with a shore and an outcrop; the reference script
  prints the ring each start was found at, so a seed that took the
  ring-40 fallback shows it.
- The reference list adds as named and holds three days (section 8).
- A gather intent "until camp has 8 stone" stops after the eighth stone
  is in the pack and delivers it, never gathering past the target.
- "Light the fire, keep it lit" is a keep; it is met while the fire is
  lit and relights after the fire goes out; with no drill it blocks with
  "needs a fire drill".
- The fire drill recipe needs no knife.

The gate is the script. The browser pass: a run into December on one of
the four seeds at `?speed=60`, the ice hole opened by the keep, camp
water frozen and thawed, a spare axe taken up, and the rack fed by order.

## 12. What the reference run added

The first run of the gate died on every seed inside five days, and the
timeline on seed 17 put the first fire at hour 54 with the fire pit built
at hour 11 and the drill at hour 23. Nothing physical was slow. Three
rules were, and they join the baseline:

**A gather stops when the shortfall is in hand.** An intent's "until camp
has N" counted the camp pile only, so away from camp the runner gathered
until the pack was heavy and walked home with fifteen stone for eight and
ninety-six bark for twelve: five hours on stone, eight on bark, out of
fifty-four. `untilMet` for a `campHas` intent now counts the camp pile,
the pack, and the pile at the work cell when the work is not at camp; the
work stops at the target and the delivery carries it home. Orders keep
judging the camp pile alone (`orderMet`): a keep is still a promise
about camp, and the live intent is what decides when to stop working.

**"Keep the fire lit" is an order.** The runner lit a fire for cold, a
storm or bedtime, never because cooking needed one: drill, pit and
firewood sat at camp for eight hours until the sleep step lit it. A keep
whose task is `light` is allowed (the one keep without a countable
yield, beside the build job), met while this camp's fire is lit, unmet
when it is out; its task is `light` at camp, and it blocks with the
light task's own reasons (no pit, no drill, no dry wood, too wet). The
order strip offers it as "keep it lit". After a storm puts the fire out
the keep relights it, so the cook keeps below it are never blocked for a
day.

**The fire drill needs no knife.** A hand drill is a stick spun on a
board; the arrival axe notches the board. The recipe's `tool: "knife"`
goes, and the drill lands on day one instead of behind the stone trip.
The fire pit keeps its six stones: the stone trip is a morning, not the
problem.

With the three, the reference day one is stone, sticks, bark, cordage,
the pit, the drill, the fire, two trees and the lean-to, and the first
fire lands on the first day. Drinking water carries no risk in this
game; boiling it is a disease rule for sub-project 5, not this one.

## 13. Out of scope

- A trough, a cellar, a storehouse: 3's.
- The risk forecast reading any of this: B's.
- Tools with their own durability in a pile, and putting a worn tool
  down: not needed while a tool in hand is never dropped.
- A take-down task for the rack.
- Rivers as open water in winter: 2's, and it plugs into `waterSource`.
- Moving the start off the coast or making the landing a bad camp: F's
  placement, after 3's siting.
