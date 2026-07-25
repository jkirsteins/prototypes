# Balticmap Subjugation and Incorporation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pairwise status/might relations between factions, subjugation derived from them, permanent incorporation, three new cards (Raid, Shrewd Marriage, Incorporate), AI that uses them, and a game-over screen when the human is subjugated.

**Architecture:** A new pure module `src/relations.ts` stores pairwise numbers and derives "who subjugates whom" as a pure function (greedy descending-lead walk). `src/game.ts` grows targeted card play, overlord diffing for log events, turn skipping, and a greedy AI. `src/main.ts` orchestrates targeting mode and realm-aware map coloring. Region adjacency is baked by the data pipeline from shared topology arcs plus authored sea links.

**Tech Stack:** TypeScript, Vite, Vitest (happy-dom for DOM tests), topojson in the node data pipeline.

**Spec:** `docs/superpowers/specs/2026-07-26-balticmap-subjugation-design.md` - read it before starting any task.

## Global Constraints

- All user-visible strings use only typable ASCII characters: no em dashes (use "-"), no unicode arrows or ellipsis characters (use "->", "...").
- Decks always total exactly 20 cards: 10x grow-crops, 5x raid, 3x shrewd-marriage, 2x incorporate.
- All game logic is pure functions over immutable state; DOM code lives in hud/panel/map-render; orchestration in main.ts. Never mutate a `GameState` input.
- Relations values only increase in this iteration. Subjugation is always derived, never stored; only `incorporated` is stored state.
- Faction order = order of `GameState.factionIds` (which main.ts builds from `data.factions`). All tiebreaks use this order.
- Test command: `npx vitest run tests/<file>.test.ts` for one file, `npm test` for all. Type check: `npm run build`.
- Commit after every task with a conventional message ending in:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: relations module

**Files:**
- Create: `src/relations.ts`
- Test: `tests/relations.test.ts`

**Interfaces:**
- Consumes: nothing (pure, standalone).
- Produces (later tasks import these from `./relations`):
  - `interface Relation { status: number; might: number }`
  - `type Relations = Record<string, Relation>` keyed `"actor|target"`
  - `type Overlords = Map<string, string>` (vassal id -> overlord id)
  - `type Incorporated = Record<string, string>` (vassal id -> owner id)
  - `relKey(actor: string, target: string): string`
  - `getRel(rel: Relations, actor: string, target: string): Relation`
  - `bumpStatus(rel: Relations, actor: string, target: string): Relations`
  - `bumpMight(rel: Relations, actor: string, target: string): Relations`
  - `leadOf(rel: Relations, a: string, b: string): number`
  - `computeOverlords(rel: Relations, incorporated: Incorporated, factionOrder: string[]): Overlords`
  - `realmOf(factionId: string, overlords: Overlords, incorporated: Incorporated): string[]`
  - `validTargets(factionId: string, cardId: string, overlords: Overlords, incorporated: Incorporated, adjacency: Record<string, string[]>, factionOrder: string[]): string[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/relations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  getRel, bumpStatus, bumpMight, leadOf, computeOverlords, realmOf,
  validTargets, type Relations,
} from "../src/relations";

const ORDER = ["alpha", "beta", "gamma", "delta"];
const ALL_ADJ = Object.fromEntries(
  ORDER.map((id) => [id, ORDER.filter((o) => o !== id)]),
);

describe("relation storage", () => {
  it("defaults missing pairs to 0/0", () => {
    expect(getRel({}, "alpha", "beta")).toEqual({ status: 0, might: 0 });
  });

  it("bumps are directional and do not mutate the input", () => {
    const rel: Relations = {};
    const r1 = bumpMight(rel, "alpha", "beta");
    const r2 = bumpStatus(r1, "alpha", "beta");
    expect(rel).toEqual({});
    expect(getRel(r2, "alpha", "beta")).toEqual({ status: 1, might: 1 });
    expect(getRel(r2, "beta", "alpha")).toEqual({ status: 0, might: 0 });
  });
});

describe("leadOf", () => {
  it("is the best margin across the two tracks", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta"); // alpha might 1
    rel = bumpStatus(rel, "beta", "alpha"); // beta status 1
    rel = bumpStatus(rel, "beta", "alpha"); // beta status 2
    expect(leadOf(rel, "alpha", "beta")).toBe(1); // might 1-0
    expect(leadOf(rel, "beta", "alpha")).toBe(2); // status 2-0
  });

  it("is <= 0 when nothing distinguishes the pair", () => {
    expect(leadOf({}, "alpha", "beta")).toBe(0);
  });
});

describe("computeOverlords", () => {
  it("a positive lead on either track subjugates", () => {
    const rel = bumpMight({}, "alpha", "beta");
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
    expect(o.has("alpha")).toBe(false);
  });

  it("the biggest lead wins a contested target", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "gamma", "beta");
    rel = bumpMight(rel, "gamma", "beta"); // gamma lead 2 > alpha lead 1
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("gamma");
  });

  it("equal leads fall back to faction order", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "gamma", "beta");
    rel = bumpMight(rel, "alpha", "beta");
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
  });

  it("a subjugated faction holds no vassals: its vassals are released", () => {
    let rel: Relations = {};
    // alpha leads beta by 2 (processed first), gamma leads alpha by 1
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "gamma", "alpha");
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
    expect(o.get("alpha")).toBe("gamma");
    // alpha kept beta because gamma's smaller lead was processed after -
    // now flip the magnitudes so the release path runs:
    let rel2: Relations = {};
    rel2 = bumpMight(rel2, "alpha", "beta"); // alpha -> beta lead 1
    rel2 = bumpMight(rel2, "gamma", "alpha");
    rel2 = bumpMight(rel2, "gamma", "alpha"); // gamma -> alpha lead 2, first
    const o2 = computeOverlords(rel2, {}, ORDER);
    expect(o2.get("alpha")).toBe("gamma");
    expect(o2.has("beta")).toBe(false); // alpha is subjugated, cannot keep beta
  });

  it("mutual leads: the larger lead wins, the loser gets nothing", () => {
    let rel: Relations = {};
    rel = bumpStatus(rel, "alpha", "beta");
    rel = bumpStatus(rel, "alpha", "beta"); // alpha status lead 2
    rel = bumpMight(rel, "beta", "alpha"); // beta might lead 1
    const o = computeOverlords(rel, {}, ORDER);
    expect(o.get("beta")).toBe("alpha");
    expect(o.has("alpha")).toBe(false);
  });

  it("incorporated factions are outside the computation entirely", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "alpha", "beta");
    rel = bumpMight(rel, "beta", "gamma");
    const o = computeOverlords(rel, { beta: "alpha" }, ORDER);
    expect(o.has("beta")).toBe(false);
    expect(o.has("gamma")).toBe(false); // beta's lead does not count either
  });
});

describe("realmOf", () => {
  it("is self + vassals + incorporated lands", () => {
    const rel = bumpMight({}, "alpha", "beta");
    const o = computeOverlords(rel, { gamma: "alpha" }, ORDER);
    expect(realmOf("alpha", o, { gamma: "alpha" }).sort()).toEqual(
      ["alpha", "beta", "gamma"],
    );
    expect(realmOf("delta", o, { gamma: "alpha" })).toEqual(["delta"]);
  });
});

describe("validTargets", () => {
  const LINE_ADJ = {
    alpha: ["beta"],
    beta: ["alpha", "gamma"],
    gamma: ["beta", "delta"],
    delta: ["gamma"],
  };

  it("raid/shrewd-marriage reach only factions adjacent to the realm", () => {
    const o = computeOverlords({}, {}, ORDER);
    expect(validTargets("beta", "raid", o, {}, LINE_ADJ, ORDER)).toEqual(
      ["alpha", "gamma"],
    );
    expect(
      validTargets("beta", "shrewd-marriage", o, {}, LINE_ADJ, ORDER),
    ).toEqual(["alpha", "gamma"]);
  });

  it("a vassal's neighbors extend the realm's reach", () => {
    const rel = bumpMight({}, "beta", "gamma"); // gamma is beta's vassal
    const o = computeOverlords(rel, {}, ORDER);
    expect(validTargets("beta", "raid", o, {}, LINE_ADJ, ORDER)).toEqual(
      ["alpha", "gamma", "delta"], // own vassal gamma stays targetable
    );
  });

  it("incorporated factions are never targets but extend reach", () => {
    const o = computeOverlords({}, { gamma: "beta" }, ORDER);
    expect(validTargets("beta", "raid", o, { gamma: "beta" }, LINE_ADJ, ORDER))
      .toEqual(["alpha", "delta"]);
  });

  it("incorporate targets exactly the player's current vassals", () => {
    let rel: Relations = {};
    rel = bumpMight(rel, "beta", "gamma");
    rel = bumpMight(rel, "alpha", "delta"); // some other overlord's vassal
    const o = computeOverlords(rel, {}, ORDER);
    expect(validTargets("beta", "incorporate", o, {}, LINE_ADJ, ORDER))
      .toEqual(["gamma"]);
    expect(validTargets("gamma", "incorporate", o, {}, LINE_ADJ, ORDER))
      .toEqual([]);
  });

  it("untargeted cards have no targets", () => {
    const o = computeOverlords({}, {}, ORDER);
    expect(validTargets("beta", "grow-crops", o, {}, ALL_ADJ, ORDER)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/relations.test.ts`
