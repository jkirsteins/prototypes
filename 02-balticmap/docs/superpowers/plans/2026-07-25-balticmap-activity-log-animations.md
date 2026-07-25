# Activity Log, Card Animations, Visual Piles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible right-edge activity log, card draw/play animations, visual card-back piles (deck bottom-right, discard bottom-left), and remove the arbitrary AI turn timer.

**Architecture:** `GameState` gains an append-only `log: GameEvent[]` written by the pure transition functions in `game.ts`. The HUD diffs "events I have already rendered" against the state log to append log entries and fire animations exactly once per event. A new `animate.ts` provides a setTimeout-driven flying-card primitive (works in happy-dom, where transitionend never fires). AI turns run in a single synchronous loop inside one `setTimeout(0)`.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom for DOM tests), plain DOM + CSS (no frameworks).

**Spec:** `docs/superpowers/specs/2026-07-25-balticmap-activity-log-animations-design.md`

## Global Constraints

- Working directory: `/Users/janis.kirsteins/Projects/prototypes/02-balticmap` (repo root is one level up; commit paths are prefixed `02-balticmap/`).
- Run tests with `npm test` (vitest run). All tests must pass before every commit.
- No new dependencies. No image assets - card backs are pure CSS.
- Pure functions in `game.ts`: signatures stay `(state) => state`, no mutation of inputs.
- The UI hides AI card names on draws; plays are public for everyone.
- Animations are for the human player (playerId 1) only.
- No em dashes or non-ASCII characters in any code, comments, or copy. Use "-", "->", "...".
- Player-facing strings exactly as specified in each task (e.g. `Waiting on other players...`).

---

### Task 1: Game events in game.ts

**Files:**
- Modify: `src/game.ts`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: existing `GameState`, `beginTurn`, `playCard`, `shuffle`.
- Produces (later tasks rely on these exact shapes):

```ts
export type GameEventType = "draw" | "play" | "reshuffle";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // present for draw and play
}

// GameState gains:  log: GameEvent[]
```

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts` (top-level, after the existing `aiTurn` describe):

```ts
describe("event log", () => {
  it("starts empty and records the opening draw", () => {
    expect(newGame(FACTIONS).log).toEqual([]);
    const g = playingState();
    expect(g.log).toEqual([
      { turn: 1, playerId: 1, type: "draw", cardId: "grow-crops" },
    ]);
  });

  it("records plays with the card id", () => {
    const g = playCard(playingState(), 0);
    expect(g.log.at(-1)).toEqual({
      turn: 1, playerId: 1, type: "play", cardId: "grow-crops",
    });
  });

  it("records AI draws on endTurn", () => {
    const g = endTurn(playingState(), seededRng(3));
    expect(g.log.at(-1)).toEqual({
      turn: 1, playerId: 2, type: "draw", cardId: "grow-crops",
    });
  });

  it("records a reshuffle before the draw when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      hand: [] as string[],
      discard: ["grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.log.slice(-2)).toEqual([
      { turn: 1, playerId: 1, type: "reshuffle" },
      { turn: 1, playerId: 1, type: "draw", cardId: "grow-crops" },
    ]);
  });

  it("records no event when deck and discard are both empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      hand: [] as string[],
      discard: [] as string[],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const before = g.log.length;
    expect(beginTurn(g, seededRng(2)).log).toHaveLength(before);
  });

  it("does not mutate the input state's log", () => {
    const g = playingState();
    const len = g.log.length;
    playCard(g, 0);
    endTurn(g, seededRng(5));
    expect(g.log).toHaveLength(len);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/game.test.ts`
Expected: FAIL - `log` is undefined on GameState (type error / toEqual failures).

- [ ] **Step 3: Implement events in src/game.ts**

Add above `GamePhase`:

```ts
export type GameEventType = "draw" | "play" | "reshuffle";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // present for draw and play
}
```

Add `log: GameEvent[];` to the `GameState` interface, and `log: [],` to the
object returned by `newGame`.

Replace `beginTurn` with:

```ts
/** Current player draws 1: reshuffle discard into deck if the deck is empty;
 *  skip the draw entirely if both are empty. Resets the play-per-turn flag. */
export function beginTurn(state: GameState, rng: Rng): GameState {
  if (state.players.length === 0) return state;
  const p = state.players[state.current];
  let { deck, discard } = p;
  const log = [...state.log];
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
    log.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
  }
  let hand = p.hand;
  if (deck.length > 0) {
    log.push({ turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0] });
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
  const updated = { ...p, deck, hand, discard };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  return { ...state, players, log, playedThisTurn: false };
}
```

In `playCard`, change the return statement to append the event:

```ts
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  const log = [
    ...state.log,
    { turn: state.turn, playerId: p.id, type: "play" as const, cardId: p.hand[cardIndex] },
  ];
  return { ...state, players, log, playedThisTurn: true };
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/tests/game.test.ts
git commit -m "feat(balticmap): append draw/play/reshuffle events to game log"
```

---

### Task 2: Activity log panel in the HUD

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `GameEvent` from Task 1 (`import { type GameEvent } from "./game"`), `CARDS` from `./cards`.
- Produces: DOM structure other tasks and tests rely on:
  - `.activity-log` panel containing `.activity-log-header` (with `.activity-log-title`, `.activity-log-toggle`) and `.activity-log-entries`.
  - `.log-entry` per event, `.log-turn` separators, `.collapsed` class on the panel when collapsed.
  - hud.ts module-level state `renderedEvents: number` - Task 4 reuses the same fresh-events diff.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud.test.ts`. Also add `aiTurn` to the existing import from `../src/game`:

