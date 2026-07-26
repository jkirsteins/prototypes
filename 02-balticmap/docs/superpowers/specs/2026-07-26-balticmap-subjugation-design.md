# Balticmap: Subjugation and Incorporation

Date: 2026-07-26
Status: approved

## Goal

Introduce soft-power and light-war expansion: factions accumulate pairwise
status (personal influence) and military might against each other. Leading a
rival on either track subjugates them into your realm; incorporation makes
that permanent. Three new cards drive this: Raid, Shrewd Marriage, and
Incorporate. An AI subjugating the human ends the game.

Leader entities and leader death are explicitly out of scope for this
iteration, but the data model is designed so a future "leader dies" event can
reset a faction's outgoing status values and the map re-derives itself
(subjugation is never stored as mutated ownership).

## Rules

### Cards and decks

Every deck still has exactly 20 cards:

- 10x Grow Crops (unchanged, untargeted no-op)
- 5x Raid (targeted: +1 might against the target)
- 3x Shrewd Marriage (targeted: +1 status against the target)
- 2x Incorporate (targeted: permanently annex one of your current vassals)

Draw, reshuffle, one-play-per-turn, and discard rules are unchanged.

### Relations

For every ordered faction pair (A, B) two integers exist, both starting
at 0 and only increasing in this iteration:

- `status[A][B]` - A's personal standing toward B (Shrewd Marriage bumps it)
- `might[A][B]` - A's demonstrated military might toward B (Raid bumps it)

The values are stored per pair and never overwritten by subjugation. A
faction's original numbers are always retained so a later drop on the other
side (e.g. future leader death) can un-subjugate it.

### Subjugation (derived)

A's lead over B is:

```
lead(A, B) = max(status[A][B] - status[B][A], might[A][B] - might[B][A])
```

A qualifies to subjugate B when `lead(A, B) > 0` (either track suffices).

Overlord assignment is a pure function recomputed after every card
resolution:

1. Collect all positive leads between living, non-incorporated factions.
2. Sort descending by lead; tiebreak by actor faction order, then target
   faction order (faction order = order in `MapData.factions`).
3. Walk the sorted list greedily. F becomes overlord of T when T has no
   overlord assigned yet in this walk and F has not itself been assigned an
   overlord. When a faction that already holds vassals is assigned an
   overlord, its vassals are released back into the pool and may be claimed
   by later (smaller) leads in the same walk.

Consequences: the biggest lead wins contested targets, vassals can be
poached by a rival with a larger lead, overlords are always free factions,
and chains (vassal of a vassal) never exist. Mutual-lead cases are handled
deterministically by the walk order; they are nearly unreachable in play
because a subjugated faction skips turns and its values freeze.

### Incorporation

Incorporate targets one of your current vassals. The target becomes a
permanent part of your realm:

- Removed from overlord computation entirely (never poached, never
  released, unaffected by future leader death).
- No longer a valid target for anyone's Raid or Shrewd Marriage.
- Its player is permanently inert (skips turns, like a vassal).

### Valid targets

- Raid / Shrewd Marriage: any living, non-incorporated faction adjacent to
  your realm (home region + vassals + incorporated lands). Your own vassals
  are valid (raising your lead defends against poaching); other overlords'
  vassals are valid (poaching); free factions are valid.
- Incorporate: your current vassals only.
- A targeted card with no valid target is unplayable: grayed in the human
  hand, skipped by the AI policy.

### Turns and game over

- Subjugated and incorporated players skip their turns entirely: no draw,
  no reshuffle, no play. Their decks and relations freeze.
- If, after any card resolves, the human faction has an overlord, the game
  moves to phase `game-over` immediately. The overlay names the overlord
  faction and offers New Game (back to the main menu flow).
- There is no win condition yet (out of scope).

## Adjacency data

`scripts/prepare-data.mjs` already builds a topojson topology in which
shared borders are shared arcs. It gains:

- Land adjacency: regions are adjacent iff their geometries share at least
  one topology arc.
- Sea links: a small authored list of region id pairs connecting island
  factions (e.g. Osilians) to nearby coastal regions, merged into the same
  adjacency sets.

Baked output: `Region.adjacent: string[]` (region ids) in `map.json`, and
the matching field on `Region` in `src/types.ts`. Faction adjacency equals
region adjacency (factions are 1:1 with regions); realm adjacency is the
union over realm members minus the realm itself, computed at runtime.

## UI

### Map rendering

- Effective color: a region subjugated by or incorporated into F renders in
  F's faction color; otherwise its own faction color.
