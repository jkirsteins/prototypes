# Balticmap Rules v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card-driven subjugation (threshold 2, Subjugate/Fortify/Reclaim/Pay Tribute cards), mandatory-play auto-ending turns, survivable subjugation, victory/defeat endings with a post-mortem screen, and threat/realm map visuals.

**Architecture:** Subjugation becomes stored state (`GameState.overlords`, a Map) changed only by card resolutions; pairwise relations stay pure and only feed thresholds and UI. New pure modules: `playability.ts` (card conditions/targets) and `ai.ts` (policy v2). `game.ts` is rewritten around playCard/discardCard/advance. HUD gains discard and tribute prompts plus the post-mortem takeover; main.ts wires threat borders, realm halo, and the new turn loop. Compatibility shims (old `endTurn`, phase literal patches) keep the suite green between tasks and are deleted in the final wiring task.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom for DOM tests).

**Spec:** `docs/superpowers/specs/2026-07-26-balticmap-rules-v2-design.md` - read it before starting any task.

## Global Constraints

- All user-visible strings use only typable ASCII: no em dashes (use "-"), no unicode arrows/ellipsis (use "->", "...").
- Deck size is exactly 10. Non-basic cards max 1 per deck; Grow Crops unlimited filler. Default/AI deck = all 6 deck-buildable non-basics + 4 Grow Crops.
- Subjugation threshold: a lead of >= 2 on either track (constant `SUBJUGATE_THRESHOLD = 2`). Victory: human realm >= 11 polygons (`VICTORY_REALM_SIZE = 11`).
- Opening hand: 3 cards per player (`OPENING_HAND = 3`), drawn without log events at game start.
- Pure functions over immutable state; rejected transitions return the SAME state reference. `GameState.overlords` is a `Map` - copy (`new Map(...)`) before mutating.
- Faction order = `GameState.factionIds`; all tiebreaks use it. AI is deterministic and RNG-free in its choices (rng is only for shuffles/injection).
- Test commands: `npx vitest run tests/<file>.test.ts`, full `npm test`, types `npm run build`.
- Commit after every task, message ending with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Compatibility shims introduced mid-plan (marked SHIM) are removed in Task 7; do not remove them earlier.

---

### Task 1: card roster v2

**Files:**
- Modify: `src/cards.ts`
- Test: `tests/cards.test.ts` (rewrite two tests, add one)
- Modify: `tests/hud.test.ts` (two count expectations)

**Interfaces:**
- Consumes: nothing.
- Produces: `CardDef { id; name; targeted: boolean; maxPerDeck: number | null; deckBuildable: boolean; forced: boolean }`; `CARDS` with 8 entries (ids: `grow-crops`, `raid`, `shrewd-marriage`, `fortify`, `subjugate`, `incorporate`, `reclaim-independence`, `pay-tribute`); `DECK_SIZE = 10`; `buildDeck()` -> 6 non-basics + 4 grow-crops; `shuffle`/`Rng` unchanged.

- [ ] **Step 1: Rewrite the card tests**

In `tests/cards.test.ts`, replace the tests "defines the four card types with targeting flags" and "builds a 20-card deck..." with:

```ts
  it("defines the eight card types with v2 properties", () => {
    const expectProps = (
      id: string, name: string, targeted: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
    ) =>
      expect(CARDS[id]).toEqual({ id, name, targeted, maxPerDeck, deckBuildable, forced });
    expectProps("grow-crops", "Grow crops", false, null, true, false);
    expectProps("raid", "Raid", true, 1, true, false);
    expectProps("shrewd-marriage", "Shrewd marriage", true, 1, true, false);
    expectProps("fortify", "Fortify", false, 1, true, false);
    expectProps("subjugate", "Subjugate", true, 1, true, false);
    expectProps("incorporate", "Incorporate", true, 1, true, false);
    expectProps("reclaim-independence", "Reclaim independence", false, 1, true, false);
    expectProps("pay-tribute", "Pay tribute", false, null, false, true);
  });

  it("builds the 10-card default deck: 6 non-basics once each + 4 grow-crops", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const count = (id: string) => deck.filter((c) => c === id).length;
    for (const id of [
      "raid", "shrewd-marriage", "fortify", "subjugate",
      "incorporate", "reclaim-independence",
    ]) {
      expect(count(id)).toBe(1);
    }
    expect(count("grow-crops")).toBe(4);
    expect(count("pay-tribute")).toBe(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/cards.test.ts`
Expected: FAIL (missing properties, wrong composition, DECK_SIZE 20).

- [ ] **Step 3: Implement `src/cards.ts` v2**

Replace everything above `shuffle` (keep `Rng` and `shuffle` unchanged):

```ts
export interface CardDef {
  id: string;
  name: string;
  targeted: boolean;
  /** Copies allowed per deck; null = unlimited (basic filler). */
  maxPerDeck: number | null;
  /** May appear in a built deck. Pay Tribute is injection-only. */
  deckBuildable: boolean;
  /** While in hand, it is the only playable card. */
  forced: boolean;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow crops", targeted: false, maxPerDeck: null, deckBuildable: true, forced: false },
  "raid": { id: "raid", name: "Raid", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false },
  "fortify": { id: "fortify", name: "Fortify", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false },
  "subjugate": { id: "subjugate", name: "Subjugate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false },
  "reclaim-independence": { id: "reclaim-independence", name: "Reclaim independence", targeted: false, maxPerDeck: 1, deckBuildable: true, forced: false },
  "pay-tribute": { id: "pay-tribute", name: "Pay tribute", targeted: false, maxPerDeck: null, deckBuildable: false, forced: true },
};

export const DECK_SIZE = 10;

/** The default (and AI) deck: every deck-buildable non-basic once,
 *  grow-crops filling the remaining slots. */
export function buildDeck(): string[] {
  const nonBasics = Object.values(CARDS)
    .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
    .map((c) => c.id);
  return [
    ...nonBasics,
    ...Array.from({ length: DECK_SIZE - nonBasics.length }, () => "grow-crops"),
  ];
}
```

- [ ] **Step 4: Fix deck-size-dependent HUD expectations**

Run `npm test`. Two `tests/hud.test.ts` expectations depend on a 20-card deck; fix them:

- In "renders the human turn: status, piles, fanned hand, End Turn":
  `expect(q(container, ".pile-deck .pile-count").textContent).toBe("19");` -> `.toBe("9");`
- In "renders layered card backs scaled to the count, dashed when empty":
  `expect(container.querySelectorAll(".pile-deck .card-back")).toHaveLength(4);` -> `.toHaveLength(3);` (pileLayers(9) = 3).

If any other test fails purely on deck size or card identity, apply the same minimal treatment (symbolic counts or forced hands) and record it in your report. The old game rules still apply in this task: the new card ids exist but have no behavior yet (old `validTargets` returns `[]` for them, so they are simply unplayable), which is expected and temporary.

- [ ] **Step 5: Run all tests and commit**

Run: `npm test && npm run build` - expected: PASS.

```bash
git add src/cards.ts tests/cards.test.ts tests/hud.test.ts
git commit -m "feat(balticmap): rules v2 card roster and 10-card decks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: relations additions (leadsOf, bumpMightAll)

**Files:**
- Modify: `src/relations.ts` (additive only)
- Test: `tests/relations.test.ts` (append)

**Interfaces:**
- Consumes: existing `getRel`, `bumpMight`.
- Produces: `leadsOf(rel, a, b): { status: number; might: number }` (per-track margins of a over b, may be negative); `bumpMightAll(rel, actor, others: string[]): Relations`. Everything already exported stays (computeOverlords/validTargets are deleted later, in Task 7).

- [ ] **Step 1: Write the failing tests**

Append to `tests/relations.test.ts`:

```ts
describe("leadsOf", () => {
  it("returns per-track margins, negative when behind", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpStatus(rel, "beta", "alpha");
    expect(leadsOf(rel, "alpha", "beta")).toEqual({ status: -1, might: 2 });
    expect(leadsOf(rel, "beta", "alpha")).toEqual({ status: 1, might: -2 });
    expect(leadsOf({}, "alpha", "beta")).toEqual({ status: 0, might: 0 });
  });
});

describe("bumpMightAll", () => {
  it("bumps might toward every listed faction, immutably", () => {
    const rel: Relations = {};
    const out = bumpMightAll(rel, "alpha", ["beta", "gamma"]);
    expect(rel).toEqual({});
    expect(getRel(out, "alpha", "beta").might).toBe(1);
    expect(getRel(out, "alpha", "gamma").might).toBe(1);
    expect(getRel(out, "alpha", "delta").might).toBe(0);
    expect(getRel(out, "beta", "alpha").might).toBe(0);
  });

  it("with an empty list returns the same reference", () => {
    const rel: Relations = {};
    expect(bumpMightAll(rel, "alpha", [])).toBe(rel);
  });
});
```

Add `leadsOf, bumpMightAll` to the import list at the top of the file.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/relations.test.ts`
Expected: FAIL - functions not exported.

- [ ] **Step 3: Implement**

Add to `src/relations.ts` after `leadOf`:

```ts
/** Per-track margins of A over B; positive = A is ahead on that track. */
export function leadsOf(
  rel: Relations,
  a: string,
  b: string,
): { status: number; might: number } {
  const ab = getRel(rel, a, b);
  const ba = getRel(rel, b, a);
  return { status: ab.status - ba.status, might: ab.might - ba.might };
}

/** +1 might from actor toward every id in others (the Fortify effect). */
export function bumpMightAll(
  rel: Relations,
  actor: string,
  others: string[],
): Relations {
  let out = rel;
  for (const target of others) out = bumpMight(out, actor, target);
  return out;
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npm test` - expected: PASS.

```bash
git add src/relations.ts tests/relations.test.ts
git commit -m "feat(balticmap): per-track leads and fortify bump in relations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: playability module

**Files:**
- Create: `src/playability.ts`
- Test: `tests/playability.test.ts`

**Interfaces:**
- Consumes: `CARDS` (Task 1); `leadsOf`, `realmOf`, types from relations. NOTE: stored overlords use the existing `Overlords` type (`Map<string, string>`, vassal -> overlord); here it is plain data passed in, not derived.
- Produces:
  - `SUBJUGATE_THRESHOLD = 2`
  - `interface RulesView { relations: Relations; overlords: Overlords; incorporated: Incorporated; adjacency: Record<string, string[]>; factionIds: string[] }`
  - `validTargetsFor(view: RulesView, factionId: string, cardId: string): string[]`
  - `isCardPlayable(view: RulesView, factionId: string, cardId: string): boolean`
  - `interface PlayableSet { mode: "play" | "discard"; cardIndexes: number[] }`
  - `playableSet(view: RulesView, factionId: string, hand: string[]): PlayableSet`

- [ ] **Step 1: Write the failing tests**

Create `tests/playability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SUBJUGATE_THRESHOLD, isCardPlayable, playableSet, validTargetsFor,
  type RulesView,
} from "../src/playability";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";

const ORDER = ["alpha", "beta", "gamma", "delta"];
const LINE_ADJ = {
  alpha: ["beta"],
  beta: ["alpha", "gamma"],
  gamma: ["beta", "delta"],
  delta: ["gamma"],
};

