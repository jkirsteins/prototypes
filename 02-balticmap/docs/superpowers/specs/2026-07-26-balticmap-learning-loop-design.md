# Balticmap: Learning Loop - Roguelite Meta-Progression

Date: 2026-07-26
Status: approved

## Goal

Losses teach cards. The player starts knowing only Grow Crops, builds a
10-card deck from known cards before each run, sees which enemy cards hit
them during a run, and permanently unlocks one seen card per new game.
AI decks stay full, so early runs are sacrificial lessons and the
post-mortem explains exactly what killed you.

Depends on and layers over `2026-07-26-balticmap-rules-v2-design.md`
(card roster, deck size 10, max 1 per non-basic, post-mortem screen).

## Persistence

- One localStorage record, key `balticmap-meta-v1`:

```json
{ "knownCards": ["grow-crops"], "seenPool": [] }
```

- `knownCards`: card ids the player may put in a deck. Initial value:
  `["grow-crops"]`.
- `seenPool`: card ids seen in past runs but not yet unlocked.
- Corrupt or missing data falls back to the initial value silently.
- A "Reset progress" control on the main menu (small, below New game)
  wipes the record after an inline confirm (button turns into
  "Really reset?" for one further click).
- Storage access lives behind a small adapter so tests can inject an
  in-memory fake.

## Learning rules

A non-basic, deck-buildable card becomes SEEN during a run when:

- a targeted play's target belongs to the human realm (the human
  faction, its vassals, or its incorporated lands) at resolution time,
  or
- an untargeted play (Fortify, Reclaim Independence) is made by a
  faction whose realm is adjacent to the human realm at resolution time.

Exclusions: cards already in `knownCards`, Pay Tribute (not
deck-buildable), Grow Crops (known from the start), and the human's own
plays.

Seen cards accumulate in `GameState.seenThisRun: string[]` (ordered,
deduplicated) as plays resolve. When a run ends - defeat, victory, or
the player starting a new game mid-run - `seenThisRun` merges into the
persistent `seenPool`.

The post-mortem's "Seen this run" row shows `seenThisRun`; cards also in
`seenPool` from earlier runs render identically (the pool is cumulative).

## Deck screen

Flow: main menu -> New game -> DECK SCREEN -> pick faction -> playing.

Full-screen takeover in the post-mortem's visual style:

- Top row, "Learned from your defeats" - shown only when `seenPool` is
  non-empty: each pool card face-up but visually locked (dashed border).
  Clicking one unlocks it: it moves to `knownCards` (persisted
  immediately), the row collapses for this game (ONE unlock per game),
  and the card appears in the deck row below, pre-selected.
- Bottom row, "Your deck": every known non-basic card as a toggle
  (selected = in deck, max 1 each). Grow Crops shows as a filler card
  with a live count. Counter line: "N picked + M Grow Crops = 10".
  Non-basics exceeding 10 slots cannot all be selected (the counter
  blocks further selection at 10; not reachable until the roster grows
  past 10 non-basics).
- Button: "Choose your lands" -> proceeds to faction picking with the
  built deck.
- First run (nothing known but Grow Crops, empty pool): the screen shows
  just the filler row and the button - one click through, deck is
  10x Grow Crops.

Deck construction: the human deck = selected non-basics + Grow Crops
filler to exactly 10. AI decks are always the full default deck from
rules v2 (all 6 non-basics + 4 Grow Crops). Unselected known cards stay
known.

## Post-mortem integration

The "Seen this run" row (static in rules v2) becomes the loot display:

- Cards newly seen this run get a "NEW" corner tag.
- Caption: "Unlock one of these when you start your next game."
- No unlock happens on this screen; the choice lives in the deck screen
  (single decision point, always available even after a page reload).

## Architecture

- `src/meta.ts` (new, pure + storage adapter): load/save/reset of the
  meta record, `unlockCard(meta, cardId)`, `mergeSeen(meta, seen)`,
  `buildPlayerDeck(selectedIds)` -> 10-card list, validation (max 1,
  known-only).
- `src/game.ts`: `GameState.seenThisRun` + the seen-detection hook in
  card resolution (pure - adjacency and realm data are already in
  state); `newGame` accepts the human deck.
- `src/deck-screen.ts` (new, DOM): the deck screen; callbacks
  `onUnlock(cardId)`, `onStart(selectedIds)`.
- `src/hud.ts`: post-mortem loot row tags + caption; main menu gains
  Reset progress.
- `src/main.ts`: phase wiring (menu -> deck screen -> pick-faction),
  meta load on boot, merge-on-run-end (including "New game" clicked from
  a running game), reset control.
- Phase model: deck building is a new `deck-building` phase in
  `GamePhase` between `main-menu` and `pick-faction`.

## Error handling / edge cases

- Unlock clicked twice quickly: second click is a no-op (row collapses
  on first).
- `seenPool` entries for ids that no longer exist in `CARDS` (roster
  changed between versions): dropped at load.
- Starting a new game mid-run merges `seenThisRun` first, so quitting a
  hopeless run still banks the lesson.
- localStorage unavailable (private mode): adapter falls back to
  in-memory for the session; Reset control hidden.
- Deck screen with every non-basic known: selecting none is allowed
  (all-Grow-Crops deck remains legal).

## Testing

- `tests/meta.test.ts` (new): load/save round-trip with fake storage,
  corrupt-data fallback, unlock moves pool -> known and persists, merge
  dedupes, deck build fills to 10 and enforces max 1 / known-only,
  unknown-id pruning.
- `tests/game.test.ts`: seen-detection - targeted at realm member,
  untargeted by adjacent faction, exclusions (own plays, known cards,
  tribute), dedupe and order.
- `tests/deck-screen.test.ts` (new, happy-dom): first-run pass-through,
  unlock flow (one per game, row collapses), toggle + counter, start
  callback payload.
- `tests/hud.test.ts`: loot row NEW tags, reset control confirm.
- Manual e2e in Chrome: two consecutive runs - lose run 1, verify seen
  cards on the post-mortem, unlock one at the next deck screen, build,
  and see the card drawn in run 2; reload mid-collection to verify
  persistence.

## Out of scope

- More cards, rarities, or unlock currencies.
- Multiple save slots / profiles.
- Cloud sync.
