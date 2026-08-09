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

**Taking a quiet land dissolves the status.** Its people join the game as their
new lord's vassal, with turns, a deck and tribute to pay - and with a road back
out through the independence gate, which is checked at the start of the turn it
now takes. A conquest that stayed silent was a conquest that could never answer
back, and half the map was that conquest.

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

A land is **quiet** when it carries the status, and **unheld** when no realm
holds it (`!overlords.has(f) && !(f in incorporated)`).

## 1a. The leader gate

Acting is a chair, not a flag. `pickFaction` seats a ruler on the acting
factions alone (`vacateRulers`), and a **vacant chair is what the turn loop
skips** - `advance` passes over a leaderless seat the same way it passes over
an incorporated one. `aiTakeTurn` is never reached for such a seat, so the AI
needs no guard of its own.

The gate is on ACTING and not on holding, so it survives conquest: taking a
quiet land wins the land, not its people's allegiance, and the chair stays
empty. Two consequences are load-bearing:

- **A leaderless faction takes no land.** A restless raid out of the grey
  middle is a raid, not a conquest, or the middle would quietly eat itself and
  lands with no chief to answer for them would end up holding vassals.
- **Anything that resolves at the actor's turn start is swept at the round
  wrap instead**, because a leaderless actor never gets a `beginTurn` of its
  own and its arrow would otherwise stand on the map for the rest of the game.

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
| `keeps-to-itself` | Keeps to itself | Answers to nobody: takes no turns and plays no cards, but its people raid a neighbour about one round in four. Taking the land dissolves this, and its people join the game. | yes |
| `wild-lands` | Wild lands | 10% chance each round to recover 1 defense. | yes |
| `no-successor` | No successor | If its ruler is killed, the land falls to the killer. | yes |
| `hill-country` | Hill country | Incoming attack damage reduced by a quarter. | no |
| `river-trade` | River trade | Earns its holder 1 extra wealth a turn. | no |
| `burden-of-bureaucracy` | Burden of bureaucracy | Its people are many and slow to muster: 1 army per 4 defense, not per 3. | no |

Every land that does not act starts with all three of `keeps-to-itself`,
`wild-lands` and `no-successor`, and a conquest strips all three: its people
join the game as their new lord's vassal, with turns, a deck and tribute to
pay. Keeping to itself describes a land that answers to nobody, so being taken
is exactly the condition that ends it - and the restless raid below stops with
it, without a second rule saying so.

The table is not six features: a new status is a row plus the one hook that
reads it, and `strippedOnCapture` is the axis that keeps "describes the ground"
apart from "describes a land nobody holds".

`burden-of-bureaucracy` is not rolled. The three biggest polygons on the map
are all Lithuanian, and at the map's own divisor the largest fields six armies
to a small land's one - enough standing force to raid every neighbour every
round and still hold. `BUREAUCRACY_LANDS` names those three, because it is a
fact about how big they are rather than a draw, and the turnip threshold
deliberately does not ask: slowing their harvests too would punish one size
twice.

### The middle is not still

A land that takes no turns is not a land that does nothing. Twenty-one of them
sitting perfectly still made the middle of the map a queue rather than a
frontier, so a land carrying `keeps-to-itself` sends a raid at a random
neighbour with chance `RESTLESS_RAID_CHANCE` (0.25), rolled at the round wrap.
It is declared out of the land itself through the ordinary march path, so it
flies, clashes and lands like anybody's raid, and it belongs to no deck.

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

- **Keeps to itself** - `playsTurns` is the one question, and a land carrying
  it gets no leader at the deal, which is what `advance` skips on (section
  3a). Its restless raid is the only other reader.
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

## 4. Taking a land, spelled out

Subjugate's rule - a faction in reach, its home defense at or below the gate,
no respite running, not the actor's own liege - reaches a quiet land, because a
quiet land is a faction in reach like any other. What follows is the ordinary
vassalage: it counts toward the realm and the win condition through
`fullRealmOf`; a rival may poach it at the gate, so taken ground stays
contested; and its lord may Incorporate it once the realm gate allows, which is
the permanent form. What it no longer does is stay silent - the status is
stripped on capture, so its people take turns, hold a deck and pay the tribute
shuffled into it.

