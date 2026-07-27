# Balticmap Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roguelite meta-progression: the player starts knowing only Grow Crops, unlocks one seen card per game at a deck screen, builds a 10-card deck from known cards, and progress persists in localStorage.

**Architecture:** A new pure module `src/meta.ts` owns the persistent record (known cards + seen pool) behind an injectable storage adapter. `game.ts` gains a `deck-building` phase and a stored human deck. A new DOM module `src/deck-screen.ts` renders the unlock-and-build screen. The HUD's post-mortem loot row upgrades to unlockable-cards-with-NEW-tags via a callback, and the main menu gains a Reset progress control. `main.ts` wires meta load/merge/save around the run lifecycle.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom for DOM tests), localStorage.

**Spec:** `docs/superpowers/specs/2026-07-26-balticmap-learning-loop-design.md` - read it before starting any task. Builds on the merged rules-v2 (`GameState.seenThisRun` and the post-mortem `.pm-seen` row already exist).

## Global Constraints

- ASCII-only user-visible strings (no em dashes - use "-"; no unicode arrows/ellipsis).
- localStorage key exactly `balticmap-meta-v1`; record shape `{ "knownCards": ["grow-crops"], "seenPool": [] }`; corrupt/missing data falls back silently to the initial value; unknown/non-deck-buildable card ids are pruned at load.
- ONE unlock per game; unlocking persists immediately; the pool is cumulative across runs.
- Human deck = selected known non-basics (max 1 each) + Grow Crops filler to exactly `DECK_SIZE` (10). AI decks stay the full default `buildDeck()`.
- Phase flow: `main-menu -> deck-building -> pick-faction -> playing -> victory | defeat`.
- Merging `seenThisRun` into the pool happens when a run ends (victory, defeat, or starting a new game mid-run) - never double-merged.
- Pure functions over immutable state; rejected transitions return the SAME state reference.
- Test commands: `npx vitest run tests/<file>.test.ts`, full `npm test`, types `npm run build`.
- Commit after every task, message ending with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: meta module

**Files:**
- Create: `src/meta.ts`
- Test: `tests/meta.test.ts`

**Interfaces:**
- Consumes: `CARDS`, `DECK_SIZE` from `./cards`.
- Produces:
  - `interface MetaRecord { knownCards: string[]; seenPool: string[] }`
  - `const META_STORAGE_KEY = "balticmap-meta-v1"`
  - `interface MetaStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }`
  - `memoryStorage(): MetaStorage` (in-memory fallback)
  - `initialMeta(): MetaRecord` (fresh copy: knownCards `["grow-crops"]`, empty pool)
  - `loadMeta(storage: MetaStorage): MetaRecord` / `saveMeta(storage: MetaStorage, meta: MetaRecord): void` / `resetMeta(storage: MetaStorage): MetaRecord`
  - `unlockCard(meta: MetaRecord, cardId: string): MetaRecord` (pool -> known; same reference if not in pool)
  - `mergeSeen(meta: MetaRecord, seen: string[]): MetaRecord` (adds deck-buildable non-basics not already known/pooled; same reference if nothing new)
  - `buildPlayerDeck(knownCards: string[], selectedIds: string[]): string[]` (known deck-buildable non-basics only, deduped, capped at DECK_SIZE, grow-crops filler to exactly DECK_SIZE)

- [ ] **Step 1: Write the failing tests**

