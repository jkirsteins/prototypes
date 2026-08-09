# Five players, quiet lands and passive statuses

2026-08-09. Successor to the 2026-08-08 defense-score design, which this
builds on rather than replaces: the defense score, the two gates, marches,
vassalage and the harvest loop all stay as they are.

## The problem

All 26 factions take turns. A round is 26 decks long before the player's own
turn comes back, the map is 26 hues at once, and nothing on it is neutral - so
there is nothing to expand INTO. Every gain has to be taken off somebody who
is playing back.

## The shape of the fix

**Everything stays a faction with a seat and a deck. Only five of them take
turns.** The other 21 carry a passive status - "Keeps to itself" - that makes
their turn a no-op, and that status is the *entire* difference between a land
that plays and a land that does not.

This is the whole design decision, and it is what keeps the change small.
Because a quiet land is an ordinary faction:

- Subjugating one is ordinary vassalage. No second arm on the card, no new
  event, no annexation store to keep in step.
- Taking one off the rival who holds it is ordinary poaching, already legal at
  the gate.
- Its lord may heal it, raid it, Incorporate it - every rule that already
  applies to a vassal applies unchanged.
- A future card that removes the status hands the land its turns back, and it
  resumes with the deck it was dealt at the start. Nothing has to be created
  for that to work.

The things that follow from never taking a turn are consequences, not rules:
a quiet vassal never plays the tribute cards shuffled into its deck, and never
reaches the independence gate, which is checked at the start of its own turn.
Both are correct and deliberate - a conquest stays conquered.

## 1. Who takes turns

`pickFaction` deals a seat and a deck to every faction exactly as it does now.
It then chooses which factions ACT:

1. The human's pick acts. Any reserved pick (a multiplayer guest) acts.
2. The remaining lands are shuffled once, and candidates are taken in that
   order until `MAX_ACTIVE` (5) act, skipping any that borders an
   already-chosen one.
3. If the spacing pass ends short - a small or a chain-shaped map - a second
   pass fills the rest without the test. Placement never fails.
4. Every faction NOT chosen gets `keeps-to-itself`.
5. Passive statuses roll (section 3).

Order matters because the rng draw count per seat is a frozen contract that
`tests/rng-isolation.test.ts` pins.

`advance` skips a seat whose faction carries the status, the same way it
already skips an incorporated one. That single line is the whole turn-loop
change. `aiTakeTurn` is never reached for a quiet seat, so the AI needs no
guard of its own.

A land is **quiet** when it carries the status, and **unheld** when no realm
holds it (`!overlords.has(f) && !(f in incorporated)`).

## 2. The map

An unheld quiet land paints one flat grey (`UNOWNED_FILL`), not its people's
hue: a colour on this map means somebody is playing behind it, and 21 hues
nobody was playing was the map describing a game that was not happening. It
keeps its people label, its badge, its settlement dots and its hover.

The moment it is held - subjugated, or annexed - it paints its own faction
hue and wears the existing vassal stripes or annexation fill. The empire
growing across the map is the reward for taking it, and the existing overlay
rules already draw exactly that.

## 3. Passive statuses

New module `src/passives.ts`.

```ts
export interface PassiveDef {
  id: string;
  name: string;        // player-facing, shown on the land hover
  text: string;        // one line, what it does
  /** Cleared when the land changes hands. */
  strippedOnCapture: boolean;
}
export const PASSIVES: Record<string, PassiveDef>;
export type Passives = Readonly<Record<string, readonly string[]>>;
export function passivesOn(p: Passives, polygon: string): readonly string[];
export function hasPassive(p: Passives, polygon: string, id: string): boolean;
export function addPassive(p: Passives, polygon: string, id: string): Passives;
export function stripOnCapture(p: Passives, polygon: string): Passives;
export function playsTurns(p: Passives, factionId: string): boolean;
```

`GameState.passives` holds the store and `RulesView` carries it, so legality,
previews and the AI all read one source. Absent key = nothing, the sparse
convention `defense` and `armies` already keep.