```ts
describe("activity log", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("is hidden outside the playing phase and visible during it", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".activity-log").classList.contains("hidden")).toBe(true);
    hud.update(playing());
    expect(q(container, ".activity-log").classList.contains("hidden")).toBe(false);
  });

  it("names your cards, hides AI draws, and shows AI plays", () => {
    const { container, hud } = setup();
    let g = playing();
    g = playCard(g, 0);
    g = endTurn(g, seededRng(2)); // player 2 draws
    g = aiTurn(g); // player 2 plays
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toEqual([
      "You drew Grow crops",
      "You played Grow crops",
      "Player 2 drew a card",
      "Player 2 played Grow crops",
    ]);
  });

  it("appends only new entries across updates and inserts turn separators", () => {
    const { container, hud } = setup();
    let g = playing();
    hud.update(g);
    for (let i = 0; i < FACTIONS.length; i++) g = endTurn(g, seededRng(3));
    hud.update(g); // back to the human: turn 2 draw happened
    expect(container.querySelectorAll(".log-entry")).toHaveLength(4);
    const seps = [...container.querySelectorAll(".log-turn")].map(
      (el) => el.textContent,
    );
    expect(seps).toEqual(["Turn 1", "Turn 2"]);
  });

  it("resets the entries when a new game starts", () => {
    const { container, hud } = setup();
    let g = playing();
    g = playCard(g, 0);
    hud.update(g);
    expect(container.querySelectorAll(".log-entry")).toHaveLength(2);
    hud.update(playing()); // fresh game: log has only the opening draw
    expect(container.querySelectorAll(".log-entry")).toHaveLength(1);
  });

  it("collapses to a tab and expands again", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const panel = q(container, ".activity-log");
    expect(panel.classList.contains("collapsed")).toBe(false);
    q(container, ".activity-log-toggle").click();
    expect(panel.classList.contains("collapsed")).toBe(true);
    q(container, ".activity-log-toggle").click();
    expect(panel.classList.contains("collapsed")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/hud.test.ts`
Expected: FAIL - `.activity-log` does not exist (`q` returns null).

- [ ] **Step 3: Implement the log panel in src/hud.ts**

Change the game import to include the event type:

