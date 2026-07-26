# Balticmap: Rules v2 - Card-Driven Subjugation

Date: 2026-07-26
Status: approved

## Goal

Replace automatic lead-based subjugation with a card-driven system: leads
only unlock the Subjugate card (threshold 2), vassals keep playing under
restrictions and can escape, tribute drags subjugated players down, and the
game ends in victory (realm majority) or defeat (the human is incorporated).
Turns become mandatory-play with automatic turn end. The map visualizes
threat and realm at a glance.

This spec is playable standalone: every player runs a full deck. The
companion spec (learning-loop) adds meta-progression on top and depends on
this one.

Supersedes the subjugation rules in
`2026-07-26-balticmap-subjugation-design.md` where they conflict. The
pairwise relations model, adjacency data, targeting UI pattern, and the
activity log carry over.

## Core model changes

- Pairwise `status` / `might` values per ordered faction pair stay exactly
  as today: start at 0, only increase.
- Lead per track: `lead(A, B, track) = value[A][B] - value[B][A]`.
- The subjugation threshold is 2: a lead of 2 or more on either track
  unlocks Subjugate against that target.
- Subjugation is STORED state, not derived. `GameState` gains
  `overlords: Record<string, string>` (vassal faction id -> overlord
  faction id), changed only by card resolutions:
  - Subjugate adds/replaces an entry (poaching replaces the old overlord).
  - Reclaim Independence removes the player's own entry.
  - Incorporate removes the entry and writes `incorporated` (permanent),
    as today.
  - When a faction F gains an overlord, every entry naming F as overlord
    is removed (F's vassals are freed; chains never exist).
  - When a faction F is incorporated, every entry naming F as overlord is
    removed (its vassals are freed).
- The derived `computeOverlords` function is retired. `realmOf` and
  `validTargets` take the stored overlord map.
- Realm(F) = F + F's vassals + F's incorporated lands. A subjugated
  faction keeps its own incorporated lands inside its own realm.
- Effective region color follows incorporation first, then that owner's
  overlord: a land incorporated into V renders V's color unless V itself
  has overlord O, then O's color.

## Card roster

Non-basic cards are limited to 1 copy per deck. Grow Crops is a basic:
unlimited copies, used as deck filler. Deck size is exactly 10.

| Card | Targeted | Effect | Playability |
|---|---|---|---|
| Grow Crops | no | none (pace card) | always |
| Raid | yes | +1 your might toward target | target adjacent to your realm, not incorporated, not yourself (own vassals ARE valid targets); while subjugated, your overlord is NOT a valid target |
| Shrewd Marriage | yes | +1 your status toward target | same adjacency rules as Raid, but your overlord IS a valid target (diplomatic escape tool) |
| Fortify | no | +1 your might toward every other living (non-incorporated) faction | always |
| Subjugate | yes | target becomes your vassal; target's own vassals are freed; a previous overlord of the target is replaced (poaching) | target adjacent to your realm, not incorporated, not yourself, not already your vassal, and your lead over it is >= 2 on at least one track; unplayable while you are subjugated |
| Incorporate | yes | permanent annexation | target is your vassal; unplayable while you are subjugated |
| Reclaim Independence | no | you cease to be a vassal; all your Pay Tribute copies are removed from deck, hand, and discard | only while subjugated AND your overlord's lead over you is below 2 on BOTH tracks |
| Pay Tribute | no | +1 toward-you value for your overlord AND every land incorporated into your overlord, on one track; the human chooses the track via a two-button prompt; the AI strengthens the overlord's weaker track against it (tie: might) | forced: while it is in hand it is the only playable card; only exists while subjugated |

Pay Tribute is not deck-buildable. When a faction becomes subjugated, 2
copies are shuffled into random positions of its deck. When it becomes
free again (Reclaim, or its overlord falls and frees it) all copies are
removed from deck, hand, and discard. Re-subjugation injects 2 fresh
copies.

Rationale for the Reclaim condition: escape requires neutralizing the
overlord's subjugation-grade edge on both tracks. Fortify closes might
gaps (it hits everyone, including the overlord); Shrewd Marriage aimed at
the overlord closes status gaps.

## Turn flow

- No End Turn button. Playing (or discarding, below) ends the turn
  automatically and immediately hands off to the next player. AI turns
  keep running back to back with no artificial delay.
- Game start: every player draws an opening hand of 3.
- Turn start: draw 1 (reshuffle the discard into the deck first when the
  deck is empty; skip the draw only if both are empty).
- The player MUST play exactly one playable card per turn.
  Playability resolution order:
  1. If any forced card (Pay Tribute) is in hand, the playable set is
     exactly the forced cards.
  2. Otherwise a card is playable if its condition holds and, for
     targeted cards, at least one valid target exists.
  3. If the playable set is empty, the turn is a forced discard: the
     human is prompted ("No playable card - discard one") and clicks a
     card to discard it; the AI discards its leftmost card. The discard
     is logged. The turn then ends.
- Incorporated players are permanently inert (skipped). Subjugated
  players take normal turns under the restrictions above.
- Human card interaction keeps the current pattern: click an untargeted
  card to play it immediately; click a targeted card to arm it, then
  click a highlighted region (Esc / background / re-click / invalid
  region cancels). Unplayable cards render grayed. In discard mode all
  cards are clickable and clicking discards.

## Endings

- Victory: after any card resolves, if the human realm size is >= 11 of
  the 20 polygons (self + vassals + incorporated), phase moves to
  `victory`.
- Defeat: only when an AI plays Incorporate on the human faction; phase
  moves to `defeat`. Being subjugated is survivable by design.
- AI factions cannot win; the game continues past any AI majority.
- Both endings show the post-mortem takeover (below).

## AI policy v2

Deterministic priority list, no RNG. Tiebreaks use faction order
(`GameState.factionIds`).

1. Pay Tribute if in hand (forced). Track choice: the overlord's weaker
   track against the payer (smaller lead; tie -> might).
2. Reclaim Independence if playable.
3. Incorporate the first vassal in faction order, if playable.
4. Subjugate the valid target with the LARGEST lead (tie: faction
   order).
5. If a single Raid or Shrewd Marriage on some valid target would raise
   that lead to >= 2 (deficit 1 on the matching track), play it on the
   first such target in faction order (raid checked before marriage).
6. Fortify, if any other free faction holds a might lead of >= 1 over
   this faction (defensive posture).
7. Raid, else Shrewd Marriage, on the valid target closest to the
   threshold on the matching track (smallest deficit; own vassals
   excluded; tie: faction order).
8. Grow Crops.
9. Forced discard (leftmost card).

## Map and HUD visuals

### Realm outline

The human realm renders one shared thick outline in a brighter shade of
the human faction color (lighten the hex, e.g. +35% toward white).
Implementation: an under-layer group re-draws every realm polygon with
`stroke-width` roughly 6 (map units) and the brightened stroke color plus
matching fill; the normal region fills painted above cover all interior
strokes, leaving a single merged outer halo. The group is rebuilt on
every ownership change.

### Threat borders (always on)

Every region outside the human realm gets a border class computed from
the deltas against the human, recomputed after every card:

- `threat-1` / `threat-2` / `threat-3`: their best lead over you is 1 / 2
  / 3 or more (red, darker with level).
- `advantage`: you lead them on at least one track and they lead you on
  none (green).
- neutral (thin gray) otherwise.

### Hover badge

The region tooltip gains, for non-realm regions during play:

- "Might: +N (you lead)" / "Might: -N (they lead)" / "Might: even", same
  for Status, each line colored green / red / neutral.
- The relationship line (Independent / Your vassal / Vassal of X / Part
  of your realm (incorporated) / Your overlord).
- "Subjugate available" when your lead is >= 2 on either track and the
  region is a valid Subjugate target.

The info panel keeps its relations block with the same delta lines.

### Activity log

New event types logged with faction names: fortify plays, subjugate
("X subjugates Y"), reclaim ("X reclaims independence from Y"), tribute
("X pays tribute to Y"), discard ("X discards a card"), victory, defeat
("X is incorporated into Y" exists already). Draw/play/reshuffle events
unchanged.

### Post-mortem screen (victory and defeat)

Full-screen takeover, replaces the current game-over overlay:

- Title: "Victory" (realm majority reached) or "Game over" (you were
  incorporated).
- Cause line: "You rule the Baltic - N of 20 lands" or "Incorporated by
  <faction>".
- For defeat: the killer's build-up - the last plays by the killer
  faction that targeted your realm (card name + turn), and the final
  might/status deltas between you and the killer.
- "Seen this run" row: the non-basic cards played against/near you this
  run (static display in this spec; the learning-loop spec makes it
  meaningful).
- Right half: the full activity log, scrollable.
- New game button.

The status bar is hidden in both ending phases.

## Architecture

- `src/relations.ts`: keeps the pairwise store, bumps, `leadOf`; drops
  `computeOverlords`; `realmOf(factionId, overlords, incorporated)` and
  `validTargets(...)` now take the stored overlord Record. Gains
  `bumpMightAll(rel, actor, others)` for Fortify.
- `src/cards.ts`: data-driven `CardDef` gains `maxPerDeck: number | null`
  (null = unlimited), `deckBuildable: boolean`, `forced: boolean`.
  `buildDeck()` returns the full 10-card AI/default deck (6 non-basics +
  4 Grow Crops).
- `src/playability.ts` (new, pure): `playableSet(state, playerIndex)` ->
  { mode: "play" | "discard", cardIndexes }, `validTargetsFor(state,
  playerIndex, cardId)`, and the per-card condition logic (thresholds,
  subjugated restrictions, forced cards).
- `src/game.ts`: stored `overlords`; phases gain `victory` and `defeat`;
  `playCard` resolves the new effects (including tribute injection and
  removal, vassal freeing, poaching) and the ending checks; `discardCard`
  transition; turn advance folds into card resolution (no explicit
  endTurn from the UI; an internal `advance` runs after every play or
  discard). Opening-hand draw in `pickFaction`.
- `src/ai.ts` (new, pure): policy v2 as above, operating via
  `playability.ts`.
- `src/hud.ts`: End Turn button removed; discard-mode prompt; tribute
  track prompt (two buttons in the status bar area); post-mortem screen;
  new log texts.
- `src/map-render.ts` / `src/main.ts` / `src/style.css`: realm outline
  under-layer, threat border classes, extended tooltip, wiring.
- `src/panel.ts`: unchanged interface; relations text gains the
  Subjugate-available hint.

## Error handling / edge cases

- Playing a card that is not in the playable set: rejected (unchanged
  state). Discarding while a playable card exists: rejected.
- Subjugate on a target that stops qualifying between arm and click
  (impossible for the human - state cannot change while armed - but the
  validation still re-checks on resolution).
- A vassal whose overlord is subjugated or incorporated is freed in the
  same resolution, before ending checks.
- Freeing removes tribute copies even from the hand mid-turn; if the
  hand becomes empty as a result, the next turn's draw proceeds normally.
- Reshuffle with injected tribute copies keeps them in the deck.
- Victory and defeat checks run after every resolution, in that order
  (simultaneous majority + incorporation cannot happen: incorporation of
  the human precludes human majority growth in the same play).
- 19 mandatory AI plays after every human play: the existing instant AI
  chain pattern (setTimeout 0, loop while not human turn) carries over.

## Testing

- `tests/relations.test.ts`: rewritten for stored overlords: realm,
  valid targets with overlord restrictions, `bumpMightAll`.
- `tests/playability.test.ts` (new): every card's condition table,
  forced-card override, discard-mode detection.
- `tests/game.test.ts`: subjugate/poach/free-on-fall resolutions,
  tribute injection and removal, reclaim, victory and defeat triggers,
  mandatory-play turn advance, opening hands.
- `tests/ai.test.ts` (new): each policy priority with constructed states.
- `tests/hud.test.ts`: discard prompt, tribute prompt, post-mortem
  content, no End Turn button.
- Manual e2e in Chrome: full loop including a survivable subjugation
  (tribute, fortify, marriage, reclaim) and both endings.

## Out of scope

- Meta-progression, deck building, persistence (learning-loop spec).
- Leader entities and death.
- AI victory conditions.
- Card art, sounds, animation changes beyond log/flow adjustments.