Create `tests/meta.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  META_STORAGE_KEY, buildPlayerDeck, initialMeta, loadMeta, memoryStorage,
  mergeSeen, resetMeta, saveMeta, unlockCard,
} from "../src/meta";
import { DECK_SIZE } from "../src/cards";

describe("storage round-trip", () => {
  it("loads the initial record when storage is empty", () => {
    expect(loadMeta(memoryStorage())).toEqual({
      knownCards: ["grow-crops"], seenPool: [],
    });
  });

  it("save/load round-trips under the exact key", () => {
    const s = memoryStorage();
    saveMeta(s, { knownCards: ["grow-crops", "raid"], seenPool: ["fortify"] });
    expect(s.getItem(META_STORAGE_KEY)).not.toBeNull();
    expect(loadMeta(s)).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    });
  });

  it("falls back silently on corrupt data", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, "{not json");
    expect(loadMeta(s)).toEqual(initialMeta());
    s.setItem(META_STORAGE_KEY, JSON.stringify({ knownCards: "nope" }));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("prunes unknown and non-deck-buildable ids, keeps grow-crops known", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify({
      knownCards: ["raid", "gone-card", "pay-tribute"],
      seenPool: ["fortify", "raid", "also-gone"],
    }));
    // raid stays known; pool drops already-known raid and unknown ids
    expect(loadMeta(s)).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    });
  });

  it("resetMeta wipes storage and returns the initial record", () => {
    const s = memoryStorage();
    saveMeta(s, { knownCards: ["grow-crops", "raid"], seenPool: [] });
    expect(resetMeta(s)).toEqual(initialMeta());
    expect(s.getItem(META_STORAGE_KEY)).toBeNull();
  });
});

describe("unlockCard", () => {
  it("moves a pooled card to known", () => {
    const m = { knownCards: ["grow-crops"], seenPool: ["raid", "fortify"] };
    expect(unlockCard(m, "raid")).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    });
  });

  it("returns the same reference when the card is not in the pool", () => {
    const m = { knownCards: ["grow-crops"], seenPool: [] };
    expect(unlockCard(m, "raid")).toBe(m);
  });
});

describe("mergeSeen", () => {
  it("adds unlockable candidates, skipping known/pooled/non-buildable", () => {
    const m = { knownCards: ["grow-crops", "raid"], seenPool: ["fortify"] };
    const out = mergeSeen(m, ["raid", "fortify", "subjugate", "pay-tribute", "grow-crops", "nope"]);
    expect(out).toEqual({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify", "subjugate"],
    });
  });

  it("returns the same reference when nothing is new", () => {
    const m = { knownCards: ["grow-crops"], seenPool: ["raid"] };
    expect(mergeSeen(m, ["raid", "grow-crops"])).toBe(m);
  });
});

describe("buildPlayerDeck", () => {
  it("fills with grow-crops to exactly DECK_SIZE", () => {
    const deck = buildPlayerDeck(["grow-crops", "raid"], ["raid"]);
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.filter((c) => c === "raid")).toHaveLength(1);
    expect(deck.filter((c) => c === "grow-crops")).toHaveLength(DECK_SIZE - 1);
  });

  it("enforces known-only, max 1 each, and drops basics from the selection", () => {
    const deck = buildPlayerDeck(
      ["grow-crops", "raid"],
      ["raid", "raid", "subjugate", "grow-crops", "pay-tribute"],
    );
    expect(deck.filter((c) => c === "raid")).toHaveLength(1);
    expect(deck.filter((c) => c === "subjugate")).toHaveLength(0);
    expect(deck.filter((c) => c === "pay-tribute")).toHaveLength(0);
    expect(deck).toHaveLength(DECK_SIZE);
  });

  it("empty selection yields an all-grow-crops deck", () => {
    expect(buildPlayerDeck(["grow-crops"], [])).toEqual(
      Array.from({ length: DECK_SIZE }, () => "grow-crops"),
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/meta.test.ts`
Expected: FAIL - cannot resolve `../src/meta`.

- [ ] **Step 3: Implement `src/meta.ts`**

```ts
import { CARDS, DECK_SIZE } from "./cards";

/** Persistent roguelite progress: cards the player may deck-build, and
 *  cards seen in past runs but not yet unlocked. */
export interface MetaRecord {
  knownCards: string[];
  seenPool: string[];
}

export const META_STORAGE_KEY = "balticmap-meta-v1";

export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory stand-in when localStorage is unavailable (private mode, tests). */
export function memoryStorage(): MetaStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function initialMeta(): MetaRecord {
  return { knownCards: ["grow-crops"], seenPool: [] };
}

/** A card id the meta system tracks: exists and may appear in decks. */
const isTrackable = (id: unknown): id is string =>
  typeof id === "string" && CARDS[id]?.deckBuildable === true;

const dedupe = (ids: string[]): string[] => [...new Set(ids)];

export function loadMeta(storage: MetaStorage): MetaRecord {
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    if (raw === null) return initialMeta();
    const parsed: unknown = JSON.parse(raw);
    const rec = parsed as { knownCards?: unknown; seenPool?: unknown };
    if (!Array.isArray(rec.knownCards) || !Array.isArray(rec.seenPool)) {
      return initialMeta();
    }
    const knownCards = dedupe([
      "grow-crops",
      ...rec.knownCards.filter(isTrackable),
    ]);
    const seenPool = dedupe(
      rec.seenPool.filter(
        (id): id is string => isTrackable(id) && !knownCards.includes(id),
      ),
    );
    return { knownCards, seenPool };
  } catch {
    return initialMeta();
  }
}

export function saveMeta(storage: MetaStorage, meta: MetaRecord): void {
  try {
    storage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // storage full or unavailable: progress persists in memory only
  }
}

export function resetMeta(storage: MetaStorage): MetaRecord {
  try {
    storage.removeItem(META_STORAGE_KEY);
  } catch {
    // ignore
  }
  return initialMeta();
}

/** Permanently learns a card from the seen pool. */
export function unlockCard(meta: MetaRecord, cardId: string): MetaRecord {
  if (!meta.seenPool.includes(cardId)) return meta;
  return {
    knownCards: [...meta.knownCards, cardId],
    seenPool: meta.seenPool.filter((id) => id !== cardId),
  };
}

/** Banks a run's seen cards as unlock candidates. */
export function mergeSeen(meta: MetaRecord, seen: string[]): MetaRecord {
  const fresh = dedupe(seen).filter(
    (id) =>
      isTrackable(id) &&
      CARDS[id].maxPerDeck !== null && // non-basics only
      !meta.knownCards.includes(id) &&
      !meta.seenPool.includes(id),
  );
  if (fresh.length === 0) return meta;
  return { ...meta, seenPool: [...meta.seenPool, ...fresh] };
}

/** The human deck: selected known non-basics (max 1 each) plus Grow Crops
 *  filler to exactly DECK_SIZE. Invalid selections are dropped, not thrown. */
export function buildPlayerDeck(
  knownCards: string[],
  selectedIds: string[],
): string[] {
  const picks = dedupe(selectedIds)
    .filter(
      (id) =>
        isTrackable(id) &&
        CARDS[id].maxPerDeck !== null &&
        knownCards.includes(id),
    )
    .slice(0, DECK_SIZE);
  return [
    ...picks,
    ...Array.from({ length: DECK_SIZE - picks.length }, () => "grow-crops"),
  ];
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/meta.test.ts` then `npm test && npm run build` - expected: PASS.