function view(partial: Partial<RulesView> = {}): RulesView {
  return {
    relations: {},
    overlords: new Map(),
    incorporated: {},
    adjacency: LINE_ADJ,
    factionIds: ORDER,
    ...partial,
  };
}

/** relations where actor leads target by n might */
function mightLead(actor: string, target: string, n: number): Relations {
  let rel: Relations = {};
  for (let i = 0; i < n; i++) rel = bumpMight(rel, actor, target);
  return rel;
}

describe("validTargetsFor", () => {
  it("raid and marriage reach adjacency; raid excludes the overlord, marriage includes it", () => {
    const v = view({ overlords: new Map([["beta", "gamma"]]) });
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["alpha"]);
    expect(validTargetsFor(v, "beta", "shrewd-marriage")).toEqual(["alpha", "gamma"]);
  });

  it("marriage adds a non-adjacent overlord", () => {
    // delta subjugated by alpha (not adjacent to delta's realm)
    const v = view({ overlords: new Map([["delta", "alpha"]]) });
    expect(validTargetsFor(v, "delta", "shrewd-marriage")).toEqual(["alpha", "gamma"]);
    expect(validTargetsFor(v, "delta", "raid")).toEqual(["gamma"]);
  });

  it("subjugate requires a lead of SUBJUGATE_THRESHOLD on either track", () => {
    expect(SUBJUGATE_THRESHOLD).toBe(2);
    const v1 = view({ relations: mightLead("beta", "gamma", 1) });
    expect(validTargetsFor(v1, "beta", "subjugate")).toEqual([]);
    const v2 = view({ relations: mightLead("beta", "gamma", 2) });
    expect(validTargetsFor(v2, "beta", "subjugate")).toEqual(["gamma"]);
    let rel: Relations = {};
    rel = bumpStatus(rel, "beta", "alpha");
    rel = bumpStatus(rel, "beta", "alpha");
    expect(validTargetsFor(view({ relations: rel }), "beta", "subjugate")).toEqual(["alpha"]);
  });

  it("subjugate excludes own vassals, incorporated lands, and is dead while subjugated", () => {
    const rel = mightLead("beta", "gamma", 2);
    const own = view({ relations: rel, overlords: new Map([["gamma", "beta"]]) });
    expect(validTargetsFor(own, "beta", "subjugate")).toEqual([]);
    const inc = view({ relations: rel, incorporated: { gamma: "delta" } });
    expect(validTargetsFor(inc, "beta", "subjugate")).toEqual([]);
    const sub = view({ relations: rel, overlords: new Map([["beta", "alpha"]]) });
    expect(validTargetsFor(sub, "beta", "subjugate")).toEqual([]);
  });

  it("incorporate targets own vassals only, dead while subjugated", () => {
    const v = view({ overlords: new Map([["gamma", "beta"], ["alpha", "delta"]]) });
    expect(validTargetsFor(v, "beta", "incorporate")).toEqual(["gamma"]);
    const sub = view({
      overlords: new Map([["gamma", "beta"], ["beta", "alpha"]]),
    });
    expect(validTargetsFor(sub, "beta", "incorporate")).toEqual([]);
  });

  it("vassals and poach targets stay raidable; incorporated lands are not", () => {
    const v = view({
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { alpha: "delta" },
    });
    // delta is reachable through the vassal gamma (realm-union reach)
    expect(validTargetsFor(v, "beta", "raid")).toEqual(["gamma", "delta"]);
  });
});

describe("isCardPlayable", () => {
  it("grow-crops and fortify always; tribute only while subjugated", () => {
    const free = view();
    expect(isCardPlayable(free, "beta", "grow-crops")).toBe(true);
    expect(isCardPlayable(free, "beta", "fortify")).toBe(true);
    expect(isCardPlayable(free, "beta", "pay-tribute")).toBe(false);
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    expect(isCardPlayable(sub, "beta", "pay-tribute")).toBe(true);
  });

  it("reclaim needs subjugation AND the overlord's lead below 2 on both tracks", () => {
    const base = { overlords: new Map([["beta", "alpha"]]) };
    expect(isCardPlayable(view(), "beta", "reclaim-independence")).toBe(false);
    expect(
      isCardPlayable(view({ ...base, relations: mightLead("alpha", "beta", 2) }),
        "beta", "reclaim-independence"),
    ).toBe(false);
    expect(
      isCardPlayable(view({ ...base, relations: mightLead("alpha", "beta", 1) }),
        "beta", "reclaim-independence"),
    ).toBe(true);
    expect(
      isCardPlayable(view(base), "beta", "reclaim-independence"),
    ).toBe(true);
  });

  it("targeted cards are playable iff a target exists", () => {
    expect(isCardPlayable(view(), "beta", "raid")).toBe(true);
    expect(isCardPlayable(view(), "beta", "subjugate")).toBe(false);
    expect(isCardPlayable(view(), "beta", "incorporate")).toBe(false);
  });
});