```ts
import { isHumanTurn, type GameEvent, type GameState } from "./game";
```

Add a helper near the top of the module (after the FAN constants):

```ts
const cardName = (id: string | undefined): string =>
  (id && CARDS[id]?.name) ?? id ?? "";

function eventText(e: GameEvent): string {
  const you = e.playerId === 1;
  switch (e.type) {
    case "draw":
      return you ? `You drew ${cardName(e.cardId)}` : `Player ${e.playerId} drew a card`;
    case "play":
      return you
        ? `You played ${cardName(e.cardId)}`
        : `Player ${e.playerId} played ${cardName(e.cardId)}`;
    case "reshuffle":
      return you
        ? "You reshuffled your discard"
        : `Player ${e.playerId} reshuffled their discard`;
  }
}
```

Inside `createHud`, after the `hand` element is created, build the panel:

```ts
  const logPanel = document.createElement("div");
  logPanel.className = "activity-log hidden";
  const logHeader = document.createElement("div");
  logHeader.className = "activity-log-header";
  const logTitle = document.createElement("span");
  logTitle.className = "activity-log-title";
  logTitle.textContent = "Activity";
  const logToggle = document.createElement("button");
  logToggle.className = "activity-log-toggle";
  logToggle.textContent = ">";
  logToggle.addEventListener("click", () => {
    const collapsed = logPanel.classList.toggle("collapsed");
    logToggle.textContent = collapsed ? "<" : ">";
  });
  logHeader.append(logTitle, logToggle);
  const logEntries = document.createElement("div");
  logEntries.className = "activity-log-entries";
  logPanel.append(logHeader, logEntries);
```

Add `logPanel` to the container append: `container.append(menu, status, piles, hand, logPanel);`

Add the diff state and renderer inside `createHud`:

```ts
  let renderedEvents = 0;
  let lastRenderedTurn = 0;

  /** Appends entries for events not yet rendered; returns those events so
   *  animations can key off the same diff. */
  function renderLog(state: GameState): GameEvent[] {
    if (state.log.length < renderedEvents) {
      logEntries.replaceChildren();
      renderedEvents = 0;
      lastRenderedTurn = 0;
    }
    const fresh = state.log.slice(renderedEvents);
    for (const e of fresh) {
      if (e.turn !== lastRenderedTurn) {
        const sep = document.createElement("div");
        sep.className = "log-turn";
        sep.textContent = `Turn ${e.turn}`;
        logEntries.appendChild(sep);
        lastRenderedTurn = e.turn;
      }
      const entry = document.createElement("div");
      entry.className = "log-entry log-new";
      entry.textContent = eventText(e);
      logEntries.appendChild(entry);
    }
    renderedEvents = state.log.length;
    if (fresh.length > 0) logEntries.scrollTop = logEntries.scrollHeight;
    return fresh;
  }
```

In `update`, toggle visibility with the other elements and call the renderer
in the playing branch (after `renderHand(state)`):

```ts
      logPanel.classList.toggle("hidden", state.phase !== "playing");
```

```ts
        renderLog(state);
```

- [ ] **Step 4: Add CSS to src/style.css**

Insert before the `.hidden` rule (which must stay last):

```css
.activity-log {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 230px;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 6;
  display: flex;
  flex-direction: column;
}

.activity-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
  font-weight: 600;
  color: #3f3428;
}

.activity-log.collapsed {
  width: auto;
}

.activity-log.collapsed .activity-log-entries,
.activity-log.collapsed .activity-log-title {
  display: none;
}

.activity-log.collapsed .activity-log-header {
  border-bottom: none;
}

.activity-log-toggle {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #666;
  padding: 2px 4px;
}

.activity-log-entries {
  max-height: 45vh;
  overflow-y: auto;
  padding: 6px 10px;
  font-size: 12px;
  color: #3f3428;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.log-turn {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #8a7f6f;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.log-entry.log-new {
  animation: log-flash 900ms ease-out;
}

@keyframes log-flash {
  from {
    background: #f1e9da;
  }
  to {
    background: transparent;
  }
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/hud.ts 02-balticmap/src/style.css 02-balticmap/tests/hud.test.ts
git commit -m "feat(balticmap): collapsible activity log panel"
```

