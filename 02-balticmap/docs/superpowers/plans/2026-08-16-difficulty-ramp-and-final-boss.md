# Difficulty ramp and a final boss beyond the map

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development
> or superpowers:executing-plans.

**Goal:** The run becomes three acts, each closing with a boss. The last boss is a
power that does not stand on the map at all, and beating it is the only way to win.

**Spec:** `docs/superpowers/specs/2026-08-15-run-structure-attack-design.md`, section
E - specifically its open question 2, which ruled run-enders out of that pass and
named the price of building them.

---

## Why

`feature/run-structure` gave the game a run: pick a bordering realm, duel it, cash a
reward, let the world take one turn, pick again. What it did not give the run is a
SHAPE. Every gauntlet is the same gauntlet, the only escalation is implicit ("the
fifth neighbour you fight has had five ticks to grow"), and the run still ends the
way it ended before the refactor - the moment a realm reaches half the map, which is
an arithmetic threshold rather than a fight.

The spec already wrote the shopping list:

> A marked neighbour that can take the whole realm must be unmissable, avoidable and
> eventually worth fighting - which means act boundaries, a boss-strength notion and
> a way to see one coming, none of which exist.

This plan builds those three. The geography for the last one is already baked:
`MapData.neighbors` carries real polygons for `RU`, `PL`, `SE`, `DK`, `FI` and the
rest, drawn as grey silhouettes under the `RUS'` and `POLAND` group labels, known to
nothing in game state.

## Global Constraints

- Branch `claude/difficulty-ramp-final-boss-v112f8`, cut from `feature/run-structure`.
  `npm test` and `npm run build` before every commit. Never `npm run balance` inside
  a task - task 8 owns the one run. Never `git add -A`.
- Comments explain WHY, no dates, no chronicle, plain ASCII.
- Run the stuck-seat sweep (method in
  `.superpowers/sdd/2026-08-15-acting-vassals/task-2-report.md`) after any change to
  who takes a turn. Zero, every time. This plan changes it four separate times.
- Anything unverified is APPENDED to `02-balticmap/FOLLOWUP.md`, never rewritten.

---

## The design

### Three acts, ratcheted on realm size

`GameState.act: 1 | 2 | 3`, a high-water mark that never walks backwards. Each act
runs ordinary gauntlets until the realm reaches that act's exit size, then closes
with a boss.

| Act | Runs while realm is | Exits at | Closes with |
|---|---|---|---|
| I | 1-4 lands | 5 | An elevated neighbour |
| II | 5-8 | 9 | A stronger elevated neighbour |
| III | 9-12 | 13 (`victoryRealmSize`) | The expedition beyond the map |

Sizes derive from the bar rather than being literals, so they cannot rot when the map
changes: `actExitSize(act, bar)` returns `ceil(bar/3)+1`, `ceil(2*bar/3)+1`, `bar`.
The 26-land Baltic map gives 5 / 9 / 13; Iberia's 24 lands give 5 / 9 / 12.

The act does not advance when the exit size is reached. Reaching it only SUMMONS the
boss; beating the boss is what advances the act.

### The beat before a boss: foretold, then rest

When the exit size is reached, three things happen in order and none of them is a
fight:

1. **The prophecy.** A `boss-foretold` `GameEventType` - a modal naming the boss, what
   it now carries, and that the next fight is harder. This is the "unmissable" half.
2. **The rest.** A three-boon offer, one pick, on the turnip harvest's existing
   three-option modal: a card from the harvest pool, a heal across the whole realm, or
   growth on the home land. The harvest is already the game's card-acquisition door, so
   this invents no discovery route.
3. **The boss duel**, offered as the only candidate. Declining is not on offer here, and
   the modal says so rather than leaving the player hunting for a way out.

### The stake replaces the clock

`DUEL_TURNS` and the whole `duel-lapsed` outcome are REMOVED. A duel now ends exactly
two ways:

- The enemy faction's own land is taken - **won**, reward paid as today.
- The enemy's realm takes the **staked** land - **lost**, and the stake changes hands.

Answering the picker therefore picks two things: which enemy, and which of your own
lands you put up. Legal stakes are lands the realm holds outright that can reach the
enemy within `MAX_MARCH_HOPS` - reuse `marchHopsTo` / `marchSourcesFor` in
`src/playability.ts` rather than writing a third spelling of reach.

The stake is a BET, not a restriction on where you attack from: raids, vassal fronts
and three-hop marches stay legal exactly as they are. Other captures during a duel are
ordinary captures and do not end it. The duel is about two named polygons and nothing
else.

**A one-land realm stakes nothing.** There is nothing to bet that is not the run
itself, and a rule that bets the run on turn 1 is a rule that ends runs on turn 1.
Such a duel ends with no forfeit.

**Losing a boss duel is defeat.** That is the whole of a boss's extra teeth, and it
needs no new forfeit rule - one arm in `endingFor`.

> **The risk this takes on, stated once.** The clock existed for a measured reason: the
> pre-refactor game stalled at a median of 110 turns, and the doc on `DUEL_TURNS` says a
> scope with no clock would put that back one duel at a time. Removing it reopens that
> risk. The stake narrows it a great deal - a duel is a race between two specific lands
> rather than an open war, so it converges far faster than the old stalemate - but it
> does not close it, and two seats that out-heal each other can still sit forever. This
> is measurable rather than arguable: `runGame` in `src/sim.ts` carries a `turnCap`, so
> unresolved runs are a number. Task 8 measures it. If it bites, the cheapest non-clock
> answer is a duel neither side can move beginning to drain the stake, which is pressure
> rather than a timer.

### Boss strength: boons on the enemy

A boss is not a new kind of entity. It is a candidate the game ELEVATES, with levers
that already exist:

- A new `PASSIVES` row, `regional-leader` - the row the spec deferred, for the purpose
  it deferred it for. Per `src/passives.ts`'s own module rule it ships with a hook and
  the land hover naming it, or it does not ship.
- `war-leader` granted to its chief through `grantAbility` (`src/rulers.ts`), the one
  existing `LEADER_ABILITIES` row. It survives assassination, which is right for a boss.
- Healed to full with a raised `defenseMax`, scaled per act.
- Extra raid cards shuffled into its deck, in the tribute-injection shape already in
  `src/game.ts` (`shuffle([...deck, ...extra], rng)`).

**No new cards.** So no `POLICY_COVERAGE` entry and no discovery route are owed, and
the card gate is not in play for this work at all.

Rewards scale with the act: `rewardFor` gains the act as an argument. It stays the ONE
answer read by both the picker and the cashing - the `SINGLE_LAND_HEAL` rule - so the
act is threaded in, never looked up twice.

### The final boss: a power beyond the map

At act III's exit the run does NOT end at half the map. It summons a foreign power onto
the map's edge, and the only victory is taking its ground.

**What it is.** A `ForeignPowerDef` on `RegionDef` in `src/regions.ts`, beside
`terrainEligibility` and `bureaucracyLands`, which are authored the same way: an id, a
name, the `MapData.neighbors` path id it borrows its polygon from (`RU` for the Baltic,
`MA` for Iberia), a defense ceiling, and `landings: string[]` - the map lands it borders.
There is no rim concept in the code and this is not the change that should invent one;
the bordering lands are authored, exactly as terrain eligibility is.

It joins `regionFingerprint()`, because two builds that disagree about the boss must
refuse to share a lobby.

**When it exists.** Summoned at the act III boundary and not before: `factionIds` gains
it, `adjacency` gains the `landings` edges both ways, `defenseMax` and a ruler are
seated. Until then it is a grey silhouette like any other neighbour.

**How it fights.** It is not a seat at the table until you go to it. Its raids into the
`landings` are a WRAP-TIME effect, in the shape `wild-lands` healing and restless raids
already have - it declares a real march, so the arrow, its timer and its landing chip
are the telegraph and nothing new is drawn. Once the expedition duel opens it also acts
as a seat, exempt from the leaderless arm the way a duel enemy already is
(`duelStanding` returning `"theirs"`).

**How you fight it.** Ordinarily. It is in `adjacency`, so `attackReach`,
`marchTargetsFrom` and the three-hop rule reach it from a `landings` land and from one
land behind. Every blow is an arrow drawn past the coast, which is the whole point.

**Winning.** `endingFor` gains an arm above the realm-size one: the human's realm holding
the foreign power is `victory`. The realm-size arm becomes act III's exit criterion
rather than an ending. `victoryRealmSize` must count HOME factions only, or summoning the
boss silently moves the bar from 13 to 14.

**Two things that will look wrong at first, stated in advance.** `.map-surround` in
`src/map-render.ts` paints an opaque matte over everything past `visibleRectOf`, so the
boss's polygon may need that hole widened to be visible at all. And `crossingBetween`
finds no shared vertices with a baked country outline, so an arrow to it draws as a
strait - the same limitation `FOLLOWUP.md` already records for long marches. Neither is
fatal; both are browser-pass items.

---

## Files

- `src/gauntlet.ts` - the cycle. `Gauntlet` gains `foretold` and `rest` arms; `duel`
  gains `staked` and `decided` and loses `until`. `DUEL_TURNS`, `duelOutcome` and
  `DuelOutcome`'s `lapsed` go. `duelDecidedBy` records the outcome directly rather than
  pulling `until` in - it already knows which way the land moved, which lets the log walk
  in `duelOutcome` be deleted outright. `duelCandidates` gains the boss arm. `rewardFor`
  gains the act.
- `src/game.ts` - `GameState.act`; `pickDuel(state, enemyId, stakeId)`; the act ratchet,
  the prophecy and the summoning at the round wrap beside `gauntletAtRoundWrap`;
  `settleDuel` pays or forfeits; `endingFor` gains the boss arms; `victoryRealmSize`
  counts home factions; `actExitSize`.
- `src/regions.ts` - `ForeignPowerDef`, one per region, folded into the fingerprint.
- `src/passives.ts` - the `regional-leader` row and its hook.
- `src/decisions.ts` - `pick-duel` gains `stakeId`; a `pick-boon` kind. Both host-only,
  for the reason the existing `pick-duel` row already states.
- `src/notices.ts`, `src/presentation.ts`, `src/audio-manifest.ts`, `src/standings.ts` -
  exhaustive `Record<GameEventType, ...>` tables. New types (`boss-foretold`,
  `boss-summoned`, `duel-staked`, `expedition-won`) do not compile until each is
  classified; `duel-lapsed` comes out of all four.
- `src/main.ts`, `src/hud.ts`, `src/gates.ts` - the two-step pick (enemy, then stake),
  the boon modal, the act chip, `inputLocked` covering both new questions.
- `src/map-render.ts`, `src/view.ts`, `src/style.css` - drawing the summoned power and
  widening the surround hole.
- `src/sim.ts`, `src/boot-params.ts` - the sim answers the new questions; `?act=` and
  `?stake=` boot straight into a state worth checking, the way `duel=` already does.
- Tests: `tests/gauntlet.test.ts` - its fixtures (`playing()`, `ruledRivals`,
  `withGauntlet`, `nextRound`, `actedIn`) are what all of this builds on - plus
  `tests/acts.test.ts`, `tests/foreign-power.test.ts`, and edits to `duel-pick.test.ts`,
  `game.test.ts`, `regions.test.ts`, `net-codec.test.ts`.

---

## Tasks

1. **The stake, and the clock's removal.** `duel` gains `staked` and `decided`, loses
   `until`; `duelDecidedBy` fires on exactly two polygons and records the outcome;
   `duelOutcome` and `duel-lapsed` deleted everywhere the exhaustive tables force.
   `pickDuel` takes a stake; legal stakes via `marchHopsTo`. The one-land rule.
   Tests: won, lost, a third party's capture not ending it, the enemy ceasing to exist,
   a one-land realm. Sweep.
2. **Acts.** `GameState.act`, `actExitSize`, the ratchet at the wrap, the act chip.
   Tests: the ratchet never falls; the boundaries derive from the bar on both maps.
3. **Foretold and rest.** The `foretold` and `rest` arms, `boss-foretold`, the three-boon
   offer on the harvest modal, `pick-boon`. Tests: the sequence cannot be skipped; the
   world does not move while a boon is owed; each boon does what the offer promised.
   Sweep.
4. **Boss boons.** `regional-leader` plus its hook and hover text; `war-leader` granted;
   ceiling and heal; deck injection; per-act scaling; `rewardFor` takes the act.
   Tests: an elevated boss is measurably harder than the same faction was; the hover
   names the status.
5. **Acts I and II end to end.** Wire 1-4 together and play the first two acts through.
6. **The foreign power exists.** `ForeignPowerDef` for both regions, the fingerprint,
   summoning at act III, drawing it, the surround hole. Tests: absent before act III and
   present after; never counts toward the bar; both regions author one. Sweep.
7. **Foreign raids and the expedition.** Wrap-time marches from off-map into the
   `landings`; the expedition duel; `endingFor`'s victory and defeat arms. Tests: the
   raid arrow is a real telegraphed march; taking the boss's ground wins; losing the
   stake to a boss is defeat. Sweep.
8. **Gate.** `npm test`, `npm run build`, `npx biome lint 02-balticmap`, the sweep at
   zero, and - because task 1 removed a stalemate guard - `npm run balance`, with the
   unresolved-run count read off `runGame`'s `turnCap`.
9. **Playtest, then write down what was not checked.** Append to `FOLLOWUP.md`.

---

## Verification

- `npm test` and `npm run build` green at every commit; `npx biome lint 02-balticmap`
  from the repo root.
- The stuck-seat sweep at zero after tasks 1, 3, 6 and 7. This work changes who takes a
  turn four separate times, and that is the shape that froze the game twice on the parent
  branch.
- `npm run balance` once, at task 8, specifically for unresolved runs at `turnCap`. The
  clock's removal is the one change here that can hang a run.
- Boot params rather than clicking through: `?act=3` into the expedition, `?stake=` into
  a staked duel, and the existing `?seed=`, `?faction=`, `?hand=` to reach a known board.
- Browser pass on
  `https://jkirsteins.github.io/prototypes/preview/claude-difficulty-ramp-final-boss-v112f8/02/`,
  in order: an act I duel with a stake; the loss taking the staked land; the prophecy
  modal; the boon pick; an elevated boss reading as harder; the foreign power appearing
  on the coast; one of its raid arrows landing; and an arrow of your own drawn out past
  the frame.
- What to watch and say afterwards, since judgement is the gate: does staking a land make
  the pick a real decision or an obvious one; does the prophecy land as a warning or as a
  nag; does an act boss read as a boss or as a neighbour with more health; and does
  marching out past the coast read as an expedition or as a bug.

## Open

- **Iberia's foreign power is authored but unplayed.** `FOLLOWUP.md` already records that
  Iberia has never been played at all on this branch. The `ForeignPowerDef` for `MA` is
  written to the same standard as the Baltic's and checked by `regions.test.ts`, not by a
  browser.
- **Reward and boon sizes are chosen for legibility, not measured** - the same caveat the
  existing 1 growth / 2 defense / 3 wealth already carries.
