# Survidle: before the round - the axe and the survivor

The two roadmap items that stand between main and the first tester
round (`2026-09-03-survidle-realism-roadmap.md`, the build order): J,
the axe and the wood without one, and the first half of I, the
survivor. J lands first, since it is first in the order and the year
probe is its gate; the survivor follows; the round's own preparation
closes the document, since the round is what both are for.

**J** answers the year probe's level-20 deaths: a camp that dies of
thirst in October beside 823 logs, because the axe wore out and the
list never gathered the stone for another. After J a fire needs no
axe, an iron axe blunts and is honed rather than wearing out, a stone
axe costs its real hours, and the list keeps stone.

**I's first half** makes the survivor a person the player is given,
leaves alone, and keeps as a prize: the log while away is in third
person by name; a boat lands three candidates and the player picks
one; four body axes set real quantities and show as words; five quirks
name a capability and a fear each; a card carries all of it from the
landing screen to the cemetery; and an 8x8 face is drawn from the
person. The reference player runs a fixed median person, so every gate
keeps measuring the list and not the boat.

The second half of I, found knowledge and earned traits, waits for the
round (section 19).

## Decisions confirmed with the author

- Scope is J, I's first half and round prep, in one branch and one PR.
  E hides and clothing and the tables audit keep their slot after the
  round: the round checks a first run's twenty days, a first run dies
  in April or May, and neither changes what a tester meets. The whole
  of I is not pulled in: earned traits read H and 5, which do not
  exist, and found knowledge is a sub-project the size of I's first
  half that the away runner never walks into.
- The iron axe is lost only through the ice. Its wear is realistic,
  honing and a blunt edge, even if that means the arrival axe stays
  around a long time. The haft break and the loss at a kill were
  offered and not taken.
- Two stone axe recipes: a flaked axe in ninety minutes that shatters,
  and a ground celt at twenty hours with a real edge.
- The voice is templates in every log string, not a transform at render
  time and not two strings per call.
- The first survivor's boat works like an heir's: a new world opens on
  the landing screen with three candidates, and "next boat" costs a week.
- All five quirks from the roadmap ship: coast-born, forest-born, sleeps
  light, big eater, steady by the fire. A fear refuses an order, and a
  refused order is skipped for the next one, never a stall.
- The face shows in six places: the three candidate cards, the journal
  card, the tombstone, the cemetery, the stats panel header and the top
  of the away report. Screenshots of a woman's and a man's card go to
  the author when the faces read well; if the drawn faces read badly, a
  third-party pixel avatar library is the fallback (section 14).
- The person has a sex. First names are drawn from the matching half of
  the pool; the pools stay Scandinavian and Baltic together for first
  names and surnames alike, combined freely. Latvian and Lithuanian
  surnames carry a paired feminine form, since those languages inflect
  them; every other surname is one form for anyone. The face reads the
  sex for beards. The body axes never read it.
- The work runs in its own worktree on a branch and lands by PR. The author's standing authorisation covers the calls that
  come up in the spec, the plan and the build; the merge waits on the
  author approving the face screenshots.

# Part J: the axe and the wood without one

## 1. What the code does today

The arrival axe and a crafted stone axe are one tool, `axe`, with a
durability that felling, splitting, ice holes and butchering wear down
to zero, when it is gone. "Sharpen the axe" spends a stone for +30. The
one recipe, `axe`, is 3 stone, a stick and 2 cordage, 90 minutes with a
knife, at no tier, and its output is the same iron axe. Firewood comes
from one source, splitting a log with an axe. The reference list gathers
8 stone once and never hones. On seed 17 at level 20 that adds up to
day 190: the axe and the spear worn out, the axe keep reading "missing
materials" with one stone at camp, 823 logs unsplit, no fire, the
trough's 24 litres ice, and thirst in late October.

## 2. Three axes

`ToolId` gains `stoneAxe` and `flakedAxe`; `axe` is the iron one.
`AXES: ToolId[] = ["axe", "stoneAxe", "flakedAxe"]` is the preference
order; `axeInHand(p)` returns the best held, `axeNear(p, invs)` any of
the three in hand or in reach, and every `toolNear(p, "axe", ...)` and
`toolFor` read that returns `"axe"` today reads through them. Piles
hold tools as counts, so three ids rather than a head field on one is
what survives a pile.

| tool | kg | edge wears | at edge 0 |
|---|---|---|---|
| `axe`, iron | 1.5 | x1, today's rate | blunt: stays, hones |
| `stoneAxe`, the celt | 1.4 | x1.5 | blunt: stays, hones |
| `flakedAxe` | 1.2 | x4 | shatters: gone, the stone spent |

