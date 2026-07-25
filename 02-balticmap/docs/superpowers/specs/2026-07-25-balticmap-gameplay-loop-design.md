# Balticmap: Basic Gameplay Loop

Date: 2026-07-25
Status: approved

## Goal

Add the first playable gameplay loop to the balticmap prototype: a main menu,
faction selection, and a turn cycle where 20 players (1 human + 19 AI) each
draw and play cards from private decks.

## Rules

### Players and factions

- There are exactly as many players as factions (currently 20, 1:1 with
  regions). Player 1 is the human; players 2..20 are AI.
- Ownership is modeled per faction (faction id), not per region. Clicking a
  region claims that region's faction. AI players are assigned one faction
  each, in stable faction order, skipping the human's pick.
- Player numbering: human is player 1; AIs are numbered 2..N in assignment
  order.

### Cards and decks

- One card type exists: "Grow crops". Playing it has no effect.
- Each player has a private deck (starts as 20 x "Grow crops"), a hand
  (starts empty), and a discard pile (starts empty).
- Shuffle is Fisher-Yates with an injected RNG (`() => number` in [0,1)) so
  tests are deterministic. The runtime uses `Math.random`.

### Turn cycle

- Turns cycle player 1 -> 2 -> ... -> N, then the turn counter increments and
  play returns to player 1. The game starts at turn 1.
- Turn start (all players): draw 1 card automatically.
  - If the deck is empty, shuffle the discard pile into a new deck first,
    leaving the discard empty.
  - If deck and discard are both empty, the draw is skipped silently.
- During a turn the player may play at most one card. Playing moves the card
  from hand to that player's discard pile and does nothing else.
- Human turn ends only when the End Turn button is clicked.
- AI turn: draw 1 (same rules), then play the first card in hand if any.
  Each AI turn resolves after a ~300 ms delay before advancing to the next
  player.

## Game phases

`main-menu -> pick-faction -> playing`

1. **main-menu**: full-screen overlay over the map (map not interactive).
   Shows the game title and a "New game" button. Clicking the button moves to
   pick-faction.
2. **pick-faction**: banner prompts "Choose your faction". Clicking a region
   claims its faction and moves to playing. During this phase region clicks do
   NOT open the info panel; hover tooltips still work.
3. **playing**: the turn cycle runs. Normal map interaction (hover, select,
   panel, pan, zoom) works as before. Regions whose faction is not owned by
   the human are slightly dimmed (CSS class, reduced opacity) for the rest of
   the game.

## UI

All new HUD DOM lives in `src/hud.ts`, styled in `src/style.css`:

- **Main menu**: centered overlay: title + "New game" button.
- **Hand fan**: bottom-center. Cards overlap with a slight rotation spread
  around the center card. Hovered card lifts. Clicking a card plays it - only
  during the human turn and only if no card was played this turn. Cards show
  the card name.
- **Deck and discard piles**: bottom-left, human's piles only. Each shows a
  count. AI piles are not rendered.
- **Status bar**: shows "Turn N - your turn" plus an End Turn button during
  the human turn; "Waiting on player N..." while AI player N is acting.

## Architecture

Follows the existing codebase pattern: pure state modules + DOM modules +
orchestration in `main.ts`.

New files:

- `src/cards.ts` - card definitions, `buildDeck()`, `shuffle(deck, rng)`.
  Pure.
- `src/game.ts` - `GameState` and pure transition functions:
  - `newGame(factionIds)` -> initial state in `main-menu` phase with an empty
    `players` array.
  - `startGame(state)` -> moves `main-menu` -> `pick-faction`.
  - `pickFaction(state, factionId)` -> assigns human + AIs, enters playing,
    begins player 1's turn (auto-draw).
  - `beginTurn(state, rng)` -> current player draws (with reshuffle rule).
  - `playCard(state, cardIndex)` -> moves card hand -> discard; at most one
    play per turn enforced.
  - `endTurn(state, rng)` -> advances to next player and begins their turn.
  - `aiTurn(state)` -> plays the current AI's first card, if any; the draw
    already happened in `beginTurn` via `endTurn`.
- `src/hud.ts` - DOM: main menu overlay, hand fan, deck/discard counters,
  status bar, End Turn button. Exposes an `update(state)` render function and
  callbacks (`onNewGame`, `onPlayCard`, `onEndTurn`).

Changed files:

- `src/main.ts` - orchestrator: owns the single mutable `GameState`, wires
  HUD callbacks, runs the AI loop with `setTimeout` (~300 ms per AI turn),
  applies/removes the region dimming CSS class on faction pick.
- `src/interaction.ts` - gains an optional intercept hook so the orchestrator
  can capture region clicks during pick-faction (and suppress panel opening).
- `src/style.css` - HUD styles, `dimmed` region class.

`GameState` shape (indicative):

```ts
interface PlayerState {
  id: number;          // 1 = human, 2..N = AI
  factionId: string;
  deck: string[];      // card ids
  hand: string[];
  discard: string[];
}

interface GameState {
  phase: "main-menu" | "pick-faction" | "playing";
  turn: number;               // 1-based
  players: PlayerState[];     // index 0 = human
  current: number;            // index into players
  playedThisTurn: boolean;
}
```

## Error handling / edge cases

- Draw with empty deck and non-empty discard: reshuffle discard, then draw.
- Draw with both empty: skip draw.
- Clicking a card outside the human turn, or after already playing: ignored.
- End Turn outside the human turn: ignored (button hidden/disabled anyway).
- Clicking the sea/background during pick-faction: nothing happens.
- Pan/zoom still work in every phase; drag on a region during pick-faction
  does not claim it (existing drag-vs-click threshold handles this).

## Testing

- `tests/cards.test.ts` - deck building, shuffle determinism with seeded RNG,
  shuffle is a permutation.
- `tests/game.test.ts` - phase transitions, faction assignment, draw,
  reshuffle-on-empty, skip-draw-when-all-empty, one-play-per-turn, turn
  advance and turn counter, AI turn logic.
- `tests/hud.test.ts` - happy-dom: menu renders and New Game fires callback,
  hand fan renders cards, counts update, status bar text, End Turn fires.
- E2E in Chrome (manual via dev server): menu -> new game -> pick faction ->
  dimming -> draw/play/end turn -> AI cycle with waiting labels -> reshuffle
  keeps the game going.

## Out of scope

- Card effects, resources, win conditions.
- AI strategy beyond "play the first card".
- Persistence/save games.
- Multiplayer.