---

### Task 3: Visual card-back piles (deck right, discard left)

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `.pile.pile-deck` (bottom-right) and `.pile.pile-discard`
  (bottom-left), each containing `.pile-stack` (with 0-4 `.card-back`
  children and an `empty` class when count is 0), `.pile-count`, and
  `.pile-label`. The `.piles` wrapper is REMOVED. Task 4 uses `deckPile` and
  `discardPile` elements for animation geometry.

- [ ] **Step 1: Update and write tests**

In `tests/hud.test.ts`:

1. In the test `"shows only the menu at main-menu..."`, replace the `.piles` assertion line with:

```ts
    expect(q(container, ".pile-deck").classList.contains("hidden")).toBe(true);
    expect(q(container, ".pile-discard").classList.contains("hidden")).toBe(true);
```

2. In the test `"renders the human turn..."`, replace the two pile textContent assertions with:

```ts
    expect(q(container, ".pile-deck .pile-count").textContent).toBe("19");
    expect(q(container, ".pile-deck .pile-label").textContent).toBe("Deck");
    expect(q(container, ".pile-discard .pile-count").textContent).toBe("0");
    expect(q(container, ".pile-discard .pile-label").textContent).toBe("Discard");
```

3. Append a new describe:

```ts
describe("visual piles", () => {
  it("renders layered card backs scaled to the count, dashed when empty", () => {
    const { container, hud } = setup();
    const g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    hud.update(g); // deck 19, discard 0
    expect(container.querySelectorAll(".pile-deck .card-back")).toHaveLength(4);
    expect(container.querySelectorAll(".pile-discard .card-back")).toHaveLength(0);
    expect(
      q(container, ".pile-discard .pile-stack").classList.contains("empty"),
    ).toBe(true);
    expect(
      q(container, ".pile-deck .pile-stack").classList.contains("empty"),
    ).toBe(false);
    hud.update(playCard(g, 0)); // discard 1
    expect(container.querySelectorAll(".pile-discard .card-back")).toHaveLength(1);
    expect(
      q(container, ".pile-discard .pile-stack").classList.contains("empty"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/hud.test.ts`
Expected: FAIL - `.pile-count` etc. do not exist.

- [ ] **Step 3: Implement piles in src/hud.ts**

Replace the whole `piles`/`deckPile`/`discardPile` construction block with:

```ts
  function makePile(kind: string, label: string) {
    const root = document.createElement("div");
    root.className = `pile pile-${kind} hidden`;
    const stack = document.createElement("div");
    stack.className = "pile-stack";
    const count = document.createElement("div");
    count.className = "pile-count";
    const lbl = document.createElement("div");
    lbl.className = "pile-label";
    lbl.textContent = label;
    root.append(stack, count, lbl);
    return { root, stack, count };
  }

  const deckPile = makePile("deck", "Deck");
  const discardPile = makePile("discard", "Discard");
```

Add a layer count helper next to `eventText` (module level):

```ts
/** Cosmetic stack depth: more cards -> visibly thicker pile, capped at 4. */
function pileLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 8) return 2;
  if (count < 13) return 3;
  return 4;
}
```

Add a render helper inside `createHud`:

```ts
  function renderPile(
    pile: { stack: HTMLElement; count: HTMLElement },
    n: number,
  ): void {
    pile.count.textContent = String(n);
    pile.stack.classList.toggle("empty", n === 0);
    pile.stack.replaceChildren();
    for (let i = 0; i < pileLayers(n); i++) {
      const back = document.createElement("div");
      back.className = "card-back";
      back.style.translate = `${-2 * i}px ${-2 * i}px`;
      pile.stack.appendChild(back);
    }
  }
```