`durability` is the edge. `wearTool` for an axe multiplies the wear by
the table and, for the iron axe and the celt, clamps at 0 and keeps the
tool; the flaked axe is removed as any tool is today, with the
`toolWorn` record and "The flaked axe shatters on the stroke." Felling
and splitting take longer once the edge is under 50: duration x `(1 +
(50 - edge) / 50)`, so a blunt axe is twice as slow and an axe at 50 or
above cuts as a fresh one does (a slowdown from 100 moved the reference
run by a minute on its first ice hole and cascaded into a death); the
flaked axe is x1.5 on top at any edge. Once per honing cycle, at an edge of 25 or under, the log
says "The axe is blunt; it wants honing." The ice hole and the hunt's
butchering wear the edge as today.

Old saves: every `axe` stays `axe`, so a crafted stone axe in an old
save becomes iron; the mastery key `craft:axe` is renamed
`craft:stoneAxe`.

## 3. Honing and the whetstone

`whetstone` is a tool, 0.5 kg, from the recipe `whetstone`: 1 stone,
30 minutes, no tool, no tier ("a flat stone ground smooth on the
outcrop"). "Hone the axe" (`hone`, camp group, camp-bound like
`sharpen`) needs a whetstone in reach and the held axe under an edge of
70, refusing "sharp enough" above it; 10 minutes, the edge to 100, the
whetstone wears 1. "Sharpen the axe on a stone" is today's `sharpen`
row renamed, kept for a survivor with no whetstone under the
one-method rule. Both work the held axe from `axeInHand`.

## 4. The loss

In `fallThrough`, on the survived branch, if an axe is in hand, one
time in two it is gone: the tool is removed, the record gets a new
event `{ kind: "toolLost"; tool }`, and the log says "The axe went to
the bottom and stayed there." The drowned branch already loses
everything. The tables audit sets the rate later from how often an
axe is lost in a year of use; one in two per survived fall is the
number until then.

## 5. Dead wood

`deadwood`, a located forest task in the gather group: "Gather dead
wood", no tool, 60 minutes, 10 kg of firewood, or wet firewood when a
split here and now would come out wet (`splitIsWet`). It draws the
region's felling stock by an eighth of a tree per gather, so 80 kg of
dead wood is one tree and the standing stock stands for both; it
refuses "the forest is picked clean" when the stock is under an eighth.
Its mastery key is `deadwood` under woodcraft, the level's speed and no
perk. The fire's fuel is 4 to 6 kg an hour, so an hour on the forest
floor is an evening's fire, as the roadmap says.

## 6. Wedges

`wedge` is an item, 0.3 kg, from the recipe `wedges`: 2 sticks, a
knife, 20 minutes, no tier, out 2 wedges. `splitWedges`, "Split a log
with wedges", a camp-group located task like `split`: needs 2 wedges in
reach and a log, 45 minutes, 20 kg of firewood with the same wet rule
as `split`; one split in ten breaks a wedge, removing one with "A wedge
splits along the grain." The maul is a stick swung, not an item.

## 7. The list

`REFERENCE_ORDERS` changes:

- The opening's `job("stone", campHas 8)` stays: a keep reads met at
  half its target while idle, so a stone keep at the top left the fire
  pit without its six stones and the run froze on day 5. A
  `keep("stone", 8)` joins the list beside the spare-axe keeps instead,
  where the celt and the hone draw on it.
- Beside that stone keep, below the food group: `job("craft", once,
  "whetstone")`, then a hone grind `{ task: "hone", until: forever }`,
  which refuses harmlessly at an edge of 70 and above, then
  `keep("craft", 2, "wedges")` counted as `wedge` at camp. Placed after
  the knife they cost the opening a stone and the snares an hour, and
  seed 17 starved on day 33; the edge matters weeks in, not on day two.
- After `keep("split", 60)`: `keep("splitWedges", 60)` and
  `keep("deadwood", 60)`. `wantOpen` opens `split` when an axe is in
  reach and the other two when none is; the wedge split sits above
  dead wood so a log camp splits before it forages. The 400 kg winter
  keep gets the same two beside it under the same season rule.
- `keep("craft", 1, "axe")` becomes `keep("craft", 1, "stoneAxe")`,
  open at Crafting 5 and above, and `keep("craft", 1, "flakedAxe")`
  beside it, open under Crafting 5 when no axe is in reach.