Expected: FAIL - cannot resolve `../src/relations`.

- [ ] **Step 3: Implement `src/relations.ts`**

```ts
export interface Relation {
  status: number;
  might: number;
}

/** Pairwise relation store keyed "actorFactionId|targetFactionId".
 *  A missing key means { status: 0, might: 0 }. Values only grow;
 *  subjugation is always derived from them, never stored. */
export type Relations = Record<string, Relation>;

/** vassal faction id -> overlord faction id (derived, see computeOverlords) */
export type Overlords = Map<string, string>;

/** vassal faction id -> owner faction id (permanent annexation) */
export type Incorporated = Record<string, string>;

export function relKey(actor: string, target: string): string {
  return `${actor}|${target}`;
}

export function getRel(rel: Relations, actor: string, target: string): Relation {
  return rel[relKey(actor, target)] ?? { status: 0, might: 0 };
}

function bump(
  rel: Relations,
  actor: string,
  target: string,
  field: "status" | "might",
): Relations {
  const cur = getRel(rel, actor, target);
  return { ...rel, [relKey(actor, target)]: { ...cur, [field]: cur[field] + 1 } };
}

export function bumpStatus(rel: Relations, actor: string, target: string): Relations {
  return bump(rel, actor, target, "status");
}

export function bumpMight(rel: Relations, actor: string, target: string): Relations {
  return bump(rel, actor, target, "might");
}

/** A's best margin over B across the two tracks; positive = A qualifies
 *  to subjugate B. */
export function leadOf(rel: Relations, a: string, b: string): number {
  const ab = getRel(rel, a, b);
  const ba = getRel(rel, b, a);
  return Math.max(ab.status - ba.status, ab.might - ba.might);
}

/** Greedy descending-lead overlord assignment. Biggest lead wins contested
 *  targets, overlords are always free factions, and a faction that becomes
 *  subjugated releases its own vassals back into the pool. */
export function computeOverlords(
  rel: Relations,
  incorporated: Incorporated,
  factionOrder: string[],
): Overlords {
  const free = factionOrder.filter((id) => !(id in incorporated));
  const index = new Map(free.map((id, i) => [id, i]));
  const edges: { actor: string; target: string; lead: number }[] = [];
  for (const actor of free) {
    for (const target of free) {
      if (actor === target) continue;
      const lead = leadOf(rel, actor, target);
      if (lead > 0) edges.push({ actor, target, lead });
    }
  }
  edges.sort(
    (a, b) =>
      b.lead - a.lead ||
      index.get(a.actor)! - index.get(b.actor)! ||
      index.get(a.target)! - index.get(b.target)!,
  );
  const overlords: Overlords = new Map();
  for (const e of edges) {
    if (overlords.has(e.target)) continue; // already claimed by a bigger lead
    if (overlords.has(e.actor)) continue; // the subjugated hold no vassals
    overlords.set(e.target, e.actor);
    for (const [vassal, lord] of overlords) {
      if (lord === e.target) overlords.delete(vassal);
    }
  }
  return overlords;
}

/** The faction ids in F's realm: itself, its vassals, its incorporated lands. */
export function realmOf(
  factionId: string,
  overlords: Overlords,
  incorporated: Incorporated,
): string[] {
  const out = [factionId];
  for (const [vassal, lord] of overlords) {
    if (lord === factionId) out.push(vassal);
  }
  for (const [land, owner] of Object.entries(incorporated)) {
    if (owner === factionId) out.push(land);
  }
  return out;
}

/** Valid targets for a card, in faction order. Adjacency is keyed and
 *  valued by faction id (main.ts translates region adjacency). */
export function validTargets(
  factionId: string,
  cardId: string,
  overlords: Overlords,
  incorporated: Incorporated,
  adjacency: Record<string, string[]>,
  factionOrder: string[],
): string[] {
  if (cardId === "incorporate") {
    return factionOrder.filter((id) => overlords.get(id) === factionId);
  }
  if (cardId !== "raid" && cardId !== "shrewd-marriage") return [];
  const realm = realmOf(factionId, overlords, incorporated);
  const reach = new Set<string>();
  for (const member of realm) {
    for (const adj of adjacency[member] ?? []) reach.add(adj);
  }
  return factionOrder.filter(
    (id) => id !== factionId && !(id in incorporated) && reach.has(id),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/relations.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test` - expected: PASS (nothing else touched).