Update the container append to use the new roots:

```ts
  container.append(menu, status, deckPile.root, discardPile.root, hand, logPanel);
```

In `update`, replace the `piles` visibility toggle with:

```ts
      deckPile.root.classList.toggle("hidden", state.phase !== "playing");
      discardPile.root.classList.toggle("hidden", state.phase !== "playing");
```

and replace the two `textContent` pile updates in the playing branch with:

```ts
        renderPile(deckPile, human.deck.length);
        renderPile(discardPile, human.discard.length);
```

- [ ] **Step 4: Replace pile CSS in src/style.css**

Delete the `.piles` and `.pile` rules and add (still before `.hidden`):

```css
.pile {
  position: absolute;
  bottom: 16px;
  width: 64px;
  text-align: center;
  z-index: 6;
}

.pile-deck {
  right: 16px;
}

.pile-discard {
  left: 16px;
}

.pile-stack {
  position: relative;
  width: 56px;
  height: 80px;
  margin: 0 auto;
}

.pile-stack.empty {
  border: 1px dashed #a89a84;
  border-radius: 6px;
}

.card-back {
  position: absolute;
  inset: 0;
  border: 1px solid #7a6a55;
  border-radius: 6px;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(122, 106, 85, 0.18) 0 4px,
      transparent 4px 8px
    ),
    #f1e9da;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}

.pile-count {
  position: absolute;
  top: -8px;
  right: -2px;
  background: #3f3428;
  color: #fdfaf4;
  font-size: 11px;
  border-radius: 999px;
  min-width: 18px;
  padding: 2px 4px;
  z-index: 1;
}

.pile-label {
  margin-top: 6px;
  font-size: 11px;
  color: #3f3428;
  text-shadow: 0 1px 2px rgba(253, 250, 244, 0.8);
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/hud.ts 02-balticmap/src/style.css 02-balticmap/tests/hud.test.ts
git commit -m "feat(balticmap): card-back pile visuals, deck right, discard left"
```

---

### Task 4: Flying-card animations

**Files:**
- Create: `src/animate.ts`
- Modify: `src/hud.ts`
- Modify: `src/style.css`
- Test: `tests/animate.test.ts` (create), `tests/hud.test.ts`

**Interfaces:**
- Consumes: `renderLog`'s returned fresh-events array (Task 2), `deckPile` / `discardPile` elements (Task 3).
- Produces `src/animate.ts`:

```ts
export interface Point { x: number; y: number }

export interface FlightStage {
  to: Point;          // where the card's CENTER ends up
  scale: number;      // scale at the end of the stage
  durationMs: number;
  holdMs?: number;    // pause after arriving, before the next stage
}

export function flyCard(
  container: HTMLElement,
  className: string,   // "" for face-up, "back" for a card back
  label: string,       // card name for face-up, "" for backs
  from: { x: number; y: number; width: number; height: number },
  stages: FlightStage[],
  onDone?: () => void,
): HTMLElement
```

- [ ] **Step 1: Write the failing animate tests**

Create `tests/animate.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { flyCard } from "../src/animate";

describe("flyCard", () => {
  it("spawns at the source, transitions through stages, then removes itself", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const done = vi.fn();
    const el = flyCard(
      host,
      "back",
      "",
      { x: 10, y: 20, width: 88, height: 126 },
      [
        { to: { x: 200, y: 300 }, scale: 1.6, durationMs: 350, holdMs: 700 },
        { to: { x: 30, y: 40 }, scale: 0.6, durationMs: 350 },
      ],
      done,
    );
    expect(host.contains(el)).toBe(true);
    expect(el.className).toBe("flying-card back");
    expect(el.style.left).toBe("10px");
    expect(el.style.top).toBe("20px");

    vi.advanceTimersByTime(30); // past the initial 20ms kick-off
    // stage 1: center moves from (54, 83) to (200, 300)
    expect(el.style.transform).toBe("translate(146px, 217px) scale(1.6)");

    vi.advanceTimersByTime(350 + 700); // stage 1 flight + hold done
    expect(el.style.transform).toBe("translate(-24px, -43px) scale(0.6)");

    vi.advanceTimersByTime(350); // stage 2 flight done -> removal
    expect(host.contains(el)).toBe(false);
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/animate.test.ts`
Expected: FAIL - cannot resolve `../src/animate`.