`axeInReach` reads all three ids. The recipes: `flakedAxe` is 2 stone,
a stick, 2 cordage, a knife, 90 minutes, no tier; `stoneAxe` is 1
stone, a stick, 2 cordage, the whetstone as the tool, 1,200 minutes,
recommended Crafting 5 (`craft:stoneAxe`), so under it the celt can
spoil as any craft does.

## 8. Tests for J

- `axes`: the three ids wear at their factors; the iron axe and the
  celt stay at 0; the flaked axe is removed at 0 with the record; a
  felling at edge 0 takes twice the minutes and a flaked felling 1.5
  times; `axeInHand` prefers iron over celt over flaked; the blunt line
  logs once per cycle.
- `hone`: the row refuses without a whetstone, refuses at 70, restores
  to 100 and wears the whetstone 1; the stone sharpen still gives +30
  for a stone.
- `loss`: with a seeded rng that survives the fall and rolls under a
  half, the axe is gone and the record has `toolLost`; over a half it
  stays.
- `deadwood`: 10 kg firewood in an hour, wet after rain, the stock down
  an eighth, refused at under an eighth.
- `wedges`: the recipe makes 2; the split needs 2 and a log, takes 45
  minutes, yields 20 kg; a seeded break removes one.
- `list`: `wantOpen` opens `split` with an axe and `splitWedges` and
  `deadwood` without; the stone keep refills; the celt keep opens at 5
  and the flaked keep under 5 with no axe; the whetstone and hone sit
  after the knife.
- The April gate in `tests/reference.test.ts` stays green.

## 9. The gate and the browser pass

`npm run year` on seeds 17, 19, 42 and 79 at level 20, the October
thirst deaths as the before (days 208, 187, 197 and 211 with causes
thirst, starved, thirst, thirst). Expected: no camp with 800 logs and a
cold pit, and the level-20 deaths moved into the winter. The readings
go under J in the roadmap the way the water readings went under F. The
run takes a quarter of an hour and goes in the background.

Browser pass, seed 17 at 1440 by 900: with the axe left in the camp
pile and the survivor in the forest, "Gather dead wood" stands and
"Fell a tree" reads "needs an axe"; make wedges and split a log with
them; craft a whetstone, run the edge down and hone; the Do rows read
as written above.

# Part I: the survivor

## 10. The person

### 10.1 The shape

```ts
type Grade = -2 | -1 | 0 | 1 | 2;
type QuirkId = "coastBorn" | "forestBorn" | "sleepsLight" | "bigEater" | "steadyByTheFire";
interface Person {
  sex: "f" | "m";
  axes: { strength: Grade; build: Grade; hands: Grade; eyes: Grade };
  /** One or two, never coastBorn with forestBorn. */
  quirks: QuirkId[];
  /** Seeds the face; the ancestor keeps their face in the cemetery. */
  face: number;
}
```

`LifeRecord` gains `person: Person`. The record is what the cemetery
keeps, so the person outlives the player. `Player` keeps its fields;
the numbers the person sets are read through `src/sim/person.ts`
(section 11) at the seams that hold the constants today, and
`workHours` is set from it at `newPerson`.

`medianPerson(sex)` is all four axes at 0, no quirk, face 0. It is
what `newGame` uses when no person is passed, with the sex of the name
it rolls, so the reference player, the horizon, the year script and
every existing test keep their numbers and their rng streams.

### 10.2 The roll

Three candidates per boat, from `new Rng(derive(seed, 700 + index * 16
+ boat))`, where `index` is the survivor's index in the world and
`boat` counts "next boat" presses from 0. The stream is separate from
the world's rng, so a candidate roll never moves the sim. Per
candidate, in this order:

1. sex: `int(2)`, 0 is "f".
2. name: section 10.3.
3. each axis: `int(3) + int(3) - 2`, strength, build, hands, eyes. Two
   three-sided dice minus four, so the shares are 1, 2, 3, 2, 1 in nine
   and the median is the commonest.
4. quirk count: `int(3) === 0` gives two, otherwise one. Quirks are
   drawn without replacement from the five in the order listed in
   10.1; if the second drawn would put coast-born and forest-born
   together, it is dropped and the person has one.
5. face: `int(2 ** 31)`.

A name already used in this world, or held by another candidate of
the same boat, is not offered. No point budget balances the axes; the
choice of three does that.

### 10.3 Names