```bash
git add src/relations.ts tests/relations.test.ts
git commit -m "feat(balticmap): pairwise relations module with derived overlords

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: region adjacency in the data pipeline

**Files:**
- Modify: `scripts/prepare-data.mjs` (after the `landFeatures` block ending near line 659, and the `regions:` mapping near line 800)
- Modify: `src/types.ts` (Region interface, line 25-36)
- Modify: `tests/panel.test.ts` (add `adjacent: []` to every Region literal)
- Regenerate: `src/data/map.json` via `npm run prepare-data`
- Test: `tests/data.test.ts`

**Interfaces:**
- Consumes: existing `topo` (topojson topology) and `LANDS` in prepare-data.mjs.
- Produces: `Region.adjacent: string[]` - sorted region ids sharing a border (or an authored sea link) with this region. Later tasks translate this to faction adjacency.

- [ ] **Step 1: Write the failing tests**

Append to `tests/data.test.ts` inside the top-level `describe`:

```ts
  it("adjacency is symmetric, non-self, sorted, and never empty", () => {
    const byId = new Map(data.regions.map((r) => [r.id, r]));
    for (const r of data.regions) {
      expect(r.adjacent.length).toBeGreaterThan(0);
      expect(r.adjacent).toEqual([...r.adjacent].sort());
      expect(new Set(r.adjacent).size).toBe(r.adjacent.length);
      for (const a of r.adjacent) {
        expect(a).not.toBe(r.id);
        expect(byId.has(a)).toBe(true);
        expect(byId.get(a)!.adjacent).toContain(r.id);
      }
    }
  });

  it("saaremaa connects by sea to laanemaa and kursa", () => {
    const saaremaa = data.regions.find((r) => r.id === "saaremaa")!;
    expect(saaremaa.adjacent).toContain("laanemaa");
    expect(saaremaa.adjacent).toContain("kursa");
  });

  it("known land borders are present", () => {
    const adj = (id: string) =>
      data.regions.find((r) => r.id === id)!.adjacent;
    expect(adj("harjumaa")).toContain("ravala");
    expect(adj("zemgale")).toContain("zemaitija");
    expect(adj("dainava")).toContain("suduva");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL - `r.adjacent` is undefined.

- [ ] **Step 3: Add `adjacent` to the Region type**

In `src/types.ts`, add to the `Region` interface after `maxSettlements`:

```ts
  adjacent: string[]; // region ids sharing a border or an authored sea link
```

Add `adjacent: []` to every `Region` object literal in `tests/panel.test.ts` (there are literals like `talava`; add the property alongside `maxSettlements`). Run `npm run build` to find any other Region literal the compiler flags, and fix those the same way.

- [ ] **Step 4: Compute adjacency in the pipeline**

In `scripts/prepare-data.mjs`, insert after the `geoArea` guard loop (after line 659):

```js
// --- Region adjacency from shared topology arcs. Two lands are adjacent
// iff some member of one and some member of the other trace the same arc.
// Island factions get authored sea links (they share no land border).
const SEA_LINKS = [
  ["saaremaa", "laanemaa"],
  ["saaremaa", "kursa"],
];

function arcIdsOf(geometry) {
  const out = new Set();
  const walk = (a) => {
    if (typeof a === "number") out.add(a < 0 ? ~a : a);
    else for (const x of a) walk(x);
  };
  if (geometry.arcs) walk(geometry.arcs);
  return out;
}

const landArcs = new Map(
  LANDS.map((land) => {
    const keys = new Set([...(land.lau ?? []), ...(land.nuts ?? [])]);
    const arcs = new Set();
    for (const g of topo.objects.members.geometries) {
      if (keys.has(g.properties.key)) {
        for (const id of arcIdsOf(g)) arcs.add(id);
      }
    }
    return [land.id, arcs];
  }),
);

const adjacency = new Map(LANDS.map((l) => [l.id, new Set()]));
const landIds = LANDS.map((l) => l.id);
for (let i = 0; i < landIds.length; i++) {
  for (let j = i + 1; j < landIds.length; j++) {
    const a = landArcs.get(landIds[i]);
    const b = landArcs.get(landIds[j]);
    let shared = false;
    for (const id of a) {
      if (b.has(id)) { shared = true; break; }
    }
    if (shared) {
      adjacency.get(landIds[i]).add(landIds[j]);
      adjacency.get(landIds[j]).add(landIds[i]);
    }
  }
}
for (const [a, b] of SEA_LINKS) {
  if (!adjacency.has(a) || !adjacency.has(b)) {
    throw new Error(`Unknown region in sea link ${a}-${b}`);
  }
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
}
for (const [id, set] of adjacency) {
  if (set.size === 0) throw new Error(`Region ${id} has no adjacency`);
}
console.log(
  "Adjacency:",
  [...adjacency].map(([id, s]) => `${id}: ${[...s].sort().join(",")}`).join("; "),
);
```

Then add to the `regions:` mapping object (next to `maxSettlements`):

```js
        adjacent: [...adjacency.get(land.id)].sort(),
```

- [ ] **Step 5: Regenerate map.json and run tests**

Run: `npm run prepare-data`
Expected: succeeds, prints the adjacency table. Eyeball it against the map: no obviously-touching pair missing. If a known land border is missing (arc sharing failed between LAU-derived and NUTS-derived lands), fall back to point sharing: compare quantized coordinate pairs of member geometries instead of arc ids, and note it in the commit message.

Run: `npx vitest run tests/data.test.ts` - expected: PASS.
Run: `npm test && npm run build` - expected: PASS (panel fixtures updated).

- [ ] **Step 6: Commit**

```bash
git add scripts/prepare-data.mjs src/types.ts src/data/map.json tests/data.test.ts tests/panel.test.ts
git commit -m "feat(balticmap): bake region adjacency with sea links into map data

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: card roster and composition-agnostic tests

**Files:**
- Modify: `src/cards.ts`
- Modify: `tests/cards.test.ts`
- Modify: `tests/game.test.ts` (make card-identity assumptions explicit)
- Modify: `tests/hud.test.ts` (same)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CardDef` gains `targeted: boolean`. `CARDS` contains `grow-crops`, `raid`, `shrewd-marriage`, `incorporate`. `buildDeck()` returns the 10/5/3/2 composition (order irrelevant; decks are shuffled). `DECK_SIZE` stays 20.

- [ ] **Step 1: Update the card tests**

Replace the two card-definition/deck tests in `tests/cards.test.ts` with:

```ts
  it("defines the four card types with targeting flags", () => {
    expect(CARDS["grow-crops"]).toEqual({ id: "grow-crops", name: "Grow crops", targeted: false });
    expect(CARDS["raid"]).toEqual({ id: "raid", name: "Raid", targeted: true });
    expect(CARDS["shrewd-marriage"]).toEqual({ id: "shrewd-marriage", name: "Shrewd marriage", targeted: true });
    expect(CARDS["incorporate"]).toEqual({ id: "incorporate", name: "Incorporate", targeted: true });
  });

  it("builds a 20-card deck: 10 grow-crops, 5 raid, 3 marriage, 2 incorporate", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const count = (id: string) => deck.filter((c) => c === id).length;
    expect(count("grow-crops")).toBe(10);
    expect(count("raid")).toBe(5);
    expect(count("shrewd-marriage")).toBe(3);
    expect(count("incorporate")).toBe(2);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/cards.test.ts`
Expected: FAIL (missing cards, wrong composition).

- [ ] **Step 3: Implement the card roster**

Replace the `CARDS` and `buildDeck` definitions in `src/cards.ts`:

```ts
export interface CardDef {
  id: string;
  name: string;
  targeted: boolean;
}

export const CARDS: Record<string, CardDef> = {
  "grow-crops": { id: "grow-crops", name: "Grow crops", targeted: false },
  "raid": { id: "raid", name: "Raid", targeted: true },
  "shrewd-marriage": { id: "shrewd-marriage", name: "Shrewd marriage", targeted: true },
  "incorporate": { id: "incorporate", name: "Incorporate", targeted: true },
};

export const DECK_SIZE = 20;

const DECK_COMPOSITION: [string, number][] = [
  ["grow-crops", 10],
  ["raid", 5],
  ["shrewd-marriage", 3],
  ["incorporate", 2],
];

export function buildDeck(): string[] {
  return DECK_COMPOSITION.flatMap(([id, n]) =>
    Array.from({ length: n }, () => id),
  );
}
```

(Keep `Rng` and `shuffle` unchanged.)

- [ ] **Step 4: Fix tests that assumed all-grow-crops decks**

Run `npm test` first to see the fallout, then fix as follows.

In `tests/game.test.ts` add two helpers below `playingState()`:

```ts
function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

/** Neutralize deck randomness for tests about cycling, not card identity. */
function allGrowCrops(g: GameState): GameState {
  return {
    ...g,
    players: g.players.map((p) => ({
      ...p,
      deck: p.deck.map(() => "grow-crops"),
      hand: p.hand.map(() => "grow-crops"),
      discard: p.discard.map(() => "grow-crops"),
    })),
  };
}
```

Then update these tests:

- "moves the card from hand to discard...": start from
  `const g = withHand(playingState(), 0, ["grow-crops"]);` (assertions unchanged).
- "ignores out-of-range indices...": start from
  `const g = withHand(playingState(), 0, ["grow-crops"]);`.
- "plays the AI's first card" (aiTurn): after `endTurn`, wrap:
  `const g = withHand(endTurn(playingState(), seededRng(6)), 1, ["grow-crops"]);`.
- "the full cycle keeps decks cycling...": start from
  `let g = allGrowCrops(playingState());` (rest unchanged).
- "starts empty and records the opening draw": replace the exact log with:

```ts
    const g = playingState();
    expect(g.log).toEqual([
      { turn: 1, playerId: 1, type: "draw", cardId: g.players[0].hand[0] },
    ]);
```

- "records plays with the card id":

```ts
    const g = withHand(playingState(), 0, ["grow-crops"]);
    const played = playCard(g, 0);
    expect(played.log.at(-1)).toEqual({
      turn: 1, playerId: 1, type: "play", cardId: "grow-crops",
    });
```

- "records AI draws on endTurn":

```ts
    const g = endTurn(playingState(), seededRng(3));
    expect(g.log.at(-1)).toEqual({
      turn: 1, playerId: 2, type: "draw", cardId: g.players[1].hand.at(-1),
    });
```

In `tests/hud.test.ts` add the same `withHand` helper (import `GameState` from `../src/game`), then:

- "renders the human turn...": build
  `const g = withHand(pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1)), 0, ["grow-crops"]);`
  (the deck count stays 19 because withHand only replaces the hand).
- "names your cards, hides AI draws, and shows AI plays": force hands before
  each action and loosen draw texts:

```ts
    let g = playing();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0);
    g = endTurn(g, seededRng(2));
    g = withHand(g, 1, ["grow-crops"]);
    g = aiTurn(g);
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts[0]).toMatch(/^You drew /);
    expect(texts[1]).toBe("You played Grow crops");
    expect(texts[2]).toBe("Player 2 drew a card");
    expect(texts[3]).toMatch(/^Player 2 played /);
```

- "resets the entries when a new game starts": force the human hand with
  `withHand` before `playCard` the same way.
- "flies the played card face-up on your play": use
  `g = withHand(g, 0, ["grow-crops"]);` before `playCard(g, 0)` so the flying
  card text stays "Grow crops".
- "does not animate AI actions...": the reshuffle segment already forces
  grow-crops discards; wrap the initial play with `withHand(g, 0, ["grow-crops"])`.
- "disables remaining cards after playing one this turn": wrap with
  `g = withHand(g, 0, ["grow-crops", "grow-crops"]);` before `playCard`.

- [ ] **Step 5: Run all tests, verify pass, commit**

Run: `npm test` - expected: PASS.
Note: aiTurn still plays `playCard(state, 0)` untargeted at this point; a
targeted first card simply no-ops, which no remaining test depends on.

```bash
git add src/cards.ts tests/cards.test.ts tests/game.test.ts tests/hud.test.ts
git commit -m "feat(balticmap): raid, shrewd marriage, incorporate card roster

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: targeted card play, effects, and game over

**Files:**
- Modify: `src/game.ts`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: Task 1 (`relations.ts`), Task 3 (`CARDS.targeted`).
- Produces:
  - `GameEventType` adds `"subjugated" | "released" | "incorporated" | "game-over"`.
  - `GameEvent` gains optional `targetFactionId?: string` and `overlordFactionId?: string`.
  - `GamePhase` adds `"game-over"`.
  - `GameState` gains `relations: Relations`, `incorporated: Incorporated`, `adjacency: Record<string, string[]>`.
  - `newGame(factionIds: string[], adjacency?: Record<string, string[]>)` - omitted adjacency defaults to fully connected (test convenience).
  - `playCard(state, cardIndex, targetId?)` - targeted cards require a valid `targetId`.
  - `overlordsOf(state: GameState): Overlords` - convenience wrapper.

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts`:

First adjust the imports at the top of the file: add `overlordsOf` to the
`../src/game` import list and add a new line
`import { getRel, bumpMight } from "../src/relations";`.

```ts
describe("targeted card play", () => {
  const LINE_ADJ = {
    alpha: ["beta"],
    beta: ["alpha", "gamma"],
    gamma: ["beta", "delta"],
    delta: ["gamma"],
  };

  function lineState(): GameState {
    return pickFaction(
      startGame(newGame(FACTIONS, LINE_ADJ)), "beta", seededRng(1),
    );
  }

  it("raid bumps might and subjugates on a positive lead", () => {
    const g = withHand(lineState(), 0, ["raid"]);
    const after = playCard(g, 0, "alpha");
    expect(getRel(after.relations, "beta", "alpha").might).toBe(1);
    expect(overlordsOf(after).get("alpha")).toBe("beta");
    expect(after.log.at(-2)).toMatchObject({
      type: "play", cardId: "raid", targetFactionId: "alpha",
    });
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
    });
  });

  it("shrewd marriage bumps status the same way", () => {
    const g = withHand(lineState(), 0, ["shrewd-marriage"]);
    const after = playCard(g, 0, "gamma");
    expect(getRel(after.relations, "beta", "gamma").status).toBe(1);
    expect(overlordsOf(after).get("gamma")).toBe("beta");
  });

  it("rejects a targeted card without a target or out of reach", () => {
    const g = withHand(lineState(), 0, ["raid"]);
    expect(playCard(g, 0)).toBe(g);
    expect(playCard(g, 0, "delta")).toBe(g); // not adjacent to beta's realm
    expect(playCard(g, 0, "beta")).toBe(g); // never self
  });

  it("incorporate annexes a vassal permanently, with a log entry", () => {
    let g = lineState();
    g = { ...g, relations: bumpMight(g.relations, "beta", "alpha") };
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, "alpha");
    expect(after.incorporated).toEqual({ alpha: "beta" });
    expect(overlordsOf(after).has("alpha")).toBe(false);
    const types = after.log.map((e) => e.type);
    expect(types).toContain("incorporated");
    expect(types.filter((t) => t === "released")).toHaveLength(0);
  });

  it("incorporate rejects non-vassals", () => {
    const g = withHand(lineState(), 0, ["incorporate"]);
    expect(playCard(g, 0, "alpha")).toBe(g);
  });

  it("poaching logs a subjugated event with the new overlord", () => {
    let g = lineState();
    // gamma starts as alpha's vassal (relations can be seeded directly;
    // adjacency only constrains card play, not stored numbers)
    g = { ...g, relations: bumpMight(g.relations, "alpha", "gamma") };
    g = withHand(g, 0, ["raid"]);
    let after = playCard(g, 0, "gamma"); // beta 1 vs alpha 1: alpha keeps (order)
    expect(overlordsOf(after).get("gamma")).toBe("alpha");
    after = { ...after, playedThisTurn: false };
    after = withHand(after, 0, ["raid"]);
    after = playCard(after, 0, "gamma"); // beta lead 2 beats alpha lead 1
    expect(overlordsOf(after).get("gamma")).toBe("beta");
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "gamma", overlordFactionId: "beta",
    });
  });

  it("subjugating the human ends the game", () => {
    let g = lineState();
    g = { ...g, current: 2 }; // player 3 = gamma
    g = withHand(g, 2, ["raid"]);
    const after = playCard(g, 0, "beta");
    expect(after.phase).toBe("game-over");
    expect(after.log.at(-1)).toMatchObject({
      type: "game-over", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("newGame without adjacency connects everyone (test default)", () => {
    const g = newGame(FACTIONS);
    expect(g.adjacency["alpha"].sort()).toEqual(["beta", "delta", "gamma"]);
    expect(g.relations).toEqual({});
    expect(g.incorporated).toEqual({});
  });
});
```

Fix the imports at the top of the file: add `overlordsOf` to the `../src/game` import and add `import { getRel, bumpMight } from "../src/relations";`. In the "subjugating the human" test the card index is 0 (hand was forced) - write it plainly as `playCard(g, 0, "beta")`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts`
Expected: FAIL - `relations`/`overlordsOf` missing, playCard signature.

- [ ] **Step 3: Implement in `src/game.ts`**

Imports and types:

```ts
import { buildDeck, shuffle, CARDS, type Rng } from "./cards";
import {
  bumpMight, bumpStatus, computeOverlords, validTargets,
  type Incorporated, type Overlords, type Relations,
} from "./relations";

export type GameEventType =
  | "draw" | "play" | "reshuffle"
  | "subjugated" | "released" | "incorporated" | "game-over";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // present for draw and play
  targetFactionId?: string; // play target / affected faction
  overlordFactionId?: string; // subjugated, incorporated, game-over
}

export type GamePhase = "main-menu" | "pick-faction" | "playing" | "game-over";
```

`GameState` gains three fields; `newGame` fills them:

```ts
export interface GameState {
  phase: GamePhase;
  turn: number;
  players: PlayerState[];
  current: number;
  playedThisTurn: boolean;
  factionIds: string[];
  relations: Relations;
  incorporated: Incorporated;
  adjacency: Record<string, string[]>; // faction id -> adjacent faction ids
  log: GameEvent[];
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
    incorporated: {},
    adjacency:
      adjacency ??
      Object.fromEntries(
        factionIds.map((id) => [id, factionIds.filter((o) => o !== id)]),
      ),
    log: [],
  };
}