- [ ] **Step 3: Implement src/animate.ts**

```ts
export interface Point {
  x: number;
  y: number;
}

export interface FlightStage {
  to: Point; // where the card's center ends up
  scale: number;
  durationMs: number;
  holdMs?: number; // pause after arriving, before the next stage
}

/** Spawns an absolutely positioned card element and flies it through the
 *  given stages with CSS transforms, then removes it. Timing is driven by
 *  setTimeout, not transitionend: happy-dom never fires transition events,
 *  and a dropped event must not leak the element. */
export function flyCard(
  container: HTMLElement,
  className: string,
  label: string,
  from: { x: number; y: number; width: number; height: number },
  stages: FlightStage[],
  onDone?: () => void,
): HTMLElement {
  const el = document.createElement("div");
  el.className = className ? `flying-card ${className}` : "flying-card";
  el.textContent = label;
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  el.style.width = `${from.width}px`;
  el.style.height = `${from.height}px`;
  container.appendChild(el);

  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let delay = 20; // let the initial styles land before the first transition
  for (const s of stages) {
    setTimeout(() => {
      el.style.transitionDuration = `${s.durationMs}ms`;
      el.style.transform =
        `translate(${s.to.x - cx}px, ${s.to.y - cy}px) scale(${s.scale})`;
    }, delay);
    delay += s.durationMs + (s.holdMs ?? 0);
  }
  setTimeout(() => {
    el.remove();
    onDone?.();
  }, delay);
  return el;
}
```

- [ ] **Step 4: Run animate tests**

Run: `npm test -- tests/animate.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing HUD animation tests**

Append to `tests/hud.test.ts`:

```ts
describe("card animations", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("flies a card back from the deck on your draw, exactly once", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    const g = playing();
    hud.update(g); // log contains your opening draw
    expect(container.querySelectorAll(".flying-card.back")).toHaveLength(1);
    hud.update(g); // same state again: no duplicate animation
    expect(container.querySelectorAll(".flying-card.back")).toHaveLength(1);
    vi.runAllTimers();
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("hides the newest hand card while the draw flight is in progress", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    hud.update(playing());
    const card = q(container, ".card");
    expect(card.classList.contains("card-incoming")).toBe(true);
    vi.runAllTimers();
    expect(card.classList.contains("card-incoming")).toBe(false);
    vi.useRealTimers();
  });

  it("flies the played card face-up on your play", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = playing();
    hud.update(g);
    vi.runAllTimers();
    g = playCard(g, 0);
    hud.update(g);
    const flying = container.querySelectorAll(".flying-card");
    expect(flying).toHaveLength(1);
    expect(flying[0].classList.contains("back")).toBe(false);
    expect(flying[0].textContent).toBe("Grow crops");
    vi.runAllTimers();
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does not animate AI actions, but pulses the deck on your reshuffle", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = playing();
    g = playCard(g, 0);
    hud.update(g); // consumes your draw + play events
    vi.runAllTimers();
    g = endTurn(g, seededRng(2)); // AI draw event
    hud.update(g);
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);

    // force a human reshuffle: empty deck, cards in discard
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      discard: ["grow-crops", "grow-crops"],
    };
    let g2 = { ...g, players: [p0, ...g.players.slice(1)], current: 0 };
    g2 = beginTurn(g2, seededRng(3));
    hud.update(g2);
    expect(q(container, ".pile-deck").classList.contains("pulse")).toBe(true);
    vi.runAllTimers();
    expect(q(container, ".pile-deck").classList.contains("pulse")).toBe(false);
    vi.useRealTimers();
  });
});
```

Add `beginTurn` to the `../src/game` import in `tests/hud.test.ts`.

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test -- tests/hud.test.ts`
Expected: FAIL - no `.flying-card` elements are created.