| id | name | text | stripped on capture |
|---|---|---|---|
| `keeps-to-itself` | Keeps to itself | This land takes no turns and plays no cards. | no |
| `wild-lands` | Wild lands | 10% chance each round to recover 1 defense. | yes |
| `no-successor` | No successor | If its ruler is killed, the land falls to the killer. | yes |
| `hill-country` | Hill country | Incoming attack damage reduced by a quarter. | no |
| `river-trade` | River trade | Earns its holder 1 extra wealth a turn. | no |

Every land that does not act starts with all three of `keeps-to-itself`,
`wild-lands` and `no-successor`. Taking one strips the two that describe a
land nobody holds; it stays quiet, because staying quiet is a fact about the
land and not about who holds it.

The five are a table, not five features: a new status is a row plus the one
hook that reads it, and `strippedOnCapture` is the axis that keeps "describes
the ground" apart from "describes being unheld".

### Where the terrain pair may sit

Random, but never absurd. `TERRAIN_ELIGIBILITY` - faction id to the statuses
that land could plausibly carry - is authored from what each region's own
`flavor` text already says:

- `hill-country`: `eastern-aukstaitian-confederacy` (lake-strewn highlands),
  `sakalans` (southwestern upland), `selonians` (wooded hills), `ugandians`
  (southeastern uplands), `samogitian-confederacy` (Samogitian uplands).
- `river-trade`: `jersikans` and `lower-daugava-livs` (Daugava), `talavians`
  (upper Gauja), `lietuva`, `dainavians` and `nadruvians` (Nemunas),
  `semigallian-confederacy` (Lielupe), `pomesanians` (Vistula).

Each eligible land rolls once, 50/50, then picks among its own options. Lands
that act roll too - the ground does not care who lives on it. A land absent
from the table gets no terrain status, which is the honest answer for the
plains and the islands.

### The hooks

- **Keeps to itself** - `advance` skips the seat. Nothing else in the codebase
  asks.
- **Wild lands** - once per round, in `beginTurn` at the wrap onto the first
  seat (`state.current === 0`): each polygon carrying it that sits below its
  max rolls `rng() < WILD_LANDS_HEAL_CHANCE` (0.10) and heals 1. Each heal
  logs a `healed` event with no `cardId` and `amount: 1`, on the seat whose
  turn is beginning - the turn-start-clock convention the independence gate
  already uses. It moves a defense score, so it must be logged and walked.
- **No successor** - in `playCard`'s `assassinate-ruler` branch, after
  `replaceRuler` lands and only when the play was not prevented: if the target
  carries it and is not already in the actor's realm, the target is subjugated
  through the existing `landSubjugation` path, gate and respite bypassed. That
  reuses the `subjugated` event, the tribute injection and the notice rules
  wholesale.
- **Hill country** - one helper, `damageAfterTerrain(view, polygon, damage)`,
  called by the march resolution in `resolveMarches` (on the leftover that
  actually lands, after the clash), by Plague in `playCard`, and by the card
  preview in `src/target-explanations.ts` so the tip and the landing agree.
- **River trade** - `wealthIncomeFor` adds 1 per land of the holder's own
  realm carrying it. A vassal's river is not counted, for the same reason its
  settlements are not: tribute is the channel, and counting it here taxes it
  twice.

### The hover says all of them

`hoverLines` gains a status block after the defense breakdown: one line per
status, `name - text`, `blockStart` on the first. Held or unheld, yours or a
rival's - a passive status is public. No status ships without it.

## 4. Capture, spelled out

Nothing new. Subjugate's existing rule - a faction in reach, its home defense
at or below the gate, no respite running, not the actor's own liege - already
reaches a quiet land, because a quiet land is a faction in reach like any
other. What follows:

- It becomes the actor's vassal and counts toward the realm and the win
  condition through `fullRealmOf`, which the scoreboard, the outline and the
  victory check already walk.
- It never pays the tribute shuffled into its deck, and never reaches the
  independence gate, because both need a turn it does not take.
- A rival may poach it at the gate exactly as it may poach any vassal, so
  taken ground stays contested.
- Its lord may Incorporate it once the realm gate allows, which is the
  permanent form.

## 5. Numbers

- `DEFENSE_PER_POPULATION` 500 -> 5000, so maxes become 2 (Pilsotas) to 18
  (Eastern Aukštaitija). `DEFAULT_DEFENSE_MAX` 60 -> 6.