export function overlordsOf(state: GameState): Overlords {
  return computeOverlords(state.relations, state.incorporated, state.factionIds);
}
```

Replace `playCard` entirely:

```ts
export function playCard(
  state: GameState,
  cardIndex: number,
  targetId?: string,
): GameState {
  if (state.phase !== "playing" || state.playedThisTurn) return state;
  const p = state.players[state.current];
  if (cardIndex < 0 || cardIndex >= p.hand.length) return state;
  const cardId = p.hand[cardIndex];
  const card = CARDS[cardId];
  const before = overlordsOf(state);

  let relations = state.relations;
  let incorporated = state.incorporated;
  if (card?.targeted) {
    const targets = validTargets(
      p.factionId, cardId, before, incorporated, state.adjacency, state.factionIds,
    );
    if (targetId === undefined || !targets.includes(targetId)) return state;
    if (cardId === "raid") {
      relations = bumpMight(relations, p.factionId, targetId);
    } else if (cardId === "shrewd-marriage") {
      relations = bumpStatus(relations, p.factionId, targetId);
    } else if (cardId === "incorporate") {
      incorporated = { ...incorporated, [targetId]: p.factionId };
    }
  }

  const updated = {
    ...p,
    hand: p.hand.filter((_, i) => i !== cardIndex),
    discard: [...p.discard, cardId],
  };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );

  const events: GameEvent[] = [
    {
      turn: state.turn, playerId: p.id, type: "play", cardId,
      ...(card?.targeted && targetId !== undefined
        ? { targetFactionId: targetId }
        : {}),
    },
  ];
  if (cardId === "incorporate" && targetId !== undefined) {
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  }

  const after = computeOverlords(relations, incorporated, state.factionIds);
  for (const f of state.factionIds) {
    if (f in incorporated) continue; // annexation logged above, not a release
    const was = before.get(f);
    const is = after.get(f);
    if (was === is) continue;
    if (is !== undefined) {
      events.push({
        turn: state.turn, playerId: p.id, type: "subjugated",
        targetFactionId: f, overlordFactionId: is,
      });
    } else {
      events.push({
        turn: state.turn, playerId: p.id, type: "released", targetFactionId: f,
      });
    }
  }

  let phase = state.phase;
  const humanFaction = players[0]?.factionId;
  const humanOverlord =
    humanFaction !== undefined ? after.get(humanFaction) : undefined;
  if (humanOverlord !== undefined) {
    phase = "game-over";
    events.push({
      turn: state.turn, playerId: p.id, type: "game-over",
      targetFactionId: humanFaction, overlordFactionId: humanOverlord,
    });
  }

  return {
    ...state, phase, players, relations, incorporated,
    log: [...state.log, ...events], playedThisTurn: true,
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run tests/game.test.ts` then `npm test`
Expected: PASS. (aiTurn still calls `playCard(state, 0)`; targeted cards
no-op for the AI until Task 6 - existing tests force grow-crops hands.)

- [ ] **Step 5: Commit**

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): targeted card play, relation effects, game over

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: subjugated players skip turns

**Files:**
- Modify: `src/game.ts` (endTurn)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `overlordsOf` (Task 4).
- Produces: `endTurn` lands only on free players (the human is never skipped; a subjugated human means game over already happened).

- [ ] **Step 1: Write the failing tests**

Append to `tests/game.test.ts`:

```ts
describe("turn skipping", () => {
  it("skips subjugated players and still increments the turn on wrap", () => {
    let g = playingState(); // players: beta(you), alpha, gamma, delta
    g = { ...g, relations: bumpMight(g.relations, "gamma", "alpha") };
    const after = endTurn(g, seededRng(7)); // alpha (index 1) is a vassal
    expect(after.current).toBe(2); // gamma acts next
    expect(after.players[1].hand).toHaveLength(0); // no draw for alpha
    let wrapped = endTurn(after, seededRng(7)); // delta
    wrapped = endTurn(wrapped, seededRng(7)); // back to you
    expect(wrapped.current).toBe(0);
    expect(wrapped.turn).toBe(2);
  });

  it("skips incorporated players", () => {
    let g = playingState();
    g = { ...g, incorporated: { alpha: "beta" } };
    const after = endTurn(g, seededRng(7));
    expect(after.current).toBe(2);
  });

  it("wraps to the human even when every AI is inert", () => {
    let g = playingState();
    let rel = g.relations;
    rel = bumpMight(rel, "beta", "alpha");
    rel = bumpMight(rel, "beta", "gamma");
    rel = bumpMight(rel, "beta", "delta");
    g = { ...g, relations: rel };
    const after = endTurn(g, seededRng(7));
    expect(after.current).toBe(0);
    expect(after.turn).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts`
Expected: FAIL - endTurn lands on index 1.

- [ ] **Step 3: Implement**

Replace `endTurn` in `src/game.ts`:

```ts
export function endTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing") return state;
  const overlords = overlordsOf(state);
  const inert = (i: number): boolean => {
    const f = state.players[i].factionId;
    return overlords.has(f) || f in state.incorporated;
  };
  let current = state.current;
  let turn = state.turn;
  do {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
  } while (current !== 0 && inert(current));
  return beginTurn({ ...state, current, turn }, rng);
}
```

(The `current !== 0` guard makes the loop total: the human is never skipped.
During `playing` the human cannot be subjugated - that flips the phase to
`game-over` inside `playCard`.)

- [ ] **Step 4: Run tests, verify pass, commit**

Run: `npm test` - expected: PASS.

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): subjugated and incorporated players skip turns

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: greedy AI policy

**Files:**
- Modify: `src/game.ts` (aiTurn)
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `overlordsOf`, `validTargets`, `getRel`, `CARDS` (Tasks 1, 3, 4).
- Produces: `aiTurn(state)` - deterministic, RNG-free: incorporate a vassal first; else the raid/marriage play closest to a new subjugation (excluding own vassals); else grow-crops; else first playable card; else no play.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe("aiTurn", ...)` block content additions - keep
the three existing tests (they still pass: forced grow-crops hands) and add:

```ts
  it("incorporates its first vassal before anything else", () => {
    let g = endTurn(playingState(), seededRng(6)); // alpha (player 2) acts
    g = { ...g, relations: bumpMight(g.relations, "alpha", "gamma") };
    g = withHand(g, 1, ["raid", "incorporate"]);
    const after = aiTurn(g);
    expect(after.incorporated).toEqual({ gamma: "alpha" });
  });

  it("raids the target closest to a new subjugation", () => {
    let g = endTurn(playingState(), seededRng(6)); // alpha (player 2) acts
    // beta raided alpha earlier, so alpha's might deficit vs beta is 2
    // while gamma and delta stay at 1. (This makes alpha beta's vassal;
    // aiTurn does not skip - only endTurn does - so the policy is still
    // exercised directly.)
    g = { ...g, relations: bumpMight(g.relations, "beta", "alpha") };
    g = withHand(g, 1, ["raid"]);
    const after = aiTurn(g);
    // equal smallest deficits (gamma, delta) fall back to faction order
    expect(after.log.filter((e) => e.type === "play").at(-1)).toMatchObject({
      cardId: "raid", targetFactionId: "gamma",
    });
  });

  it("prefers raid over marriage at equal deficit", () => {
    let g = endTurn(playingState(), seededRng(6)); // alpha acts
    g = withHand(g, 1, ["shrewd-marriage", "raid"]);
    const after = aiTurn(g);
    // all deficits equal 1 -> first faction in order (beta), raid first;
    // beta is the human, so this play also flips the phase to game-over
    expect(after.log.filter((e) => e.type === "play").at(-1)).toMatchObject({
      cardId: "raid", targetFactionId: "beta",
    });
    expect(after.phase).toBe("game-over");
  });

  it("expands instead of reinforcing its own vassals", () => {
    let g = endTurn(playingState(), seededRng(6)); // alpha acts
    g = { ...g, relations: bumpMight(g.relations, "alpha", "gamma") };
    g = withHand(g, 1, ["raid"]);
    const after = aiTurn(g);
    // own vassal gamma is skipped; beta is next in faction order
    expect(after.log.filter((e) => e.type === "play").at(-1)).toMatchObject({
      cardId: "raid", targetFactionId: "beta",
    });
  });

  it("falls back to grow-crops when incorporate has no vassal", () => {
    let g = endTurn(playingState(), seededRng(6));
    g = withHand(g, 1, ["incorporate", "grow-crops"]);
    const after = aiTurn(g);
    expect(after.log.at(-1)).toMatchObject({
      type: "play", cardId: "grow-crops",
    });
  });

  it("passes when nothing is playable", () => {
    let g = endTurn(playingState(), seededRng(6));
    g = withHand(g, 1, ["incorporate"]);
    expect(aiTurn(g)).toBe(g);
  });
```

Notes for the implementer: `playingState()` uses the fully-connected default
adjacency and the human faction is `beta`, so AI raids on `beta` also flip
the phase to `game-over` - that is expected and asserted where relevant. All
play-event assertions use the `log.filter((e) => e.type === "play").at(-1)`
form because derived events (subjugated, game-over) land after the play
entry.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/game.test.ts`
Expected: the new tests FAIL (aiTurn still plays index 0 untargeted).

- [ ] **Step 3: Implement**

Replace `aiTurn` in `src/game.ts`:

```ts
import { getRel } from "./relations"; // add to the existing import list

/** Greedy, deterministic AI: incorporate a vassal; else the raid/marriage
 *  closest to a NEW subjugation (own vassals excluded); else grow crops;
 *  else the first playable card; else pass. */
export function aiTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  if (p.hand.length === 0) return state;
  const overlords = overlordsOf(state);
  const targetsFor = (cardId: string): string[] =>
    validTargets(
      p.factionId, cardId, overlords, state.incorporated,
      state.adjacency, state.factionIds,
    );

  const vassals = state.factionIds.filter(
    (f) => overlords.get(f) === p.factionId,
  );
  if (p.hand.includes("incorporate") && vassals.length > 0) {
    return playCard(state, p.hand.indexOf("incorporate"), vassals[0]);
  }

  const tracks = [
    { cardId: "raid", field: "might" as const },
    { cardId: "shrewd-marriage", field: "status" as const },
  ];
  let best: { cardId: string; targetId: string; deficit: number; order: number } | null = null;
  for (const t of tracks) {
    if (!p.hand.includes(t.cardId)) continue;
    for (const targetId of targetsFor(t.cardId)) {
      if (overlords.get(targetId) === p.factionId) continue; // expand, not reinforce
      const mine = getRel(state.relations, p.factionId, targetId)[t.field];
      const theirs = getRel(state.relations, targetId, p.factionId)[t.field];
      const deficit = theirs - mine + 1;
      const order = state.factionIds.indexOf(targetId);
      if (
        best === null ||
        deficit < best.deficit ||
        (deficit === best.deficit && order < best.order)
      ) {
        best = { cardId: t.cardId, targetId, deficit, order };
      }
    }
  }
  if (best !== null) {
    return playCard(state, p.hand.indexOf(best.cardId), best.targetId);
  }

  if (p.hand.includes("grow-crops")) {
    return playCard(state, p.hand.indexOf("grow-crops"));
  }

  for (let i = 0; i < p.hand.length; i++) {
    const card = CARDS[p.hand[i]];
    if (!card?.targeted) return playCard(state, i);
    const targets = targetsFor(p.hand[i]);
    if (targets.length > 0) return playCard(state, i, targets[0]);
  }
  return state;
}
```

(Raid wins ties over marriage because raid's candidates are evaluated first
and later equal candidates do not replace `best`.)

- [ ] **Step 4: Run tests, verify pass, commit**

Run: `npm test` - expected: PASS. If an assertion disagrees on log indices,
inspect the actual `after.log` and fix the test to the filter form noted in
Step 1 - the behavior contract is the played card + target, not the index.

```bash
git add src/game.ts tests/game.test.ts
git commit -m "feat(balticmap): greedy AI raids, marries, and incorporates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: HUD - event texts, unplayable cards, targeting prompt, game over

**Files:**
- Modify: `src/hud.ts`
- Modify: `src/style.css`
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: new `GameEvent` fields (Task 4), `CARDS.targeted` (Task 3).
- Produces (main.ts wires these in Task 9):
  - `createHud(container, cb, factionNames?: Map<string, string>)` - names for log/overlay texts; missing entries fall back to the raw id.
  - `HudCallbacks` gains optional `canPlayCard?(cardId: string): boolean` (default: always true). Cards where it returns false render disabled with class `unplayable`.
  - `Hud` gains `setArmed(index: number | null, cardName?: string): void` - toggles class `card-armed` on the hand card at `index` and swaps the status text to `Choose a target for <cardName>`; `setArmed(null)` restores the normal status text.
  - Game-over overlay: `.gameover-overlay` with `.gameover-title`, `.gameover-reason`, and a `.menu-new-game` button firing `onNewGame`.

- [ ] **Step 1: Write the failing tests**

In `tests/hud.test.ts`, extend `setup()`:

```ts
function setup(canPlayCard?: (cardId: string) => boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: HudCallbacks = {
    onNewGame: vi.fn(),
    onPlayCard: vi.fn(),
    onEndTurn: vi.fn(),
    ...(canPlayCard ? { canPlayCard } : {}),
  };
  const hud = createHud(container, cb, new Map([
    ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
  ]));
  return { container, cb, hud };
}
```

Append a new describe block:

```ts
describe("subjugation HUD", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("renders targeted play and subjugation log texts with faction names", () => {
    const { container, hud } = setup();
    let g = withHand(playing(), 0, ["raid"]);
    g = playCard(g, 0, "alpha");
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Raid on Alpha");
    expect(texts).toContain("Alpha submits to Beta");
  });

  it("marks cards the callback rejects as unplayable", () => {
    const { container, cb, hud } = setup((id) => id !== "incorporate");
    const g = withHand(playing(), 0, ["incorporate", "grow-crops"]);
    hud.update(g);
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards[0].disabled).toBe(true);
    expect(cards[0].classList.contains("unplayable")).toBe(true);
    expect(cards[1].disabled).toBe(false);
    cards[0].click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("setArmed highlights the card and prompts for a target", () => {
    const { container, hud } = setup();
    const g = withHand(playing(), 0, ["raid", "grow-crops"]);
    hud.update(g);
    hud.setArmed(0, "Raid");
    expect(q(container, ".status-text").textContent).toBe(
      "Choose a target for Raid",
    );
    expect(q(container, ".card").classList.contains("card-armed")).toBe(true);
    hud.setArmed(null);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - your turn");
    expect(q(container, ".card").classList.contains("card-armed")).toBe(false);
  });

  it("shows the game-over overlay naming the overlord", () => {
    const { container, cb, hud } = setup();
    let g = playing();
    g = { ...g, current: 2 };
    g = withHand(g, 2, ["raid"]);
    g = playCard(g, 0, "beta"); // gamma subjugates the human
    expect(g.phase).toBe("game-over");
    hud.update(g);
    const overlay = q(container, ".gameover-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".gameover-reason").textContent).toBe(
      "Your realm has been subjugated by Gamma",
    );
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(true);
    (overlay.querySelector(".menu-new-game") as HTMLElement).click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });
});
```

(`withHand` exists from Task 3; `playCard` import already present.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hud.test.ts`
Expected: new tests FAIL (createHud arity is fine - extra args ignored - but
texts/overlay/setArmed missing).

- [ ] **Step 3: Implement in `src/hud.ts`**

1. Signature and helpers:

```ts
export interface HudCallbacks {
  onNewGame(): void;
  onPlayCard(index: number): void;
  onEndTurn(): void;
  /** Optional gate for cards that need a valid target; default: playable. */
  canPlayCard?(cardId: string): boolean;
}

export interface Hud {
  update(state: GameState): void;
  setArmed(index: number | null, cardName?: string): void;
}

export function createHud(
  container: HTMLElement,
  cb: HudCallbacks,
  factionNames: Map<string, string> = new Map(),
): Hud {
  const factionName = (id: string | undefined): string =>
    (id !== undefined ? factionNames.get(id) : undefined) ?? id ?? "";
```

2. Move `eventText` inside `createHud` (it needs `factionName`) and extend it:

```ts
  function eventText(e: GameEvent): string {
    const you = e.playerId === 1;
    switch (e.type) {
      case "draw":
        return you ? `You drew ${cardName(e.cardId)}` : `Player ${e.playerId} drew a card`;
      case "play": {
        const target = e.targetFactionId !== undefined
          ? ` on ${factionName(e.targetFactionId)}`
          : "";
        return you
          ? `You played ${cardName(e.cardId)}${target}`
          : `Player ${e.playerId} played ${cardName(e.cardId)}${target}`;
      }
      case "reshuffle":
        return you
          ? "You reshuffled your discard"
          : `Player ${e.playerId} reshuffled their discard`;
      case "subjugated":
        return `${factionName(e.targetFactionId)} submits to ${factionName(e.overlordFactionId)}`;
      case "released":
        return `${factionName(e.targetFactionId)} breaks free`;
      case "incorporated":
        return `${factionName(e.targetFactionId)} is incorporated into ${factionName(e.overlordFactionId)}`;
      case "game-over":
        return `Your realm has been subjugated by ${factionName(e.overlordFactionId)}`;
    }
  }
```

3. Game-over overlay DOM, created next to the menu overlay:

```ts
  const gameover = document.createElement("div");
  gameover.className = "gameover-overlay hidden";
  const goTitle = document.createElement("h1");
  goTitle.className = "menu-title gameover-title";
  goTitle.textContent = "Game over";
  const goReason = document.createElement("p");
  goReason.className = "gameover-reason";
  const goNewGame = document.createElement("button");
  goNewGame.className = "menu-new-game";
  goNewGame.textContent = "New game";
  goNewGame.addEventListener("click", () => cb.onNewGame());
  gameover.append(goTitle, goReason, goNewGame);
```

Add `gameover` to the `container.append(...)` call.

4. Status rendering extracted so `setArmed(null)` can restore it. Keep a
`let lastState: GameState | null = null;` set at the top of `update`. Pull
the current status-text/end-turn logic of `update` into
`renderStatus(state: GameState)` and call it from `update`.

5. `renderHand` playability:

```ts
    const canPlayCardCb = cb.canPlayCard ?? (() => true);
    // inside the forEach:
      const playable = canPlay && canPlayCardCb(cardId);
      card.disabled = !playable;
      card.classList.toggle("unplayable", canPlay && !canPlayCardCb(cardId));
      if (playable)
        card.addEventListener("click", () => { ...unchanged... });
```

6. `animateEvents`: only draw/play/reshuffle animate:

```ts
      if (e.type === "draw") animateDraw();
      else if (e.type === "play") animatePlay(e.cardId ?? "");
      else if (e.type === "reshuffle") pulseDeck();
```

7. `update` additions: the overlay and the game-over reason (from the last
game-over event in the log):

```ts
      gameover.classList.toggle("hidden", state.phase !== "game-over");
      if (state.phase === "game-over") {
        const e = [...state.log].reverse().find((ev) => ev.type === "game-over");
        goReason.textContent = e ? eventText(e) : "";
        renderLog(state); // final entries still appear in the log
      }
```

(The existing `menu`/`status`/piles/hand/log toggles already hide themselves
for non-playing phases; verify `.activity-log` visibility: keep it visible in
game-over by changing its toggle to
`logPanel.classList.toggle("hidden", state.phase !== "playing" && state.phase !== "game-over");`.)

8. `setArmed`:

```ts
    setArmed(index, cardNameText) {
      [...hand.children].forEach((el, i) =>
        el.classList.toggle("card-armed", i === index),
      );
      if (index !== null && cardNameText !== undefined) {
        statusText.textContent = `Choose a target for ${cardNameText}`;
      } else if (lastState) {
        renderStatus(lastState);
      }
    },
```

9. CSS in `src/style.css` (next to the `.card` rules and after `.menu-overlay`):

```css
.card.unplayable {
  filter: grayscale(0.85) brightness(0.92);
  opacity: 0.65;
}

.card.card-armed {
  translate: 0 -26px;
  outline: 2px solid #fdfaf4;
  outline-offset: -1px;
  z-index: 7;
}

.gameover-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: rgba(24, 32, 38, 0.72);
  z-index: 20;
}

.gameover-reason {
  font-size: 18px;
  color: #fdfaf4;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 4: Run tests, verify pass, commit**

Run: `npx vitest run tests/hud.test.ts` then `npm test && npm run build`
Expected: PASS. (main.ts still compiles: the new createHud param and callback
are optional.)

```bash
git add src/hud.ts src/style.css tests/hud.test.ts
git commit -m "feat(balticmap): HUD targeting prompt, relation log texts, game-over overlay

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: region panel relations block

**Files:**
- Modify: `src/panel.ts`
- Test: `tests/panel.test.ts`

**Interfaces:**
- Consumes: nothing from game state directly - main.ts supplies a callback.
- Produces: `createPanel(container, onClose, peoples, factions, settlements, relationsInfo?)` where `relationsInfo?: (region: Region) => string[]`. Non-empty lines render in a `.panel-relations` paragraph (newline-joined, `white-space: pre-line`); empty array hides the paragraph.

- [ ] **Step 1: Write the failing test**

Append to `tests/panel.test.ts` (reuse its existing `peoples`, `factions`,
`talava` fixtures):

```ts
describe("relations block", () => {
  it("renders the lines from relationsInfo, hidden when empty", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let lines: string[] = [];
    const panel = createPanel(
      container, vi.fn(), peoples, factions, [],
      () => lines,
    );
    panel.show(talava);
    const el = container.querySelector(".panel-relations") as HTMLElement;
    expect(el.classList.contains("hidden")).toBe(true);

    lines = ["Status: yours 1 / theirs 0", "Might: yours 0 / theirs 0", "Your vassal"];
    panel.show(talava);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe(
      "Status: yours 1 / theirs 0\nMight: yours 0 / theirs 0\nYour vassal",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/panel.test.ts`
Expected: FAIL (createPanel arity / missing element).

- [ ] **Step 3: Implement**

In `src/panel.ts`:

```ts
export function createPanel(
  container: HTMLElement,
  onClose: () => void,
  peoples: People[],
  factions: Faction[],
  settlements: Settlement[],
  relationsInfo?: (region: Region) => string[],
): Panel {
```

Create the element after `factionLine`:

```ts
  const relations = document.createElement("p");
  relations.className = "panel-relations hidden";
```

Insert `relations` into the `root.append(...)` list right after `factionLine`.
In `show(region)`:

```ts
      const lines = relationsInfo?.(region) ?? [];
      relations.textContent = lines.join("\n");
      relations.classList.toggle("hidden", lines.length === 0);
```

Add CSS to `src/style.css` next to the other panel rules:

```css
.panel-relations {
  white-space: pre-line;
}
```

- [ ] **Step 4: Run tests, verify pass, commit**

Run: `npm test && npm run build` - expected: PASS.

```bash
git add src/panel.ts src/style.css tests/panel.test.ts
git commit -m "feat(balticmap): relations block in the region panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: orchestration - realm coloring, targeting mode, wiring

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`

**Interfaces:**
- Consumes: everything above.
- Produces: the playable feature. No new exported interfaces.

- [ ] **Step 1: Rewrite `src/main.ts`**

Replace the file body as follows (keep the existing imports and add the new
ones; unchanged sections noted):

```ts
import rawData from "./data/map.json";
import type { MapData, Region } from "./types";
import { renderMap, darkenColor } from "./map-render";
import { createPanel, createTooltip, tooltipText, settlementTooltipText } from "./panel";
import { attachInteraction } from "./interaction";
import {
  newGame, startGame, pickFaction, playCard, endTurn, aiTurn, isHumanTurn,
  overlordsOf, type GameState,
} from "./game";
import { getRel, realmOf, validTargets } from "./relations";
import { CARDS } from "./cards";
import { createHud } from "./hud";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths, settlementDots } = renderMap(data, app);
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

function inPlay(): boolean {
  return game.phase === "playing" || game.phase === "game-over";
}

function relationsInfo(region: Region): string[] {
  const human = game.players[0];
  if (!inPlay() || !human || region.faction === human.factionId) return [];
  const overlords = overlordsOf(game);
  const f = region.faction;
  const mine = getRel(game.relations, human.factionId, f);
  const theirs = getRel(game.relations, f, human.factionId);
  const lines = [
    `Status: yours ${mine.status} / theirs ${theirs.status}`,
    `Might: yours ${mine.might} / theirs ${theirs.might}`,
  ];
  const owner = game.incorporated[f];
  const lord = overlords.get(f);
  if (owner === human.factionId) lines.push("Part of your realm (incorporated)");
  else if (owner !== undefined) lines.push(`Incorporated into ${factionById.get(owner)!.name}`);
  else if (lord === human.factionId) lines.push("Your vassal");
  else if (overlords.get(human.factionId) === f) lines.push("Your overlord");
  else if (lord === undefined) lines.push("Independent");
  else lines.push(`Vassal of ${factionById.get(lord)!.name}`);
  return lines;
}

const panel = createPanel(
  app, () => interaction.deselect(), data.peoples, data.factions,
  data.settlements, relationsInfo,
);

function applyOwnership(): void {
  const overlords = inPlay() ? overlordsOf(game) : new Map<string, string>();
  const human = game.players[0];
  const humanRealm = new Set(
    inPlay() && human ? realmOf(human.factionId, overlords, game.incorporated) : [],
  );
  for (const [id, el] of regionPaths) {
    const region = regionById.get(id)!;
    const effective =
      game.incorporated[region.faction] ??
      overlords.get(region.faction) ??
      region.faction;
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
  }
}

function armedTargets(): string[] {
  const human = game.players[0];
  if (armed === null || !human) return [];
  return validTargets(
    human.factionId, human.hand[armed], overlordsOf(game),
    game.incorporated, game.adjacency, game.factionIds,
  );
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

function refresh(): void {
  applyOwnership();
  applyTargeting();
  hud.update(game);
}

/** Runs every AI turn back to back. The setTimeout(0) lets the HUD paint
 *  the waiting label first; there is no artificial per-turn delay. */
function runAiTurns(): void {
  if (game.phase !== "playing" || isHumanTurn(game)) return;
  setTimeout(() => {
    while (game.phase === "playing" && !isHumanTurn(game)) {
      game = endTurn(aiTurn(game), rng);
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
      refresh();
    },
    onPlayCard(index) {
      if (!isHumanTurn(game)) return;
      const human = game.players[0];
      const card = CARDS[human.hand[index]];
      if (card?.targeted) {
        if (armed === index) {
          disarm();
          return;
        }
        armed = index;
        if (armedTargets().length === 0) {
          armed = null;
          return;
        }
        applyTargeting();
        hud.setArmed(index, card.name);
        return;
      }
      game = playCard(game, index);
      refresh();
    },
    onEndTurn() {
      if (!isHumanTurn(game)) return;
      disarm();
      game = endTurn(game, rng);
      refresh();
      runAiTurns();
    },
    canPlayCard(cardId) {
      const human = game.players[0];
      const card = CARDS[cardId];
      if (!human || !card?.targeted) return true;
      return validTargets(
        human.factionId, cardId, overlordsOf(game),
        game.incorporated, game.adjacency, game.factionIds,
      ).length > 0;
    },
  },
  new Map(data.factions.map((f) => [f.id, f.name])),
);
hud.update(game);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && armed !== null) disarm();
});

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
        game = playCard(game, idx, faction);
        refresh();
      }
      return true;
    }
    return false;
  },
});
```

- [ ] **Step 2: Targeting CSS**

Add to `src/style.css` near `.region.dimmed`:

```css
.region.target-valid {
  cursor: pointer;
  stroke: #fdfaf4;
  stroke-width: 2;
  opacity: 1;
}

.region.target-invalid {
  opacity: 0.12;
  pointer-events: auto;
}
```

(`.target-valid` must appear after `.region.dimmed` in the file so it wins
the opacity when both classes apply.)

- [ ] **Step 3: Verify build and full suite**

Run: `npm run build && npm test`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/style.css
git commit -m "feat(balticmap): targeting mode, realm coloring, game-over wiring

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: end-to-end validation in Chrome

**Files:** none (validation only; fix regressions found, with tests where the
gap was unit-testable).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Note the local URL (default
`http://127.0.0.1:5173/prototypes/02/`).

- [ ] **Step 2: Walk the scenario in Chrome** (browser automation tools)

1. Main menu -> New game -> pick a central faction (e.g. click Zemgale).
2. Confirm your region is undimmed in your faction color; all others dimmed.
3. Play turns until a Raid is in hand. Click it: valid (adjacent) regions
   highlight, everything else dims hard; status bar reads
   "Choose a target for Raid". Press Esc: targeting cancels.
4. Arm Raid again, click an adjacent region: log shows
   "You played Raid on <name>" and "<name> submits to <you>"; the region
   flips to your color and undims immediately.
5. Open the vassal's panel: status/might numbers and "Your vassal" line.
6. With a vassal held, play Incorporate on it: log entry, permanent color.
   Confirm Incorporate is grayed (unplayable) when you have no vassal.
7. Let AI turns run: AI realms recolor (dimmed) as they subjugate each other.
8. Keep ending turns without raising your own might until an AI subjugates
   you: game-over overlay appears naming the overlord; New game returns to
   the menu and fully resets colors, log, and hand.
9. Reshuffle still works (piles cycle) and no console errors appeared.

- [ ] **Step 3: Fix anything found, re-run `npm test`, commit fixes**

---

## Execution notes

- Tasks 1-3 are independent of each other except Task 3's test edits; run
  them in order anyway - they are cheap.
- Tasks 4-6 build on each other inside `src/game.ts` and must be sequential.
- Tasks 7 and 8 are independent of each other, both after Task 4.
- Task 9 requires all prior tasks. Task 10 is last.
- If a numeric log-index assertion in a plan test disagrees with the real
  event order, prefer asserting via `log.filter(...)`; the contract is the
  set/order of event types, not absolute indices.