`FIRST_NAMES` splits into `WOMEN` and `MEN`, each still Scandinavian
(Norwegian, Swedish, Danish, Finnish) and Baltic (Latvian, Lithuanian,
Estonian) together. `LAST_NAMES` becomes entries of one or two forms:
`"Berg"` for a surname that is the same for anyone, and `{ m:
"Kalnins", f: "Kalnina" }` where the language inflects it. The
Latvian pairs are Kalnins/Kalnina, Berzins/Berzina, Ozols/Ozola,
Krumins/Krumina, Balodis/Balode, Zarins/Zarina, Vitols/Vitola,
Eglitis/Eglite, Dzenis/Dzene; Liepa is one form. The Lithuanian pairs
use the unmarried form: Kazlauskas/Kazlauskaite,
Petrauskas/Petrauskaite, Jankauskas/Jankauskaite,
Zukauskas/Zukauskaite, Butkus/Butkute, Urbonas/Urbonaite.
Scandinavian, Finnish and Estonian surnames stay single. A first name
from either region can carry a surname from either, as today.

`rollName(rng, sex, taken)` draws the first name from the sex's list
and the surname's form for that sex. `nameTaken` compares first and
last as typed. The "the younger" fallback stays.

### 10.4 Old saves

Save version goes to 7. A version 6 record gets `medianPerson(sex)`
with `face` set to the record's index and the sex inferred from which
list the first name is in; a first name in neither list (typed by the
player) takes the face seed's parity. A version 6 landing in progress
gets `candidates` rolled for boat 0 and `chosen` 0; its `name` field
is dropped. Versions 3 to 5 still load, through the same path. The
same bump carries J's mastery key rename.

## 11. What the axes set

`src/sim/person.ts` exports `derived(person): Derived`, every field a
real quantity, and the seams below read it in place of the constant
they hold today. `derived(medianPerson(sex))` equals today's numbers
exactly for either sex.

| axis | -2 | 0 (today) | +2 | seam |
|---|---|---|---|---|
| strength: comfortable / hard load | 20 / 28 kg | 25 / 35 kg | 30 / 42 kg | `packComfortableKg`, `packHardKg`: every read of `PACK_COMFORTABLE_KG` and `PACK_HARD_KG` |
| strength: the working day | 8 h | 10 h | 12 h | `workHours` at `newPerson`; `spentNow` reads the player's field as today |
| strength: burn above base | x0.9 | x1.0 | x1.1 | the activity and walk buckets in `stepPlayer` |
| build: body mass | 60 kg | 72 kg | 84 kg | `massKg`; the card |
| build: fat reserve | 66,667 kcal | 80,000 | 93,333 | `fatFull = FAT_FULL * massKg / 72`: the landing reserve and the thin, ribs and wasting thresholds as shares of it |
| build: resting burn | 58.3 kcal/h | 70 | 81.7 | the base bucket: `BASE_KCAL_PER_HOUR * massKg / 72` |
| build: sleeps warm | comfort at 7 C | 5 C | 3 C | `comfortC` in `warmthTarget` |
| hands: spoil | x1.4 | x1.0 | x0.6 | the spoil chance `1 - craftSuccess` before the cold and tired doublings |
| hands: tool wear | x1.2 | x1.0 | x0.8 | `wearFactor` |
| eyes: sight | nothing seen beyond the region entered | its neighbours seen | neighbours of neighbours seen too | `enterRegion` |
| eyes: hunting by day | x0.8 | x1.0 | x1.2 | `huntOdds`, day only; the night factor is unchanged |

The formulas: comfortable `25 + 2.5s`, hard `35 + 3.5s`, hours `10 +
s`, work burn `1 + 0.05s`; mass `72 + 6b`, comfort `5 - b`; spoil `1 -
0.2h`, wear `1 - 0.1h`; sight reach 0 at -2 and -1, 1 at 0, 2 at +1
and +2, day odds `1 + 0.1e`. Strength and build cut both ways by
physiology: a strong survivor hauls the cabin's logs in fewer trips
and eats for it; a heavy one lands with more weeks of fat, sleeps
warmer and burns more a day. Hands and eyes are a spread with no
downside at the top.

Where a constant is read in a worker or a script with no person at
hand (`horizon.ts`, the forecast worker), the state's current record
carries the person, so the read is the same call.

### 11.1 The words

Grades show as words or quantities, never the number:

