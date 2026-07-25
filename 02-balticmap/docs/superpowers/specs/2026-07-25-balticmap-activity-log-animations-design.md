# Balticmap: Activity Log, Card Animations, Visual Piles

Date: 2026-07-25
Status: approved

## Goal

Give the player visibility into what is happening (an activity log) and game
feel (card animations, visual deck/discard piles), and remove the arbitrary
AI turn timer.

## 1. Game events (game.ts)

`GameState` gains a `log: GameEvent[]` field.

```ts
export type GameEventType = "draw" | "play" | "reshuffle";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // present for draw and play
}
```

- `newGame` initializes `log: []`.
- `beginTurn` appends a `reshuffle` event when it moves the discard into the
  deck, and a `draw` event (with `cardId`) when a card is drawn. If both deck
  and discard are empty, no event is appended.
- `playCard` appends a `play` event with `cardId`.
- Function signatures stay `(state) => state`; callers are untouched.
- The log grows unbounded in state. That is acceptable for this prototype;
  the UI renders only a recent slice.

Hidden information rule: the state records `cardId` for every draw (it is
needed for correctness and tests); the UI decides whether to show it.

## 2. Activity log UI (hud.ts)

A panel fixed to the right edge of the screen, vertically centered:

- ~230px wide, max-height ~45vh, scrollable, newest entry at the bottom,
  auto-scrolled to the bottom when new entries arrive.
- Visible only during the `playing` phase.
- Entry text:
  - Human draw: `You drew <card name>`
  - AI draw: `Player <id> drew a card` (card name hidden)
  - Human play: `You played <card name>`
  - AI play: `Player <id> played <card name>` (plays are public)
  - Reshuffle: `You reshuffled your discard` / `Player <id> reshuffled their discard`
  - A `Turn <n>` separator line is rendered whenever the turn number changes
    between consecutive entries (derived at render time from event turns, not
    stored as events).
- New entries get a brief highlight flash (CSS animation).
- A header bar with a chevron button collapses the panel into a thin tab on
  the right edge; clicking the tab expands it again. Collapse state is
  in-memory only (not persisted).
- The HUD tracks the number of log entries it has already rendered and treats
  entries beyond that as new (for the flash and for triggering animations).

## 3. AI turns without timer (main.ts)

- Delete `AI_TURN_MS` and the recursive `setTimeout` in `runAiTurns`.
- On end turn: update the HUD once (status shows `Waiting on other players...`),
  then in a `setTimeout(..., 0)` run all AI turns in a loop:
  `while (game.phase === "playing" && !isHumanTurn(game)) game = endTurn(aiTurn(game), rng);`
  then update the HUD again.
- The waiting label is visible for roughly one frame today; it becomes
  meaningful if AI turns ever get slow.

## 4. Visual piles (hud.ts + style.css)

- Deck pile: bottom-right corner. Discard pile: bottom-left corner (replacing
  the current combined text piles bottom-left). Hand stays bottom-center.
- Each pile renders as a mini card stack:
  - Card-aspect element, ~56x80px, styled as a card back (parchment card
    style with a simple back pattern, e.g. a border inset and crosshatch or
    diagonal stripes done in CSS - no image assets).
  - 2-4 offset back layers depending on count (1 card = 1 layer, scaling up
    to 4 layers; purely cosmetic).
  - A count badge showing the number of cards.
  - A small "Deck" / "Discard" label under the stack.
  - Empty pile renders as a dashed outline with count 0.
- Both piles show card backs (per explicit user request), including discard.
- Piles reflect the human player's deck/discard only, as today.

## 5. Animations (hud.ts + style.css)

A transient absolutely positioned `.flying-card` element appended to the app
container, moved with CSS transform transitions, removed on `transitionend`
(with a timeout fallback). Positions are computed from
`getBoundingClientRect()` of the source and target elements. Animations are
for the human player's cards only; AI actions surface only as log entries.

- Draw (human): a card back flies from the deck pile (bottom-right) to the
  hand area (~350ms), then the hand re-renders including the new card.
- Play (human), three stages:
  1. The played card flies from its hand position to the center of the
     screen, enlarging to ~1.6x so the name is readable (~350ms).
  2. Holds at center ~700ms.
  3. Flies into the discard pile (bottom-left), shrinking into the pile
     (~350ms), then is removed.
  - Input remains enabled throughout; the animation is purely visual and
    never blocks game state updates. State updates immediately on click;
    the hand re-render hides the played card right away.
- Reshuffle (human): the deck pile pulses (brief CSS scale animation).
- Animations are triggered from the new-events-since-last-update diff in the
  HUD, so they fire once per event even if `update` is called repeatedly.

## Non-goals

- No animation for AI draws/plays (no visible AI cards exist).
- No log persistence, filtering, or timestamps.
- No cap/trim of the in-state event log.
- No sound.

## Testing

- Unit tests (vitest, happy-dom) in `tests/game.test.ts`: draw/play/reshuffle
  events appended with correct turn, playerId, cardId; no event when deck and
  discard are both empty; log initialized empty.
- `tests/hud.test.ts`: log panel renders entry text per the hidden-info rules;
  turn separators appear; collapse toggle hides the entry list; piles render
  count badges; new-entry diff triggers a flying card element for human draw
  and play.
- E2E: manual verification in Chrome (per standing rule) - draw and play
  animations, log collapse/expand, AI turns resolve without delay.