```bash
git add src/meta.ts tests/meta.test.ts
git commit -m "feat(balticmap): meta module - persistent known cards and seen pool

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: deck-building phase and human deck

**Files:**
- Modify: `src/game.ts`
- Test: `tests/game.test.ts` (additions + helper patch)
- Modify: `tests/hud.test.ts`, `tests/ai.test.ts` (helper patch only)
- Modify: `src/hud.ts` (one status-bar visibility line)
- Modify: `src/main.ts` (one transition line, keeps compiling; full wiring is Task 5)

**Interfaces:**
- Consumes: nothing from Task 1 (engine stays meta-agnostic).
- Produces:
  - `GamePhase` gains `"deck-building"` between `main-menu` and `pick-faction`; `startGame` now goes `main-menu -> deck-building`.
  - `chooseDeck(state: GameState, deckCards: string[]): GameState` - `deck-building -> pick-faction`, stores `humanDeck`; rejects (same reference) outside the phase or when `deckCards.length !== DECK_SIZE`.
  - `GameState.humanDeck: string[]` (initialized to `buildDeck()` in `newGame`).
  - `pickFaction` deals player 1 from `shuffle(state.humanDeck, rng)`; AI players keep `buildDeck()`.

- [ ] **Step 1: Write the failing tests**

In `tests/game.test.ts`:

1. Patch the helper (single source of the phase flow) and imports - add `chooseDeck` to the `../src/game` import and `buildDeck` to the `../src/cards` import:

```ts
function playingState(adj?: Record<string, string[]>): GameState {
  return pickFaction(
    chooseDeck(startGame(newGame(FACTIONS, adj)), buildDeck()),
    "beta",
    seededRng(1),
  );
}
```

2. Append a new describe block:

```ts
describe("deck building", () => {
  it("startGame enters deck-building; chooseDeck moves to pick-faction", () => {
    const g = startGame(newGame(FACTIONS));
    expect(g.phase).toBe("deck-building");
    const picked = chooseDeck(g, buildDeck());
    expect(picked.phase).toBe("pick-faction");
    expect(picked.humanDeck).toEqual(buildDeck());
  });

  it("chooseDeck rejects wrong phases and wrong deck sizes", () => {
    const menu = newGame(FACTIONS);
    expect(chooseDeck(menu, buildDeck())).toBe(menu);
    const g = startGame(menu);
    expect(chooseDeck(g, ["grow-crops"])).toBe(g);
  });

  it("the human is dealt from humanDeck, AIs from the default deck", () => {
    const custom = Array.from({ length: 10 }, () => "grow-crops");
    let g = chooseDeck(startGame(newGame(FACTIONS)), custom);
    g = pickFaction(g, "beta", seededRng(1));
    const human = g.players[0];
    expect(
      [...human.deck, ...human.hand, ...human.discard].every(
        (c) => c === "grow-crops",
      ),
    ).toBe(true);
    const ai = g.players[1];
    expect(
      [...ai.deck, ...ai.hand].filter((c) => c === "raid"),
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts`
Expected: FAIL - `chooseDeck` not exported; helper breaks.

- [ ] **Step 3: Implement in `src/game.ts`**

1. Phase union (`src/game.ts:23-24`):

```ts
export type GamePhase =
  | "main-menu" | "deck-building" | "pick-faction" | "playing"
  | "victory" | "defeat";
```

2. `GameState` gains `humanDeck: string[];` (add after `adjacency`); `newGame` initializes `humanDeck: buildDeck(),`.
3. `startGame` returns `{ ...state, phase: "deck-building" }`.
4. New transition after `startGame`:

```ts
/** Locks in the human deck and proceeds to faction picking. */
export function chooseDeck(state: GameState, deckCards: string[]): GameState {
  if (state.phase !== "deck-building") return state;
  if (deckCards.length !== DECK_SIZE) return state;
  return { ...state, phase: "pick-faction", humanDeck: [...deckCards] };
}
```

(Import `DECK_SIZE` from `./cards`.)
5. `makePlayer` gains a deck parameter; `pickFaction` uses it for the human:

```ts
function makePlayer(
  id: number,
  factionId: string,
  rng: Rng,
  deckCards: string[] = buildDeck(),
): PlayerState {
  const deck = shuffle(deckCards, rng);
  // opening hand: dealt silently (no log events)
  return {
    id,
    factionId,
    hand: deck.slice(0, OPENING_HAND),
    deck: deck.slice(OPENING_HAND),
    discard: [],
  };
}
```

and in `pickFaction`: `makePlayer(1, factionId, rng, state.humanDeck),`.

- [ ] **Step 4: Fallout patches**

Run `npm test && npm run build`; fix exactly these:

1. `tests/hud.test.ts` and `tests/ai.test.ts`: their `playing()` / `base()` helpers wrap `pickFaction(startGame(newGame(...)), ...)` - insert `chooseDeck(..., buildDeck())` the same way as Step 1's helper (add the needed imports). No other test edits.
2. `src/hud.ts`: the status bar must stay hidden during deck building. The current line reads
   `status.classList.toggle("hidden", state.phase === "main-menu" || ended);`
   change to
   `status.classList.toggle("hidden", state.phase === "main-menu" || state.phase === "deck-building" || ended);`
3. `src/main.ts`: `onNewGame` currently lands on `deck-building` with no way forward (Task 5 adds the screen). Keep the game playable in the interim by choosing the default deck inline - change
   `game = startGame(newGame(data.factions.map((f) => f.id), factionAdjacency));`
   to
   `game = chooseDeck(startGame(newGame(data.factions.map((f) => f.id), factionAdjacency)), buildDeck());`
   (add `chooseDeck` to the game import and `buildDeck` to the cards import). Mark it with `// TEMP until the deck screen lands (learning-loop Task 5)`.

- [ ] **Step 5: Run everything, commit**

Run: `npm test && npm run build` - expected: PASS.

```bash
git add src/game.ts src/hud.ts src/main.ts tests/game.test.ts tests/hud.test.ts tests/ai.test.ts
git commit -m "feat(balticmap): deck-building phase and stored human deck

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: deck screen

**Files:**
- Create: `src/deck-screen.ts`
- Modify: `src/style.css`
- Test: `tests/deck-screen.test.ts`

**Interfaces:**
- Consumes: `CARDS`, `DECK_SIZE` from `./cards` (names, non-basic detection).
- Produces:
  - `interface DeckScreenView { visible: boolean; knownCards: string[]; seenPool: string[]; unlockUsed: boolean }`
  - `interface DeckScreenCallbacks { onUnlock(cardId: string): void; onStart(selectedIds: string[]): void }`
  - `createDeckScreen(container: HTMLElement, cb: DeckScreenCallbacks): { update(view: DeckScreenView): void }`
  - Behavior: unlock row (`.ds-unlock`) visible only when `seenPool` nonempty AND `!unlockUsed`; clicking a pool card fires `onUnlock` once. Deck row (`.ds-deck`) shows known non-basics as toggles (`.ds-card`, `.selected` when in), all pre-selected by default, newly appearing known cards auto-selected; a non-clickable Grow Crops filler card shows `Grow crops xN`. Counter `.ds-counter`: `"N picked + M Grow Crops = 10"`. `.ds-start` button ("Choose your lands") fires `onStart` with the selected ids.

- [ ] **Step 1: Write the failing tests**

Create `tests/deck-screen.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = { onUnlock: vi.fn(), onStart: vi.fn() };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

describe("createDeckScreen", () => {
  it("is hidden until shown, and first-run shows only filler + start", () => {
    const { container, cb, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update({
      visible: true, knownCards: ["grow-crops"], seenPool: [], unlockUsed: false,
    });
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-unlock-section").classList.contains("hidden")).toBe(true);
    expect(container.querySelectorAll(".ds-deck .ds-card")).toHaveLength(1); // filler only
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow Crops = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith([]);
  });

  it("unlock row lists the pool and collapses after one unlock", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops"],
      seenPool: ["raid", "fortify"], unlockUsed: false,
    });
    const locked = [...container.querySelectorAll(".ds-unlock .ds-card")];
    expect(locked.map((c) => c.textContent)).toEqual(["Raid", "Fortify"]);
    (locked[0] as HTMLElement).click();
    expect(cb.onUnlock).toHaveBeenCalledWith("raid");
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid"],
      seenPool: ["fortify"], unlockUsed: true,
    });
    expect(q(container, ".ds-unlock-section").classList.contains("hidden")).toBe(true);
  });

  it("known non-basics toggle, are pre-selected, and feed onStart", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], unlockUsed: false,
    });
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")].filter(
      (c) => !c.classList.contains("ds-filler"),
    ) as HTMLElement[];
    expect(toggles.map((c) => c.textContent)).toEqual(["Raid", "Fortify"]);
    expect(toggles.every((c) => c.classList.contains("selected"))).toBe(true);
    expect(q(container, ".ds-counter").textContent).toBe(
      "2 picked + 8 Grow Crops = 10",
    );
    toggles[1].click(); // deselect fortify
    expect(toggles[1].classList.contains("selected")).toBe(false);
    expect(q(container, ".ds-counter").textContent).toBe(
      "1 picked + 9 Grow Crops = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid"]);
  });

  it("a newly unlocked card arrives pre-selected without resetting other toggles", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid"],
      seenPool: ["fortify"], unlockUsed: false,
    });
    const raid = [...container.querySelectorAll(".ds-deck .ds-card")].find(
      (c) => c.textContent === "Raid",
    ) as HTMLElement;
    raid.click(); // deselect raid
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], unlockUsed: true,
    });
    const cards = [...container.querySelectorAll(".ds-deck .ds-card")];
    const byText = (t: string) =>
      cards.find((c) => c.textContent === t) as HTMLElement;
    expect(byText("Raid").classList.contains("selected")).toBe(false);
    expect(byText("Fortify").classList.contains("selected")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/deck-screen.test.ts`
Expected: FAIL - cannot resolve `../src/deck-screen`.

- [ ] **Step 3: Implement `src/deck-screen.ts`**

```ts
import { CARDS, DECK_SIZE } from "./cards";

export interface DeckScreenView {
  visible: boolean;
  knownCards: string[];
  seenPool: string[];
  /** One unlock per game: hides the unlock row once spent. */
  unlockUsed: boolean;
}

export interface DeckScreenCallbacks {
  onUnlock(cardId: string): void;
  onStart(selectedIds: string[]): void;
}

export interface DeckScreen {
  update(view: DeckScreenView): void;
}

const cardName = (id: string): string => CARDS[id]?.name ?? id;

const nonBasics = (ids: string[]): string[] =>
  ids.filter((id) => CARDS[id]?.maxPerDeck !== null);

export function createDeckScreen(
  container: HTMLElement,
  cb: DeckScreenCallbacks,
): DeckScreen {
  const root = document.createElement("div");
  root.className = "deck-screen hidden";

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Prepare your deck";

  const unlockSection = document.createElement("div");
  unlockSection.className = "ds-unlock-section";
  const unlockLabel = document.createElement("p");
  unlockLabel.className = "ds-label";
  unlockLabel.textContent = "Learned from your defeats - unlock one:";
  const unlockRow = document.createElement("div");
  unlockRow.className = "ds-unlock";
  unlockSection.append(unlockLabel, unlockRow);

  const deckLabel = document.createElement("p");
  deckLabel.className = "ds-label";
  deckLabel.textContent = "Your deck (click to include, max 1 each):";
  const deckRow = document.createElement("div");
  deckRow.className = "ds-deck";
  const counter = document.createElement("p");
  counter.className = "ds-counter";

  const start = document.createElement("button");
  start.className = "menu-new-game ds-start";
  start.textContent = "Choose your lands";

  root.append(title, unlockSection, deckLabel, deckRow, counter, start);
  container.appendChild(root);

  /** Toggle state survives update() calls; pruned to known cards each render. */
  let selected = new Set<string>();
  let everKnown = new Set<string>();

  start.addEventListener("click", () => cb.onStart([...selected]));

  function renderCounter(pickCount: number): void {
    counter.textContent =
      `${pickCount} picked + ${DECK_SIZE - pickCount} Grow Crops = ${DECK_SIZE}`;
  }

  return {
    update(view) {
      root.classList.toggle("hidden", !view.visible);
      if (!view.visible) return;

      const known = nonBasics(view.knownCards);
      // newly known cards arrive pre-selected; stale selections are pruned
      for (const id of known) {
        if (!everKnown.has(id)) {
          everKnown.add(id);
          selected.add(id);
        }
      }
      selected = new Set(known.filter((id) => selected.has(id)));

      unlockSection.classList.toggle(
        "hidden", view.seenPool.length === 0 || view.unlockUsed,
      );
      unlockRow.replaceChildren(
        ...view.seenPool.map((id) => {
          const card = document.createElement("button");
          card.className = "ds-card ds-locked";
          card.textContent = cardName(id);
          card.addEventListener("click", () => cb.onUnlock(id));
          return card;
        }),
      );

      const filler = document.createElement("div");
      filler.className = "ds-card ds-filler";
      deckRow.replaceChildren(
        ...known.map((id) => {
          const card = document.createElement("button");
          card.className = "ds-card";
          card.classList.toggle("selected", selected.has(id));
          card.textContent = cardName(id);
          card.addEventListener("click", () => {
            if (selected.has(id)) selected.delete(id);
            else if (selected.size < DECK_SIZE) selected.add(id);
            card.classList.toggle("selected", selected.has(id));
            renderCounter(selected.size);
            filler.textContent = `Grow crops x${DECK_SIZE - selected.size}`;
          });
          return card;
        }),
        filler,
      );
      filler.textContent = `Grow crops x${DECK_SIZE - selected.size}`;
      renderCounter(selected.size);
    },
  };
}
```

- [ ] **Step 4: CSS**

Add to `src/style.css`, after the `.pm-log` block (matching the post-mortem's dark-overlay style):

```css
.deck-screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(24, 32, 38, 0.88);
  z-index: 20;
}