- Undimmed treatment covers the human's whole realm (home + vassals +
  incorporated). Everything else stays dimmed, including AI realms (which
  still recolor to their overlord's color).

### Targeting mode

- Clicking a playable targeted card during the human turn arms it: valid
  target regions highlight, all other regions dim further, and the status
  bar shows "Choose a target for <card name>".
- Clicking a valid region resolves the card. Esc, clicking the background,
  or clicking the armed card again cancels. Clicking an invalid region
  cancels targeting (and does not open the panel).
- Unplayable cards (e.g. Incorporate with no vassal) render grayed and do
  not arm. Grow Crops plays immediately on click, as today.
- Armed-card state is transient UI state in `main.ts`, not part of
  `GameState`.

### Region info panel

During play the panel gains a relations block for non-human factions:

- Numbers: "Status: yours X / theirs Y", "Might: yours X / theirs Y"
  (pairwise vs the human).
- Relationship line: "Independent", "Your vassal",
  "Part of your realm (incorporated)", "Vassal of <faction>", or
  "Your overlord".

### Activity log

New / extended events:

- Plays of Raid, Shrewd Marriage, Incorporate log with their target
  ("P3 raids the Curonians").
- Overlord diffs after each card produce derived events: subjugated
  ("The Curonians submit to P3"), released ("The Curonians break free"),
  incorporated, and game over.

### Game over screen

Full-screen overlay styled like the main menu: title, "Your realm has been
subjugated by <faction>", New Game button.

## Architecture

New file:

- `src/relations.ts` (pure) - pairwise store as
  `Record<"actorFactionId|targetFactionId", { status: number; might: number }>`
  (missing key = 0/0), plus:
  - `bumpStatus(rel, a, b)` / `bumpMight(rel, a, b)`
  - `leadOf(rel, a, b)`
  - `computeOverlords(rel, incorporated, factionOrder)` ->
    `Map<factionId, overlordId>` (the greedy walk)
  - `realmOf(factionId, overlords, incorporated)` -> faction ids
  - `validTargets(factionId, cardId, overlords, incorporated, adjacency)`

Changed files:

- `src/cards.ts` - card defs gain a `targeted` flag; new deck composition.
- `src/game.ts` - `GameState` gains `relations`,
  `incorporated: Record<string, string>` (vassal -> owner), phase
  `"game-over"`. `playCard(state, cardIndex, targetId?)` validates targets,
  applies effects, diffs overlords for log events, detects human
  subjugation. `beginTurn` / `endTurn` skip subjugated players. `aiTurn`
  implements the greedy policy below.
- `src/hud.ts` - targeting prompt in the status bar, grayed unplayable
  cards, game-over overlay.
- `src/map-render.ts` - effective-color fills, realm undimming, targeting
  highlight/dim classes.
- `src/main.ts` - armed-card state machine, target click routing, panel
  suppression while armed.
- `src/interaction.ts` - reuse of the existing click intercept hook for
  targeting mode.
- `src/style.css` - targeting highlight/dim, grayed cards, game-over
  overlay.
- `scripts/prepare-data.mjs`, `src/data/map.json`, `src/types.ts` -
  adjacency baking as above.

### AI policy (deterministic, RNG-free)

1. If holding Incorporate and at least one vassal exists: incorporate the
   first vassal in faction order.
2. Else, among Raid / Shrewd Marriage cards in hand: for every valid
   target the AI does not already subjugate (own vassals are excluded so
   the AI expands instead of endlessly reinforcing) and matching track,
   compute the deficit to subjugate (`theirValue - yourValue + 1` on that
   track); play the card/target pair with the smallest deficit, tiebreak
   by faction order, then Raid before Marriage.
3. Else play Grow Crops if in hand.
4. Else play the first playable card; if nothing is playable, pass.

## Error handling / edge cases

- Playing a targeted card without a target id, or with an invalid target:
  state returned unchanged.
- Incorporate on a non-vassal: rejected (unchanged state).
- Raid / Marriage on an incorporated region or the player's own faction:
  rejected.
- All neighbors of a realm subjugated by others: they remain valid raid
  targets (poaching), so a realm cannot be target-starved while any
  adjacent faction lives un-incorporated.
- Human subjugated in the middle of an AI turn chain: game-over phase set
  immediately; remaining AI turns do not run.
- Vassal released mid-walk (overlord got subjugated): it may be claimed by
  a smaller lead in the same walk, else becomes free; a "break free" log
  event is emitted only if it ends the walk with no overlord.

## Testing

- `tests/relations.test.ts` (new): lead math, greedy assignment, biggest
  lead wins, poaching, release on overlord subjugation, mutual-lead
  determinism, incorporation removal, realm and valid-target computation
  including sea links.
- `tests/game.test.ts`: card effects on relations, target validation,
  turn skipping for vassals, game-over trigger, AI policy steps 1-4.
- `tests/cards.test.ts`: new deck composition (10/5/3/2, total 20).
- `tests/data.test.ts`: adjacency symmetric, nonempty, non-self.
- `tests/hud.test.ts`: targeting prompt, grayed cards, game-over overlay.
- Manual e2e in Chrome: full loop - arm card, highlight/dim, subjugate a
  neighbor (color flip + undim), poach, incorporate, lose to an AI and see
  game over.

## Out of scope

- Leader entities, leader death, and any status decay.
- Win condition.
- AI strategy beyond the greedy policy.
- Multiplayer, persistence.
