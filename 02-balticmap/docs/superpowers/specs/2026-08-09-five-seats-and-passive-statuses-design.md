# Five seats, unowned lands and passive statuses

2026-08-09. Successor to the 2026-08-08 defense-score design, which this
builds on rather than replaces: the defense score, the two gates, marches and
the harvest loop all stay as they are.

## The problem

Every one of the 26 lands is a player seat. `pickFaction` builds a
`PlayerState` per faction, so a game is 26 decks taking 26 turns, the map is
26 hues at once, and a round is long before the player's own turn comes back.
Nothing on the map is neutral, so there is nothing to expand INTO - every gain
has to be taken off somebody who is playing back.

This design splits **seat** from **land**. Five seats play; the other 21 lands
sit there with defenses, a ruler and a garrison, and are taken one at a time.

## 1. Seats

`MAX_SEATS = 5`, clamped to the land count so small test maps still deal a
seat per land.

`pickFaction(state, factionId, rng, opts?)` keeps its signature and gains
`opts.reservedFactionIds` - the multiplayer guest's pick, seated before the
AI fill. The deal, in order, so the rng draw count stays the frozen contract
`tests/rng-isolation.test.ts` pins:

1. Seat 0 is the human's pick. Reserved picks take the next seats.
2. The remaining lands are shuffled once (`shuffle`, one Fisher-Yates over
   `factionIds.length - seated`).
3. AI homes are taken from that order, skipping any candidate adjacent
   (`state.adjacency`) to an already-placed home, until the seats are full.
   If the pass ends with seats unfilled, a second pass takes the next
   candidates in the same order without the spacing test - placement never
   fails, and on a three-land test map it degrades to "everyone gets a land".
4. Each AI seat rolls its build, then its deck is shuffled - unchanged.
5. Passive statuses are rolled (section 3).

**A land is unowned when it is not a seat home and not in `incorporated`.**
`RulesView` gains `seats: string[]` (the seat faction ids, in seat order) so
the rules can ask that question; `viewOf` fills it from `state.players`.
`src/relations.ts` gains the two spellings everything else uses:

```ts
export function isSeat(view: {seats: string[]}, factionId: string): boolean
export function holderOf(view, polygon): string | null  // seat that holds it, or null
```

`holderOf` is `incorporated[polygon] ?? (isSeat ? realmRootOf(polygon) : null)`.
Unowned lands keep everything a land has - `defenseMax`, `defense`, disease,
armies, adjacency, a ruler, settlements - and only ever lack a turn.

### What unowned lands do not do

They take no turn, hold no hand, declare no march, counter nothing, pay no
tribute and are never asked for a harvest pick. `beginTurn`, `advance` and the
AI loop already walk `state.players`, so they need no guard: a land with no
seat is simply not in that array. `updateFaction` is a no-op for them, which
is the correct behaviour everywhere it is called.

### Map

An unowned land paints `UNOWNED_FILL` (one flat grey, `#c3bfb6`, distinct from
the off-map neighbour grey) instead of its people's hue, and keeps its people
label, its badge, its settlement dots and its hover. `applyOwnership` chooses
the fill; the moment a land is taken, `effectiveFaction` already resolves it
to its holder and the hue follows for free.

## 2. Taking a land

`Subjugate` splits by what it is aimed at.

**Against a seat faction** - unchanged in every particular: reach through
`reachOf`, the subjugation gate, the respite, the liege rule, the
already-vassal rule; the target becomes a vassal, gets tribute cards shuffled
in, and can win independence back at its own turn start.

**Against a land with no seat** - grey, or one a rival has taken:

- legal when the land is in the actor's `attackReach` (polygon space: it
  borders the actor's full realm, or is inside it), and its defense is at or
  below the subjugation gate;
- blocked when the actor already holds it (`self`), and by nothing else - a
  non-seat land has no respite, no liege and no vassalage;
- landing writes `incorporated[land] = actor`, overwriting any previous
  holder, and strips the land's `strippedOnCapture` statuses (section 3).

So a conquest is an annexation: no tribute, no independence gate, nothing to
revolt. It can be taken off its holder the same way it was taken - beat it
back down to the gate and play Subjugate.

`GameEventType` gains `conquered`, carrying `targetFactionId` (the land),
`overlordFactionId` (the new holder) and `formerOverlordFactionId` when it was
taken off somebody. It nests under its play (`nestsUnderItsPlay`), needs a
`NOTICE_RULES` entry - notice-worthy when the land was the human's or borders
their realm, silent otherwise - and an `eventSegments` clause. It moves no
walked score, so it carries no `amount`.

`Subjugate`'s card text gains the second clause:

> Turn a faction in reach into your vassal, or take a land that answers to
> nobody. Legal only while the land's defenses sit at a quarter or less.
> Vassals pay tribute; a taken land is yours outright.

One copy joins `startingDeck()`, which becomes 3 Raid, 5 Fortify, 1 Grow
turnips, 1 Subjugate. `maxPerDeck: 1` already stops the harvest offering a
second.

