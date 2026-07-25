# Balticmap Gameplay Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first playable loop: main menu -> pick a faction -> turn cycle where 20 players (1 human + 19 AI) draw and play "Grow crops" cards from private 20-card decks.

**Architecture:** Pure-logic modules (`src/cards.ts`, `src/game.ts`) following the reducer style of `src/state.ts`; a DOM module `src/hud.ts` following the style of `src/panel.ts`; orchestration (mutable state + AI timers + region dimming) in `src/main.ts`. `src/interaction.ts` gains an optional click-intercept callback so the pick-faction phase can capture region clicks.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom (`// @vitest-environment happy-dom` pragma per DOM test file). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-balticmap-gameplay-loop-design.md`

## Global Constraints

- No em dashes or non-typable unicode characters anywhere (use "-", "->", "...", '"').
- Card name copy is exactly "Grow crops". Deck size is exactly 20.
- Human is player 1 (players[0]); AI players are numbered 2..N in faction order (skipping the human's faction).
- Ownership is per faction id, not region id (currently 1:1 with regions).
- Run tests from the project root `/Users/janis.kirsteins/Projects/prototypes/02-balticmap` with `npx vitest run <file>`.
- Every commit message follows the existing `feat(balticmap): ...` / `test(balticmap): ...` convention and ends with the Claude Code co-author trailer.
- All code matches existing style: 2-space indent, double quotes, semicolons, pure functions returning new objects (never mutating inputs).

---

### Task 1: Card definitions, deck building, shuffle (`src/cards.ts`)

**Files:**
- Create: `src/cards.ts`
- Test: `tests/cards.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2, 3):
  - `interface CardDef { id: string; name: string }`
  - `const CARDS: Record<string, CardDef>` with key `"grow-crops"` -> `{ id: "grow-crops", name: "Grow crops" }`
  - `const DECK_SIZE = 20`
  - `type Rng = () => number` (returns in [0, 1))
  - `function buildDeck(): string[]` - 20 x `"grow-crops"`
  - `function shuffle(cards: string[], rng: Rng): string[]` - Fisher-Yates, pure (input untouched)

- [ ] **Step 1: Write the failing test**

Create `tests/cards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CARDS, DECK_SIZE, buildDeck, shuffle, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("cards", () => {
  it("defines the grow-crops card", () => {
    expect(CARDS["grow-crops"]).toEqual({ id: "grow-crops", name: "Grow crops" });
  });

  it("builds a deck of 20 grow-crops cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.every((c) => c === "grow-crops")).toBe(true);
  });

  it("shuffle returns a permutation and leaves the input untouched", () => {
    const input = ["a", "b", "c", "d", "e"];
    const copy = [...input];
    const out = shuffle(input, seededRng(42));
    expect(input).toEqual(copy);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("shuffle is deterministic for a given rng seed", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffle(input, seededRng(7))).toEqual(shuffle(input, seededRng(7)));
  });

  it("shuffle actually reorders (seed chosen to produce a change)", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffle(input, seededRng(1))).not.toEqual(input);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cards.test.ts`
Expected: FAIL - cannot resolve `../src/cards`.

- [ ] **Step 3: Write the implementation**

Create `src/cards.ts`:

```ts
export interface CardDef {
  id: string;
  name: string;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow crops" },
};

export const DECK_SIZE = 20;

/** Returns a float in [0, 1). Injected so tests are deterministic. */
export type Rng = () => number;

export function buildDeck(): string[] {
  return Array.from({ length: DECK_SIZE }, () => "grow-crops");
}

/** Fisher-Yates; returns a new array, input untouched. */
export function shuffle(cards: string[], rng: Rng): string[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/cards.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cards.ts tests/cards.test.ts
git commit -m "feat(balticmap): card defs, deck building, seeded shuffle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Game state and turn transitions (`src/game.ts`)

**Files:**
- Create: `src/game.ts`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes (from Task 1): `buildDeck()`, `shuffle(cards, rng)`, `type Rng` from `./cards`.
- Produces (used by Tasks 3, 4):
  - `type GamePhase = "main-menu" | "pick-faction" | "playing"`
  - `interface PlayerState { id: number; factionId: string; deck: string[]; hand: string[]; discard: string[] }`
  - `interface GameState { phase: GamePhase; turn: number; players: PlayerState[]; current: number; playedThisTurn: boolean; factionIds: string[] }`
  - `newGame(factionIds: string[]): GameState` - phase `"main-menu"`, `turn: 1`, empty players.
  - `startGame(state: GameState): GameState` - `"main-menu"` -> `"pick-faction"`; no-op in other phases.
  - `pickFaction(state: GameState, factionId: string, rng: Rng): GameState` - assigns human (player 1) + AIs (2..N in `factionIds` order, skipping the pick), enters `"playing"`, and begins player 1's turn (auto-draw). No-op if phase is not `"pick-faction"` or factionId is unknown.
  - `beginTurn(state: GameState, rng: Rng): GameState` - current player draws 1 (reshuffle discard into deck first if deck empty; skip if both empty); resets `playedThisTurn`.
  - `playCard(state: GameState, cardIndex: number): GameState` - moves the card from the current player's hand to their discard; no-op if not `"playing"`, already played this turn, or index out of range.
  - `endTurn(state: GameState, rng: Rng): GameState` - advances `current` (wraps, incrementing `turn` on wrap) and calls `beginTurn` for the next player. No-op if not `"playing"`.
  - `aiTurn(state: GameState): GameState` - the current (AI) player plays their first card if they have one (draw already happened in `beginTurn` via `endTurn`).
  - `isHumanTurn(state: GameState): boolean` - true iff `"playing"` and `current === 0`.

**All functions are pure: never mutate the input state; players arrays are copied on write.**

- [ ] **Step 1: Write the failing test**

Create `tests/game.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, pickFaction, beginTurn, playCard, endTurn, aiTurn,
  isHumanTurn, type GameState,
} from "../src/game";
import { DECK_SIZE, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function playingState(): GameState {
  return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
}

describe("newGame / startGame", () => {
  it("starts at the main menu with no players", () => {
    const g = newGame(FACTIONS);
    expect(g.phase).toBe("main-menu");
    expect(g.turn).toBe(1);
    expect(g.players).toEqual([]);
  });

  it("startGame moves to pick-faction, and only from main-menu", () => {
    const g = startGame(newGame(FACTIONS));
    expect(g.phase).toBe("pick-faction");
    expect(startGame(g)).toBe(g);
  });
});

describe("pickFaction", () => {
  it("assigns the human to the picked faction and AIs to the rest in order", () => {
    const g = playingState();
    expect(g.phase).toBe("playing");
    expect(g.players.map((p) => p.factionId)).toEqual(["beta", "alpha", "gamma", "delta"]);
    expect(g.players.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it("begins player 1's turn: they have drawn 1 card", () => {
    const g = playingState();
    expect(g.current).toBe(0);
    expect(g.players[0].hand).toHaveLength(1);
    expect(g.players[0].deck).toHaveLength(DECK_SIZE - 1);
    expect(g.players[1].hand).toHaveLength(0);
  });

  it("ignores unknown factions and wrong phases", () => {
    const menu = newGame(FACTIONS);
    expect(pickFaction(menu, "beta", seededRng(1))).toBe(menu);
    const picking = startGame(menu);
    expect(pickFaction(picking, "nope", seededRng(1))).toBe(picking);
  });
});

describe("draw and reshuffle", () => {
  it("reshuffles the discard into the deck when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      hand: [] as string[],
      discard: ["grow-crops", "grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(1);
    expect(after.players[0].deck).toHaveLength(2);
    expect(after.players[0].discard).toEqual([]);
  });

  it("skips the draw when deck and discard are both empty", () => {
    let g = playingState();
    const p0 = { ...g.players[0], deck: [] as string[], hand: [] as string[], discard: [] as string[] };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toEqual([]);
    expect(after.players[0].deck).toEqual([]);
  });
});

describe("playCard", () => {
  it("moves the card from hand to discard and blocks a second play", () => {
    const g = playingState();
    const played = playCard(g, 0);
    expect(played.players[0].hand).toHaveLength(0);
    expect(played.players[0].discard).toEqual(["grow-crops"]);
    expect(played.playedThisTurn).toBe(true);
    expect(playCard(played, 0)).toBe(played);
  });

  it("ignores out-of-range indices and does not mutate input", () => {
    const g = playingState();
    const handBefore = [...g.players[0].hand];
    expect(playCard(g, 5)).toBe(g);
    expect(playCard(g, -1)).toBe(g);
    playCard(g, 0);
    expect(g.players[0].hand).toEqual(handBefore);
    expect(g.playedThisTurn).toBe(false);
  });
});

describe("endTurn / turn cycle", () => {
  it("advances to the next player and draws for them", () => {
    const g = endTurn(playingState(), seededRng(3));
    expect(g.current).toBe(1);
    expect(g.turn).toBe(1);
    expect(g.players[1].hand).toHaveLength(1);
    expect(g.playedThisTurn).toBe(false);
  });

  it("wraps to player 1 and increments the turn counter", () => {
    let g = playingState();
    for (let i = 0; i < FACTIONS.length; i++) g = endTurn(g, seededRng(4));
    expect(g.current).toBe(0);
    expect(g.turn).toBe(2);
    expect(g.players[0].hand).toHaveLength(2);
  });

  it("isHumanTurn is true only for players[0] in playing phase", () => {
    const g = playingState();
    expect(isHumanTurn(g)).toBe(true);
    expect(isHumanTurn(endTurn(g, seededRng(5)))).toBe(false);
    expect(isHumanTurn(newGame(FACTIONS))).toBe(false);
  });
});

describe("aiTurn", () => {
  it("plays the AI's first card", () => {
    const g = endTurn(playingState(), seededRng(6));
    const after = aiTurn(g);
    expect(after.players[1].hand).toHaveLength(0);
    expect(after.players[1].discard).toHaveLength(1);
  });

  it("does nothing when the AI hand is empty", () => {
    let g = endTurn(playingState(), seededRng(6));
    const p1 = { ...g.players[1], hand: [] as string[] };
    g = { ...g, players: [g.players[0], p1, ...g.players.slice(2)] };
    expect(aiTurn(g)).toBe(g);
  });

  it("the full cycle keeps decks cycling far past deck depletion", () => {
    let g = playingState();
    const rng = seededRng(9);
    // 4 players x 60 full rounds = every player draws and plays 60 times
    for (let round = 0; round < 60; round++) {
      for (let p = 0; p < FACTIONS.length; p++) {
        g = isHumanTurn(g) ? playCard(g, 0) : aiTurn(g);
        g = endTurn(g, rng);
      }
    }
    expect(g.turn).toBe(61);
    for (const p of g.players) {
      expect(p.deck.length + p.hand.length + p.discard.length).toBe(DECK_SIZE);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game.test.ts`
Expected: FAIL - cannot resolve `../src/game`.

- [ ] **Step 3: Write the implementation**

Create `src/game.ts`:

```ts
import { buildDeck, shuffle, type Rng } from "./cards";

export type GamePhase = "main-menu" | "pick-faction" | "playing";

export interface PlayerState {
  id: number; // 1 = human, 2..N = AI
  factionId: string;
  deck: string[];
  hand: string[];
  discard: string[];
}

export interface GameState {
  phase: GamePhase;
  turn: number; // 1-based
  players: PlayerState[]; // index 0 = human
  current: number; // index into players
  playedThisTurn: boolean;
  factionIds: string[];
}

export function newGame(factionIds: string[]): GameState {
  return {
    phase: "main-menu",
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    factionIds,
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "main-menu") return state;
  return { ...state, phase: "pick-faction" };
}

function makePlayer(id: number, factionId: string, rng: Rng): PlayerState {
  return { id, factionId, deck: shuffle(buildDeck(), rng), hand: [], discard: [] };
}

export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
): GameState {
  if (state.phase !== "pick-faction") return state;
  if (!state.factionIds.includes(factionId)) return state;
  const others = state.factionIds.filter((id) => id !== factionId);
  const players = [
    makePlayer(1, factionId, rng),
    ...others.map((id, i) => makePlayer(i + 2, id, rng)),
  ];
  return beginTurn(
    { ...state, phase: "playing", players, current: 0 },
    rng,
  );
}

/** Current player draws 1: reshuffle discard into deck if the deck is empty;
 *  skip the draw entirely if both are empty. Resets the play-per-turn flag. */
export function beginTurn(state: GameState, rng: Rng): GameState {
  const p = state.players[state.current];
  let { deck, discard } = p;
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
  }
  let hand = p.hand;
  if (deck.length > 0) {
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
  const updated = { ...p, deck, hand, discard };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  return { ...state, players, playedThisTurn: false };
}

export function playCard(state: GameState, cardIndex: number): GameState {
  if (state.phase !== "playing" || state.playedThisTurn) return state;
  const p = state.players[state.current];
  if (cardIndex < 0 || cardIndex >= p.hand.length) return state;
  const updated = {
    ...p,
    hand: p.hand.filter((_, i) => i !== cardIndex),
    discard: [...p.discard, p.hand[cardIndex]],
  };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  return { ...state, players, playedThisTurn: true };
}

export function endTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing") return state;
  const current = (state.current + 1) % state.players.length;
  const turn = current === 0 ? state.turn + 1 : state.turn;
  return beginTurn({ ...state, current, turn }, rng);
}

/** The current (AI) player plays their first card, if any.
 *  Their draw already happened in beginTurn via endTurn. */
export function aiTurn(state: GameState): GameState {
  return playCard(state, 0);
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/game.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): game state with turn cycle, decks, reshuffle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: HUD - menu, hand fan, piles, status bar (`src/hud.ts` + CSS)

**Files:**
- Create: `src/hud.ts`
- Modify: `src/style.css` (append HUD styles at the end)
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes (from Tasks 1, 2): `CARDS` from `./cards`; `type GameState`, `isHumanTurn` from `./game`.
- Produces (used by Task 4):
  - `interface HudCallbacks { onNewGame(): void; onPlayCard(index: number): void; onEndTurn(): void }`
  - `interface Hud { update(state: GameState): void }`
  - `function createHud(container: HTMLElement, cb: HudCallbacks): Hud`

**Behavior of `update(state)`:**
- Menu overlay (`.menu-overlay`) visible only in `"main-menu"`; contains an `h1.menu-title` with text `Baltic Lands` and a `button.menu-new-game` with text `New game` firing `onNewGame`.
- Status bar (`.status-bar`) hidden in `"main-menu"`. In `"pick-faction"` the `.status-text` reads `Choose your faction` and the End Turn button is hidden. In `"playing"`: on the human turn the text is `Turn N - your turn` and `button.end-turn` (text `End turn`) is visible, firing `onEndTurn`; on an AI turn the text is `Waiting on player N...` (the AI's 1-based player id) and the button is hidden.
- Piles (`.piles`) and hand (`.hand`) visible only in `"playing"`. `.pile-deck` shows `Deck: N`, `.pile-discard` shows `Discard: N` for the human player only.
- Hand renders one `button.card` per card in `players[0].hand` in order, each containing the card's display name from `CARDS`. Fan layout: each card gets an inline transform `rotate({(i - (n-1)/2) * 5}deg) translateY({abs(i - (n-1)/2) * 6}px)` computed in JS. Clicking card i fires `onPlayCard(i)` only when it is the human turn and `playedThisTurn` is false; otherwise the cards have the `disabled` attribute and no callback fires.

- [ ] **Step 1: Write the failing test**

Create `tests/hud.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createHud, type HudCallbacks } from "../src/hud";
import { newGame, startGame, pickFaction, endTurn, playCard } from "../src/game";
import type { Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma"];

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: HudCallbacks = {
    onNewGame: vi.fn(),
    onPlayCard: vi.fn(),
    onEndTurn: vi.fn(),
  };
  const hud = createHud(container, cb);
  return { container, cb, hud };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

describe("createHud", () => {
  it("shows only the menu at main-menu, and New game fires onNewGame", () => {
    const { container, cb, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    expect(q(container, ".hand").classList.contains("hidden")).toBe(true);
    expect(q(container, ".piles").classList.contains("hidden")).toBe(true);
    q(container, ".menu-new-game").click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });

  it("prompts for a faction during pick-faction, no End Turn button", () => {
    const { container, hud } = setup();
    hud.update(startGame(newGame(FACTIONS)));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(true);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-text").textContent).toBe("Choose your faction");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(true);
  });

  it("renders the human turn: status, piles, fanned hand, End Turn", () => {
    const { container, cb, hud } = setup();
    const g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - your turn");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(false);
    expect(q(container, ".pile-deck").textContent).toBe("Deck: 19");
    expect(q(container, ".pile-discard").textContent).toBe("Discard: 0");
    const cards = container.querySelectorAll(".card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toBe("Grow crops");
    (cards[0] as HTMLElement).click();
    expect(cb.onPlayCard).toHaveBeenCalledWith(0);
    q(container, ".end-turn").click();
    expect(cb.onEndTurn).toHaveBeenCalledOnce();
  });

  it("fans multiple cards with symmetric rotations", () => {
    const { container, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    for (let i = 0; i < FACTIONS.length * 2; i++) g = endTurn(g, seededRng(2));
    hud.update(g); // human has drawn 3 cards, played none
    const cards = [...container.querySelectorAll(".card")] as HTMLElement[];
    expect(cards).toHaveLength(3);
    expect(cards[0].style.transform).toContain("rotate(-5deg)");
    expect(cards[1].style.transform).toContain("rotate(0deg)");
    expect(cards[2].style.transform).toContain("rotate(5deg)");
  });

  it("disables held cards during AI turns and shows the waiting label", () => {
    const { container, cb, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    // human keeps their 1 card; endTurn hands control to player 2 (AI)
    g = endTurn(g, seededRng(3));
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Waiting on player 2...");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(true);
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards).toHaveLength(1);
    expect(cards[0].disabled).toBe(true);
    cards[0].click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("disables remaining cards after playing one this turn", () => {
    const { container, cb, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    // run one full round so the human holds 2 cards on their next turn
    for (let i = 0; i < FACTIONS.length; i++) g = endTurn(g, seededRng(4));
    g = playCard(g, 0); // 1 card left, playedThisTurn = true
    hud.update(g);
    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    card.click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hud.test.ts`
Expected: FAIL - cannot resolve `../src/hud`.

- [ ] **Step 3: Write the implementation**

Create `src/hud.ts`:

```ts
import { CARDS } from "./cards";
import { isHumanTurn, type GameState } from "./game";

export interface HudCallbacks {
  onNewGame(): void;
  onPlayCard(index: number): void;
  onEndTurn(): void;
}

export interface Hud {
  update(state: GameState): void;
}

const FAN_ANGLE_DEG = 5;
const FAN_DROP_PX = 6;

export function createHud(container: HTMLElement, cb: HudCallbacks): Hud {
  const menu = document.createElement("div");
  menu.className = "menu-overlay";
  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Baltic Lands";
  const newGameBtn = document.createElement("button");
  newGameBtn.className = "menu-new-game";
  newGameBtn.textContent = "New game";
  newGameBtn.addEventListener("click", () => cb.onNewGame());
  menu.append(title, newGameBtn);

  const status = document.createElement("div");
  status.className = "status-bar hidden";
  const statusText = document.createElement("span");
  statusText.className = "status-text";
  const endTurnBtn = document.createElement("button");
  endTurnBtn.className = "end-turn hidden";
  endTurnBtn.textContent = "End turn";
  endTurnBtn.addEventListener("click", () => cb.onEndTurn());
  status.append(statusText, endTurnBtn);

  const piles = document.createElement("div");
  piles.className = "piles hidden";
  const deckPile = document.createElement("div");
  deckPile.className = "pile pile-deck";
  const discardPile = document.createElement("div");
  discardPile.className = "pile pile-discard";
  piles.append(deckPile, discardPile);

  const hand = document.createElement("div");
  hand.className = "hand hidden";

  container.append(menu, status, piles, hand);

  function renderHand(state: GameState): void {
    hand.replaceChildren();
    const human = state.players[0];
    if (!human) return;
    const n = human.hand.length;
    const canPlay = isHumanTurn(state) && !state.playedThisTurn;
    human.hand.forEach((cardId, i) => {
      const card = document.createElement("button");
      card.className = "card";
      card.textContent = CARDS[cardId]?.name ?? cardId;
      const offset = i - (n - 1) / 2;
      card.style.transform =
        `rotate(${offset * FAN_ANGLE_DEG}deg) ` +
        `translateY(${Math.abs(offset) * FAN_DROP_PX}px)`;
      card.disabled = !canPlay;
      if (canPlay) card.addEventListener("click", () => cb.onPlayCard(i));
      hand.appendChild(card);
    });
  }

  return {
    update(state) {
      menu.classList.toggle("hidden", state.phase !== "main-menu");
      status.classList.toggle("hidden", state.phase === "main-menu");
      piles.classList.toggle("hidden", state.phase !== "playing");
      hand.classList.toggle("hidden", state.phase !== "playing");

      if (state.phase === "pick-faction") {
        statusText.textContent = "Choose your faction";
        endTurnBtn.classList.add("hidden");
      } else if (state.phase === "playing") {
        if (isHumanTurn(state)) {
          statusText.textContent = `Turn ${state.turn} - your turn`;
          endTurnBtn.classList.remove("hidden");
        } else {
          const player = state.players[state.current];
          statusText.textContent = `Waiting on player ${player.id}...`;
          endTurnBtn.classList.add("hidden");
        }
        const human = state.players[0];
        deckPile.textContent = `Deck: ${human.deck.length}`;
        discardPile.textContent = `Discard: ${human.discard.length}`;
        renderHand(state);
      }
    },
  };
}
```

Append to `src/style.css`:

```css
.menu-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: rgba(24, 32, 38, 0.55);
  z-index: 20;
}

.menu-title {
  font-size: 42px;
  letter-spacing: 0.12em;
  color: #fdfaf4;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.menu-new-game {
  font-size: 18px;
  padding: 10px 32px;
  border: 1px solid #7a6a55;
  border-radius: 6px;
  background: #fdfaf4;
  color: #3f3428;
  cursor: pointer;
}

.menu-new-game:hover {
  background: #f1e9da;
}

.status-bar {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 8px 16px;
  font-size: 14px;
  color: #3f3428;
  z-index: 6;
}

.end-turn {
  font-size: 13px;
  padding: 4px 14px;
  border: 1px solid #7a6a55;
  border-radius: 5px;
  background: #fdfaf4;
  color: #3f3428;
  cursor: pointer;
}

.end-turn:hover {
  background: #f1e9da;
}

.piles {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  gap: 8px;
  z-index: 6;
}

.pile {
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: #3f3428;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.hand {
  position: absolute;
  bottom: -30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  z-index: 6;
}

.card {
  width: 88px;
  height: 126px;
  margin: 0 -14px;
  border: 1px solid #7a6a55;
  border-radius: 8px;
  background: #fdfaf4;
  color: #3f3428;
  font-size: 13px;
  padding: 8px 4px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: translate 120ms ease;
}

.card:hover:not(:disabled) {
  translate: 0 -26px;
  z-index: 7;
}

.card:disabled {
  cursor: default;
  filter: saturate(0.6) brightness(0.96);
}
```

(The fan rotation comes from the JS inline `transform`; the hover lift uses the separate `translate` property so it does not fight the inline transform.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hud.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hud.ts src/style.css tests/hud.test.ts
git commit -m "feat(balticmap): HUD with main menu, hand fan, piles, status bar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Click intercept, region dimming, orchestration (`src/interaction.ts`, `src/main.ts`)

**Files:**
- Modify: `src/interaction.ts` (add optional `interceptClick` callback)
- Modify: `src/main.ts` (game state, HUD wiring, AI loop, dimming)
- Modify: `src/style.css` (append `.region.dimmed` rule)
- Test: `tests/interaction.test.ts` (add cases)

**Interfaces:**
- Consumes: everything produced by Tasks 1-3.
- Produces:
  - `InteractionCallbacks` gains optional `interceptClick?(regionId: string | null): boolean`. When present and it returns `true`, the click is consumed: no selection change, no `onSelect`.
  - `src/main.ts` exports nothing (entry point).

- [ ] **Step 1: Write the failing tests**

In `tests/interaction.test.ts`, extend `setup()` to accept an optional intercept and pass it through:

```ts
function setup(interceptClick?: (id: string | null) => boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { svg, regionPaths, settlementDots } = renderMap(data, container);
  const onHover = vi.fn();
  const onSelect = vi.fn();
  const onHoverSettlement = vi.fn();
  const handle = attachInteraction(svg, regionPaths, settlementDots, data, {
    onHover,
    onSelect,
    onHoverSettlement,
    interceptClick,
  });
  return { svg, regionPaths, settlementDots, onHover, onSelect, onHoverSettlement, handle };
}
```

Add to the `describe("attachInteraction")` block:

```ts
  it("interceptClick returning true consumes the click: no selection", () => {
    const intercept = vi.fn(() => true);
    const { regionPaths, onSelect } = setup(intercept);
    const el = regionPaths.get("kursa")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(intercept).toHaveBeenCalledWith("kursa");
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("interceptClick returning false lets selection proceed", () => {
    const intercept = vi.fn(() => false);
    const { regionPaths, onSelect } = setup(intercept);
    const el = regionPaths.get("kursa")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "kursa" }));
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/interaction.test.ts`
Expected: the first new test FAILS (selection still happens because `interceptClick` is ignored); existing tests PASS. (TypeScript will also flag the unknown callback property at build time.)

- [ ] **Step 3: Implement the intercept in `src/interaction.ts`**

Add the optional member to the interface:

```ts
export interface InteractionCallbacks {
  onHover(region: Region | null, clientX: number, clientY: number): void;
  onSelect(region: Region | null): void;
  onHoverSettlement(
    settlement: Settlement | null,
    clientX: number,
    clientY: number,
  ): void;
  /** Return true to consume the click (e.g. during faction picking):
   *  selection state is left untouched and onSelect does not fire. */
  interceptClick?(regionId: string | null): boolean;
}
```

In the `pointerup` handler, replace:

```ts
    const target = (e.target as Element).closest?.("[data-id]") ?? null;
    state = withClick(state, target?.getAttribute("data-id") ?? null);
    applySelection();
```

with:

```ts
    const target = (e.target as Element).closest?.("[data-id]") ?? null;
    const id = target?.getAttribute("data-id") ?? null;
    if (cb.interceptClick?.(id)) return;
    state = withClick(state, id);
    applySelection();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/interaction.test.ts`
Expected: PASS (existing 7 + 2 new).

- [ ] **Step 5: Wire the game into `src/main.ts` and add the dimmed style**

Replace the whole of `src/main.ts` with:

```ts
import rawData from "./data/map.json";
import type { MapData } from "./types";
import { renderMap } from "./map-render";
import { createPanel, createTooltip, tooltipText, settlementTooltipText } from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, pickFaction, playCard, endTurn, aiTurn, isHumanTurn,
  type GameState,
} from "./game";
import { createHud } from "./hud";
import "./style.css";

const AI_TURN_MS = 300;

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths, settlementDots } = renderMap(data, app);
const tooltip = createTooltip(app);
const factionById = new Map(data.factions.map((f) => [f.id, f]));
const regionById = new Map(data.regions.map((r) => [r.id, r]));
const panel = createPanel(app, () => interaction.deselect(), data.peoples, data.factions, data.settlements);

const rng = Math.random;
let game: GameState = newGame(data.factions.map((f) => f.id));

function applyOwnership(): void {
  const human = game.players[0];
  for (const [id, el] of regionPaths) {
    const owned = human !== undefined && regionById.get(id)!.faction === human.factionId;
    el.classList.toggle("dimmed", game.phase === "playing" && !owned);
  }
}

function runAiTurns(): void {
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    game = endTurn(aiTurn(game), rng);
    hud.update(game);
    runAiTurns();
  }, AI_TURN_MS);
}

const hud = createHud(app, {
  onNewGame() {
    game = startGame(game);
    hud.update(game);
  },
  onPlayCard(index) {
    if (!isHumanTurn(game)) return;
    game = playCard(game, index);
    hud.update(game);
  },
  onEndTurn() {
    if (!isHumanTurn(game)) return;
    game = endTurn(game, rng);
    hud.update(game);
    runAiTurns();
  },
});
hud.update(game);

const interaction = attachInteraction(svg, regionPaths, settlementDots, data, {
  onHover(region, clientX, clientY) {
    if (region) {
      tooltip.show(
        tooltipText(region, factionById.get(region.faction)!),
        clientX,
        clientY,
      );
    } else tooltip.hide();
  },
  onHoverSettlement(settlement, clientX, clientY) {
    if (settlement) {
      tooltip.show(settlementTooltipText(settlement), clientX, clientY);
    } else tooltip.hide();
  },
  onSelect(region) {
    if (region) panel.show(region);
    else panel.hide();
  },
  interceptClick(regionId) {
    if (game.phase !== "pick-faction") return false;
    if (regionId === null) return true;
    game = pickFaction(game, regionById.get(regionId)!.faction, rng);
    applyOwnership();
    hud.update(game);
    return true;
  },
});
```

Append to `src/style.css`:

```css
.region.dimmed {
  opacity: 0.45;
}
```

- [ ] **Step 6: Run the full test suite and the production build**

Run: `npx vitest run`
Expected: all test files PASS.

Run: `npm run build`
Expected: `tsc` emits no errors; vite build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/interaction.ts src/main.ts src/style.css tests/interaction.test.ts
git commit -m "feat(balticmap): wire gameplay loop - pick faction, AI turns, dimming

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: E2E verification in Chrome (orchestrator, not a subagent)

**Files:** none (verification only; fix regressions if found).

- [ ] **Step 1:** Start the dev server: `npm run dev` (background), note the URL (default `http://127.0.0.1:5173`).
- [ ] **Step 2:** In Chrome: load the page. Verify the main menu overlay with title and "New game" button; map dimly visible behind it.
- [ ] **Step 3:** Click "New game". Verify the banner says "Choose your faction" and no info panel opens when clicking a region.
- [ ] **Step 4:** Click a region. Verify: all other regions dim; status shows "Turn 1 - your turn"; hand shows 1 "Grow crops" card; piles show "Deck: 19" / "Discard: 0".
- [ ] **Step 5:** Click the card. Verify it moves to discard ("Discard: 1", hand empties). Click "End turn". Verify "Waiting on player N..." labels cycle through players 2..20 over roughly 6 seconds, then "Turn 2 - your turn" appears and the hand has a newly drawn card.
- [ ] **Step 6:** Verify normal map interaction still works during play: hover tooltip, click opens the panel, pan and zoom.
- [ ] **Step 7:** Check the browser console for errors (none expected).
- [ ] **Step 8:** Optional long-run check via console: none needed beyond unit tests; visually confirm a few more turns run smoothly.