| axis | -2 | -1 | 0 | +1 | +2 |
|---|---|---|---|---|---|
| strength | carries 20 kg all day, 28 at a push; works eight hours | 22.5 / 31.5; nine hours | 25 / 35; ten hours | 27.5 / 38.5; eleven hours | 30 / 42; twelve hours |
| build | 60 kg, sleeps cold | 66 kg, sleeps cold | 72 kg | 78 kg, sleeps warm | 84 kg, sleeps warm |
| hands | clumsy | unsure hands | ordinary hands | sure hands | steady hands |
| eyes | poor sight | short sight | ordinary sight | sharp eyes | eagle-eyed |

The strength line is "carries 30 kg all day, 42 at a push; works
twelve hours", the hours in words. Half kilos print as "22.5 kg".

## 12. Quirks

Each quirk is a capability or a fear with a source, never a modifier
with a name. Its card line, its seam, and the number its test reads:

- **Coast-born.** "Reads any shore at a glance; will not go up on the
  fell in cloud." On entering a region, every shore cell of it is read
  (`readShore`), so the read-water hour is never spent; the landing
  region counts. On a day that is not clear, routing treats fell as
  impassable and a task sited on a fell cell is refused with "will not
  go up on the fell in this cloud". Test: at minute 0 of a seeded run
  the shore is read and `isRead` is true; on an overcast day a route
  across fell is null where the median's is not.
- **Forest-born.** "Knows the forest's game two levels early; will not
  work the open shore in a storm." For a `hunt:<species>` key whose
  hunt spot is `forest`, the levels short of the recommendation are
  reduced by two, to a floor of 0. While a storm is on, a task sited
  on a shore spot (fish, set or empty the trap, fetch at the shore,
  read the water) is refused with "will not work the open shore in
  this storm". Test: a level-4 forest-born hunts a level-6 species at
  full odds; during a storm the fish option is not ok.
- **Sleeps light.** "Wolves never reach the bed; a windy night is half
  a night's rest." The wolf event at night wakes them: no health loss,
  no injury, the cue and a log line "{You} {wake} at the wolves and
  {sit} up by the embers till they go." Energy gained asleep during a
  storm is half. Test: a forced wolf night leaves health at 100 and
  injury 0; a storm night's energy gain is half the median's.
- **Big eater.** "Works a tenth faster and burns a tenth more." Every
  kcal bucket is x1.1, base included; every task's duration is x0.9 at
  `beginTask`. Test: a day's ledger burn is 1.1 times the median's on
  the same seed and list, and a felling task's minutes are 0.9 times.
- **Steady by the fire.** "Lights in rain without fail." The one-in-
  three fail chance of `lightingInRain` is 0 for them; the twenty
  minutes stay. Test: `lightingInRain` under heavy rain reports
  `failChance` 0 with the quirk and 1/3 without.

A fear refuses the way a ladder refusal does today: the row says why,
the runner reports the order as blocked, and the scheduler, greedy
top-down, moves to the next order. A refusal never stalls the list.

The roadmap's rule is that a quirk earns its place if two people with
different quirks write different order lists. The tests above are that
rule made a number: each names what a seeded run reads differently.

The predicates live in `person.ts` (`hasQuirk(state, id)`, reading the
current record) so a seam asks one question and never reads the
record's shape.

## 13. The boat

### 13.1 The landing shape

```ts
interface Candidate { name: { first: string; last: string }; person: Person }
interface Landing {
  cell: number; region: number; date: WorldDate; gapDays: number;
  candidates: Candidate[];
  /** "Next boat" presses, from 0. */
  boat: number;
  /** Index into candidates, the highlighted card. */
  chosen: 0 | 1 | 2;
  /** Null for the first survivor. */
  oldCamp: number | null;
}
```

`Landing.name` and `rerollName` go: the boat is the reroll.

### 13.2 The first survivor

`newWorld(seed, boat = 0)` in `newgame.ts` builds the state as `newGame`
does at `START_DOY + 7 * boat`, then empties `survivors`, and sets
`landing` to the start camp cell and region, the date `{ year: 1, doy:
START_DOY + 7 * boat }`, `gapDays` 0, candidates rolled for index 1 and
this boat, `chosen` 0, `oldCamp` null. The player under the overlay is
a median placeholder that `land` replaces. `main.ts` opens a fresh seed
through `newWorld`; `newGame` stays the direct path for the scripts and
the tests and still lands on 1 April with the median person.

"Next boat" for the first survivor rebuilds through `newWorld(seed,
boat + 1)` and swaps the state in `main.ts`. The world is the same
world, from the seed; the weather opens a week later, so a player who
keeps asking lands in May with the snow gone and the coast open, and
in autumn lands in the snow.