**A Subjugate is declared, not landed.** The play writes a CLAIM out of the
actor's home, and the claim answers at the actor's next turn. In between, the
target may heal its gate shut, somebody else's army may arrive, and the demand
lapses; a land already inside the actor's realm, or one that escaped into its
respite, lapses too. The actor's own raid at the same land does not break the
claim, or Subjugate and Raid could not be played together. This is the march
rule, for the march reason: an allegiance that changed the instant a card hit
the table gave the land no chance to answer and everyone else no chance to see
it coming.

**A raid that lands on a flattened land takes it.** An army arriving where the
defense is already 0 has nothing left to fight, so it walks in: the same
allegiance move a claim makes, through the same path. Two raids on one land
therefore need no Subjugate between them, which is what makes timing them
worth something - and only a faction with a leader may take a land this way.

**A capture asks what defense goes with it.** The taker leaves a
`pendingTransfer` from the land the army marched out of to the land it took;
`transferDefense` answers it, clamped by what the origin holds and by the
destination's room. 0 is a real answer, and closes the question. An AI seat
moves half on the spot (`autoTransfer`), and only one question can be pending
at a time, because the modal asks about one pair of lands.

## 4a. A card may re-open the turn it spent

`CardDef.playsAgain` says that playing this card leaves the turn open for
ANOTHER COPY OF ITSELF, and nothing else. The play spends the turn's allowance
the way every card does; what it adds is `GameState.repeatCardId`, and
`turnAccepts` is the only rule that reads it. What ends the run is ordinary
legality - a raid needs a land with a free army - so the limit is the board
rather than a count kept anywhere.

Deliberately not "raids are special": nothing outside `playsAgain` and
`repeatCardId` knows the rule exists, and neither of them knows which card is
carrying it. The two raids carry it today.

`aiTakeTurn` walks a turn until it is no longer open or the state stops moving,
which is also how the balance harness must walk one: a harness that asked the
policy once per seat turn counted a seat's second raid as no raid.

## 4b. The harvest is five answers

`HarvestChoice`: grow a land, take a card from your own build, take one from
everything the game knows sight unseen, burn a card out of your piles for good,
or take nothing. The last two are not consolation prizes - a ten-card deck
draws its best card sooner for every card that is not in it, so thinning is a
real play, and skipping is the honest answer when everything on offer would
only dilute what the deck already draws.

The offer IS the discovery route for deck-buildable cards, which is why growth
occupies a slot of its own every time: the offer can then never come back with
nothing worth taking.

## 4c. Milestones

`MILESTONES` is a standing race every acting faction runs at once, each row
worth points to whoever reaches it: Overlord (subjugate 5 different lands, 3),
The great host (muster 8 armies, 2), A wide realm (hold 5 lands at once, 3),
Founders (found 3 settlements, 2), Fruitful lands (grow 3 times, 2), The black
season (cash a plague on 5 different lands, 2).

Progress is READ off the state and the log, never accumulated into a store -
which is why "a wide realm" is the only row that can go down, and that is the
point: a realm is held, not banked. A store would be a third copy of what the
board and the log already hold, and the first of the three to drift. What
points buy is a later decision; the milestones are a second scoreboard beside
the land count.

## 5. Numbers

The board is small on purpose, and every number that moves a score is sized to
it:

- `DEFENSE_PER_POPULATION` 5000, so maxes run 2 (Pilsotas) to 18 (Eastern
  Aukstaitija). `DEFAULT_DEFENSE_MAX` 6.
- A Raid deals 1 plus leadership, a Strong raid 2 plus leadership, a Great raid
  0.5 each. War council is +1 leadership a stack. A disease stack cashes for 1.
- Fortify heals 1, Strong fortify 2, Hillfort 3, Harvest feast 1 realm-wide.
  Fortify is below Hillfort on purpose: every deck OPENS with four of it, and a
  harvested card has to be worth harvesting.