describe("playableSet", () => {
  it("forced tribute overrides everything else", () => {
    const sub = view({ overlords: new Map([["beta", "alpha"]]) });
    const set = playableSet(sub, "beta", ["raid", "pay-tribute", "grow-crops"]);
    expect(set).toEqual({ mode: "play", cardIndexes: [1] });
  });

  it("returns the playable indexes in hand order", () => {
    const set = playableSet(view(), "beta", ["subjugate", "grow-crops", "raid"]);
    expect(set).toEqual({ mode: "play", cardIndexes: [1, 2] });
  });

  it("falls back to discard mode over the whole hand", () => {
    const set = playableSet(view(), "beta", ["subjugate", "incorporate"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0, 1] });
  });

  it("a stale tribute in a free hand is not forced and not playable", () => {
    const set = playableSet(view(), "beta", ["pay-tribute"]);
    expect(set).toEqual({ mode: "discard", cardIndexes: [0] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/playability.test.ts`
Expected: FAIL - cannot resolve `../src/playability`.

- [ ] **Step 3: Implement `src/playability.ts`**

```ts
import { CARDS } from "./cards";
import {
  leadsOf, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";

export const SUBJUGATE_THRESHOLD = 2;

/** The slice of game state the rules need. GameState satisfies this
 *  structurally; tests build it directly. */
export interface RulesView {
  relations: Relations;
  overlords: Overlords; // stored vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>; // faction id -> adjacent faction ids
  factionIds: string[];
}

function reachOf(view: RulesView, factionId: string): Set<string> {
  const realm = realmOf(factionId, view.overlords, view.incorporated);
  const reach = new Set<string>();
  for (const member of realm) {
    for (const adj of view.adjacency[member] ?? []) reach.add(adj);
  }
  return reach;
}

/** Valid targets for a targeted card, in faction order. */
export function validTargetsFor(
  view: RulesView,
  factionId: string,
  cardId: string,
): string[] {
  const overlord = view.overlords.get(factionId);
  const subjugated = overlord !== undefined;
  if (cardId === "incorporate") {
    if (subjugated) return [];
    return view.factionIds.filter((id) => view.overlords.get(id) === factionId);
  }
  if (cardId === "raid" || cardId === "shrewd-marriage") {
    const reach = reachOf(view, factionId);
    const inReach = (id: string) =>
      id !== factionId && !(id in view.incorporated) && reach.has(id);
    if (cardId === "raid") {
      return view.factionIds.filter((id) => inReach(id) && id !== overlord);
    }
    // Marriage: the overlord is always courtable, adjacent or not.
    return view.factionIds.filter((id) => inReach(id) || id === overlord);
  }
  if (cardId === "subjugate") {
    if (subjugated) return [];
    const reach = reachOf(view, factionId);
    return view.factionIds.filter((id) => {
      if (id === factionId || id in view.incorporated || !reach.has(id)) return false;
      if (view.overlords.get(id) === factionId) return false; // already yours
      const l = leadsOf(view.relations, factionId, id);
      return Math.max(l.status, l.might) >= SUBJUGATE_THRESHOLD;
    });
  }
  return [];
}

export function isCardPlayable(
  view: RulesView,
  factionId: string,
  cardId: string,
): boolean {
  const card = CARDS[cardId];
  if (!card) return false;
  const overlord = view.overlords.get(factionId);
  if (cardId === "grow-crops" || cardId === "fortify") return true;
  if (cardId === "pay-tribute") return overlord !== undefined;
  if (cardId === "reclaim-independence") {
    if (overlord === undefined) return false;
    const l = leadsOf(view.relations, overlord, factionId);
    return l.status < SUBJUGATE_THRESHOLD && l.might < SUBJUGATE_THRESHOLD;
  }
  if (card.targeted) return validTargetsFor(view, factionId, cardId).length > 0;
  return false;
}

export interface PlayableSet {
  mode: "play" | "discard";
  cardIndexes: number[];
}

/** Which hand indexes may be played this turn. Forced cards (Pay Tribute)
 *  monopolize the set; an empty playable set means a forced discard of any
 *  card in hand. */
export function playableSet(
  view: RulesView,
  factionId: string,
  hand: string[],
): PlayableSet {
  const forced: number[] = [];
  hand.forEach((c, i) => {
    if (CARDS[c]?.forced && isCardPlayable(view, factionId, c)) forced.push(i);
  });
  if (forced.length > 0) return { mode: "play", cardIndexes: forced };
  const playable: number[] = [];
  hand.forEach((c, i) => {
    if (!CARDS[c]?.forced && isCardPlayable(view, factionId, c)) playable.push(i);
  });
  if (playable.length > 0) return { mode: "play", cardIndexes: playable };
  return { mode: "discard", cardIndexes: hand.map((_, i) => i) };
}
```

- [ ] **Step 4: Run tests, commit**

Run: `npm test && npm run build` - expected: PASS.

```bash
git add src/playability.ts tests/playability.test.ts
git commit -m "feat(balticmap): playability module with v2 card conditions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: game core v2

This is the pivotal task: `src/game.ts` is rewritten and `tests/game.test.ts` is replaced wholesale. Two SHIMs keep the rest of the app compiling until Tasks 6-7: a legacy `endTurn` alias and a minimal `aiTurn`. `src/hud.ts`, `src/main.ts`, and `tests/hud.test.ts` get small mechanical patches listed in Step 4.

**Files:**
- Modify: `src/game.ts` (full rewrite below)
- Test: `tests/game.test.ts` (full replacement below)
- Modify: `src/hud.ts` (phase/event literal patches only)
- Modify: `src/main.ts` (playCard call sites only)
- Modify: `tests/hud.test.ts` (mechanical fallout)

**Interfaces:**
- Consumes: Tasks 1-3 (`CARDS`, `buildDeck`, `leadsOf`, `bumpMightAll`, `realmOf`, `playableSet`, `validTargetsFor`, `RulesView`).
- Produces:
  - `GameEventType = "draw" | "play" | "reshuffle" | "discard" | "subjugated" | "released" | "incorporated" | "reclaimed" | "tribute" | "victory" | "defeat"`
  - `GameEvent` gains `track?: "status" | "might"`.
  - `GamePhase = "main-menu" | "pick-faction" | "playing" | "victory" | "defeat"`
  - `type TributeTrack = "status" | "might"`
  - `GameState` gains `overlords: Overlords` (Map) and `seenThisRun: string[]`.
  - `OPENING_HAND = 3`, `VICTORY_REALM_SIZE = 11`.
  - `playCard(state, cardIndex, rng: Rng, targetId?: string, tributeTrack?: TributeTrack)`
  - `discardCard(state, cardIndex): GameState`
  - `advance(state, rng): GameState` (requires `playedThisTurn`; skips incorporated players; never skips the human)
  - `viewOf(state): RulesView`
  - SHIM `endTurn(state, rng)` = advance without the playedThisTurn guard (removed in Task 7).
  - SHIM `aiTurn(state, rng)` = minimal legal turn (replaced by ai.ts in Task 5; note it now takes rng).
  - `overlordsOf(state)` now returns `state.overlords` (accessor kept for main.ts until Task 7).

- [ ] **Step 1: Replace `tests/game.test.ts`**

Full new file:

```ts
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, pickFaction, beginTurn, playCard, discardCard, advance,
  endTurn, aiTurn, isHumanTurn, viewOf,
  OPENING_HAND, VICTORY_REALM_SIZE, type GameState,
} from "../src/game";
import { DECK_SIZE, type Rng } from "../src/cards";
import { bumpMight, bumpStatus, getRel, leadsOf, type Relations } from "../src/relations";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma", "delta"];
const LINE_ADJ = {
  alpha: ["beta"],
  beta: ["alpha", "gamma"],
  gamma: ["beta", "delta"],
  delta: ["gamma"],
};

function playingState(adj?: Record<string, string[]>): GameState {
  return pickFaction(startGame(newGame(FACTIONS, adj)), "beta", seededRng(1));
}

function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

function withRel(g: GameState, relations: Relations): GameState {
  return { ...g, relations };
}

/** actor leads target by n might */
function mightLead(rel: Relations, actor: string, target: string, n: number): Relations {
  let out = rel;
  for (let i = 0; i < n; i++) out = bumpMight(out, actor, target);
  return out;
}

const rng = () => seededRng(7);

describe("setup", () => {
  it("newGame initializes v2 state", () => {
    const g = newGame(FACTIONS);
    expect(g.phase).toBe("main-menu");
    expect(g.overlords.size).toBe(0);
    expect(g.seenThisRun).toEqual([]);
    expect(g.adjacency["alpha"].sort()).toEqual(["beta", "delta", "gamma"]);
  });

  it("pickFaction deals opening hands of 3 plus the first draw, without opening-draw log spam", () => {
    const g = playingState();
    expect(g.players.map((p) => p.factionId)).toEqual(["beta", "alpha", "gamma", "delta"]);
    expect(g.players[0].hand).toHaveLength(OPENING_HAND + 1); // +1 = turn draw
    expect(g.players[0].deck).toHaveLength(DECK_SIZE - OPENING_HAND - 1);
    expect(g.players[1].hand).toHaveLength(OPENING_HAND);
    expect(g.log.filter((e) => e.type === "draw")).toHaveLength(1); // only the turn draw
  });
});

describe("beginTurn", () => {
  it("reshuffles the discard when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0], deck: [] as string[], hand: [] as string[],
      discard: ["grow-crops", "grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(1);
    expect(after.players[0].deck).toHaveLength(2);
    expect(after.log.at(-2)?.type).toBe("reshuffle");
  });
});

describe("playCard validation", () => {
  it("rejects cards outside the playable set and bad targets", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["raid", "subjugate"]);
    expect(playCard(g, 1, rng(), "alpha")).toBe(g); // no lead: subjugate unplayable
    expect(playCard(g, 0, rng())).toBe(g); // raid without target
    expect(playCard(g, 0, rng(), "delta")).toBe(g); // not adjacent to beta
    expect(playCard(g, 5, rng(), "alpha")).toBe(g); // out of range
  });

  it("rejects playing while the hand demands a discard, and discarding while playable", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["subjugate"]);
    expect(playCard(g, 0, rng(), "alpha")).toBe(g);
    const d = discardCard(g, 0);
    expect(d).not.toBe(g);
    const g2 = withHand(playingState(LINE_ADJ), 0, ["grow-crops"]);
    expect(discardCard(g2, 0)).toBe(g2);
  });

  it("pay-tribute requires a track", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 0, ["pay-tribute"]);
    expect(playCard(g, 0, rng())).toBe(g);
    expect(playCard(g, 0, rng(), undefined, "might")).not.toBe(g);
  });
});

describe("card effects", () => {
  it("raid and marriage bump one pair; fortify bumps everyone living", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid", "shrewd-marriage", "fortify"]);
    const afterRaid = playCard(g, 0, rng(), "alpha");
    expect(getRel(afterRaid.relations, "beta", "alpha").might).toBe(1);
    const afterMarriage = playCard(g, 1, rng(), "gamma");
    expect(getRel(afterMarriage.relations, "beta", "gamma").status).toBe(1);
    g = { ...g, incorporated: { delta: "gamma" } };
    const afterFortify = playCard(g, 2, rng());
    expect(getRel(afterFortify.relations, "beta", "alpha").might).toBe(1);
    expect(getRel(afterFortify.relations, "beta", "gamma").might).toBe(1);
    expect(getRel(afterFortify.relations, "beta", "delta").might).toBe(0); // incorporated
  });

  it("subjugate stores the overlord, injects 2 tribute cards, logs", () => {
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    const gammaPlayer = after.players.find((p) => p.factionId === "gamma")!;
    const tributes = [...gammaPlayer.deck, ...gammaPlayer.hand, ...gammaPlayer.discard]
      .filter((c) => c === "pay-tribute");
    expect(tributes).toHaveLength(2);
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "gamma", overlordFactionId: "beta",
    });
    expect(g.overlords.size).toBe(0); // input untouched
  });

  it("subjugate poaches and frees the target's own vassals with tribute cleanup", () => {
    let g = playingState(LINE_ADJ);
    // gamma holds delta; beta out-leads and takes gamma
    g = { ...g, overlords: new Map([["delta", "gamma"]]) };
    let deltaP = g.players.find((p) => p.factionId === "delta")!;
    deltaP = { ...deltaP, deck: [...deltaP.deck, "pay-tribute", "pay-tribute"] };
    g = { ...g, players: g.players.map((p) => (p.factionId === "delta" ? deltaP : p)) };
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.overlords.get("gamma")).toBe("beta");
    expect(after.overlords.has("delta")).toBe(false);
    const freedDelta = after.players.find((p) => p.factionId === "delta")!;
    expect(
      [...freedDelta.deck, ...freedDelta.hand, ...freedDelta.discard]
        .filter((c) => c === "pay-tribute"),
    ).toHaveLength(0);
    expect(after.log.some((e) => e.type === "released" && e.targetFactionId === "delta")).toBe(true);
  });

  it("incorporate is permanent and ends the game when the human falls", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["gamma", "beta"]]) };
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.incorporated).toEqual({ gamma: "beta" });
    expect(after.overlords.has("gamma")).toBe(false);
    expect(after.phase).toBe("playing");

    // now the human is someone's vassal and gets incorporated
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g2 = withHand(g2, 2, ["incorporate"]);
    const dead = playCard(g2, 0, rng(), "beta");
    expect(dead.phase).toBe("defeat");
    expect(dead.log.at(-1)).toMatchObject({
      type: "defeat", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("reclaim frees the player and strips tribute copies", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    let p0 = g.players[0];
    p0 = {
      ...p0,
      deck: [...p0.deck, "pay-tribute"],
      discard: ["pay-tribute"],
      hand: ["reclaim-independence"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    // overlord lead < 2 on both tracks (all zeros): reclaim is playable
    const after = playCard(g, 0, rng());
    expect(after.overlords.has("beta")).toBe(false);
    const freed = after.players[0];
    expect(
      [...freed.deck, ...freed.hand, ...freed.discard].filter((c) => c === "pay-tribute"),
    ).toHaveLength(0);
    expect(after.log.at(-1)).toMatchObject({
      type: "reclaimed", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("reclaim is rejected while the overlord's lead is 2+", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, overlords: new Map([["beta", "gamma"]]) };
    g = withRel(g, mightLead(g.relations, "gamma", "beta", 2));
    g = withHand(g, 0, ["reclaim-independence"]);
    // reclaim unplayable -> hand of 1 means discard mode
    expect(playCard(g, 0, rng())).toBe(g);
    expect(discardCard(g, 0)).not.toBe(g);
  });

  it("tribute feeds the overlord and its incorporated lands on the chosen track", () => {
    let g = playingState(LINE_ADJ);
    g = {
      ...g,
      overlords: new Map([["beta", "gamma"]]),
      incorporated: { delta: "gamma" },
    };
    g = withHand(g, 0, ["pay-tribute"]);
    const after = playCard(g, 0, rng(), undefined, "status");
    expect(getRel(after.relations, "gamma", "beta").status).toBe(1);
    expect(getRel(after.relations, "delta", "beta").status).toBe(1);
    expect(getRel(after.relations, "alpha", "beta").status).toBe(0);
    expect(after.log.at(-1)).toMatchObject({
      type: "tribute", targetFactionId: "beta", overlordFactionId: "gamma",
      track: "status",
    });
  });

  it("victory triggers at VICTORY_REALM_SIZE realm polygons", () => {
    expect(VICTORY_REALM_SIZE).toBe(11);
    // 4-faction fixture: victory needs 11, unreachable here - verify the check
    // by lowering the bar structurally: subjugating gamma makes realm 2 < 11.
    let g = playingState(LINE_ADJ);
    g = withRel(g, mightLead(g.relations, "beta", "gamma", 2));
    g = withHand(g, 0, ["subjugate"]);
    const after = playCard(g, 0, rng(), "gamma");
    expect(after.phase).toBe("playing");
    // and by direct construction: 11 of 20 factions incorporated
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    let big = pickFaction(startGame(newGame(many)), "f0", seededRng(1));
    const inc: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) inc[`f${i}`] = "f0";
    big = { ...big, incorporated: inc };
    big = withHand(big, 0, ["grow-crops"]);
    const won = playCard(big, 0, rng());
    expect(won.phase).toBe("victory");
    expect(won.log.at(-1)?.type).toBe("victory");
  });
});

describe("seenThisRun", () => {
  it("records AI cards played against the human realm, once, in order", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, current: 2 }; // gamma acts
    g = withHand(g, 2, ["raid"]);
    let after = playCard(g, 0, rng(), "beta");
    expect(after.seenThisRun).toEqual(["raid"]);
    after = { ...after, playedThisTurn: false };
    after = withHand(after, 2, ["raid"]);
    after = playCard(after, 0, rng(), "beta");
    expect(after.seenThisRun).toEqual(["raid"]); // deduped
  });

  it("records untargeted plays only from factions adjacent to the human realm", () => {
    let g = playingState(LINE_ADJ);
    g = { ...g, current: 2 }; // gamma, adjacent to beta
    g = withHand(g, 2, ["fortify"]);
    expect(playCard(g, 0, rng()).seenThisRun).toEqual(["fortify"]);
    let far = playingState(LINE_ADJ);
    far = { ...far, current: 3 }; // delta, not adjacent to beta
    far = withHand(far, 3, ["fortify"]);
    expect(playCard(far, 0, rng()).seenThisRun).toEqual([]);
  });

  it("ignores the human's own plays and AI plays on other AIs", () => {
    let g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    expect(playCard(g, 0, rng(), "alpha").seenThisRun).toEqual([]);
    let g2 = playingState(LINE_ADJ);
    g2 = { ...g2, current: 2 };
    g2 = withHand(g2, 2, ["raid"]);
    expect(playCard(g2, 0, rng(), "delta").seenThisRun).toEqual([]);
  });
});

describe("discard and advance", () => {
  it("discard moves the card and logs it", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["subjugate"]);
    const after = discardCard(g, 0);
    expect(after.players[0].hand).toEqual([]);
    expect(after.players[0].discard.at(-1)).toBe("subjugate");
    expect(after.playedThisTurn).toBe(true);
    expect(after.log.at(-1)).toMatchObject({ type: "discard", cardId: "subjugate" });
  });

  it("advance requires a completed turn, skips only incorporated players, wraps the turn counter", () => {
    const g = playingState(LINE_ADJ);
    expect(advance(g, seededRng(3))).toBe(g); // nothing played yet
    let played = playCard(withHand(g, 0, ["grow-crops"]), 0, rng());
    let next = advance(played, seededRng(3));
    expect(next.current).toBe(1);
    // subjugated players still get turns now
    played = { ...played, overlords: new Map([["alpha", "gamma"]]) };
    next = advance(played, seededRng(3));
    expect(next.current).toBe(1);
    // incorporated players are skipped
    played = { ...played, overlords: new Map(), incorporated: { alpha: "gamma" } };
    next = advance(played, seededRng(3));
    expect(next.current).toBe(2);
    // full wrap increments the turn
    let wrap = next;
    for (const _ of [2, 3]) {
      wrap = { ...wrap, playedThisTurn: true };
      wrap = advance(wrap, seededRng(3));
    }
    expect(wrap.current).toBe(0);
    expect(wrap.turn).toBe(2);
  });

  it("legacy endTurn shim advances without the played guard", () => {
    const g = playingState(LINE_ADJ);
    expect(endTurn(g, seededRng(3)).current).toBe(1);
  });
});

describe("aiTurn shim", () => {
  it("makes a legal move: plays something playable or discards", () => {
    let g = playingState(LINE_ADJ);
    g = advance({ ...g, playedThisTurn: true }, seededRng(4)); // alpha's turn
    const after = aiTurn(g, seededRng(5));
    expect(after).not.toBe(g);
    expect(after.playedThisTurn).toBe(true);
    const types = after.log.slice(-1)[0].type;
    expect(["play", "discard", "subjugated", "released", "tribute", "reclaimed", "incorporated", "victory", "defeat"]).toContain(types);
  });
});

describe("immutability", () => {
  it("playCard leaves the input state untouched", () => {
    const g = withHand(playingState(LINE_ADJ), 0, ["raid"]);
    const handBefore = [...g.players[0].hand];
    const logLen = g.log.length;
    playCard(g, 0, rng(), "alpha");
    expect(g.players[0].hand).toEqual(handBefore);
    expect(g.log).toHaveLength(logLen);
    expect(g.playedThisTurn).toBe(false);
    expect(g.overlords.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts`
Expected: FAIL massively (signatures, missing exports).

- [ ] **Step 3: Rewrite `src/game.ts`**

Full replacement:

```ts
import { buildDeck, shuffle, CARDS, type Rng } from "./cards";
import {
  bumpMight, bumpMightAll, bumpStatus, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";
import { playableSet, validTargetsFor, type RulesView } from "./playability";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "reclaimed" | "tribute"
  | "victory" | "defeat";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // draw, play, discard
  targetFactionId?: string;
  overlordFactionId?: string;
  track?: "status" | "might"; // tribute
}

export type GamePhase =
  | "main-menu" | "pick-faction" | "playing" | "victory" | "defeat";

export type TributeTrack = "status" | "might";

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
  current: number;
  playedThisTurn: boolean;
  factionIds: string[];
  relations: Relations;
  overlords: Overlords; // STORED vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>;
  seenThisRun: string[]; // non-basic enemy cards witnessed (learning loop)
  log: GameEvent[];
}

export const OPENING_HAND = 3;
export const VICTORY_REALM_SIZE = 11;

export function viewOf(state: GameState): RulesView {
  return {
    relations: state.relations,
    overlords: state.overlords,
    incorporated: state.incorporated,
    adjacency: state.adjacency,
    factionIds: state.factionIds,
  };
}

/** SHIM until Task 7: main.ts still reads overlords through this. */
export function overlordsOf(state: GameState): Overlords {
  return state.overlords;
}

export function newGame(
  factionIds: string[],
  adjacency?: Record<string, string[]>,
): GameState {
  return {
    phase: "main-menu",
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    factionIds,
    relations: {},
    overlords: new Map(),
    incorporated: {},
    adjacency:
      adjacency ??
      Object.fromEntries(
        factionIds.map((id) => [id, factionIds.filter((o) => o !== id)]),
      ),
    seenThisRun: [],
    log: [],
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "main-menu") return state;
  return { ...state, phase: "pick-faction" };
}

function makePlayer(id: number, factionId: string, rng: Rng): PlayerState {
  const deck = shuffle(buildDeck(), rng);
  // opening hand: dealt silently (no log events)
  return {
    id,
    factionId,
    hand: deck.slice(0, OPENING_HAND),
    deck: deck.slice(OPENING_HAND),
    discard: [],
  };
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
  return beginTurn({ ...state, phase: "playing", players, current: 0 }, rng);
}

/** Current player draws 1 (reshuffle rule); resets the play flag. */
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

const stripTribute = (p: PlayerState): PlayerState => ({
  ...p,
  deck: p.deck.filter((c) => c !== "pay-tribute"),
  hand: p.hand.filter((c) => c !== "pay-tribute"),
  discard: p.discard.filter((c) => c !== "pay-tribute"),
});

function updateFaction(
  players: PlayerState[],
  factionId: string,
  fn: (p: PlayerState) => PlayerState,
): PlayerState[] {
  return players.map((p) => (p.factionId === factionId ? fn(p) : p));
}

export function playCard(
  state: GameState,
  cardIndex: number,
  rng: Rng,
  targetId?: string,
  tributeTrack?: TributeTrack,
): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand);
  if (set.mode !== "play" || !set.cardIndexes.includes(cardIndex)) return state;
  const cardId = p.hand[cardIndex];
  const card = CARDS[cardId];
  if (card === undefined) return state;
  if (card.targeted) {
    const targets = validTargetsFor(viewOf(state), p.factionId, cardId);
    if (targetId === undefined || !targets.includes(targetId)) return state;
  }
  if (cardId === "pay-tribute" && tributeTrack === undefined) return state;

  let relations = state.relations;
  const overlords = new Map(state.overlords);
  let incorporated = state.incorporated;
  let phase: GamePhase = state.phase;
  const events: GameEvent[] = [
    {
      turn: state.turn, playerId: p.id, type: "play", cardId,
      ...(card.targeted && targetId !== undefined
        ? { targetFactionId: targetId }
        : {}),
    },
  ];

  // move the played card out of hand first, then apply effects to players
  let players = state.players.map((pl, i) =>
    i === state.current
      ? {
          ...pl,
          hand: pl.hand.filter((_, j) => j !== cardIndex),
          discard: [...pl.discard, cardId],
        }
      : pl,
  );

  const freeVassalsOf = (lord: string): void => {
    for (const [vassal, l] of [...overlords]) {
      if (l === lord) {
        overlords.delete(vassal);
        players = updateFaction(players, vassal, stripTribute);
        events.push({
          turn: state.turn, playerId: p.id, type: "released",
          targetFactionId: vassal,
        });
      }
    }
  };

  if (cardId === "raid" && targetId !== undefined) {
    relations = bumpMight(relations, p.factionId, targetId);
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
    relations = bumpStatus(relations, p.factionId, targetId);
  } else if (cardId === "fortify") {
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && !(f in incorporated),
    );
    relations = bumpMightAll(relations, p.factionId, living);
  } else if (cardId === "subjugate" && targetId !== undefined) {
    freeVassalsOf(targetId);
    overlords.set(targetId, p.factionId);
    players = updateFaction(players, targetId, (pl) => ({
      ...pl,
      deck: shuffle([...pl.deck, "pay-tribute", "pay-tribute"], rng),
    }));
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  } else if (cardId === "incorporate" && targetId !== undefined) {
    overlords.delete(targetId);
    freeVassalsOf(targetId); // defensive: chains never exist
    incorporated = { ...incorporated, [targetId]: p.factionId };
    players = updateFaction(players, targetId, stripTribute);
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  } else if (cardId === "reclaim-independence") {
    const former = overlords.get(p.factionId);
    if (former === undefined) return state;
    overlords.delete(p.factionId);
    players = updateFaction(players, p.factionId, stripTribute);
    events.push({
      turn: state.turn, playerId: p.id, type: "reclaimed",
      targetFactionId: p.factionId, overlordFactionId: former,
    });
  } else if (cardId === "pay-tribute") {
    const lord = overlords.get(p.factionId);
    if (lord === undefined || tributeTrack === undefined) return state;
    const beneficiaries = [
      lord,
      ...state.factionIds.filter((f) => incorporated[f] === lord),
    ];
    const bump = tributeTrack === "might" ? bumpMight : bumpStatus;
    for (const b of beneficiaries) {
      relations = bump(relations, b, p.factionId);
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "tribute",
      targetFactionId: p.factionId, overlordFactionId: lord,
      track: tributeTrack,
    });
  }

  // learning hook: enemy non-basic cards witnessed by the human
  let seenThisRun = state.seenThisRun;
  const human = players[0];
  if (
    p.id !== 1 &&
    card.deckBuildable &&
    card.maxPerDeck !== null &&
    !seenThisRun.includes(cardId)
  ) {
    const humanRealm = realmOf(human.factionId, overlords, incorporated);
    let seen = false;
    if (card.targeted && targetId !== undefined) {
      seen = humanRealm.includes(targetId);
    } else if (!card.targeted) {
      const actorRealm = realmOf(p.factionId, overlords, incorporated);
      const humanSet = new Set(humanRealm);
      seen = actorRealm.some((m) =>
        (state.adjacency[m] ?? []).some((a) => humanSet.has(a)),
      );
    }
    if (seen) seenThisRun = [...seenThisRun, cardId];
  }

  // endings
  if (incorporated[human.factionId] !== undefined) {
    phase = "defeat";
    events.push({
      turn: state.turn, playerId: p.id, type: "defeat",
      targetFactionId: human.factionId,
      overlordFactionId: incorporated[human.factionId],
    });
  } else if (
    realmOf(human.factionId, overlords, incorporated).length >=
    VICTORY_REALM_SIZE
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  }

  return {
    ...state, phase, players, relations, overlords, incorporated, seenThisRun,
    log: [...state.log, ...events], playedThisTurn: true,
  };
}

/** Forced discard when nothing in hand is playable. */
export function discardCard(state: GameState, cardIndex: number): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand);
  if (set.mode !== "discard" || !set.cardIndexes.includes(cardIndex)) return state;
  const cardId = p.hand[cardIndex];
  const players = state.players.map((pl, i) =>
    i === state.current
      ? {
          ...pl,
          hand: pl.hand.filter((_, j) => j !== cardIndex),
          discard: [...pl.discard, cardId],
        }
      : pl,
  );
  return {
    ...state,
    players,
    log: [
      ...state.log,
      { turn: state.turn, playerId: p.id, type: "discard", cardId },
    ],
    playedThisTurn: true,
  };
}

/** Moves to the next non-incorporated player after a completed turn.
 *  The human (index 0) is never skipped; the turn counter bumps on wrap. */
export function advance(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing" || !state.playedThisTurn) return state;
  const inert = (i: number): boolean =>
    state.players[i].factionId in state.incorporated;
  let current = state.current;
  let turn = state.turn;
  do {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
  } while (current !== 0 && inert(current));
  return beginTurn({ ...state, current, turn }, rng);
}

/** SHIM until Task 7: legacy alias for the old UI wiring; advances even
 *  when nothing was played. */
export function endTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing") return state;
  return advance({ ...state, playedThisTurn: true }, rng);
}

/** SHIM until Task 5 replaces it with the real policy in ai.ts:
 *  plays the first playable card on its first valid target (tribute goes
 *  to might), else discards the leftmost card. */
export function aiTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand);
  if (set.mode === "discard") {
    return discardCard(state, set.cardIndexes[0]);
  }
  const i = set.cardIndexes[0];
  const cardId = p.hand[i];
  if (CARDS[cardId]?.targeted) {
    const t = validTargetsFor(viewOf(state), p.factionId, cardId)[0];
    return playCard(state, i, rng, t);
  }
  if (cardId === "pay-tribute") return playCard(state, i, rng, undefined, "might");
  return playCard(state, i, rng);
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
```

- [ ] **Step 4: Mechanical fallout patches**

Run `npm run build` and `npm test`; fix exactly these classes of breakage:

1. `src/hud.ts` - the phase and event literals that no longer exist:
   - every `"game-over"` phase comparison becomes `"defeat"` (three occurrences in `update`),
   - in `eventText`, rename the `case "game-over":` to `case "defeat":` keeping the same text, and add minimal cases so the switch stays exhaustive:

```ts
      case "discard":
        return you
          ? "You discarded a card"
          : `Player ${e.playerId} discarded a card`;
      case "reclaimed":
        return `${factionName(e.targetFactionId)} reclaims independence from ${factionName(e.overlordFactionId)}`;
      case "tribute":
        return `${factionName(e.targetFactionId)} pays tribute to ${factionName(e.overlordFactionId)}`;
      case "victory":
        return "You rule the Baltic";
      case "defeat":
        return `Your realm has been incorporated by ${factionName(e.overlordFactionId)}`;
```

   (Task 6 rebuilds this screen fully; these are compile-and-log patches.)
2. `src/main.ts` - `playCard` call sites gain the rng argument:
   - `game = playCard(game, index);` -> `game = playCard(game, index, rng);`
   - `game = playCard(game, idx, faction);` -> `game = playCard(game, idx, rng, faction);`
   - the `runAiTurns` loop: `game = endTurn(aiTurn(game), rng);` -> `game = endTurn(aiTurn(game, rng), rng);`
3. `tests/hud.test.ts` - mechanical: `playCard(g, 0)` -> `playCard(g, 0, seededRng(1))` (and similar); any test that relied on the old auto-subjugation game-over now constructs the ending directly, e.g. the overlay test becomes:

```ts
  it("shows the defeat overlay naming the incorporator", () => {
    const { container, cb, hud } = setup();
    let g = playing();
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 2, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    expect(g.phase).toBe("defeat");
    hud.update(g);
    const overlay = q(container, ".gameover-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".gameover-reason").textContent).toBe(
      "Your realm has been incorporated by Gamma",
    );
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    (overlay.querySelector(".menu-new-game") as HTMLElement).click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });
```

   Tests that walked turns with `endTurn` keep working through the shim. Tests asserting the opening draw text (`/^You drew /`) still pass (opening hand is silent, the turn draw still logs). Deck-count fallout from the opening hand: the pile-count expectation from Task 1 changes again, `"9"` -> `"6"` (10 - 3 opening - 1 draw), and the visual-piles card-back expectation drops from 3 layers to 2 (`pileLayers(6) === 2`). If a log test assumed hand length 1 at turn 1, adapt using `withHand` (the human now holds 4 cards on turn 1). Document every hud.test edit in your report.

- [ ] **Step 5: Run everything, commit**

Run: `npm test && npm run build` - expected: PASS.

```bash
git add src/game.ts src/hud.ts src/main.ts tests/game.test.ts tests/hud.test.ts
git commit -m "feat(balticmap): rules v2 game core - stored subjugation, tribute, endings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: AI policy v2

**Files:**
- Create: `src/ai.ts`
- Modify: `src/game.ts` (aiTurn delegates)
- Test: `tests/ai.test.ts`

**Interfaces:**
- Consumes: Task 4 (`GameState`, `playCard`, `discardCard`, `viewOf`, `TributeTrack`), Task 3 (`playableSet`, `validTargetsFor`, `SUBJUGATE_THRESHOLD`), Task 2 (`leadsOf`).
- Produces:
  - `type AiAction = { type: "play"; cardIndex: number; targetId?: string; tributeTrack?: TributeTrack } | { type: "discard"; cardIndex: number }`
  - `chooseAction(state: GameState): AiAction` (deterministic, RNG-free)
  - `aiTakeTurn(state: GameState, rng: Rng): GameState`
  - `game.ts`'s `aiTurn(state, rng)` becomes `aiTakeTurn(state, rng)` re-exported behavior (SHIM label removed; it stays as the public entry).

- [ ] **Step 1: Write the failing tests**

Create `tests/ai.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { chooseAction } from "../src/ai";
import {
  newGame, startGame, pickFaction, type GameState,
} from "../src/game";
import { bumpMight, bumpStatus, type Relations } from "../src/relations";
import type { Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function base(): GameState {
  // human is beta; make alpha (player 2, index 1) the actor
  const g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  return { ...g, current: 1 };
}

function withHand(g: GameState, hand: string[]): GameState {
  const p = { ...g.players[1], hand };
  return { ...g, players: g.players.map((pl, i) => (i === 1 ? p : pl)) };
}

function lead(rel: Relations, actor: string, target: string, n: number): Relations {
  let out = rel;
  for (let i = 0; i < n; i++) out = bumpMight(out, actor, target);
  return out;
}

describe("chooseAction priorities", () => {
  it("1: tribute first, feeding the overlord's weaker track", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    // gamma leads alpha by 2 might, 0 status -> weaker track is status
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 2) };
    g = withHand(g, ["raid", "pay-tribute"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, tributeTrack: "status",
    });
  });

  it("1: tribute track tie goes to might", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["pay-tribute"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, tributeTrack: "might",
    });
  });

  it("2: reclaim when playable", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    g = withHand(g, ["grow-crops", "reclaim-independence"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 1 });
  });

  it("3: incorporate the first vassal", () => {
    let g = base();
    g = { ...g, overlords: new Map([["delta", "alpha"], ["gamma", "alpha"]]) };
    g = withHand(g, ["subjugate", "incorporate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma", // faction order
    });
  });

  it("4: subjugate the biggest lead", () => {
    let g = base();
    let rel = lead(g.relations, "alpha", "beta", 2);
    rel = lead(rel, "alpha", "gamma", 3);
    g = { ...g, relations: rel };
    g = withHand(g, ["raid", "subjugate"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "gamma",
    });
  });

  it("5: finish a deficit-1 target before generic building", () => {
    let g = base();
    // alpha already leads gamma by 1 might; delta untouched
    g = { ...g, relations: lead(g.relations, "alpha", "gamma", 1) };
    g = withHand(g, ["raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 0, targetId: "gamma",
    });
  });

  it("6: fortify defensively when out-mighted", () => {
    let g = base();
    g = { ...g, relations: lead(g.relations, "gamma", "alpha", 1) };
    g = withHand(g, ["fortify", "grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("7: otherwise build toward the closest target, raid over marriage, faction order", () => {
    let g = base();
    g = withHand(g, ["shrewd-marriage", "raid"]);
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });

  it("8: grow crops as filler", () => {
    let g = base();
    g = { ...g, overlords: new Map([["alpha", "gamma"]]) };
    // subjugated: no raid on overlord; gamma is only... beta and delta remain raidable
    g = withHand(g, ["grow-crops"]);
    expect(chooseAction(g)).toEqual({ type: "play", cardIndex: 0 });
  });

  it("9: discards leftmost when nothing is playable", () => {
    let g = base();
    g = withHand(g, ["subjugate", "incorporate"]);
    expect(chooseAction(g)).toEqual({ type: "discard", cardIndex: 0 });
  });

  it("fortify is not wasted when unthreatened", () => {
    let g = base();
    g = withHand(g, ["fortify", "raid"]);
    // no one leads alpha: prefer building with raid (priority 7 over 6's gate)
    expect(chooseAction(g)).toEqual({
      type: "play", cardIndex: 1, targetId: "beta",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/ai.test.ts`
Expected: FAIL - cannot resolve `../src/ai`.

- [ ] **Step 3: Implement `src/ai.ts`**

```ts
import { CARDS, type Rng } from "./cards";
import { leadsOf } from "./relations";
import {
  SUBJUGATE_THRESHOLD, playableSet, validTargetsFor,
} from "./playability";
import {
  discardCard, playCard, viewOf,
  type GameState, type TributeTrack,
} from "./game";

export type AiAction =
  | { type: "play"; cardIndex: number; targetId?: string; tributeTrack?: TributeTrack }
  | { type: "discard"; cardIndex: number };

const TRACKS = [
  { cardId: "raid", field: "might" as const },
  { cardId: "shrewd-marriage", field: "status" as const },
];

/** Deterministic policy v2; see the rules-v2 spec, "AI policy v2". */
export function chooseAction(state: GameState): AiAction {
  const p = state.players[state.current];
  const v = viewOf(state);
  const set = playableSet(v, p.factionId, p.hand);
  if (set.mode === "discard") return { type: "discard", cardIndex: 0 };
  const idxOf = (id: string): number | undefined =>
    set.cardIndexes.find((i) => p.hand[i] === id);

  // 1: forced tribute, feeding the overlord's weaker track
  const tribute = idxOf("pay-tribute");
  if (tribute !== undefined) {
    const lord = state.overlords.get(p.factionId)!;
    const l = leadsOf(state.relations, lord, p.factionId);
    const track: TributeTrack = l.status < l.might ? "status" : "might";
    return { type: "play", cardIndex: tribute, tributeTrack: track };
  }

  // 2: reclaim independence
  const reclaim = idxOf("reclaim-independence");
  if (reclaim !== undefined) return { type: "play", cardIndex: reclaim };

  // 3: incorporate the first vassal in faction order
  const incorporate = idxOf("incorporate");
  if (incorporate !== undefined) {
    const t = validTargetsFor(v, p.factionId, "incorporate")[0];
    if (t !== undefined) return { type: "play", cardIndex: incorporate, targetId: t };
  }

  // 4: subjugate the biggest lead
  const subjugate = idxOf("subjugate");
  if (subjugate !== undefined) {
    const targets = validTargetsFor(v, p.factionId, "subjugate");
    if (targets.length > 0) {
      let best = targets[0];
      let bestLead = -Infinity;
      for (const t of targets) {
        const l = leadsOf(state.relations, p.factionId, t);
        const m = Math.max(l.status, l.might);
        if (m > bestLead) {
          best = t;
          bestLead = m;
        }
      }
      return { type: "play", cardIndex: subjugate, targetId: best };
    }
  }

  // 5: one play away from the threshold
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      if (leadsOf(state.relations, p.factionId, t)[field] === SUBJUGATE_THRESHOLD - 1) {
        return { type: "play", cardIndex: i, targetId: t };
      }
    }
  }

  // 6: defensive fortify
  const fortify = idxOf("fortify");
  if (fortify !== undefined) {
    const threatened = state.factionIds.some(
      (f) =>
        f !== p.factionId &&
        !(f in state.incorporated) &&
        !state.overlords.has(f) &&
        leadsOf(state.relations, f, p.factionId).might >= 1,
    );
    if (threatened) return { type: "play", cardIndex: fortify };
  }

  // 7: build toward the closest new subjugation
  let build: { cardIndex: number; targetId: string; deficit: number; order: number } | null = null;
  for (const { cardId, field } of TRACKS) {
    const i = idxOf(cardId);
    if (i === undefined) continue;
    for (const t of validTargetsFor(v, p.factionId, cardId)) {
      if (state.overlords.get(t) === p.factionId) continue;
      const deficit = SUBJUGATE_THRESHOLD - leadsOf(state.relations, p.factionId, t)[field];
      const order = state.factionIds.indexOf(t);
      if (
        build === null ||
        deficit < build.deficit ||
        (deficit === build.deficit && order < build.order)
      ) {
        build = { cardIndex: i, targetId: t, deficit, order };
      }
    }
  }
  if (build !== null) {
    return { type: "play", cardIndex: build.cardIndex, targetId: build.targetId };
  }

  // 8: grow crops
  const grow = idxOf("grow-crops");
  if (grow !== undefined) return { type: "play", cardIndex: grow };

  // 9: first playable card as a last resort
  const i0 = set.cardIndexes[0];
  const cardId = p.hand[i0];
  if (CARDS[cardId]?.targeted) {
    return {
      type: "play", cardIndex: i0,
      targetId: validTargetsFor(v, p.factionId, cardId)[0],
    };
  }
  return { type: "play", cardIndex: i0 };
}

export function aiTakeTurn(state: GameState, rng: Rng): GameState {
  const a = chooseAction(state);
  return a.type === "discard"
    ? discardCard(state, a.cardIndex)
    : playCard(state, a.cardIndex, rng, a.targetId, a.tributeTrack);
}
```

- [ ] **Step 4: Retire the aiTurn SHIM**

Do NOT re-export `aiTakeTurn` from `src/game.ts` - that would create an import cycle (`ai.ts` imports from `game.ts`). Instead DELETE the SHIM `aiTurn` from `src/game.ts` entirely, and update the consumers:

- `src/main.ts`: import `aiTakeTurn` from `./ai`; the loop becomes
  `game = endTurn(aiTakeTurn(game, rng), rng);` and remove `aiTurn` from the game import list.
- `tests/game.test.ts`: delete the `describe("aiTurn shim", ...)` block and the `aiTurn` import (`tests/ai.test.ts` now owns AI coverage).
- `tests/hud.test.ts`: if it still imports/uses `aiTurn`, replace those usages with `aiTakeTurn` imported from `../src/ai`.

- [ ] **Step 5: Run everything, commit**

Run: `npm test && npm run build` - expected: PASS.

```bash
git add src/ai.ts src/game.ts src/main.ts tests/ai.test.ts tests/game.test.ts tests/hud.test.ts
git commit -m "feat(balticmap): deterministic AI policy v2

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: HUD v2 - prompts and post-mortem

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: Task 4 state/phases/events; `leadsOf`, `realmOf` from relations (pure, for the post-mortem numbers).
- Produces:
  - `HudCallbacks`: `onEndTurn` becomes OPTIONAL (`onEndTurn?(): void`, dead; removed in Task 7); adds `onTributeTrack?(track: "status" | "might"): void` and `isDiscardMode?(): boolean` (default false).
  - `Hud` gains `setTributePrompt(show: boolean): void`.
  - The End Turn button is REMOVED from the DOM.
  - Discard mode: all hand cards enabled with class `discard-hint`; status text "No playable card - discard one".
  - Post-mortem overlay replaces the gameover overlay: `.postmortem-overlay` containing `.pm-summary` (`.pm-title` via `.menu-title`, `.pm-cause`, `.pm-buildup`, `.pm-deltas`, `.pm-seen` with `.pm-card` children, `.menu-new-game`) and `.pm-log` (full log copy).
  - Status bar hidden in `victory`/`defeat` phases.

- [ ] **Step 1: Write the failing tests**

In `tests/hud.test.ts`:

- delete tests/assertions about the End Turn button (`.end-turn` in "renders the human turn..." and any standalone End Turn coverage) and remove `onEndTurn` from `setup()`'s callbacks;
- delete the Task-4-era defeat overlay test ("shows the defeat overlay naming the incorporator") - the post-mortem test below replaces it;
- update every `"Turn 1 - your turn"` expectation to `"Turn 1 - play a card"` (the human-turn status text changes in this task; the setArmed-restore test is affected too).

Then add a new describe block (adjust `setup()` to accept an options object `{ canPlayCard?, isDiscardMode? }` merged into `cb`, always including `onTributeTrack: vi.fn()`; existing `setup(fn)` callers become `setup({ canPlayCard: fn })`):

```ts
describe("hud v2", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("has no End Turn button", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(container.querySelector(".end-turn")).toBeNull();
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
  });

  it("discard mode enables all cards and prompts", () => {
    const { container, cb, hud } = setup({ isDiscardMode: () => true });
    const g = withHand(playing(), 0, ["subjugate", "incorporate"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe(
      "No playable card - discard one",
    );
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards.every((c) => !c.disabled)).toBe(true);
    expect(cards.every((c) => c.classList.contains("discard-hint"))).toBe(true);
    cards[1].click();
    expect(cb.onPlayCard).toHaveBeenCalledWith(1);
  });

  it("tribute prompt swaps the status bar to track buttons", () => {
    const { container, cb, hud } = setup();
    hud.update(playing());
    hud.setTributePrompt(true);
    const buttons = [...container.querySelectorAll(".tribute-btn")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Might", "Status"]);
    (buttons[1] as HTMLElement).click();
    expect(cb.onTributeTrack).toHaveBeenCalledWith("status");
    hud.setTributePrompt(false);
    expect(container.querySelectorAll(".tribute-btn")).toHaveLength(0);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
  });

  it("defeat shows the post-mortem with cause, build-up, seen cards, and log", () => {
    const { container, cb, hud } = setup();
    let g = playing();
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 2, ["raid"]);
    g = playCard(g, 0, seededRng(1), "beta"); // gamma raids you (seen)
    g = { ...g, playedThisTurn: false };
    g = withHand(g, 2, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    expect(g.phase).toBe("defeat");
    hud.update(g);
    const pm = q(container, ".postmortem-overlay");
    expect(pm.classList.contains("hidden")).toBe(false);
    expect(q(container, ".pm-title").textContent).toBe("Game over");
    expect(q(container, ".pm-cause").textContent).toBe("Incorporated by Gamma");
    expect(q(container, ".pm-buildup").textContent).toContain("Raid");
    expect(q(container, ".pm-seen").textContent).toContain("Raid");
    expect(q(container, ".pm-log .log-entry").textContent?.length).toBeGreaterThan(0);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    (pm.querySelector(".menu-new-game") as HTMLElement).click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });

  it("victory names the realm size", () => {
    const { container, hud } = setup();
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    let g = pickFaction(startGame(newGame(many)), "f0", seededRng(1));
    const inc: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) inc[`f${i}`] = "f0";
    g = { ...g, incorporated: inc };
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.phase).toBe("victory");
    hud.update(g);
    expect(q(container, ".pm-title").textContent).toBe("Victory");
    expect(q(container, ".pm-cause").textContent).toBe(
      "You rule the Baltic - 11 of 20 lands",
    );
  });
});
```

(Where `setup(...)` needs extension: give it an optional options object `{ canPlayCard?, isDiscardMode? }` merged into `cb`, always including `onTributeTrack: vi.fn()`. Update existing `setup(fn)` callers accordingly - the old positional `canPlayCard` argument becomes `setup({ canPlayCard: fn })`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hud.test.ts`
Expected: new tests FAIL.

- [ ] **Step 3: Implement in `src/hud.ts`**

1. `HudCallbacks`: `onEndTurn?(): void;` (deprecated comment: removed in the wiring task), add `onTributeTrack?(track: "status" | "might"): void;` and `isDiscardMode?(): boolean;`. `Hud` gains `setTributePrompt(show: boolean): void;`.
2. Delete the `endTurnBtn` element and its append; the status bar holds only `statusText` plus a `tributeButtons` span:

```ts
  const tributeButtons = document.createElement("span");
  tributeButtons.className = "tribute-buttons hidden";
  for (const track of ["might", "status"] as const) {
    const b = document.createElement("button");
    b.className = "tribute-btn";
    b.textContent = track === "might" ? "Might" : "Status";
    b.addEventListener("click", () => cb.onTributeTrack?.(track));
    tributeButtons.appendChild(b);
  }
  status.append(statusText, tributeButtons);
```

3. `renderStatus` (human turn branch):

```ts
      if (isHumanTurn(state)) {
        statusText.textContent = (cb.isDiscardMode?.() ?? false)
          ? "No playable card - discard one"
          : `Turn ${state.turn} - play a card`;
      } else {
        statusText.textContent = "Waiting on other players...";
      }
```

4. `renderHand`: in discard mode every card is enabled and clickable:

```ts
      const discardMode = canPlay && (cb.isDiscardMode?.() ?? false);
      const playable = canPlay && (discardMode || canPlayCardCb(cardId));
      card.disabled = !playable;
      card.classList.toggle("discard-hint", discardMode);
      card.classList.toggle(
        "unplayable", canPlay && !discardMode && !canPlayCardCb(cardId),
      );
```

5. Replace the gameover overlay block with the post-mortem (keep variable names local):

```ts
  const postmortem = document.createElement("div");
  postmortem.className = "postmortem-overlay hidden";
  const pmSummary = document.createElement("div");
  pmSummary.className = "pm-summary";
  const pmTitle = document.createElement("h1");
  pmTitle.className = "menu-title pm-title";
  const pmCause = document.createElement("p");
  pmCause.className = "pm-cause";
  const pmDeltas = document.createElement("p");
  pmDeltas.className = "pm-deltas";
  const pmBuildup = document.createElement("div");
  pmBuildup.className = "pm-buildup";
  const pmSeenLabel = document.createElement("p");
  pmSeenLabel.className = "pm-seen-label";
  pmSeenLabel.textContent = "Cards seen this run:";
  const pmSeen = document.createElement("div");
  pmSeen.className = "pm-seen";
  const pmNewGame = document.createElement("button");
  pmNewGame.className = "menu-new-game";
  pmNewGame.textContent = "New game";
  pmNewGame.addEventListener("click", () => cb.onNewGame());
  pmSummary.append(pmTitle, pmCause, pmDeltas, pmBuildup, pmSeenLabel, pmSeen, pmNewGame);
  const pmLog = document.createElement("div");
  pmLog.className = "pm-log";
  postmortem.append(pmSummary, pmLog);
```

Append `postmortem` in the `container.append(...)` (replacing `gameover`). Add a render function (import `leadsOf` and `realmOf` from `./relations`):

```ts
  function renderPostmortem(state: GameState): void {
    const human = state.players[0];
    const won = state.phase === "victory";
    pmTitle.textContent = won ? "Victory" : "Game over";
    if (won) {
      const size = realmOf(
        human.factionId, state.overlords, state.incorporated,
      ).length;
      pmCause.textContent = `You rule the Baltic - ${size} of 20 lands`;
      pmDeltas.textContent = "";
      pmBuildup.replaceChildren();
    } else {
      const defeatEvent = [...state.log].reverse().find((e) => e.type === "defeat");
      const killer = defeatEvent?.overlordFactionId;
      pmCause.textContent = `Incorporated by ${factionName(killer)}`;
      if (killer !== undefined) {
        const l = leadsOf(state.relations, killer, human.factionId);
        const line = (label: string, n: number) =>
          `${label}: ${n > 0 ? `they led by ${n}` : n < 0 ? `you led by ${-n}` : "even"}`;
        pmDeltas.textContent = `${line("Might", l.might)} / ${line("Status", l.status)}`;
        const killerPlayer = state.players.find((p) => p.factionId === killer);
        const plays = state.log
          .filter(
            (e) =>
              e.type === "play" &&
              e.playerId === killerPlayer?.id &&
              e.targetFactionId === human.factionId,
          )
          .slice(-5);
        pmBuildup.replaceChildren(
          ...plays.map((e) => {
            const d = document.createElement("div");
            d.className = "pm-buildup-entry";
            d.textContent = `${cardName(e.cardId)} (turn ${e.turn})`;
            return d;
          }),
        );
      }
    }
    pmSeen.replaceChildren(
      ...state.seenThisRun.map((id) => {
        const d = document.createElement("div");
        d.className = "pm-card";
        d.textContent = cardName(id);
        return d;
      }),
    );
    pmSeenLabel.classList.toggle("hidden", state.seenThisRun.length === 0);
    pmLog.replaceChildren(
      ...state.log.map((e) => {
        const d = document.createElement("div");
        d.className = "log-entry";
        d.textContent = eventText(e);
        return d;
      }),
    );
  }
```

6. `update()`: the ended check is `state.phase === "victory" || state.phase === "defeat"`:
   - status bar hidden for `main-menu` and both endings,
   - `postmortem.classList.toggle("hidden", !ended)` and call `renderPostmortem(state)` when ended,
   - the old gameover branch (goReason etc.) is gone; the standalone activity-log panel stays visible only for `playing` (the post-mortem carries its own copy: change the logPanel toggle back to `state.phase !== "playing"`).
7. `setTributePrompt(show)`:

```ts
    setTributePrompt(show) {
      tributeButtons.classList.toggle("hidden", !show);
      if (show) statusText.textContent = "Pay tribute with:";
      else if (lastState) renderStatus(lastState);
    },
```

8. `src/style.css`: replace `.gameover-overlay`/`.gameover-reason` rules with:

```css
.postmortem-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 24px;
  align-items: stretch;
  justify-content: center;
  padding: 48px;
  background: rgba(24, 32, 38, 0.88);
  z-index: 20;
}

.pm-summary {
  flex: 1.2;
  max-width: 460px;
  color: #fdfaf4;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
}

.pm-cause {
  font-size: 18px;
}

.pm-deltas {
  font-size: 13px;
  color: #d8cfc0;
}

.pm-buildup-entry {
  font-size: 12px;
  color: #e8b0a8;
}

.pm-seen-label {
  font-size: 11px;
  color: #b8b0a2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.pm-seen {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pm-card {
  width: 72px;
  height: 100px;
  border: 1px dashed #b8b0a2;
  border-radius: 6px;
  font-size: 11px;
  color: #fdfaf4;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4px;
}

.pm-log {
  flex: 1;
  max-width: 380px;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  padding: 10px 12px;
  overflow-y: auto;
  font-size: 12px;
  color: #3f3428;
}

.tribute-btn {
  font-size: 13px;
  padding: 4px 14px;
  margin-left: 8px;
  border: 1px solid #7a6a55;
  border-radius: 5px;
  background: #fdfaf4;
  color: #3f3428;
  cursor: pointer;
}

.card.discard-hint {
  outline: 2px dashed #b5544c;
  outline-offset: -2px;
}
```

Also delete the now-unused `.end-turn` rules.

- [ ] **Step 4: Run everything, commit**

Run: `npm test && npm run build` - expected: PASS. (main.ts still compiles: `onEndTurn` is optional and still passed; it is simply never fired.)

```bash
git add src/hud.ts src/style.css tests/hud.test.ts
git commit -m "feat(balticmap): hud v2 - discard and tribute prompts, post-mortem screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: wiring - turn loop, threat visuals, realm halo, cleanup

**Files:**
- Modify: `src/main.ts` (full rewrite below)
- Modify: `src/map-render.ts` (halo group + brightenColor)
- Modify: `src/panel.ts` (tooltip line support)
- Modify: `src/style.css` (threat borders, halo)
- Modify: `src/game.ts`, `src/relations.ts`, `src/hud.ts`, `tests/relations.test.ts` (SHIM/dead-code removal)

**Interfaces:**
- Consumes: everything.
- Produces: the playable feature; deletes `endTurn`, `overlordsOf`, `computeOverlords`, relations' `validTargets`, `leadOf`, the `Overlords` doc-comment updated to "stored"; `HudCallbacks.onEndTurn` removed.

- [ ] **Step 1: map-render additions**

In `src/map-render.ts`:

1. Add next to `darkenColor`:

```ts
/** Brightens a "#rrggbb" color by moving each channel toward 255 by
 *  `factor` (0..1). Used for the realm halo. */
export function brightenColor(hex: string, factor: number): string {
  const channel = (start: number): string => {
    const v = parseInt(hex.slice(start, start + 2), 16);
    const value = Math.round(v + (255 - v) * factor);
    return value.toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
```

2. In `renderMap`, create the halo group immediately BEFORE `regionsGroup` is appended, and expose it:

```ts
  const realmOutlineGroup = el("g") as SVGGElement;
  realmOutlineGroup.classList.add("realm-outline");
  svg.appendChild(realmOutlineGroup);
```

(placed after the neighbors group, before the regions group), and add `realmOutlineGroup: SVGGElement;` to `RenderResult` and the return object.

- [ ] **Step 2: tooltip line support in `src/panel.ts`**

Extend `Tooltip`:

```ts
export interface TooltipLine {
  text: string;
  tone?: "good" | "bad" | "neutral";
}

export interface Tooltip {
  show(text: string, clientX: number, clientY: number): void;
  showLines(lines: TooltipLine[], clientX: number, clientY: number): void;
  hide(): void;
}
```

In `createTooltip`, implement `showLines`:

```ts
    showLines(lines, clientX, clientY) {
      el.replaceChildren(
        ...lines.map((l) => {
          const div = document.createElement("div");
          div.className = `tooltip-line tone-${l.tone ?? "neutral"}`;
          div.textContent = l.text;
          return div;
        }),
      );
      el.style.left = `${clientX + 12}px`;
      el.style.top = `${clientY + 12}px`;
      el.classList.remove("hidden");
    },
```

(`show` keeps using `textContent`, which clears the children - no conflict.)
Add CSS next to the tooltip rules:

```css
.tooltip-line.tone-good {
  color: #7cb06a;
}

.tooltip-line.tone-bad {
  color: #e08a80;
}
```

- [ ] **Step 3: threat/halo CSS**

Add after `.region.dimmed` (before `.region.owned`):

```css
.region.threat-1 {
  stroke: #c9807a;
  stroke-width: 1.4;
}

.region.threat-2 {
  stroke: #b5544c;
  stroke-width: 2;
}

.region.threat-3 {
  stroke: #992f27;
  stroke-width: 2.6;
}

.region.advantage {
  stroke: #5d8a55;
  stroke-width: 1.4;
}

.realm-outline path {
  stroke-width: 6;
  stroke-linejoin: round;
}
```

- [ ] **Step 4: rewrite `src/main.ts`**

Full replacement:

```ts
import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor, brightenColor } from "./map-render";
import {
  createPanel, createTooltip, tooltipText, settlementTooltipText,
  type TooltipLine,
} from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, pickFaction, playCard, discardCard, advance,
  isHumanTurn, viewOf, type GameState,
} from "./game";
import { aiTakeTurn } from "./ai";
import { getRel, leadsOf, realmOf } from "./relations";
import { playableSet, validTargetsFor } from "./playability";
import { CARDS } from "./cards";
import { createHud } from "./hud";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths, settlementDots, realmOutlineGroup } = renderMap(data, app);
const tooltip = createTooltip(app);
const factionById = new Map(data.factions.map((f) => [f.id, f]));
const regionById = new Map(data.regions.map((r) => [r.id, r]));
const factionByRegion = new Map(data.regions.map((r) => [r.id, r.faction]));
const regionByFaction = new Map(data.regions.map((r) => [r.faction, r.id]));
const factionAdjacency = Object.fromEntries(
  data.regions.map((r) => [
    r.faction,
    r.adjacent.map((id) => factionByRegion.get(id)!),
  ]),
);

const rng = Math.random;
let game: GameState = newGame(data.factions.map((f) => f.id), factionAdjacency);
let armed: number | null = null; // hand index of the armed targeted card
let pendingTribute: number | null = null; // hand index awaiting a track choice

function inPlay(): boolean {
  return (
    game.phase === "playing" ||
    game.phase === "victory" ||
    game.phase === "defeat"
  );
}

function humanPlayableSet() {
  const human = game.players[0];
  return playableSet(viewOf(game), human.factionId, human.hand);
}

function discardMode(): boolean {
  return (
    isHumanTurn(game) &&
    !game.playedThisTurn &&
    humanPlayableSet().mode === "discard"
  );
}

function relationsInfo(region: Region): string[] {
  const human = game.players[0];
  if (!inPlay() || !human || region.faction === human.factionId) return [];
  const f = region.faction;
  const mine = getRel(game.relations, human.factionId, f);
  const theirs = getRel(game.relations, f, human.factionId);
  const lines = [
    `Status: yours ${mine.status} / theirs ${theirs.status}`,
    `Might: yours ${mine.might} / theirs ${theirs.might}`,
  ];
  lines.push(relationshipLine(f, human.factionId));
  if (validTargetsFor(viewOf(game), human.factionId, "subjugate").includes(f)) {
    lines.push("Subjugate available");
  }
  return lines;
}

function relationshipLine(f: string, humanFaction: string): string {
  const owner = game.incorporated[f];
  const lord = game.overlords.get(f);
  if (owner === humanFaction) return "Part of your realm (incorporated)";
  if (owner !== undefined) return `Incorporated into ${factionById.get(owner)!.name}`;
  if (lord === humanFaction) return "Your vassal";
  if (game.overlords.get(humanFaction) === f) return "Your overlord";
  if (lord === undefined) return "Independent";
  return `Vassal of ${factionById.get(lord)!.name}`;
}

const panel = createPanel(
  app, () => interaction.deselect(), data.peoples, data.factions,
  data.settlements, relationsInfo,
);

function effectiveFaction(regionFaction: string): string {
  const owner = game.incorporated[regionFaction];
  if (owner !== undefined) return game.overlords.get(owner) ?? owner;
  return game.overlords.get(regionFaction) ?? regionFaction;
}

function applyOwnership(): void {
  const human = game.players[0];
  const humanRealm = new Set(
    inPlay() && human
      ? realmOf(human.factionId, game.overlords, game.incorporated)
      : [],
  );
  for (const [id, el] of regionPaths) {
    const region = regionById.get(id)!;
    const effective = inPlay() ? effectiveFaction(region.faction) : region.faction;
    el.setAttribute("fill", factionById.get(effective)!.color);
    const owned = humanRealm.has(region.faction);
    el.classList.toggle("dimmed", inPlay() && !owned);
    el.classList.toggle("owned", owned);
    if (owned) {
      el.style.setProperty(
        "--owned-stroke",
        darkenColor(factionById.get(effective)!.color, 0.55),
      );
    } else {
      el.style.removeProperty("--owned-stroke");
    }
    applyThreat(el, region.faction, human?.factionId, humanRealm);
  }
  renderRealmHalo(human?.factionId, humanRealm);
}

function applyThreat(
  el: SVGPathElement,
  faction: string,
  humanFaction: string | undefined,
  humanRealm: Set<string>,
): void {
  let threat = 0;
  let advantage = false;
  if (
    inPlay() &&
    humanFaction !== undefined &&
    !humanRealm.has(faction) &&
    !(faction in game.incorporated)
  ) {
    const theirs = leadsOf(game.relations, faction, humanFaction);
    const yours = leadsOf(game.relations, humanFaction, faction);
    const theirBest = Math.max(theirs.status, theirs.might);
    const yourBest = Math.max(yours.status, yours.might);
    threat = Math.min(3, Math.max(0, theirBest));
    advantage = theirBest <= 0 && yourBest >= 1;
  }
  el.classList.toggle("threat-1", threat === 1);
  el.classList.toggle("threat-2", threat === 2);
  el.classList.toggle("threat-3", threat === 3);
  el.classList.toggle("advantage", advantage);
}

function renderRealmHalo(
  humanFaction: string | undefined,
  humanRealm: Set<string>,
): void {
  realmOutlineGroup.replaceChildren();
  if (!inPlay() || humanFaction === undefined) return;
  const color = brightenColor(factionById.get(humanFaction)!.color, 0.35);
  for (const factionId of humanRealm) {
    const regionId = regionByFaction.get(factionId);
    const region = regionId !== undefined ? regionById.get(regionId) : undefined;
    if (!region) continue;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", region.path);
    p.setAttribute("stroke", color);
    p.setAttribute("fill", color);
    realmOutlineGroup.appendChild(p);
  }
}

function hoverLines(region: Region): TooltipLine[] {
  const human = game.players[0];
  const base: TooltipLine[] = tooltipText(
    region, factionById.get(region.faction)!,
  )
    .split("\n")
    .map((text) => ({ text }));
  if (!inPlay() || !human || region.faction === human.factionId) return base;
  const f = region.faction;
  const delta = (label: string, n: number): TooltipLine =>
    n > 0
      ? { text: `${label}: +${n} (you lead)`, tone: "good" }
      : n < 0
        ? { text: `${label}: ${n} (they lead)`, tone: "bad" }
        : { text: `${label}: even`, tone: "neutral" };
  const yours = leadsOf(game.relations, human.factionId, f);
  base.push(delta("Might", yours.might), delta("Status", yours.status));
  base.push({ text: relationshipLine(f, human.factionId) });
  if (validTargetsFor(viewOf(game), human.factionId, "subjugate").includes(f)) {
    base.push({ text: "Subjugate available", tone: "good" });
  }
  return base;
}

function armedTargets(): string[] {
  const human = game.players[0];
  if (armed === null || !human) return [];
  return validTargetsFor(viewOf(game), human.factionId, human.hand[armed]);
}

function applyTargeting(): void {
  const targets = new Set(armedTargets().map((f) => regionByFaction.get(f)!));
  for (const [id, el] of regionPaths) {
    el.classList.toggle("target-valid", armed !== null && targets.has(id));
    el.classList.toggle("target-invalid", armed !== null && !targets.has(id));
  }
}

function disarm(): void {
  armed = null;
  applyTargeting();
  hud.setArmed(null);
}

function cancelTribute(): void {
  pendingTribute = null;
  hud.setTributePrompt(false);
}

function refresh(): void {
  applyOwnership();
  applyTargeting();
  hud.update(game);
}

/** After a completed human action: advance, then run every AI turn back to
 *  back (each AI plays or discards; the loop stops on an ending phase). */
function afterHumanAction(): void {
  game = advance(game, rng);
  refresh();
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    while (game.phase === "playing" && !isHumanTurn(game)) {
      game = advance(aiTakeTurn(game, rng), rng);
    }
    refresh();
  }, 0);
}

const hud = createHud(
  app,
  {
    onNewGame() {
      game = startGame(newGame(data.factions.map((f) => f.id), factionAdjacency));
      armed = null;
      pendingTribute = null;
      refresh();
    },
    onPlayCard(index) {
      if (!isHumanTurn(game) || game.playedThisTurn) return;
      cancelTribute();
      if (discardMode()) {
        disarm();
        game = discardCard(game, index);
        afterHumanAction();
        return;
      }
      const human = game.players[0];
      const cardId = human.hand[index];
      const card = CARDS[cardId];
      if (cardId === "pay-tribute") {
        disarm();
        pendingTribute = index;
        hud.setTributePrompt(true);
        return;
      }
      if (card?.targeted) {
        if (armed === index) {
          disarm();
          return;
        }
        armed = index;
        if (armedTargets().length === 0) {
          disarm();
          return;
        }
        applyTargeting();
        hud.setArmed(index, card.name);
        return;
      }
      disarm();
      game = playCard(game, index, rng);
      afterHumanAction();
    },
    onTributeTrack(track) {
      if (pendingTribute === null) return;
      const index = pendingTribute;
      cancelTribute();
      game = playCard(game, index, rng, undefined, track);
      afterHumanAction();
    },
    canPlayCard(cardId) {
      const human = game.players[0];
      if (!human) return true;
      const set = humanPlayableSet();
      if (set.mode === "discard") return true;
      return set.cardIndexes.some((i) => human.hand[i] === cardId);
    },
    isDiscardMode() {
      return game.players.length > 0 && discardMode();
    },
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
);
hud.update(game);

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (armed !== null) disarm();
  if (pendingTribute !== null) {
    cancelTribute();
    hud.update(game);
  }
});

const interaction = attachInteraction(svg, regionPaths, settlementDots, data, {
  onHover(region, clientX, clientY) {
    if (region) tooltip.showLines(hoverLines(region), clientX, clientY);
    else tooltip.hide();
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
    if (game.phase === "pick-faction") {
      if (regionId === null) return true;
      game = pickFaction(game, regionById.get(regionId)!.faction, rng);
      refresh();
      return true;
    }
    if (game.phase === "playing" && armed !== null) {
      const idx = armed;
      const faction = regionId !== null ? factionByRegion.get(regionId) : undefined;
      const valid = faction !== undefined && armedTargets().includes(faction);
      disarm();
      if (valid) {
        game = playCard(game, idx, rng, faction);
        afterHumanAction();
      }
      return true;
    }
    return false;
  },
});
```

- [ ] **Step 5: SHIM and dead-code removal**

1. `src/game.ts`: delete `endTurn` and `overlordsOf` (and their SHIM comments). `beginTurn` stays exported (tests use it).
2. `src/relations.ts`: delete `computeOverlords`, `validTargets`, and `leadOf`; update the `Overlords` doc comment to `/** vassal faction id -> overlord faction id (stored on GameState) */` and the `Relations` doc comment to end with "subjugation is stored on GameState, never derived."
3. `src/hud.ts`: delete the optional `onEndTurn` from `HudCallbacks`.
4. `tests/relations.test.ts`: delete the `describe("computeOverlords", ...)` and `describe("validTargets", ...)` blocks and any now-unused imports (`computeOverlords`, `validTargets`, `leadOf`). Keep `realmOf` tests (still exported) - they construct `Overlords` Maps directly, which still typechecks.
5. `tests/game.test.ts`: delete the `describe(... "legacy endTurn shim" ...)` test and the `endTurn` import; replace any remaining `endTurn(g, rng)` stepping with `advance({ ...g, playedThisTurn: true }, rng)`.
6. `tests/hud.test.ts`: same replacement for any `endTurn` usage.

- [ ] **Step 6: Run everything, commit**

Run: `npm test && npm run build` - expected: PASS, no unused-export leftovers.

```bash
git add src/main.ts src/map-render.ts src/panel.ts src/style.css src/game.ts src/relations.ts src/hud.ts tests/relations.test.ts tests/game.test.ts tests/hud.test.ts
git commit -m "feat(balticmap): rules v2 wiring - auto turns, threat borders, realm halo

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: end-to-end validation in Chrome

**Files:** none (validation; fix regressions found, with tests where unit-testable).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Note the URL.

- [ ] **Step 2: Walk the scenario**

1. New game -> pick a faction. Confirm: opening hand of 4 visible (3 + draw), no End Turn button, status "Turn 1 - play a card", realm halo (bright thick outline) around your region.
2. Play any card: your turn ends immediately and all 19 AI turns run; the map updates (threat borders start appearing as AIs raid).
3. Hover a foreign region: name plus colored Might/Status delta lines, relationship, and (when a lead >= 2 exists) "Subjugate available".
4. Raid the same neighbor twice across turns (threat border on it turns green from your side); when your lead hits 2, play Subjugate on it: it joins your realm, halo grows, log shows the subjugated entry, its player starts paying tribute (log entries).
5. Get subjugated yourself (pick a fight with a big AI or wait): confirm Pay Tribute appears in your hand and is the ONLY playable card; clicking it swaps the status bar to Might/Status buttons; choosing one plays it. Fortify and marriages on the overlord eventually enable Reclaim Independence; play it and confirm the log and freedom.
6. Force a discard turn (hand of only unplayable cards): prompt appears, click discards, turn ends.
7. Lose a run (AI incorporates you): post-mortem shows "Incorporated by X", the killer's build-up plays, final deltas, seen cards, and the full log on the right. New game resets cleanly.
8. (Optional long path) Win check: not practically reachable by hand; verified by unit tests.
9. Console: zero errors/warnings.

- [ ] **Step 3: Fix anything found, re-run `npm test`, commit fixes**

---

## Execution notes

- Tasks must run in order 1 -> 8; Tasks 4 and 7 are the big ones.
- SHIMs (`endTurn` alias, minimal `aiTurn`, optional `onEndTurn`) exist ONLY between Tasks 4 and 7; do not remove early, do not keep past Task 7.
- If a numeric log-index assertion disagrees with the real event order, assert via `log.filter(...)` instead - the contract is event content, not absolute indices.
- The learning-loop spec (deck building, persistence) is a separate follow-up plan; `seenThisRun` built here is its input.