`land` with an empty `survivors` pushes record 1 with the chosen
person, runs `newPerson` with it, and writes the 1 April line that
`newGame` writes today ("1 April. Snow still lies in the shade at
Grey Shore. {You} {have} an axe, wool on {your} back and a kilo of
dried meat.", or the dated form for any other day).

### 13.3 The heir

`beginAgain` rolls three candidates for the heir's index and boat 0.
"Next boat" (`nextBoat(state, world)`): `boat` becomes `boat + 1`; the
date moves to the first open-coast day on or after the old date plus
7; the world runs the days between in nobody mode from the rebased
minute 0 and is rebased again the way `beginAgain` rebases (minute 0,
`startDoy` the new day, the year stepped over a year end, the hour and
day markers 0, the storm cleared, the ice holes gone, the log empty);
`gapDays` grows by the days added; candidates are rolled for the new
boat. A wait that crosses the coast's close on 3 November jumps to 6
May: the world sits empty all winter, and that is a story.

### 13.4 The screen

The landing overlay shows the date, the gap line as today, and three
cards side by side (stacked at the phone width), each a candidate's
card (section 14) with a face, the name, four grade lines and the quirk
lines. Clicking a card highlights it. Under the cards: the name field,
prefilled with the highlighted candidate's name and editable, the
rule from the F core spec that what the player types is taken as typed
and empty means the prefilled name; "Land"; and "next boat (a week
later)", which shows the date it would land on.

## 14. The card and the face

`src/ui/card.ts` renders one card two ways, `cardHtml` and `cardText`,
from the same lines, so what the copy button puts on the clipboard is
what the screen shows without the markup.

Every card: the face, the name, the four grade lines from 11.1, one
line per quirk from section 12.

The living survivor's card, in the journal panel above the entry, adds:

- "Day N of this life."
- What they know: the skills at level 3 and above by name and level
  ("Woodcraft 5, Hunting 3"), and the shores read ("4 shores read").
  "Nothing yet." when there is none of either.
- What they fear: the fear clause of each quirk that has one; "Nothing
  they will say." with no fearing quirk.
- What they have lost: toes and fingers to frostbite, and each tool
  worn out or lost with its day, from the record's `toolWorn` and
  `toolLost` events; "Nothing." when there is nothing.
- Three stories: the record's event lines ranked, three at most,
  oldest first. The rank is the worst night with wolves, then the
  first kill of a large-game species, then the cold snap, the first
  snow and the dark, then the cabin or the turf hut built, then any
  other threshold, then any other structure, then any other first
  kill, then a tool lost, then a tool worn, then a storm, then a mend,
  then the worst night without wolves. Ties by day. `stories(rec)`
  lives in `epitaph.ts` beside `entry`, so the two selectors share the
  lines.

The tombstone shows the whole card under the name with the epitaph
and the entry as today. The cemetery shows it under an opened grave.
The stats panel header becomes the face, the first name and "day N"
where "You day N" sits today. The away report shows the face beside
the "what happened" line.

A "copy" button on the journal card, the tombstone and an opened grave
writes `cardText` to the clipboard and flashes "copied"; where the
clipboard API is refused, the text opens in a read-only textarea under
the card for copying by hand.

### 14.1 The face

`src/ui/face.ts` draws an 8x8 portrait: a four-column half mirrored,
five colours, as an inline SVG of rects with `shape-rendering:
crispEdges`, at eight to ten times scale on the desktop and six on the
phone. Nothing is drawn on a canvas, so the panels that are HTML
strings today stay HTML strings.

The templates the person picks, each a list of 8 rows of 4 cells:

- hair: for women long, braided, short, cropped; for men short, cropped,
  bald, long. Picked by the face seed.
- beard: men only: none, short, full. Picked by the face seed.
- eyes: wide and bright at eyes +1 and up, narrow at -1 and down, plain
  at 0.
- jaw: wide at build +1 and up, narrow otherwise.

The palette per person, from the face seed: a skin tone from three, a
hair colour from four (black, brown, fair, red), an eye colour from
three, one dark line colour and one background from a small northern
set (slate, pine, night blue). Rows compose in the order background,
jaw, hair, eyes, beard, so a later layer paints over an earlier one.

`FACE_SIZE` is 8 or 12; the 12 grid on the self-test page is the 8 grid
scaled by one and a half, the same shapes, so a real 12 set is drawn only
if 8 fails the judgement. `?faces=1` renders a page of 48 faces, 24 women and 24 men
across the eye and jaw variants, at both sizes, in place of the game.
The browser pass screenshots it and judges each face for whether it
reads as a person by shape and colour; if 8x8 does not read, the
constant flips to 12 and the templates at 8 stay for the page.