### Targeting plumbing

`targetEligibilityFor` treats Subjugate as relevant for a candidate that is
either in `reachOf` (seat factions, as today) or in `attackReach` and not a
seat. `aimsAtPolygons` gains the polygon argument - `aimsAtPolygons(cardId,
polygon)` - and answers true for Subjugate on a non-seat land, so the hover
preview, the target classes and the click all resolve the same id. Nothing
else changes about the two-space rule.

## 3. Passive statuses

New module `src/passives.ts`.

```ts
export interface PassiveDef {
  id: string;
  name: string;        // player-facing, shown on the land hover
  text: string;        // one line, what it does
  /** Cleared when the land changes hands. The two statuses that describe a
   *  land NOBODY holds are stripped; the ones that describe the ground
   *  itself are not. */
  strippedOnCapture: boolean;
}
export const PASSIVES: Record<string, PassiveDef>;
export type Passives = Readonly<Record<string, readonly string[]>>;
export function passivesOn(p: Passives, polygon: string): readonly string[];
export function hasPassive(p: Passives, polygon: string, id: string): boolean;
export function addPassive(p: Passives, polygon: string, id: string): Passives;
export function stripOnCapture(p: Passives, polygon: string): Passives;
```

`GameState.passives` holds the store; `RulesView` carries it so legality and
previews can read it. Absent key = no statuses, the sparse convention
`defense` and `armies` already use.

| id | name | text | stripped |
|---|---|---|---|
| `wild-lands` | Wild lands | 10% chance each round to recover 1 defense | yes |
| `no-successor` | No successor | If its ruler is killed, the land falls to the killer | yes |
| `hill-country` | Hill country | Incoming attack damage reduced by a quarter | no |
| `river-trade` | River trade | Earns its holder 1 extra wealth a turn | no |

Every unowned land starts with `wild-lands` and `no-successor`. Both are
stripped on capture, so a conquest is solid ground - it stops repairing itself
and stops falling to an assassin.

The four are a table, not four features: a new status is one row plus one
hook, and `strippedOnCapture` is the axis that keeps "describes the ground"
apart from "describes being unheld".

### Placement of the terrain pair

Random, but never absurd. `TERRAIN_ELIGIBILITY: Record<string, string[]>` -
faction id to the statuses that land could plausibly carry - is authored from
what the map itself already says in each region's `flavor`:

- `hill-country`: `eastern-aukstaitian-confederacy` (lake-strewn highlands),
  `sakalans` (southwestern upland), `selonians` (wooded hills), `ugandians`
  (southeastern uplands), `samogitian-confederacy` (Samogitian uplands).
- `river-trade`: `jersikans` and `lower-daugava-livs` (Daugava),
  `talavians` (upper Gauja), `lietuva`, `dainavians` and `nadruvians`
  (Nemunas), `semigallian-confederacy` (Lielupe), `pomesanians` (Vistula).

At deal time, in faction order, each land with a non-empty eligibility list
rolls `rng() < 0.5`; on a hit it takes `eligible[floor(rng() * eligible.length)]`.
Seat homes roll too - the ground does not care who lives on it. Two draws per
eligible land, in faction order, after the deck deal: a frozen contract like
every other draw here.

A land absent from the table gets no terrain status, which is the honest
answer for the plains and the islands.

### The hooks

- **Wild lands** - once per round, in `beginTurn` when `state.current === 0`
  (the round wrap): for each polygon carrying it, in faction order, that is
  below its max, roll `rng() < WILD_LANDS_HEAL_CHANCE` (0.10) and heal 1. Each
  heal logs a `healed` event with no `cardId` and `amount: 1`, on the seat
  whose turn is beginning - the same convention `independence` already uses
  for a turn-start clock tick. It moves a defense score, so it must be in the
  walk (AGENTS.md); it is not `.log-mine`, because nobody chose it.
- **No successor** - in `playCard`'s `assassinate-ruler` branch, after
  `replaceRuler` lands and only when the play was not `prevented`: if the
  target land carries `no-successor` and the actor does not already hold it,
  capture it through the same path Subjugate's land arm uses (`incorporated`,
  strip, `conquered` event). Bodyguard still stops the whole play.
- **Hill country** - one helper, `damageAfterTerrain(view, polygon, damage)`,
  returning `damage * 0.75` for a land carrying it. Called at the two sites
  that deal hostile damage - the march resolution in `resolveMarches` (applied
  to the leftover that lands, after the clash, since it is INCOMING damage)
  and Plague in `playCard` - and by `targetImpactLines`, so what the preview
  promises and what lands cannot drift.
- **River trade** - `wealthIncomeFor` adds 1 per member of
  `incorporatedRealmOf` carrying it.

### The hover says all of them

`hoverLines` gains a status block, after the defense breakdown: one line per
status on that land, `name - text`, `blockStart` on the first. Unowned or
held, human's or rival's - a passive status is public. This is the surface
that makes the system legible, and no status may ship without it.

## 4. Numbers