- Damage, heals and leadership are deliberately unchanged. A raid is 1 plus
  leadership against a 6, so a land falls in a handful of landings instead of
  forty. The known consequences: a stacked War council empties an average land
  in one landing, Hillfort (+15) fully heals anything, and one disease stack
  cashed by Plague (10) empties most lands. Accepted for this pass and
  re-measured after playtest.
- `TURNIP_HARVEST_THRESHOLD` 5 -> 3.
- `victoryRealmSize` = `ceil(0.5 * factionCount)` = 13 of 26.
- One `subjugate` joins `startingDeck()`: every seat opens on a map that is
  mostly unheld, and a deck that cannot take ground can win nothing.

Gate arithmetic stays whole at these sizes: a 6 opens at 1 and frees at 5; a 2
opens only at 0.

## 6. Leaderboard

`standingsFor` ranks the factions that ACT - `state.players` filtered by
`playsTurns` - and not the 26. Every one of them gets a row: five rows is the
whole board, so `SCOREBOARD_ROWS` and the extra human row both retire. Same
columns, same order, same tie rule (seat order, stable sort), human row still
marked. A faction that has been incorporated drops out, as today.

## 7. Raid arrows start and end at towns

The anchors are already the closest cross-border pair of towns
(`marchAnchors`). What leaves a gap is the inset: `ARROW_INSET` pulls 34 user
units (or 20% of the axis) off the tail and `ARROW_HEAD_INSET_SHARE` a further
45% of that off the head, so an arrow out of Daugmalē starts well north of the
dot and stops short of Trikāta. Both are replaced by a clearance sized to what
is actually in the way - the town dot (`r = 3.5`) and its label - capped as a
share of a very short axis. The fade-out ghost uses the same numbers.

## 8. AI

Quiet seats never reach `aiTakeTurn`, so the policy needs no guard. Two
things change:

- The Assassinate branch prefers a target carrying `no-successor` - the
  killing takes the land outright, which beats any leadership stack.
- `POLICY_COVERAGE` records that preference, and records that Subjugate now
  also takes quiet lands (the branch is unchanged; what it reaches is not).

## 9. Multiplayer

Unchanged in shape. The guest's pick is passed to `pickFaction` as a reserved
faction so it ACTS, and `seatOfFaction` still finds its seat. The AI fill
takes the remaining three acting slots.

## 10. Tests

- placement: five acting factions, none bordering another, stable per seed,
  and a map smaller than the table where everybody acts.
- quiet lands: a quiet seat is skipped by `advance` and never logs a play;
  subjugating one makes it a vassal that still never acts and never pays
  tribute; a rival poaches it at the gate.
- statuses: the roll is seeded and stable; only eligible lands get terrain;
  `wild-lands`/`no-successor` are stripped on capture while `keeps-to-itself`
  and the terrain survive; Wild lands heals on a rigged rng and logs a walked
  `healed`; No successor subjugates on assassination and does not when a
  bodyguard prevented the play; Hill country reduces a landed march and a
  Plague; River trade adds income.
- leaderboard: one row per acting faction, none for a quiet land.
- `POLICY_COVERAGE` for the rewritten Assassinate branch.

Updated: `tests/game.test.ts`, `tests/standings.test.ts`, `tests/sim.test.ts`,
`tests/hud.test.ts`, `tests/boot-params.test.ts` and the scenario pacing
bands, which will move. `src/sim.ts` needs no seat logic of its own - it
drives whatever `advance` hands it - but a simulated game is now five acting
decks on 26 lands, so every number it reports moves.

`npm run balance` is not run as part of this work; the repo rule is that
balance evidence is produced on demand. `npm test` and `npm run build` must
pass, then a browser pass.

## Explicitly not in this design

- No new cards. The status system is built so that a card granting or removing
  one is a small change later - including the card that would wake a quiet
  land up - and no such card ships here.
- No timed statuses. All five are permanent while they hold; `src/timed.ts`
  stays the lifecycle core for anything that expires.
- No rebalance of damage and heals against the smaller maxes beyond section 5.