- [ ] **Step 7: Wire animations into src/hud.ts**

Add imports and constants:

```ts
import { flyCard } from "./animate";
```

```ts
const CARD_W = 88; // matches .card in style.css
const CARD_H = 126;
const DRAW_MS = 350;
const PLAY_TO_CENTER_MS = 350;
const PLAY_HOLD_MS = 700;
const PLAY_TO_DISCARD_MS = 350;
const PLAY_CENTER_SCALE = 1.6;
const RESHUFFLE_PULSE_MS = 450;
```

Inside `createHud`, add capture state for the played card's origin:

```ts
  let pendingPlayRect: DOMRect | null = null;
```

In `renderHand`, change the card click listener to capture the rect first:

```ts
      if (canPlay)
        card.addEventListener("click", () => {
          pendingPlayRect = card.getBoundingClientRect();
          cb.onPlayCard(i);
        });
```

Add geometry helpers and animation triggers inside `createHud`:

```ts
  const center = (r: DOMRect): { x: number; y: number } => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  });

  function animateDraw(): void {
    const from = deckPile.root.getBoundingClientRect();
    flyCard(
      container,
      "back",
      "",
      { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
      [{ to: center(hand.getBoundingClientRect()), scale: 1, durationMs: DRAW_MS }],
    );
    const newest = hand.lastElementChild;
    if (newest) {
      newest.classList.add("card-incoming");
      setTimeout(() => newest.classList.remove("card-incoming"), DRAW_MS + 40);
    }
  }

  function animatePlay(cardId: string): void {
    const from = pendingPlayRect ?? hand.getBoundingClientRect();
    pendingPlayRect = null;
    flyCard(
      container,
      "",
      cardName(cardId),
      { x: from.x, y: from.y, width: CARD_W, height: CARD_H },
      [
        {
          to: center(container.getBoundingClientRect()),
          scale: PLAY_CENTER_SCALE,
          durationMs: PLAY_TO_CENTER_MS,
          holdMs: PLAY_HOLD_MS,
        },
        {
          to: center(discardPile.root.getBoundingClientRect()),
          scale: 0.6,
          durationMs: PLAY_TO_DISCARD_MS,
        },
      ],
    );
  }

  function pulseDeck(): void {
    deckPile.root.classList.add("pulse");
    setTimeout(() => deckPile.root.classList.remove("pulse"), RESHUFFLE_PULSE_MS);
  }

  /** Human-only: AI actions surface as log entries, nothing moves on screen. */
  function animateEvents(fresh: GameEvent[]): void {
    for (const e of fresh) {
      if (e.playerId !== 1) continue;
      if (e.type === "draw") animateDraw();
      else if (e.type === "play") animatePlay(e.cardId ?? "");
      else pulseDeck();
    }
  }
```

In `update`'s playing branch, replace the bare `renderLog(state);` call with:

```ts
        animateEvents(renderLog(state));
```

(`renderLog` must run after `renderHand` so `animateDraw` can tag the newest
hand card.)

- [ ] **Step 8: Add animation CSS to src/style.css**

Add before the `.hidden` rule:

```css
.flying-card {
  position: fixed;
  z-index: 30;
  pointer-events: none;
  border: 1px solid #7a6a55;
  border-radius: 8px;
  background: #fdfaf4;
  color: #3f3428;
  font-size: 13px;
  padding: 8px 4px;
  text-align: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  transition-property: transform;
  transition-timing-function: ease;
}

.flying-card.back {
  background:
    repeating-linear-gradient(
      45deg,
      rgba(122, 106, 85, 0.18) 0 4px,
      transparent 4px 8px
    ),
    #f1e9da;
}

.card-incoming {
  visibility: hidden;
}

.pile-deck.pulse .pile-stack {
  animation: pile-pulse 400ms ease;
}

@keyframes pile-pulse {
  50% {
    transform: scale(1.12);
  }
}
```

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add 02-balticmap/src/animate.ts 02-balticmap/src/hud.ts 02-balticmap/src/style.css 02-balticmap/tests/animate.test.ts 02-balticmap/tests/hud.test.ts
git commit -m "feat(balticmap): flying-card draw/play animations, reshuffle pulse"
```

---

### Task 5: AI turns without the timer

**Files:**
- Modify: `src/main.ts`
- Modify: `src/hud.ts`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: existing `endTurn`, `aiTurn`, `isHumanTurn`.
- Produces: status text `Waiting on other players...` during any AI turn
  (replaces `Waiting on player N...`).

- [ ] **Step 1: Update the status-text test**

In `tests/hud.test.ts`, in the test `"disables held cards during AI turns and shows the waiting label"`, change:

```ts
    expect(q(container, ".status-text").textContent).toBe("Waiting on player 2...");
```

to:

```ts
    expect(q(container, ".status-text").textContent).toBe("Waiting on other players...");
```

- [ ] **Step 2: Run tests to verify the change fails**

Run: `npm test -- tests/hud.test.ts`
Expected: FAIL on that one assertion.

- [ ] **Step 3: Update src/hud.ts status text**

In `update`, replace the AI-turn branch:

```ts
        } else {
          statusText.textContent = "Waiting on other players...";
          endTurnBtn.classList.add("hidden");
        }
```

(The `const player = state.players[state.current];` line goes away.)

- [ ] **Step 4: Update src/main.ts**

Delete the `const AI_TURN_MS = 300;` line. Replace `runAiTurns` with:

```ts
/** Runs every AI turn back to back. The setTimeout(0) lets the HUD paint
 *  the waiting label first; there is no artificial per-turn delay. */
function runAiTurns(): void {
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    while (game.phase === "playing" && !isHumanTurn(game)) {
      game = endTurn(aiTurn(game), rng);
    }
    hud.update(game);
  }, 0);
}
```

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: all tests PASS, build succeeds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/main.ts 02-balticmap/src/hud.ts 02-balticmap/tests/hud.test.ts
git commit -m "feat(balticmap): run AI turns back to back without timer"
```

---

### Task 6: E2E verification in Chrome (chrome-devtools MCP)

**Files:** none (verification only; fix regressions if found).

This task is performed by the main session (not a subagent) using the
chrome-devtools MCP tools.

- [ ] **Step 1: Start the dev server**

Run in background: `npm run dev` (serves on http://127.0.0.1:5173).

- [ ] **Step 2: Drive the app**

Using chrome-devtools MCP (new_page/navigate, take_snapshot, click,
take_screenshot, list_console_messages):

1. Open http://127.0.0.1:5173. Click "New game".
2. Click a region to pick a faction. Verify: activity log panel on the right
   edge shows "Turn 1" and "You drew Grow crops"; deck stack with count badge
   bottom-right; empty dashed discard bottom-left; a draw animation fires.
3. Play the card from the hand. Verify: card flies to the center enlarged and
   readable, holds, then lands on the discard pile; log shows "You played
   Grow crops"; discard count becomes 1.
4. Click "End turn". Verify: AI turns resolve immediately (no 300ms-per-turn
   stagger); log gains "Player N drew a card" / "Player N played Grow crops"
   entries for every AI player and a "Turn 2" separator plus your new draw.
5. Collapse the log via the chevron; verify it shrinks to a tab; expand it.
6. Check the console for errors (list_console_messages) - expect none.

- [ ] **Step 3: Report**

Screenshot key states and report pass/fail per check. Any failure: fix in the
main session, re-run `npm test`, commit the fix, and re-verify in Chrome.