- `DEFENSE_PER_POPULATION` 500 -> 5000. Maxes become 2 (Pilsotas) to 18
  (Eastern Aukštaitija). `DEFAULT_DEFENSE_MAX` 60 -> 6.
- Damage, heals and leadership are deliberately unchanged. A raid is 1 plus
  leadership against a 6, so a land falls in a handful of landings instead of
  forty - which was the point. The known consequences: a stacked War council
  empties an average land in one landing, Hillfort (+15) fully heals anything,
  and one disease stack cashed by Plague (10) empties most lands. These are
  accepted for this pass and re-measured after playtest, not designed around.
- `TURNIP_HARVEST_THRESHOLD` 5 -> 3.
- `victoryRealmSize` = `ceil(0.5 * factionCount)` = 13 of 26.

Gate arithmetic at these sizes stays whole: a 6 opens at 1 and frees at 5; a
2 opens only at 0 and frees at full.

## 5. Leaderboard

`standingsFor` ranks **seats**, not all 26 factions: `contenders` becomes the
seat faction ids not in `incorporated`. Every seat gets a row - `SCOREBOARD_ROWS`
and the extra human row both retire, since five rows is the whole board. Same
columns, same order, same tie rule (seat order, stable sort), human row still
marked.

## 6. Raid arrows start and end at towns

The anchors are already the closest cross-border pair of towns
(`marchAnchors`). What leaves a gap is the inset: `ARROW_INSET` pulls 34 user
units (or 20% of the axis) off the tail and `ARROW_HEAD_INSET_SHARE` a further
45% of that off the head, so an arrow out of Daugmalē starts well north of the
dot and stops short of Trikāta.

Replace both with a clearance sized to what is actually in the way - the town
dot (`r = 3.5`) and its label:

```ts
const TOWN_CLEARANCE_TAIL = 12;  // dot plus its name below it
const TOWN_CLEARANCE_HEAD = 6;   // the tip only has to not cover the dot
const CLEARANCE_MAX_SHARE = 0.35; // both ends together, on a very short axis
```

`drawMarch` and the fade-out ghost both use them, so a landed arrow fades out
where the live one stood.

## 7. AI

Two `POLICY_COVERAGE` entries change, because two cards changed:

- `subjugate` - "2: take any land whose gate is open - a seat faction becomes
  a vassal, an unheld or rival-held land is taken outright; prefer the largest
  realm gain, ties by faction order".
- `assassinate-ruler` - "4: kill the ruler of a land carrying No successor in
  reach, which takes it outright; else the highest leadership in reach".

The gate-hunting candidate sets in `src/ai.ts` currently filter to rival
faction HOMES. They become "polygons in reach the actor does not hold" - which
is what the map now mostly consists of - so the AI grinds neutral lands down
and takes them, rather than ignoring 21 of 26 lands.

## 8. Multiplayer

Unchanged in shape: the host picks, the guest picks, `tryDeal` seats both. The
guest's pick is passed to `pickFaction` as a reserved seat, so
`seatOfFaction(game, pick.factionId)` still finds it. The AI fill takes the
remaining three seats.

## 9. Tests

New:

- placement: five seats on a 26-land map, no two homes adjacent, same seed ->
  same homes, and a 3-land map deals 3 seats without throwing.
- unowned: a non-seat land takes no turn; Subjugate on it above the gate is
  refused and at the gate lands as `incorporated` with a `conquered` event;
  a rival re-takes it at the gate and the event carries the former holder.
- statuses: the roll is seeded and stable; only eligible lands get terrain;
  `wild-lands`/`no-successor` are stripped on capture and terrain is not;
  Wild lands heals on a rigged rng and logs a walked `healed`; No successor
  captures on assassination and does not when Bodyguard prevented the play;
  Hill country reduces a landed march and a Plague; River trade adds income.
- leaderboard: `standingsFor` returns one row per seat and no row for an
  unowned land.
- `POLICY_COVERAGE` (already a test) for the two rewritten branches.

Updated: `tests/rng-isolation.test.ts` (the draw contract now includes the
placement shuffle and the status rolls), `tests/game.test.ts` and
`tests/standings.test.ts` (seat counts), `tests/boot-params.test.ts`
(`faction=` still picks the human's seat; `defense=` clamps against the new
maxes), and the scenario pacing bands, which will move.

`src/sim.ts` needs no seat logic of its own - it drives whatever seats
`pickFaction` dealt - but a simulated game is now five decks on 26 lands, so
every number it reports moves.

`npm run balance` is not run as part of this work - the repo rule is that
balance evidence is produced on demand. `npm test` and `npm run build` must
pass, then a browser pass.

## Explicitly not in this design

- No new cards. The passive-status system is built so a card that applies one
  is a small change later, and no such card ships here.
- No timed statuses. All four are permanent while they hold; `src/timed.ts`
  stays the lifecycle core for anything that expires, if a future status does.
- No rebalance of damage and heals against the smaller maxes, beyond what
  section 4 records.