.ds-label {
  font-size: 11px;
  color: #b8b0a2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ds-unlock,
.ds-deck {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 640px;
}

.ds-card {
  width: 84px;
  height: 118px;
  border: 1px solid #7a6a55;
  border-radius: 8px;
  background: #fdfaf4;
  color: #3f3428;
  font-size: 12px;
  padding: 6px;
  cursor: pointer;
  opacity: 0.6;
}

.ds-card.selected {
  opacity: 1;
  outline: 2px solid #7cb06a;
  outline-offset: -2px;
}

.ds-card.ds-locked {
  background: #3a4148;
  color: #d8cfc0;
  border-style: dashed;
  border-color: #d4af37;
  opacity: 1;
}

.ds-card.ds-filler {
  background: #f1e9da;
  cursor: default;
  opacity: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.ds-counter {
  font-size: 13px;
  color: #fdfaf4;
}
```

- [ ] **Step 5: Run tests, commit**

Run: `npx vitest run tests/deck-screen.test.ts` then `npm test && npm run build` - expected: PASS.

```bash
git add src/deck-screen.ts src/style.css tests/deck-screen.test.ts
git commit -m "feat(balticmap): deck screen - unlock row and deck toggles

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: HUD - loot row upgrade and Reset progress

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (callback-driven).
- Produces:
  - `HudCallbacks` gains `lootInfo?(): { id: string; isNew: boolean }[]` and `onResetProgress?(): void`.
  - Post-mortem loot row: when `cb.lootInfo` is provided, `.pm-seen` renders from it (instead of raw `state.seenThisRun`); cards with `isNew` get a `.pm-card-new` corner tag reading `NEW`; the caption `.pm-seen-label` reads `"Unlock one of these when you start your next game."`; row and caption hidden when the list is empty. Without the callback, behavior stays exactly as today (fallback).
  - Main menu: when `cb.onResetProgress` is provided, a `.menu-reset` button ("Reset progress") renders under New game; first click arms it (text "Really reset?", class `confirm`); second click fires the callback and disarms; clicking New game disarms it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hud.test.ts` (extend `setup()`'s options object to also accept `lootInfo` and `onResetProgress` and merge them into `cb` like `canPlayCard`):

```ts
describe("learning loop hud", () => {
  function playing() {
    return pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()),
      "beta", seededRng(1),
    );
  }

  function defeated() {
    let g = playing();
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 2, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    return { ...g, seenThisRun: ["raid", "subjugate"] };
  }

  it("renders loot from lootInfo with NEW tags and the unlock caption", () => {
    const { container, hud } = setup({
      lootInfo: () => [
        { id: "raid", isNew: true },
        { id: "subjugate", isNew: false },
      ],
    });
    hud.update(defeated());
    const cards = [...container.querySelectorAll(".pm-card")];
    expect(cards.map((c) => c.textContent)).toEqual(["RaidNEW", "Subjugate"]);
    expect(cards[0].querySelector(".pm-card-new")?.textContent).toBe("NEW");
    expect(q(container, ".pm-seen-label").textContent).toBe(
      "Unlock one of these when you start your next game.",
    );
  });

  it("hides the loot row when lootInfo returns nothing", () => {
    const { container, hud } = setup({ lootInfo: () => [] });
    hud.update(defeated());
    expect(q(container, ".pm-seen-label").classList.contains("hidden")).toBe(true);
    expect(container.querySelectorAll(".pm-card")).toHaveLength(0);
  });

  it("reset progress arms on first click and fires on second", () => {
    const onResetProgress = vi.fn();
    const { container, hud } = setup({ onResetProgress });
    hud.update(newGame(FACTIONS));
    const reset = q(container, ".menu-reset");
    expect(reset.textContent).toBe("Reset progress");
    reset.click();
    expect(onResetProgress).not.toHaveBeenCalled();
    expect(reset.textContent).toBe("Really reset?");
    expect(reset.classList.contains("confirm")).toBe(true);
    reset.click();
    expect(onResetProgress).toHaveBeenCalledOnce();
    expect(reset.textContent).toBe("Reset progress");
  });

  it("omits the reset control without the callback", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(container.querySelector(".menu-reset")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hud.test.ts`
Expected: new tests FAIL.

- [ ] **Step 3: Implement in `src/hud.ts`**

1. `HudCallbacks` additions:

```ts
  /** Post-mortem loot row: unlockable cards seen this run. */
  lootInfo?(): { id: string; isNew: boolean }[];
  /** Renders the main-menu Reset progress control when provided. */
  onResetProgress?(): void;
```

2. Menu reset control, created right after `newGameBtn` and appended into `menu` only when the callback exists:

```ts
  if (cb.onResetProgress) {
    const reset = document.createElement("button");
    reset.className = "menu-reset";
    reset.textContent = "Reset progress";
    let armedReset = false;
    const disarmReset = () => {
      armedReset = false;
      reset.textContent = "Reset progress";
      reset.classList.remove("confirm");
    };
    reset.addEventListener("click", () => {
      if (!armedReset) {
        armedReset = true;
        reset.textContent = "Really reset?";
        reset.classList.add("confirm");
        return;
      }
      disarmReset();
      cb.onResetProgress!();
    });
    newGameBtn.addEventListener("click", disarmReset);
    menu.appendChild(reset);
  }
```

3. Loot row in `renderPostmortem` - replace the current `pmSeen.replaceChildren(...)` + `pmSeenLabel` toggle block with:

```ts
    const loot =
      cb.lootInfo?.() ??
      state.seenThisRun.map((id) => ({ id, isNew: false }));
    pmSeenLabel.textContent = cb.lootInfo
      ? "Unlock one of these when you start your next game."
      : "Cards seen this run:";
    pmSeen.replaceChildren(
      ...loot.map(({ id, isNew }) => {
        const d = document.createElement("div");
        d.className = "pm-card";
        d.textContent = cardName(id);
        if (isNew) {
          const tag = document.createElement("span");
          tag.className = "pm-card-new";
          tag.textContent = "NEW";
          d.appendChild(tag);
        }
        return d;
      }),
    );
    pmSeenLabel.classList.toggle("hidden", loot.length === 0);
```

4. CSS additions (next to `.pm-card`):

```css
.pm-card {
  position: relative;
}

.pm-card-new {
  position: absolute;
  top: -7px;
  right: -7px;
  background: #d4af37;
  color: #2b3238;
  font-size: 9px;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 4px;
}

.menu-reset {
  font-size: 12px;
  padding: 4px 14px;
  border: 1px solid #7a6a55;
  border-radius: 5px;
  background: transparent;
  color: #d8cfc0;
  cursor: pointer;
}

.menu-reset.confirm {
  background: #7a2f2f;
  color: #fdfaf4;
  border-color: #7a2f2f;
}
```

(Note: `.pm-card` already exists - add `position: relative;` to the existing rule rather than duplicating the selector.)

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run tests/hud.test.ts` then `npm test && npm run build` - expected: PASS.

```bash
git add src/hud.ts src/style.css tests/hud.test.ts
git commit -m "feat(balticmap): post-mortem loot row with NEW tags, reset progress control

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: main.ts wiring

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: the complete loop. No new exports.

- [ ] **Step 1: Wire meta + deck screen into `src/main.ts`**

1. Imports: add

```ts
import { createDeckScreen } from "./deck-screen";
import {
  buildPlayerDeck, initialMeta, loadMeta, memoryStorage, mergeSeen,
  resetMeta, saveMeta, unlockCard, type MetaRecord, type MetaStorage,
} from "./meta";
```

   and add `chooseDeck` to the `./game` import (Task 2 already did) - `buildDeck` stays imported for the AI default.
2. Meta boot, directly after the `rng` declaration:

```ts
const storage: MetaStorage = (() => {
  try {
    const probe = "balticmap-meta-probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
})();
const storageIsPersistent = storage === window.localStorage;
let meta: MetaRecord = loadMeta(storage);
let unlockUsedThisGame = false;
let seenMerged = false;
let poolAtRunStart: string[] = meta.seenPool;
```

3. Run-end banking helper (place near `refresh`):

```ts
/** Banks this run's seen cards into the persistent pool, once per run. */
function bankSeen(): void {
  if (seenMerged || game.players.length === 0) return;
  seenMerged = true;
  const next = mergeSeen(meta, game.seenThisRun);
  if (next !== meta) {
    meta = next;
    saveMeta(storage, meta);
  }
}
```

   Call `bankSeen()` when a run ends: in `afterHumanAction`, after `game = advance(game, rng);` add

```ts
  if (game.phase === "victory" || game.phase === "defeat") bankSeen();
```

   and the same line inside the AI chain's `setTimeout` callback, right after the `while` loop.
4. Deck screen creation (after the hud creation, before `hud.update(game)`):

```ts
function deckScreenView(visible: boolean) {
  return {
    visible,
    knownCards: meta.knownCards,
    seenPool: meta.seenPool,
    unlockUsed: unlockUsedThisGame,
  };
}

const deckScreen = createDeckScreen(app, {
  onUnlock(cardId) {
    if (unlockUsedThisGame) return;
    const next = unlockCard(meta, cardId);
    if (next === meta) return;
    meta = next;
    unlockUsedThisGame = true;
    saveMeta(storage, meta);
    deckScreen.update(deckScreenView(true));
  },
  onStart(selectedIds) {
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
    deckScreen.update(deckScreenView(false));
    refresh();
  },
});
```

5. `onNewGame` becomes the full loop reset (replacing the TEMP chooseDeck inline):

```ts
    onNewGame() {
      bankSeen();
      game = startGame(newGame(data.factions.map((f) => f.id), factionAdjacency));
      cancelTribute();
      disarm();
      unlockUsedThisGame = false;
      seenMerged = false;
      poolAtRunStart = meta.seenPool;
      deckScreen.update(deckScreenView(true));
      refresh();
    },
```

6. New hud callbacks (in the createHud callbacks object):

```ts
    lootInfo() {
      return game.seenThisRun
        .filter((id) => !meta.knownCards.includes(id))
        .map((id) => ({ id, isNew: !poolAtRunStart.includes(id) }));
    },
    ...(storageIsPersistent
      ? {
          onResetProgress() {
            meta = resetMeta(storage);
            poolAtRunStart = meta.seenPool;
            deckScreen.update(deckScreenView(game.phase === "deck-building"));
          },
        }
      : {}),
```

7. `inPlay()` and the rest need no changes; the deck screen overlays the map during `deck-building`, and `interceptClick` ignores that phase already (its first check is `pick-faction`).

- [ ] **Step 2: Verify build and suite**

Run: `npm run build && npm test`
Expected: PASS (no unit tests for main.ts; the Chrome e2e is Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(balticmap): wire meta persistence and deck screen into the run loop

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: end-to-end validation in Chrome

**Files:** none (validation; fix regressions found, with tests where unit-testable).

- [ ] **Step 1: Start the dev server** (`npm run dev`, background; note the URL).

- [ ] **Step 2: Walk the two-run scenario**

1. Fresh profile (use Reset progress first if the browser has stale meta): New game -> deck screen shows no unlock row, filler-only deck ("0 picked + 10 Grow Crops = 10") -> Choose your lands -> pick a faction. Your whole deck is Grow Crops.
2. Play passively until subjugated and incorporated (fast when you cannot fight back). The post-mortem loot row lists the cards that beat you, tagged NEW, with the unlock caption.
3. New game -> deck screen now shows "Learned from your defeats - unlock one" with the pool. Unlock one card: the row collapses, the card appears pre-selected in the deck row, the counter updates.
4. Start run 2, confirm the unlocked card gets drawn/played (it is 1 of 10 cards - cycle a few turns).
5. Mid-run, reload the page. Main menu -> New game -> deck screen: the unlocked card is still known; the rest of the pool survived. (Also verifies mid-run quit banking: any cards seen before the reload-quit are NOT banked - the reload dropped in-memory state; note this is accepted behavior, the spec banks on New game clicks and endings, not on tab close.)
6. Reset progress: first click arms ("Really reset?"), second wipes; New game shows the first-run screen again.
7. Console: zero errors/warnings.

- [ ] **Step 3: Fix anything found, re-run `npm test`, commit fixes**

---

## Execution notes

- Order 1 -> 6. Task 2 carries the cross-test helper patches; Task 5 replaces Task 2's TEMP inline chooseDeck.
- The engine stays meta-agnostic: `seenThisRun` tracks all witnessed non-basics; filtering against `knownCards` happens in main.ts's `lootInfo`/`mergeSeen` layer.
- If a plan test contradicts plan code, STOP and report BLOCKED - never delete or weaken a spec test.