**The author's look.** When the faces read well, a screenshot of a
woman's card and a man's card goes to the author. **The fallback.** If
neither size reads as a person, the drawn templates give way to a
third-party pixel avatar library, `pixel-avatar-lib` (Apache-2.0, on
npm, a 24 by 24 grid drawn on a canvas from a DNA string) or another
found at the time; the person's face seed becomes the DNA, the canvas
is drawn once per face into a data URL so the string panels stay
strings, and the sex and the eye and jaw rules are dropped where the
library has no hook for them. The decision and its reason go in the
roadmap's Built line.

## 15. The voice

### 15.1 Templates

Every log string with a second-person word becomes a template.
Tokens: `{You}`, `{you}`, `{Your}`, `{your}`, and a verb in braces in
its second-person form, `{reach}`, `{are}`, `{have}`. `voice(text,
name)` renders: with `name` null, the tokens read as today ("You reach
Grey Shore."); with a name, the subject tokens become the name and
the possessives the name with `'s`, and each verb takes its third-
person form: the irregular table are/is, have/has, do/does, were/was;
otherwise a word ending in s, sh, ch, x or o takes `es`, a consonant
and `y` becomes `ies`, and everything else takes `s`. A two-word verb
tokens the verb only: `{crawl} out`. The name is used at every subject,
never a pronoun, so no gender is needed and the agreement is always
right: "Too tired to stand, Veikko sleeps where Veikko is." The name
is the first name.

The strings are in about thirty files, most in `tasks.ts` (34),
`player.ts` (20), `panels.ts` (12), `map.ts` (8), `intent.ts` (7) and
`hazards.ts` (7). `DEATH_LINES` and the landing and new-game lines
are among them. Strings that only describe ("Feed the fire ... while
you are there" in a button title, a JSDoc) are not log lines and are
left alone; the scan below reads only what reaches `log`.

### 15.2 Which entries are by name

`LogEntry` gains `away?: true`. `catchUp` marks every entry it wrote.
The away report and the log panel render an entry through `voice`
with the current record's first name when the entry is marked and
with null otherwise, so while the player is here the log says "you"
and while they were gone the survivor is someone else, and the away
lines keep their voice once the player is back. The away report's own
lines follow: "{You} {are} now in Hareskog." and the since line, which
`since(rec, day, name)` prefixes with the name and a colon ("Veikko:
set the first snare on day 3; the worst night on day 5."), since the
line mixes what the survivor did with what happened to them. The headline stays "While
you were away", since it addresses the player.

The ledger, the forecast worker and the scripts never render a line,
so nothing there changes.

### 15.3 The scan

A test reads every `.ts` under `src/sim`, `src/ui` and `src/main.ts`,
finds each string literal that is an argument of `log(` or an entry of
`DEATH_LINES`, and fails on a bare `you`, `You`, `your` or `Your`
outside braces, naming the file and line. A second test renders a
fixed list of templates both ways against golden strings, one per
grammar rule in 15.1.

## 16. The reference player and the scripts

`newGame(seed, startDoy = START_DOY, person?: Person)`; with no person,
the median for the rolled name's sex. `runReference`, `runHeir`, the
horizon and the year script pass nothing and get the median. `runHeir`
lands the heir with the median too: it replaces the boat's candidates
with one median candidate, sets `chosen` to 0 and calls `land(state,
world)` as today. The April gate, the heir gate, the year gate and the
winter gate read the same numbers before and after the survivor's
work; `tests/reference.test.ts` already asserts the gate outputs and
stays green without edits.

## 17. Tests for I

All in `tests/`, vitest, fast:

- `person`: the roll on a seed is the same twice; over 9,000 rolls
  each grade's share is within two points of 1/9, 2/9, 3/9, 2/9, 1/9;
  one or two quirks, never coast-born with forest-born; `derived` at
  -2, 0 and +2 matches the table in section 11 exactly; the median's
  `derived` equals today's constants.
- `names`: a woman draws a feminine Latvian or Lithuanian form and a
  man never does; a seed exists whose first name is Scandinavian and
  surname Baltic and another the reverse; a name is not offered twice
  in a world or a boat.
- `axes`: at +2 strength, 28 kg walks at full speed where the median
  slows and `workHours` is 12; at +2 build the landing fat is 93,333
  and the base bucket per hour is 81.7 to one decimal; at -2 hands the
  spoil chance one level short is 0.7 of the attempt; at +2 eyes the
  neighbours' neighbours are `SEEN` on entry and `huntOdds` by day is
  1.2 times the median's and by night the same.
- `quirks`: the five tests in section 12.
- `boat`: `newWorld` opens in the landing phase with three candidates
  on 1 April; "next boat" lands on 8 April with three different
  candidates in the same world; an heir's "next boat" adds seven days
  to the gap and ages the old camp's structures by seven days; a death
  on 28 October's next boat lands 6 May; landing as candidate 2 puts
  that person and name on the record.
- `card`: `cardText` for a seeded person against a golden string;
  `stories` picks the three top-ranked lines oldest first; the text of
  `cardHtml` stripped of tags equals `cardText`.
- `face`: every template combination yields eight rows of eight cells
  and each row is a mirror; two seeds give different faces and one
  seed the same face twice; a woman is never drawn with a beard.
- `voice`: the grammar goldens; the scan; `catchUp` marks its entries
  and `awayHtml` renders them by name.
- `save`: a version 6 file loads with median persons and the sex from
  the name lists; a version 7 file round-trips; a version 6 landing
  loads with three candidates.

# Part R: the round

## 18. Round prep

After both items are built, `docs/testing.md` gains three sections:

- **The invite.** The text a tester receives: the link with
  `?tester=<cohort>`, that it is a browser game saved on that device,
  that closing the tab is playing, that a first death is expected
  inside the first hour or two, and that a survey follows after a week
  keyed by the id on the settings panel.
- **The survey.** One form, seven questions: the beacon id from the
  settings panel; how many real days they opened the tab; what killed
  their first survivor; whether they started again, and if not, why;
  what they did while the tab was closed; "Would you pay ten dollars
  for this game?" yes or no, which is the pay bar; and "Tell the story
  of one of your survivors", an open box, which is the stories bar.
- **The pre-round pass.** The checklist run before the first invite:
  the four beacon steps; a build deployed from main and opened on a
  device that has never seen it landing on the landing screen with
  three candidates; the rules in `docs/ux.md` at 1440 by 900 and at
  390 wide with touch emulation, including the landing screen's cards
  and the journal card; the copy button on a phone.

## 19. Browser pass for I

At 1440 by 900 and at 390 wide with touch emulation, recorded with
both widths named. On a fresh seed: the landing screen shows three
cards with faces that read as people; "next boat" moves the date to 8
April and shows three new faces; pick the second card, change the
name, land, and read the first log line by that name's kit; the stats
header shows the face and the first name; the journal card shows the
grades, the quirks and "Nothing yet."; copy the card and paste it
somewhere. Run with `?speed=` to a death; the tombstone shows the
card; "Begin again"; the heir's boat; "next boat" once; land. Open the
cemetery and find the ancestor's face. Back-date the save and reload
the way the survidle browser gotchas memory says (a new tab, not the
pagehide path) so the away report shows lines by name and the log
panel keeps them by name after "Continue". Open `?faces=1` and judge
the page; record the verdict on 8x8. Screenshot a woman's card and a
man's card for the author.

## 20. Out of scope

Found knowledge and earned traits (the second half of I; found
knowledge is the first content after the round if the survey says
there is nothing to do but wait), the haft break and the loss at a
kill, a saw, a forge, a tree felled by fire, pronouns in the voice, an
age in years, any physiology by sex, a re-roll button, a point budget,
a trait that is a percentage with a name, the tree buying anything
here, the kit variant, the save sync, and the RUM application ids.

## 21. Coordination and bookkeeping

The water work landed on main on 2026-09-06 and this branch is rebased
on it. The winter loop is in flight on its own branch with no commits
yet; from its spec it touches `body.ts`, `reference.ts`, `intent.ts`,
`orders.ts` and `tasks.ts`. J touches `reference.ts` (the list) and
`tasks.ts` (the rows) heavily; I touches `body.ts` (one line,
`workHours`), `reference.ts` (the `newGame` signature) and `tasks.ts`
(the voice templates and three seams). The voice conversion is the
last code task, done after a rebase onto whatever main holds then, so
the string edits meet their final form once. If the winter loop lands
during this work, the branch rebases before its next task.

When this lands: the roadmap's build order marks J and I's first half
built with a pointer to this spec and its plan; the J and I sections
gain the "Built" lines the other items carry, J's with the year probe's
readings and I's with the face verdict and the size or library chosen;
`docs/README.md` names `?faces=1` under the debug parameters, the boat
under "How it plays" and the three axes and dead wood under "Where the
numbers live"; and `docs/testing.md` carries section 18.