- `STRONG_BONUS` is 1 - the strong pair is a better version of what the seat
  already holds four of, not something different in kind.
- One army per 3 defense (`DEFENSE_PER_ARMY`), floored, minimum one; per 4 on
  the three bureaucratic lands. The turnip threshold is the same divisor
  rounded the other way, so a part-grown land musters no army for the remainder
  but its people still eat.
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

## 7a. The turn structure

Nothing ends itself. A turn ends when the seat says so, on two independent
axes (`RULE_AXES`): `turn` is one card or unlimited, and `hand` keeps what is
left over or sweeps it into the discard. They ask different questions - how
many cards a turn may play, and what becomes of the ones it did not - so every
combination is a game somebody might want, and `sweepHand` runs where a turn
actually ends rather than in any one of the four things that can end it.

`playsAgain` (section 4a) is the one thing that reaches across: it re-opens a
spent turn, so "the turn is spent" and "the turn accepts nothing" stopped being
the same question. `turnOpen` is the second one, and every screen and policy
that used to ask about `playedThisTurn` asks it instead.

## 8. AI

Quiet seats never reach `aiTakeTurn`, so the policy needs no guard. What
changes:

- The Assassinate branch prefers a target carrying `no-successor` - the
  killing takes the land outright, which beats any leadership stack.
- `POLICY_COVERAGE` records that preference, and records that Subjugate now
  also takes quiet lands (the branch is unchanged; what it reaches is not).
- `aiTakeTurn` plays while the turn is still open and the state still moves, so
  a repeat needs no branch of its own: `repeatOnly` narrows the set the same
  branches choose out of, aimed afresh at the board the first play left. A
  refused play returns the state unchanged and stops the run, so the rules end
  a turn rather than a count of plays; `MAX_AI_PLAYS` is belt and braces.

## 9. Multiplayer

Unchanged in shape. The guest's pick is passed to `pickFaction` as a reserved
faction so it ACTS, and `seatOfFaction` still finds its seat. The AI fill
takes the remaining three acting slots.

The reservation is not optional dressing. Only acting factions keep a leader,
and a leaderless faction takes no turn, so a guest dealt like any other rival
would sit through the whole game unable to play - roughly four times in five on
a 26-land map.

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
- the leader gate: a leader on the acting factions alone, a reserved land
  seated too, `advance` walking past a vacant chair twice round the table, a
  leaderless faction's march resolving at the round wrap, and a leaderless
  army taking nothing.
- claims: a Subjugate changes nothing when played and answers at the ACTOR's
  next turn; it lapses on a gate the target closed, on a land already in the
  realm and against a land in its respite; anybody else's army at the claimed
  land breaks it and the actor's own does not.
- captures: an army arriving at a 0-defense land takes it with no
  `march-resolved`; the taken land wakes up; the transfer is asked of a human
  and taken automatically for an AI, clamped both ways, with 0 a real answer.
- `playsAgain`: the set is pinned to the field, a spent turn accepts more of
  the same card and nothing else, and the AI's turn walks until the board
  stops it.
- milestones: the table, progress clamped and read off the state, a wide realm
  going down, and one milestone driven end to end through `playCard`.
- the animation queue: one step at a time in the order asked for, `busy` from
  the first push to the last release, a throwing step releasing rather than
  wedging, and the turn gate holding while a play is still queued.

`src/sim.ts` needs no seat logic of its own - it drives whatever `advance`
hands it - but its per-turn loop must mirror `aiTakeTurn`, or a seat that
raided twice is counted as having raided once.

`npm run balance` is not run as part of this work; the repo rule is that
balance evidence is produced on demand. `npm test` and `npm run build` must
pass, then a browser pass.

## Explicitly not in this design

- No new cards beyond the strong pair the harvest offers. The status system is
  built so that a card granting or removing one is a small change later -
  including the card that would wake a quiet land up - and no such card ships
  here.
- No timed statuses. All six are permanent while they hold; `src/timed.ts`
  stays the lifecycle core for anything that expires.
- No rebalance of damage and heals against the smaller maxes beyond section 5.
