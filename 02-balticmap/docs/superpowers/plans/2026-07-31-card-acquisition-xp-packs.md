# Card Acquisition: XP, Levels and Packs - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the witnessing/`seenPool` learning loop with XP earned from play, persistent levels, and Hearthstone-style 2-card packs opened at the deck screen.

**Architecture:** XP is a pure function of `state.log` (already the complete append-only run history) - no `GameState` field, no accrual hook, zero call sites. `src/xp.ts` holds an exhaustive `Record<GameEventType, number>` table plus the level curve and hidden turnip milestones. `src/packs.ts` draws 2 cards by weighted rarity. `src/meta.ts` persists `{knownCards, xp, turnipsGrown, packsOpened}` and derives `pendingPacks`. The deck screen gains a pack-opening overlay in the slot the old "learned cards" overlay used - no new `GamePhase`.

**Tech Stack:** TypeScript, Vite, vitest (+ happy-dom for DOM tests), Web Animations API via `src/animate.ts`. No framework, imperative DOM.

**Spec:** `docs/superpowers/specs/2026-07-31-card-acquisition-xp-packs-design.md`

## Global Constraints

- `npm test` must pass before every commit, with no exceptions.
- `npm run build` (full `tsc`) must pass at Tasks 1, 2, 3 and 8. It is **expected to fail at Tasks 4-7**: this refactor removes `seenThisRun`, `mergeSeen`, `unlockAllSeen` and `lootInfo`, and `main.ts` keeps referencing them until Task 8 rewires it. Each of those tasks states the expected failure. Do not "fix" `main.ts` early to get a green build - that steals Task 8's work and skips its review. Task 8 is where the build goes green again.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`. Several sessions share this branch.
- Never interpolate a card or faction name into a string. Build player-facing prose with `t()`, `card()`, `faction()` from `src/rich-text.ts` and hand the array to `renderSegments`. `tests/naming-convention.test.ts` enforces this. (Note: existing deck-screen code uses `cardName(id)` into `textContent`; that is the pre-existing pattern inside `deck-screen.ts` and is what the convention test currently tolerates there. Follow the surrounding file.)
- Never re-derive an animation's duration. Wait on `runAnimation`'s `onDone`, never a second `setTimeout` set to the same number.
- Do NOT reorder the `CARDS` object. `buildAiDeck()` consumes one rng draw per entry in declaration order; reordering silently moves every committed AI-deck band and stales `tests/fixtures/seeded-games-baseline.json`.
- Adding a *field* to `CardDef` is safe for that baseline (draw count unchanged). Adding or removing a *card* is not - this plan adds no cards.
- Card rarity tiers: `"common" | "rare" | "epic"` all exist as types, but **every card is tagged `"common"`**. Populating rare/epic is explicitly out of scope.
- Run `npm run build` (not just `npm test`) after any change to a shared type like `CardDef`, `MetaRecord` or `GameState` - `tsc` is what catches the ripple.

## File Structure

| File | Responsibility |
|---|---|
| `src/cards.ts` (modify) | `rarity` on `CardDef`, `CardRarity` type, `STARTING_KNOWN_CARDS`, `ACQUIRABLE_CARDS` |
| `src/xp.ts` (create) | XP table, `xpForEvent`, `runXp`, `runTurnips`, level curve, turnip milestones |
| `src/packs.ts` (create) | `PACK_SIZE`, `RARITY_WEIGHTS`, `openPack` |
| `src/meta.ts` (modify) | New `MetaRecord` shape, `pendingPacks`, `bankRun`, `applyPack`; drop witnessing fns |
| `src/game.ts` (modify) | Delete `seenThisRun` and the witnessing block. Nothing added. |
| `src/deck-screen.ts` (modify) | Pack-opening overlay replaces learned overlay; "N of 9 collected" |
| `src/hud.ts` (modify) | Postmortem "+N XP earned" line; drop `lootInfo` and the loot row |
| `src/main.ts` (modify) | Wire banking, pack opening, reset |
| `src/style.css` (modify) | Pack overlay styles |

**Dependency order:** 1 -> (2, 3) -> 4 -> 5 -> (6, 7) -> 8

---

### Task 1: Card rarity and the acquirable pool

**Files:**
- Modify: `src/cards.ts`
- Test: `tests/cards.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type CardRarity = "common" | "rare" | "epic"`
  - `CardDef.rarity: CardRarity` (new required field on every entry)
  - `export const STARTING_KNOWN_CARDS: string[]` = `["raid", "subjugate", "fortify"]`
  - `export const ACQUIRABLE_CARDS: string[]` - deck-buildable non-basics minus the starting three, in stable `CARDS` order (9 ids)

- [ ] **Step 1: Write the failing test**

Add to `tests/cards.test.ts`:

```ts
import {
  ACQUIRABLE_CARDS, CARDS, STARTING_KNOWN_CARDS,
} from "../src/cards";

describe("rarity and the acquirable pool", () => {
  it("tags every card with a rarity, all common for now", () => {
    for (const c of Object.values(CARDS)) {
      expect(c.rarity).toBe("common");
    }
  });

  it("starts the player on Raid, Subjugate and Fortify", () => {
    expect(STARTING_KNOWN_CARDS).toEqual(["raid", "subjugate", "fortify"]);
    for (const id of STARTING_KNOWN_CARDS) {
      expect(CARDS[id].deckBuildable).toBe(true);
      expect(CARDS[id].maxPerDeck).not.toBeNull();
    }
  });

  it("acquires exactly the deck-buildable non-basics you do not start with", () => {
    expect(ACQUIRABLE_CARDS).toEqual([
      "shrewd-marriage", "incorporate", "seeds-of-revolt",
      "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
      "favourable-omens", "found-settlement",
    ]);
    // grow-crops is free filler, not acquirable; revolt and pay-tribute are
    // injection-only and must never appear in a pack.
    expect(ACQUIRABLE_CARDS).not.toContain("grow-crops");
    expect(ACQUIRABLE_CARDS).not.toContain("revolt");
    expect(ACQUIRABLE_CARDS).not.toContain("pay-tribute");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cards.test.ts`
Expected: FAIL - `ACQUIRABLE_CARDS` / `STARTING_KNOWN_CARDS` are not exported, `c.rarity` is undefined.

- [ ] **Step 3: Add the rarity field and constants**

In `src/cards.ts`, add above `CardDef`:

```ts
/** Pack draw tier. Only "common" is populated today - rare and epic exist so
 *  the weighting machinery is real, and assigning cards to them is a separate
 *  balance pass. See the 2026-07-31 card-acquisition design doc. */
export type CardRarity = "common" | "rare" | "epic";
```

Add to the `CardDef` interface:

```ts
  /** Pack draw tier. Every card is "common" today; see CardRarity. */
  rarity: CardRarity;
```

Then add `rarity: "common",` to **every one of the 15 entries** in `CARDS`. Example for the first two:

```ts
  "grow-crops": { id: "grow-crops", name: "Grow turnips", targeted: false, maxPerDeck: null, deckBuildable: true, forced: false, rarity: "common", text: "No effect - a quiet season. Fills out the deck." },
  "raid": { id: "raid", name: "Raid", targeted: true, maxPerDeck: 1, deckBuildable: true, forced: false, rarity: "common", text: "Gain Might over one faction in reach: +1 for your first land on their border, +2 for the second, +3 for the third, and so on." },
```

Do NOT reorder any entry while doing this - see Global Constraints.

Add near `DEFAULT_DECK`:

```ts
/** Cards the player knows from their very first game. Everything else in the
 *  roster is earned from packs. Raid, Subjugate and Fortify together cover the
 *  three verbs the game is about - hit someone, take someone, hold everyone -
 *  so a first run is a real game rather than ten turns of turnips. */
export const STARTING_KNOWN_CARDS: string[] = ["raid", "subjugate", "fortify"];

/** The pack pool: every deck-buildable non-basic you do not start with, in
 *  stable CARDS order. Grow turnips stays free filler outside the pool; Revolt
 *  and Pay tribute are injection-only and excluded by `deckBuildable`. */
export const ACQUIRABLE_CARDS: string[] = Object.values(CARDS)
  .filter(
    (c) =>
      c.deckBuildable &&
      c.maxPerDeck !== null &&
      !STARTING_KNOWN_CARDS.includes(c.id),
  )
  .map((c) => c.id);
```

- [ ] **Step 4: Fix the existing full-shape assertions**

`tests/cards.test.ts` has an `expectProps` helper doing `toEqual` on the whole `CardDef`. Adding a field breaks every call. Update the helper signature and each call to include rarity:

```ts
    const expectProps = (
      id: string, name: string, targeted: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
      rarity: string, text: string,
    ) =>
      expect(CARDS[id]).toEqual({ id, name, targeted, maxPerDeck, deckBuildable, forced, rarity, text });
```

Then insert `"common",` before the `text` argument in every `expectProps(...)` call in that file.

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS. If `tests/rng-isolation.test.ts` fails, STOP - a field addition must not move the baseline, so something else changed (most likely a `CARDS` reorder). Do not re-freeze the fixture.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/cards.ts 02-balticmap/tests/cards.test.ts
git commit -m "feat(balticmap): card rarity tiers and the acquirable pack pool"
```

---

### Task 2: `src/xp.ts` - the XP table, level curve and turnip milestones

**Files:**
- Create: `src/xp.ts`
- Test: `tests/xp.test.ts` (create)

**Interfaces:**
- Consumes: `GameEvent`, `GameEventType` from `src/game.ts` (**type-only import**, so there is no runtime import cycle when `main.ts`/`hud.ts` pull both in).
- Produces:
  - `export const XP_TABLE: Record<GameEventType, number>`
  - `export function xpForEvent(e: GameEvent): number`
  - `export function runXp(log: GameEvent[]): number`
  - `export function runTurnips(log: GameEvent[]): number`
  - `export const XP_LEVEL_STEP = 25`
  - `export function xpThresholdForLevel(level: number): number`
  - `export function levelForXp(xp: number): number`
  - `export const TURNIP_MILESTONES_BASE: number[]`
  - `export function turnipMilestone(index: number): number`
  - `export function turnipPacksEarned(turnipsGrown: number): number`

- [ ] **Step 1: Write the failing test**

Create `tests/xp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  TURNIP_MILESTONES_BASE, XP_TABLE, levelForXp, runTurnips, runXp,
  turnipMilestone, turnipPacksEarned, xpForEvent, xpThresholdForLevel,
} from "../src/xp";
import type { GameEvent } from "../src/game";

const ev = (e: Partial<GameEvent> & { type: GameEvent["type"] }): GameEvent => ({
  turn: 1, playerId: 1, ...e,
});

describe("xpForEvent", () => {
  it("gives every event type a decided value", () => {
    // The Record<GameEventType, number> type is the real guard - this only
    // proves the table is populated with finite numbers.
    for (const v of Object.values(XP_TABLE)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it("pays the base value for an event that moves no counter", () => {
    expect(xpForEvent(ev({ type: "play", cardId: "grow-crops" }))).toBe(1);
    expect(xpForEvent(ev({ type: "settled" }))).toBe(3);
  });

  it("scales with how far a tracked event moved the counter", () => {
    // A 4-point Raid is worth more than a 1-point one: base 1 + amount.
    expect(xpForEvent(ev({ type: "play", cardId: "raid", track: "might", amount: 4 }))).toBe(5);
    expect(xpForEvent(ev({ type: "play", cardId: "raid", track: "might", amount: 1 }))).toBe(2);
  });

  it("pays nothing for forced or automatic events", () => {
    expect(xpForEvent(ev({ type: "tribute", track: "might", amount: 1 }))).toBe(0);
    expect(xpForEvent(ev({ type: "garrisoned" }))).toBe(0);
    expect(xpForEvent(ev({ type: "draw", cardId: "raid" }))).toBe(0);
    expect(xpForEvent(ev({ type: "discard", cardId: "raid" }))).toBe(0);
  });
});

describe("runXp / runTurnips", () => {
  it("counts only the human's events", () => {
    const log: GameEvent[] = [
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", cardId: "raid", playerId: 2, track: "might", amount: 9 }),
      ev({ type: "subjugated" }),
    ];
    expect(runXp(log)).toBe(1 + 4);
  });

  it("counts the human's turnips and nobody else's", () => {
    const log: GameEvent[] = [
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", cardId: "grow-crops" }),
      ev({ type: "play", cardId: "grow-crops", playerId: 3 }),
      ev({ type: "draw", cardId: "grow-crops" }),
    ];
    expect(runTurnips(log)).toBe(2);
  });
});

describe("level curve", () => {
  it("uses triangular thresholds", () => {
    expect(xpThresholdForLevel(1)).toBe(25);
    expect(xpThresholdForLevel(2)).toBe(75);
    expect(xpThresholdForLevel(3)).toBe(150);
    expect(xpThresholdForLevel(4)).toBe(250);
    expect(xpThresholdForLevel(5)).toBe(375);
  });

  it("levels on crossing a threshold, not before", () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(24)).toBe(0);
    expect(levelForXp(25)).toBe(1);
    expect(levelForXp(74)).toBe(1);
    expect(levelForXp(75)).toBe(2);
    expect(levelForXp(10_000)).toBe(27);
  });
});

describe("turnip milestones", () => {
  it("lists the explicit milestones, then doubles forever", () => {
    expect(TURNIP_MILESTONES_BASE).toEqual([10, 100, 1000, 5000, 10000]);
    expect(turnipMilestone(0)).toBe(10);
    expect(turnipMilestone(4)).toBe(10_000);
    expect(turnipMilestone(5)).toBe(20_000);
    expect(turnipMilestone(6)).toBe(40_000);
    expect(turnipMilestone(7)).toBe(80_000);
  });

  it("earns one pack per milestone crossed", () => {
    expect(turnipPacksEarned(0)).toBe(0);
    expect(turnipPacksEarned(9)).toBe(0);
    expect(turnipPacksEarned(10)).toBe(1);
    expect(turnipPacksEarned(99)).toBe(1);
    expect(turnipPacksEarned(100)).toBe(2);
    expect(turnipPacksEarned(10_000)).toBe(5);
    expect(turnipPacksEarned(20_000)).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/xp.test.ts`
Expected: FAIL - cannot resolve `../src/xp`.

- [ ] **Step 3: Write the implementation**

Create `src/xp.ts`:

```ts
import type { GameEvent, GameEventType } from "./game";

/** What each event type is worth to the human who caused it.
 *
 *  This Record is exhaustive on purpose: adding a GameEventType without
 *  deciding its XP will not compile. That is the same enforcement NOTICE_RULES
 *  uses for notices, and it exists for the same reason - prose asking people to
 *  remember did not work.
 *
 *  Zero means "not a choice the player made": a draw, a reshuffle, a forced
 *  discard or tribute payment, a garrison tick that every large realm gets
 *  every turn regardless. Endings other than victory pay nothing because the
 *  run is over and the postmortem is the reward. */
export const XP_TABLE: Record<GameEventType, number> = {
  play: 1,
  subjugated: 4,
  incorporated: 4,
  reclaimed: 4, // Revolt: breaking free is as big as taking someone
  settled: 3,
  seeded: 2,
  released: 1, // your own Subjugate freeing the target's vassals
  "subjugate-failed": 1, // the card was spent and the turn is gone
  "incorporate-failed": 1,
  victory: 15,
  draw: 0,
  reshuffle: 0,
  discard: 0,
  tribute: 0,
  garrisoned: 0,
  defeat: 0,
  unified: 0,
  surrendered: 0,
};

/** Base value plus how far the event moved a relation counter. A four-point
 *  Raid is worth more than a one-point one, so reaching for a good play beats
 *  spamming a cheap one. Events with no `track` carry no `amount` worth
 *  scoring (see the GameEvent.amount contract in src/game.ts). */
export function xpForEvent(e: GameEvent): number {
  const base = XP_TABLE[e.type];
  if (base === 0) return 0;
  const scaled = e.track !== undefined ? Math.max(0, e.amount ?? 0) : 0;
  return base + scaled;
}

/** Total XP a run earned the human.
 *
 *  Derived from the log rather than accumulated into a counter, because the log
 *  is already the complete append-only history of the run and a derivation
 *  cannot be forgotten at a new call site. See the 2026-07-31 design doc. */
export function runXp(log: GameEvent[]): number {
  return log.reduce((sum, e) => sum + (e.playerId === 1 ? xpForEvent(e) : 0), 0);
}

/** Turnips the human grew this run - the hidden milestone counter's input. */
export function runTurnips(log: GameEvent[]): number {
  return log.filter(
    (e) => e.type === "play" && e.playerId === 1 && e.cardId === "grow-crops",
  ).length;
}

export const XP_LEVEL_STEP = 25;

/** Triangular growth: 25, 75, 150, 250, 375, ... Fast enough that a first run
 *  earns a pack off the starting three cards, slow enough that packs thin out
 *  as the collection fills. */
export function xpThresholdForLevel(level: number): number {
  return (XP_LEVEL_STEP * level * (level + 1)) / 2;
}

/** Highest level fully paid for by `xp`. Walks the curve rather than solving
 *  the quadratic: exact at every boundary, and the loop is a few dozen steps
 *  even at absurd totals. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < XP_LEVEL_STEP) return 0;
  let level = 0;
  while (xpThresholdForLevel(level + 1) <= xp) level++;
  return level;
}

/** The turnip-farming easter egg. Deliberately undocumented in the UI: no
 *  progress counter anywhere, or it stops being a secret. */
export const TURNIP_MILESTONES_BASE: number[] = [10, 100, 1000, 5000, 10000];

/** The 0-indexed nth milestone. Past the explicit list it doubles forever, so
 *  the joke keeps paying out but never becomes a grind worth farming. */
export function turnipMilestone(index: number): number {
  const base = TURNIP_MILESTONES_BASE[index];
  if (base !== undefined) return base;
  const last = TURNIP_MILESTONES_BASE[TURNIP_MILESTONES_BASE.length - 1];
  return last * 2 ** (index - TURNIP_MILESTONES_BASE.length + 1);
}

/** Bonus packs earned from lifetime turnips: one per milestone crossed. */
export function turnipPacksEarned(turnipsGrown: number): number {
  if (!Number.isFinite(turnipsGrown) || turnipsGrown < TURNIP_MILESTONES_BASE[0]) {
    return 0;
  }
  let count = 0;
  while (turnipMilestone(count) <= turnipsGrown) count++;
  return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/xp.test.ts && npm run build`
Expected: PASS.

If `levelForXp(10_000)` is not 27, do not change the test - recompute: `xpThresholdForLevel(27) = 25*27*28/2 = 9450` and `xpThresholdForLevel(28) = 25*28*29/2 = 10150`, so 10,000 gives level 27.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/xp.ts 02-balticmap/tests/xp.test.ts
git commit -m "feat(balticmap): XP table, level curve and hidden turnip milestones"
```

---

### Task 3: `src/packs.ts` - weighted 2-card pack draw

**Files:**
- Create: `src/packs.ts`
- Test: `tests/packs.test.ts` (create)

**Interfaces:**
- Consumes: `CARDS`, `CardRarity`, `Rng` from `src/cards.ts` (Task 1).
- Produces:
  - `export const PACK_SIZE = 2`
  - `export const RARITY_WEIGHTS: Record<CardRarity, number>`
  - `export function openPack(acquirableIds: string[], rng: Rng): string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/packs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PACK_SIZE, RARITY_WEIGHTS, openPack } from "../src/packs";
import { ACQUIRABLE_CARDS, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Feeds exact values, then zeros. Lets a test pin which branch a roll takes. */
function scriptedRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe("openPack", () => {
  it("always draws PACK_SIZE cards from the pool", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      const pack = openPack(ACQUIRABLE_CARDS, rng);
      expect(pack).toHaveLength(PACK_SIZE);
      for (const id of pack) expect(ACQUIRABLE_CARDS).toContain(id);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(openPack(ACQUIRABLE_CARDS, seededRng(42)))
      .toEqual(openPack(ACQUIRABLE_CARDS, seededRng(42)));
  });

  it("allows duplicates - a pack never guarantees a new card", () => {
    // Both slots roll the common tier (0) and then index 0 of it.
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]));
    expect(pack).toEqual([ACQUIRABLE_CARDS[0], ACQUIRABLE_CARDS[0]]);
  });

  it("falls back to common when the rolled tier is empty", () => {
    // Roll the very top of the weight range: epic, which has no cards today.
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0.999, 0, 0.999, 0]));
    expect(pack).toHaveLength(PACK_SIZE);
    for (const id of pack) expect(ACQUIRABLE_CARDS).toContain(id);
  });

  it("returns nothing for an empty pool rather than throwing", () => {
    expect(openPack([], seededRng(1))).toEqual([]);
  });

  it("weights common most heavily", () => {
    expect(RARITY_WEIGHTS.common).toBeGreaterThan(RARITY_WEIGHTS.rare);
    expect(RARITY_WEIGHTS.rare).toBeGreaterThan(RARITY_WEIGHTS.epic);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/packs.test.ts`
Expected: FAIL - cannot resolve `../src/packs`.

- [ ] **Step 3: Write the implementation**

Create `src/packs.ts`:

```ts
import { CARDS, type CardRarity, type Rng } from "./cards";

/** Cards revealed per pack. Two is enough for a reveal to have a beat to it
 *  without a pack becoming a whole screen of cards. */
export const PACK_SIZE = 2;

/** Slot-by-slot tier odds. Rare and epic are unpopulated today, so in practice
 *  every roll resolves to common via the empty-tier fallback below - the
 *  weights are live machinery waiting on a balance pass, not dead code. */
export const RARITY_WEIGHTS: Record<CardRarity, number> = {
  common: 70,
  rare: 25,
  epic: 5,
};

/** Fixed order so a seeded rng is deterministic. */
const TIERS: CardRarity[] = ["common", "rare", "epic"];

function rollTier(rng: Rng): CardRarity {
  const total = TIERS.reduce((sum, t) => sum + RARITY_WEIGHTS[t], 0);
  let roll = rng() * total;
  for (const tier of TIERS) {
    roll -= RARITY_WEIGHTS[tier];
    if (roll < 0) return tier;
  }
  return "common";
}

/** Draws PACK_SIZE cards. Each slot rolls a tier, then picks uniformly inside
 *  it; an empty tier falls back to common, which is what makes unpopulated
 *  rare/epic harmless rather than a crash waiting to happen.
 *
 *  Deliberately never consults what the player already knows: a duplicate is a
 *  real outcome, shown as "already known" at reveal. Consumes exactly two rng
 *  values per slot whatever the tier, so a seed maps to a stable pack. */
export function openPack(acquirableIds: string[], rng: Rng): string[] {
  if (acquirableIds.length === 0) return [];
  const byTier = new Map<CardRarity, string[]>(
    TIERS.map((t) => [t, acquirableIds.filter((id) => CARDS[id]?.rarity === t)]),
  );
  const commons = byTier.get("common") ?? [];
  const drawn: string[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot++) {
    const tier = rollTier(rng);
    const pool = byTier.get(tier)?.length ? byTier.get(tier)! : commons;
    const from = pool.length > 0 ? pool : acquirableIds;
    drawn.push(from[Math.floor(rng() * from.length)]);
  }
  return drawn;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/packs.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/packs.ts 02-balticmap/tests/packs.test.ts
git commit -m "feat(balticmap): weighted two-card pack draws"
```

---

### Task 4: `src/meta.ts` - new record shape, pending packs, banking

**Files:**
- Modify: `src/meta.ts`
- Test: `tests/meta.test.ts`

**Interfaces:**
- Consumes: `STARTING_KNOWN_CARDS`, `ACQUIRABLE_CARDS` (Task 1); `levelForXp`, `turnipPacksEarned` (Task 2).
- Produces:
  - `export interface MetaRecord { knownCards: string[]; xp: number; turnipsGrown: number; packsOpened: number }`
  - `export function pendingPacks(meta: MetaRecord): number`
  - `export function bankRun(meta: MetaRecord, xpEarned: number, turnipsGrown: number): MetaRecord`
  - `export function applyPack(meta: MetaRecord, drawn: string[]): { meta: MetaRecord; results: { id: string; isNew: boolean }[] }`
  - `export function collectedCount(meta: MetaRecord): number`
  - unchanged: `META_STORAGE_KEY`, `MetaStorage`, `memoryStorage`, `initialMeta`, `loadMeta`, `saveMeta`, `resetMeta`, `buildPlayerDeck`
  - **removed:** `mergeSeen`, `unlockCard`, `unlockAllSeen`

- [ ] **Step 1: Write the failing test**

Replace the whole of `tests/meta.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  META_STORAGE_KEY, applyPack, bankRun, buildPlayerDeck, collectedCount,
  initialMeta, loadMeta, memoryStorage, pendingPacks, resetMeta, saveMeta,
} from "../src/meta";
import { ACQUIRABLE_CARDS, DECK_SIZE } from "../src/cards";

const rec = (over: Partial<ReturnType<typeof initialMeta>> = {}) => ({
  ...initialMeta(), ...over,
});

describe("storage round-trip", () => {
  it("starts you knowing turnips plus Raid, Subjugate and Fortify", () => {
    expect(loadMeta(memoryStorage())).toEqual({
      knownCards: ["grow-crops", "raid", "subjugate", "fortify"],
      xp: 0, turnipsGrown: 0, packsOpened: 0,
    });
  });

  it("save/load round-trips under the exact key", () => {
    const s = memoryStorage();
    const m = rec({ knownCards: [...initialMeta().knownCards, "alliance"], xp: 90, turnipsGrown: 12, packsOpened: 2 });
    saveMeta(s, m);
    expect(s.getItem(META_STORAGE_KEY)).not.toBeNull();
    expect(loadMeta(s)).toEqual(m);
  });

  it("falls back silently on corrupt data", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, "{not json");
    expect(loadMeta(s)).toEqual(initialMeta());
    s.setItem(META_STORAGE_KEY, JSON.stringify({ knownCards: "nope" }));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("falls back on an old witnessing-era record", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify({
      knownCards: ["grow-crops", "raid"], seenPool: ["fortify"],
    }));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("rejects negative or non-numeric counters", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify(rec({ xp: -5 })));
    expect(loadMeta(s)).toEqual(initialMeta());
    s.setItem(META_STORAGE_KEY, JSON.stringify(rec({ turnipsGrown: "lots" })));
    expect(loadMeta(s)).toEqual(initialMeta());
  });

  it("prunes unknown ids and re-adds the starting cards", () => {
    const s = memoryStorage();
    s.setItem(META_STORAGE_KEY, JSON.stringify({
      knownCards: ["alliance", "gone-card", "pay-tribute"],
      xp: 10, turnipsGrown: 0, packsOpened: 0,
    }));
    expect(loadMeta(s).knownCards).toEqual([
      "grow-crops", "raid", "subjugate", "fortify", "alliance",
    ]);
  });

  it("resetMeta wipes storage and returns the initial record", () => {
    const s = memoryStorage();
    saveMeta(s, rec({ xp: 500 }));
    expect(resetMeta(s)).toEqual(initialMeta());
    expect(s.getItem(META_STORAGE_KEY)).toBeNull();
  });
});

describe("pendingPacks", () => {
  it("is zero on a fresh record", () => {
    expect(pendingPacks(initialMeta())).toBe(0);
  });

  it("counts XP levels not yet opened", () => {
    expect(pendingPacks(rec({ xp: 25 }))).toBe(1);
    expect(pendingPacks(rec({ xp: 75 }))).toBe(2);
    expect(pendingPacks(rec({ xp: 75, packsOpened: 2 }))).toBe(0);
  });

  it("adds hidden turnip milestone packs on top of XP levels", () => {
    expect(pendingPacks(rec({ xp: 25, turnipsGrown: 10 }))).toBe(2);
    expect(pendingPacks(rec({ xp: 0, turnipsGrown: 100 }))).toBe(2);
  });

  it("never goes negative if packsOpened somehow runs ahead", () => {
    expect(pendingPacks(rec({ xp: 0, packsOpened: 3 }))).toBe(0);
  });
});

describe("bankRun", () => {
  it("adds a run's XP and turnips to the lifetime totals", () => {
    const next = bankRun(rec({ xp: 30, turnipsGrown: 4 }), 45, 3);
    expect(next.xp).toBe(75);
    expect(next.turnipsGrown).toBe(7);
  });

  it("ignores a nonsense run total rather than corrupting progress", () => {
    const before = rec({ xp: 30 });
    expect(bankRun(before, Number.NaN, 0).xp).toBe(30);
    expect(bankRun(before, -10, 0).xp).toBe(30);
  });
});

describe("applyPack", () => {
  it("learns new cards, counts the pack, and flags what was new", () => {
    const before = initialMeta();
    const { meta, results } = applyPack(before, ["alliance", "bodyguard"]);
    expect(meta.knownCards).toContain("alliance");
    expect(meta.knownCards).toContain("bodyguard");
    expect(meta.packsOpened).toBe(1);
    expect(results).toEqual([
      { id: "alliance", isNew: true }, { id: "bodyguard", isNew: true },
    ]);
  });

  it("marks a duplicate as already known without adding it twice", () => {
    const { meta } = applyPack(initialMeta(), ["alliance", "alliance"]);
    expect(meta.knownCards.filter((id) => id === "alliance")).toHaveLength(1);
    const { results } = applyPack(meta, ["alliance", "bodyguard"]);
    expect(results).toEqual([
      { id: "alliance", isNew: false }, { id: "bodyguard", isNew: true },
    ]);
  });

  it("flags the second copy inside one pack as already known", () => {
    const { results } = applyPack(initialMeta(), ["alliance", "alliance"]);
    expect(results).toEqual([
      { id: "alliance", isNew: true }, { id: "alliance", isNew: false },
    ]);
  });

  it("counts an empty pack as opened so it cannot loop forever", () => {
    expect(applyPack(initialMeta(), []).meta.packsOpened).toBe(1);
  });
});

describe("collectedCount", () => {
  it("counts only acquirable cards, not the ones you start with", () => {
    expect(collectedCount(initialMeta())).toBe(0);
    const { meta } = applyPack(initialMeta(), ["alliance", "bodyguard"]);
    expect(collectedCount(meta)).toBe(2);
    expect(ACQUIRABLE_CARDS).toHaveLength(9);
  });
});

describe("buildPlayerDeck", () => {
  it("fills to DECK_SIZE with turnips and drops unknown picks", () => {
    const deck = buildPlayerDeck(
      ["grow-crops", "raid", "subjugate"], ["raid", "alliance", "raid"],
    );
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.filter((id) => id === "raid")).toHaveLength(1);
    expect(deck).not.toContain("alliance");
    expect(deck.filter((id) => id === "grow-crops")).toHaveLength(DECK_SIZE - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/meta.test.ts`
Expected: FAIL - `pendingPacks`, `bankRun`, `applyPack`, `collectedCount` are not exported.

- [ ] **Step 3: Rewrite `src/meta.ts`**

Replace the file's contents with:

```ts
import { ACQUIRABLE_CARDS, CARDS, DECK_SIZE, STARTING_KNOWN_CARDS } from "./cards";
import { levelForXp, turnipPacksEarned } from "./xp";

/** Persistent progress: what the player may deck-build, and the two lifetime
 *  counters that pay out packs. `packsOpened` is the only bookkeeping stored -
 *  everything else about pack entitlement is derived, so the two can never
 *  disagree. */
export interface MetaRecord {
  knownCards: string[];
  xp: number;
  turnipsGrown: number;
  packsOpened: number;
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
  return {
    knownCards: ["grow-crops", ...STARTING_KNOWN_CARDS],
    xp: 0,
    turnipsGrown: 0,
    packsOpened: 0,
  };
}

/** A card id the meta system tracks: exists and may appear in decks. */
const isTrackable = (id: unknown): id is string =>
  typeof id === "string" && CARDS[id]?.deckBuildable === true;

const isCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

const dedupe = (ids: string[]): string[] => [...new Set(ids)];

/** Records written before the XP refactor have no counters and fail this
 *  validation, so they reset to a fresh start. That is deliberate: a seen-pool
 *  has no meaning under the new system, and silently resetting is what corrupt
 *  data already did. */
export function loadMeta(storage: MetaStorage): MetaRecord {
  try {
    const raw = storage.getItem(META_STORAGE_KEY);
    if (raw === null) return initialMeta();
    const parsed: unknown = JSON.parse(raw);
    const rec = parsed as {
      knownCards?: unknown; xp?: unknown;
      turnipsGrown?: unknown; packsOpened?: unknown;
    };
    if (
      !Array.isArray(rec.knownCards) || !isCount(rec.xp) ||
      !isCount(rec.turnipsGrown) || !isCount(rec.packsOpened)
    ) {
      return initialMeta();
    }
    return {
      knownCards: dedupe([
        "grow-crops",
        ...STARTING_KNOWN_CARDS,
        ...rec.knownCards.filter(isTrackable),
      ]),
      xp: rec.xp,
      turnipsGrown: rec.turnipsGrown,
      packsOpened: rec.packsOpened,
    };
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

/** Packs the player has earned but not yet opened. Derived from the two
 *  lifetime counters, so no code path can grant a pack without the XP or the
 *  turnips to back it. */
export function pendingPacks(meta: MetaRecord): number {
  const earned = levelForXp(meta.xp) + turnipPacksEarned(meta.turnipsGrown);
  return Math.max(0, earned - meta.packsOpened);
}

/** Folds a finished run's totals into the lifetime record. A nonsense total is
 *  dropped rather than written: progress is the one thing a bug here would
 *  corrupt permanently. */
export function bankRun(
  meta: MetaRecord, xpEarned: number, turnipsGrown: number,
): MetaRecord {
  return {
    ...meta,
    xp: meta.xp + (isCount(xpEarned) ? xpEarned : 0),
    turnipsGrown: meta.turnipsGrown + (isCount(turnipsGrown) ? turnipsGrown : 0),
  };
}

/** Opens one pack: learns whatever is new and reports what each card was, so
 *  the reveal can tag it NEW or already-known. An empty draw still counts as
 *  opened - `pendingPacks` must always be able to reach zero. */
export function applyPack(
  meta: MetaRecord, drawn: string[],
): { meta: MetaRecord; results: { id: string; isNew: boolean }[] } {
  const known = new Set(meta.knownCards);
  const results = drawn.map((id) => {
    const isNew = !known.has(id);
    known.add(id);
    return { id, isNew };
  });
  return {
    meta: {
      ...meta,
      knownCards: dedupe([...meta.knownCards, ...drawn.filter(isTrackable)]),
      packsOpened: meta.packsOpened + 1,
    },
    results,
  };
}

/** How much of the pack pool the player owns. Starting cards are not part of
 *  the pool, so a fresh record reads 0 of 9 rather than 3 of 12. */
export function collectedCount(meta: MetaRecord): number {
  return ACQUIRABLE_CARDS.filter((id) => meta.knownCards.includes(id)).length;
}

/** The human deck: selected known non-basics (max 1 each) plus Grow potatoes
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

- [ ] **Step 4: Run the meta tests**

Run: `npm test -- tests/meta.test.ts`
Expected: PASS. `npm run build` will still FAIL here - `main.ts` imports the deleted `mergeSeen`/`unlockAllSeen`. That is fixed in Task 8; do not patch `main.ts` yet.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/meta.ts 02-balticmap/tests/meta.test.ts
git commit -m "feat(balticmap): persist XP, turnips and packs opened"
```

---

### Task 5: delete the witnessing hook (`game.ts` + `hud.ts` together)

> **Plan correction, made during execution.** Task 5 and Task 7 were
> originally separate. They cannot be: `src/hud.ts:948` reads
> `state.seenThisRun.map(...)` with no fallback, and vitest transforms
> without type-checking, so deleting the field breaks 9 `tests/hud.test.ts`
> cases at RUNTIME - not merely in `tsc`, which is what the split assumed.
> `npm test` green at every commit is non-negotiable, so the field's removal
> and the hud's last read of it must land in one commit. Task 7's content is
> folded in here; Task 7 below is retained only as a pointer.

**Files:**
- Modify: `src/game.ts` (lines ~99, ~170, ~603-626, ~668)
- Modify: `src/hud.ts` (lines ~35-36, ~361-370, ~946-973) - see Task 7 for the exact edits
- Modify: `src/style.css` - see Task 7
- Test: `tests/game.test.ts`, `tests/hud.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GameState` with **no** `seenThisRun` field and no XP field. XP is read via `runXp(state.log)` from Task 2.

- [ ] **Step 1: Delete the seen-detection tests**

In `tests/game.test.ts`, find and delete every test that asserts on `seenThisRun` (search the file for `seenThisRun`). Their replacement already exists as the `runXp`/`runTurnips` tests in Task 2.

- [ ] **Step 2: Add a log-derived XP test over a real game**

Append to `tests/game.test.ts`. It already defines `playingState()` (line ~36), `withHand(g, playerIdx, hand)` (line ~44) and `seededRng(seed)` (line ~20) - use those, do not add new fixtures:

```ts
import { runTurnips, runXp } from "../src/xp";

describe("XP is derived from a real game's log", () => {
  it("scores a human turnip as one point and counts it as a turnip", () => {
    let g = playingState();
    g = withHand(g, 0, ["grow-crops"]);
    const before = runXp(g.log);
    const beforeTurnips = runTurnips(g.log);
    g = playCard(g, 0, seededRng(1));
    expect(runXp(g.log)).toBe(before + 1);
    expect(runTurnips(g.log)).toBe(beforeTurnips + 1);
  });

  it("ignores an AI's plays entirely", () => {
    let g = playingState();
    g = { ...g, current: 1 };
    g = withHand(g, 1, ["grow-crops"]);
    const before = runXp(g.log);
    g = playCard(g, 0, seededRng(1));
    expect(runXp(g.log)).toBe(before);
    expect(runTurnips(g.log)).toBe(0);
  });
});
```

Note: `playingState()` deals opening hands, so `g.log` already holds `draw` events - all worth 0 XP, which is why the tests assert a delta rather than an absolute.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/game.test.ts`
Expected: FAIL - cannot resolve `../src/xp` if Task 2 is not merged, otherwise the suite still compiles against `seenThisRun` and the deletions below are what make it pass.

- [ ] **Step 4: Remove the field and the block**

In `src/game.ts`:

1. Delete line ~99 from the `GameState` interface:
   ```ts
     seenThisRun: string[]; // non-basic enemy cards witnessed (learning loop)
   ```
2. Delete `seenThisRun: [],` from the `newGame` return object (~line 170).
3. Delete the entire witnessing block (~lines 603-626), from the comment `// learning hook: enemy non-basic cards witnessed by the human` through `if (seen) seenThisRun = [...seenThisRun, cardId];` and its closing brace. Replace it with nothing.
4. In the final return (~line 668), remove `seenThisRun,` from the spread list, leaving:
   ```ts
     alliances, diplomacyBoost, bodyguards, omens, settled, rulers,
   ```
5. If `realmOf` is now unused in that function, leave the import alone only if `tsc` does not complain - `noUnusedLocals` may be on. Run the build to find out and delete the import only if it errors.

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`
Expected: `tests/game.test.ts` PASSES. `npm run build` still FAILS on `main.ts` and `hud.ts` (both read `seenThisRun`) - that is expected and fixed in Tasks 7 and 8.

Also expected: `tests/rng-isolation.test.ts` PASSES unchanged. Removing a state field changes no rng draw. If it fails, STOP and investigate - do not re-freeze the fixture.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/game.ts 02-balticmap/tests/game.test.ts
git commit -m "refactor(balticmap): drop the witnessing hook, XP comes from the log"
```

---

### Task 6: `src/deck-screen.ts` - the pack-opening overlay

**Files:**
- Modify: `src/deck-screen.ts`, `src/style.css`
- Test: `tests/deck-screen.test.ts`

**Interfaces:**
- Consumes: `runAnimation` from `src/animate.ts`; `CARDS`, `ACQUIRABLE_CARDS` from `src/cards.ts`.
- Produces:
  ```ts
  export interface PackReveal { id: string; isNew: boolean }
  export interface DeckScreenView {
    visible: boolean;
    knownCards: string[];
    collected: number;      // owned acquirable cards
    pendingPacks: number;   // packs waiting to be opened
    reveal: PackReveal[] | null; // non-null once the owner has drawn a pack
  }
  export interface DeckScreenCallbacks {
    onStart(selectedIds: string[]): void;
    onOpenPack(): void;      // player clicked the sealed pack
    onDismissReveal(): void; // player clicked Continue on the reveal
  }
  ```
  `seenPool` and `learned` are gone from the view; `onDismissLearned` is gone from the callbacks.

**Flow:** owner sets `pendingPacks > 0, reveal: null` -> screen shows a sealed pack -> click fires `onOpenPack()` -> owner draws and calls `update` with `reveal: [...]` -> screen animates the burst and reveals both cards -> Continue fires `onDismissReveal()` -> owner decrements and re-renders. The deck builder is hidden whenever `pendingPacks > 0` or `reveal !== null`.

- [ ] **Step 1: Write the failing test**

Replace `tests/deck-screen.test.ts` with:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = {
    onStart: vi.fn(), onOpenPack: vi.fn(), onDismissReveal: vi.fn(),
  };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;
const START = ["grow-crops", "raid", "subjugate", "fortify"];

const view = (over: Record<string, unknown> = {}) => ({
  visible: true, knownCards: START, collected: 0, pendingPacks: 0,
  reveal: null, ...over,
}) as Parameters<ReturnType<typeof createDeckScreen>["update"]>[0];

describe("createDeckScreen", () => {
  it("is hidden until shown, then offers the three starting cards", () => {
    const { container, cb, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update(view());
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    // three toggles plus the filler tile
    expect(container.querySelectorAll(".ds-deck .ds-card")).toHaveLength(4);
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith([]);
  });

  it("reports collection progress against the pack pool", () => {
    const { container, screen } = setup();
    screen.update(view({ collected: 3 }));
    expect(q(container, ".ds-undiscovered").textContent).toBe("3 of 9 collected");
  });

  it("gates the deck builder behind a sealed pack and opens it on click", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ pendingPacks: 1 }));
    const overlay = q(container, ".ds-pack-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-pack-sealed").classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-pack-count").textContent).toBe("1 pack to open");
    q(container, ".ds-pack-sealed").click();
    expect(cb.onOpenPack).toHaveBeenCalled();
  });

  it("pluralizes the waiting-pack count", () => {
    const { container, screen } = setup();
    screen.update(view({ pendingPacks: 3 }));
    expect(q(container, ".ds-pack-count").textContent).toBe("3 packs to open");
  });

  it("reveals both cards, tagging new ones and duplicates", () => {
    const { container, cb, screen } = setup();
    screen.update(view({
      pendingPacks: 1,
      reveal: [{ id: "alliance", isNew: true }, { id: "raid", isNew: false }],
    }));
    expect(q(container, ".ds-pack-sealed").classList.contains("hidden")).toBe(true);
    const cards = [...container.querySelectorAll(".ds-pack-card")];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".ds-card-name")?.textContent).toBe("Alliance");
    expect(cards[0].querySelector(".ds-pack-new")).not.toBeNull();
    expect(cards[1].querySelector(".ds-pack-new")).toBeNull();
    expect(cards[1].querySelector(".ds-pack-dupe")?.textContent).toBe("already known");
    // Every revealed card states its rules - this is where a new card is learnt.
    for (const c of cards) {
      expect(c.querySelector(".ds-card-text")!.textContent!.length).toBeGreaterThan(0);
    }
    q(container, ".ds-pack-continue").click();
    expect(cb.onDismissReveal).toHaveBeenCalled();
  });

  it("shows the deck builder again once no packs are pending", () => {
    const { container, screen } = setup();
    screen.update(view({ pendingPacks: 1 }));
    expect(q(container, ".ds-pack-overlay").classList.contains("hidden")).toBe(false);
    screen.update(view({ pendingPacks: 0, reveal: null }));
    expect(q(container, ".ds-pack-overlay").classList.contains("hidden")).toBe(true);
  });

  it("caps picks at the deck size", () => {
    const { container, screen } = setup();
    screen.update(view({ knownCards: START }));
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")]
      .filter((c) => c.tagName === "BUTTON") as HTMLElement[];
    for (const t of toggles) t.click();
    expect(q(container, ".ds-counter").textContent).toBe(
      "3 picked + 7 Grow turnips = 10",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/deck-screen.test.ts`
Expected: FAIL - `.ds-pack-overlay` does not exist, `onOpenPack` is not a callback.

- [ ] **Step 3: Rewrite the overlay in `src/deck-screen.ts`**

Change the imports at the top:

```ts
import { ACQUIRABLE_CARDS, CARDS, DECK_SIZE } from "./cards";
import { runAnimation } from "./animate";
import { cardName } from "./rich-text";
```

Replace the `DeckScreenView` / `DeckScreenCallbacks` interfaces with the ones in **Interfaces** above.

Delete `ALL_DECK_BUILDABLE_NON_BASICS` (superseded by `ACQUIRABLE_CARDS`).

Replace the whole `learnedOverlay` block (the element construction, roughly lines 46-59) with the pack overlay:

```ts
  // The pack is the only place a card's rules are stated before it is played,
  // so a revealed card carries its full text, not just a name.
  const packOverlay = document.createElement("div");
  packOverlay.className = "ds-pack-overlay hidden";
  const packInner = document.createElement("div");
  packInner.className = "ds-pack-inner";
  const packCount = document.createElement("p");
  packCount.className = "ds-pack-count";
  const packSealed = document.createElement("button");
  packSealed.className = "ds-pack-sealed";
  packSealed.textContent = "Open";
  const packHint = document.createElement("p");
  packHint.className = "ds-pack-hint";
  packHint.textContent = "Click to open";
  const packCards = document.createElement("div");
  packCards.className = "ds-pack-cards";
  const packContinue = document.createElement("button");
  packContinue.className = "notice-continue ds-pack-continue hidden";
  packContinue.textContent = "Continue";
  packSealed.addEventListener("click", () => cb.onOpenPack());
  packContinue.addEventListener("click", () => cb.onDismissReveal());
  packInner.append(packCount, packSealed, packHint, packCards, packContinue);
  packOverlay.appendChild(packInner);
```

Change the `root.append(...)` line to use `packOverlay` in place of `learnedOverlay`.

Add above the returned object, tracking which reveal has already been animated so a re-render does not replay the burst:

```ts
  /** The reveal currently on screen, so `update()` re-rendering for an
   *  unrelated reason does not replay the burst. Compared by identity: the
   *  owner hands over a fresh array per pack. */
  let animatedReveal: unknown = null;
```

Inside `update(view)`, replace the whole `learnedOverlay` / `undiscovered` section with:

```ts
      const opening = view.pendingPacks > 0 || view.reveal !== null;
      packOverlay.classList.toggle("hidden", !opening);
      packCount.textContent =
        `${view.pendingPacks} ${view.pendingPacks === 1 ? "pack" : "packs"} to open`;
      packSealed.classList.toggle("hidden", view.reveal !== null);
      packHint.classList.toggle("hidden", view.reveal !== null);
      packContinue.classList.toggle("hidden", view.reveal === null);

      if (view.reveal === null) {
        packCards.replaceChildren();
        animatedReveal = null;
      } else if (view.reveal !== animatedReveal) {
        animatedReveal = view.reveal;
        packCards.replaceChildren(
          ...view.reveal.map((r, i) => {
            const el = document.createElement("div");
            el.className = "ds-pack-card";
            const name = document.createElement("span");
            name.className = "ds-card-name";
            name.textContent = cardName(r.id);
            const text = document.createElement("span");
            text.className = "ds-card-text";
            text.textContent = CARDS[r.id]?.text ?? "";
            const tag = document.createElement("span");
            if (r.isNew) {
              tag.className = "ds-pack-new";
              tag.textContent = "NEW";
            } else {
              tag.className = "ds-pack-dupe";
              tag.textContent = "already known";
            }
            el.append(name, tag, text);
            // Each card flips in after the one before it. The stagger is the
            // whole beat of a pack opening; the animation reports its own end
            // and nothing re-derives its length.
            runAnimation(
              el,
              [
                { offset: 0, opacity: 0, transform: "rotateY(90deg) scale(0.8)" },
                { offset: i === 0 ? 0 : 0.4, opacity: 0, transform: "rotateY(90deg) scale(0.8)" },
                { offset: 1, opacity: 1, transform: "rotateY(0deg) scale(1)" },
              ],
              i === 0 ? 420 : 700,
            );
            return el;
          }),
        );
      }

      undiscovered.classList.remove("hidden");
      undiscovered.textContent =
        `${view.collected} of ${ACQUIRABLE_CARDS.length} collected`;
```

Wrap the deck builder so it hides while a pack is up. Right after computing `opening`, add:

```ts
      for (const el of [deckLabel, deckRow, counter, start]) {
        el.classList.toggle("hidden", opening);
      }
```

Update `const known = nonBasics(view.knownCards);` - it stays as is.

- [ ] **Step 4: Add the styles**

Append to `src/style.css`, following the existing `.ds-learned-*` block's visual language (replace that block entirely - it is now dead):

```css
.ds-pack-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 10, 8, 0.88);
  z-index: 20;
}

.ds-pack-overlay.hidden { display: none; }

.ds-pack-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  max-width: 44rem;
  padding: 2rem;
  text-align: center;
}

.ds-pack-count {
  margin: 0;
  font-size: 1.1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}

.ds-pack-sealed {
  width: 9rem;
  height: 13rem;
  border: 2px solid #c9a227;
  border-radius: 0.6rem;
  background: linear-gradient(160deg, #4a3a18, #2a2113);
  color: #f2e2b0;
  font-size: 1.2rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  cursor: pointer;
  animation: pack-breathe 2.2s ease-in-out infinite;
}

.ds-pack-sealed:hover { border-color: #f0d060; }
.ds-pack-sealed.hidden { display: none; }

@keyframes pack-breathe {
  0%, 100% { transform: scale(1); box-shadow: 0 0 1.4rem rgba(201, 162, 39, 0.25); }
  50% { transform: scale(1.03); box-shadow: 0 0 2.4rem rgba(201, 162, 39, 0.55); }
}

.ds-pack-hint { margin: 0; opacity: 0.6; font-size: 0.9rem; }
.ds-pack-hint.hidden { display: none; }

.ds-pack-cards {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.ds-pack-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 13rem;
  padding: 0.9rem;
  border: 1px solid #6b5a34;
  border-radius: 0.5rem;
  background: #1b1710;
  text-align: left;
}

.ds-pack-new {
  align-self: flex-start;
  padding: 0.1rem 0.4rem;
  border-radius: 0.2rem;
  background: #c9a227;
  color: #1b1710;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
}

.ds-pack-dupe {
  align-self: flex-start;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  opacity: 0.5;
}

.ds-pack-continue.hidden { display: none; }
```

Also confirm `.deck-screen` has `position: relative` so the overlay's `inset: 0` anchors to it. If it does not, add it.

- [ ] **Step 5: Run tests and build**

Run: `npm test -- tests/deck-screen.test.ts`
Expected: PASS. `npm run build` still fails on `main.ts` - expected until Task 8.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/deck-screen.ts 02-balticmap/src/style.css 02-balticmap/tests/deck-screen.test.ts
git commit -m "feat(balticmap): pack-opening overlay on the deck screen"
```

---

### Task 7: `src/hud.ts` - postmortem XP line, loot row removed

> **Folded into Task 5 during execution** - see the correction note there.
> The edits below are the authoritative description of the hud change; they
> are performed as part of Task 5's commit, not separately.

**Files:**
- Modify: `src/hud.ts` (lines ~35-36, ~361-370, ~946-973)
- Test: `tests/hud.test.ts`

**Interfaces:**
- Consumes: `runXp` from `src/xp.ts`.
- Produces: `HudCallbacks` without `lootInfo`. Postmortem shows `.pm-xp`.

- [ ] **Step 1: Update the existing postmortem tests**

`tests/hud.test.ts` already has `setup(opts?)` (line ~28), `q(container, sel)` (line ~68), `withHand` (line ~70) and a `defeated()` helper (line ~785) inside the postmortem describe block. Make three edits:

1. In `setup(opts?)`, delete the `lootInfo?: () => { id: string; isNew: boolean }[];` option (line ~33) and the `...(opts?.lootInfo ? { lootInfo: opts.lootInfo } : {}),` spread (line ~55).
2. In `defeated()` (line ~785), change the final line from `return { ...g, seenThisRun: ["raid", "subjugate"] };` to `return g;`.
3. Delete the two loot tests outright: `"renders loot from lootInfo with NEW tags and the learned caption"` (line ~795) and `"hides the loot row when lootInfo returns nothing"` (line ~815).
4. In the main defeat postmortem test, delete the line `expect(q(container, ".pm-seen").textContent).toContain("Raid");` (line ~752).

Then add, inside the same postmortem describe block:

```ts
  it("reports what the run earned and drops the old loot row", () => {
    const { container, hud } = setup();
    hud.update(defeated());
    expect(q(container, ".pm-xp").textContent).toMatch(/^\+\d+ XP earned$/);
    expect(container.querySelector(".pm-seen")).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hud.test.ts`
Expected: FAIL - `.pm-xp` is null.

- [ ] **Step 3: Replace the loot row with the XP line**

In `src/hud.ts`:

1. Delete the `lootInfo?()` member from `HudCallbacks` (lines ~35-36).
2. Add the import: `import { runXp } from "./xp";`
3. Replace the `pmSeenLabel` / `pmSeen` element construction (~lines 361-365) with:
   ```ts
   const pmXp = document.createElement("p");
   pmXp.className = "pm-xp";
   ```
4. Change the `pmSummary.append(...)` line (~370) to use `pmXp` in place of `pmSeenLabel, pmSeen`.
5. Replace the whole loot-rendering block (~lines 946-973, from `const loot =` through `pmSeenLabel.classList.toggle(...)`) with:
   ```ts
   // XP is derived from the log, never a counter carried on state - see
   // src/xp.ts. The number here is the same one that gets banked.
   pmXp.textContent = `+${runXp(state.log)} XP earned`;
   ```
6. In `src/style.css`, replace the `.pm-seen-label` and `.pm-seen` rules with:
   ```css
   .pm-xp {
     margin: 0.6rem 0 0;
     color: #c9a227;
     font-size: 1.05rem;
     letter-spacing: 0.06em;
   }
   ```
   Leave `.pm-card`, `.pm-card-name`, `.pm-card-new`, `.pm-card-text` alone only if something else still uses them; `grep -n "pm-card" src/` and delete the rules if nothing does.

- [ ] **Step 4: Run tests and build**

Run: `npm test -- tests/hud.test.ts tests/hud-animation-gate.test.ts`
Expected: PASS. Build still fails on `main.ts` - expected.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/hud.ts 02-balticmap/src/style.css 02-balticmap/tests/hud.test.ts
git commit -m "feat(balticmap): postmortem reports XP earned instead of cards seen"
```

---

### Task 8: `src/main.ts` - wire banking and pack opening

**Files:**
- Modify: `src/main.ts` (lines ~29-30, ~96-98, ~534-543, ~577-598, ~705-756)
- Test: full suite + manual browser pass

**Interfaces:**
- Consumes: everything from Tasks 1-7.
- Produces: a working game. No new exports.

- [ ] **Step 1: Update the imports**

Replace the `./meta` import (lines ~29-30) with:

```ts
import {
  applyPack, bankRun, buildPlayerDeck, collectedCount, loadMeta, memoryStorage,
  pendingPacks, resetMeta, saveMeta, type MetaRecord, type MetaStorage,
} from "./meta";
import { runTurnips, runXp } from "./xp";
import { openPack } from "./packs";
import { ACQUIRABLE_CARDS } from "./cards";
```

(`ACQUIRABLE_CARDS` may already be covered by an existing `./cards` import - merge rather than duplicate.)

- [ ] **Step 2: Replace the run-start state**

Replace `let poolAtRunStart: string[] = meta.seenPool;` (~line 98) with:

```ts
/** The pack currently revealed on the deck screen, or null when none is open.
 *  A fresh array per pack: the deck screen compares identity to decide whether
 *  to replay the reveal animation. */
let packReveal: { id: string; isNew: boolean }[] | null = null;
```

Rename the `seenMerged` flag to `runBanked` throughout the file (it guards the same once-per-run invariant).

- [ ] **Step 3: Replace `bankSeen` with `bankRunProgress`**

Replace the whole `bankSeen` function (~lines 534-543) with:

```ts
/** Banks this run's XP and turnips into the persistent record, once per run.
 *  Both totals are derived from the log rather than carried on state, so this
 *  is the only place progress is written and it cannot double-count. */
function bankRunProgress(): void {
  if (runBanked || game.players.length === 0) return;
  runBanked = true;
  meta = bankRun(meta, runXp(game.log), runTurnips(game.log));
  saveMeta(storage, meta);
}
```

Then replace every call to `bankSeen()` with `bankRunProgress()` (there are four: `afterHumanAction` twice, `onNewGame`, `onSurrender`).

- [ ] **Step 4: Update `onNewGame`**

In the `onNewGame` handler (~lines 580-598), replace:

```ts
      seenMerged = false;
      poolAtRunStart = meta.seenPool;
      learnSeenCards();
      deckScreen.update(deckScreenView(true));
```

with:

```ts
      runBanked = false;
      packReveal = null;
      deckScreen.update(deckScreenView(true));
```

- [ ] **Step 5: Remove `lootInfo` and fix reset**

In the hud callbacks (~lines 705-718):

1. Delete the whole `lootInfo() { ... }` member.
2. In `onResetProgress`, replace `poolAtRunStart = meta.seenPool;` with `packReveal = null;`.

- [ ] **Step 6: Rewrite the deck-screen view and callbacks**

Replace `deckScreenView`, `learnSeenCards` and the `createDeckScreen` call (~lines 725-756) with:

```ts
function deckScreenView(visible: boolean) {
  return {
    visible,
    knownCards: meta.knownCards,
    collected: collectedCount(meta),
    pendingPacks: pendingPacks(meta),
    reveal: packReveal,
  };
}

const deckScreen = createDeckScreen(app, {
  onOpenPack() {
    if (pendingPacks(meta) === 0 || packReveal !== null) return;
    const drawn = openPack(ACQUIRABLE_CARDS, rng);
    const { meta: next, results } = applyPack(meta, drawn);
    meta = next;
    packReveal = results;
    saveMeta(storage, meta);
    deckScreen.update(deckScreenView(true));
  },
  onDismissReveal() {
    packReveal = null;
    deckScreen.update(deckScreenView(true));
  },
  onStart(selectedIds) {
    // A pack still waiting is the screen's own business - it hides the deck
    // builder - but guard anyway so a stray call cannot skip the reveal.
    if (pendingPacks(meta) > 0 || packReveal !== null) return;
    game = chooseDeck(game, buildPlayerDeck(meta.knownCards, selectedIds));
    deckScreen.update(deckScreenView(false));
    refresh();
  },
});
```

Delete the now-unused `learnedToShow` variable declaration wherever it sits.

- [ ] **Step 7: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: BOTH PASS. This is the first task where the build is green again.

If `tsc` reports anything still referencing `seenThisRun`, `seenPool`, `mergeSeen`, `unlockAllSeen`, `unlockCard`, `learnedToShow` or `lootInfo`, delete that reference - every one of them is dead.

- [ ] **Step 8: Verify in a real browser**

From the repo root: `npm run dev`, then open `http://127.0.0.1:4173/prototypes/02/`.

Check, in order:
1. Deck screen shows Raid, Subjugate and Fortify as toggles, and "0 of 9 collected".
2. Play a run to a loss or surrender. Postmortem shows "+N XP earned" with N > 0, and no cards-seen row.
3. Click New game. If N >= 25, a sealed pack is waiting, the deck builder is hidden, and the count reads "1 pack to open".
4. Click the pack. Two cards flip in, staggered. New ones carry a gold NEW tag.
5. Continue. The deck builder appears with the new cards selectable, and the collected count has gone up.
6. Reload the page. The new cards are still known - progress persisted.

- [ ] **Step 9: Commit**

```bash
git add 02-balticmap/src/main.ts
git commit -m "feat(balticmap): earn packs from play and open them at the deck screen"
```

- [ ] **Step 10: Run the balance suite**

Run: `npm run balance`
Expected: completes (about a minute). This is a card-acquisition change rather than a card-effect change, so the pacing bands should not move. If they do, report the numbers rather than re-freezing anything.

---

## Post-implementation

Per the repo card rule, this change alters deck availability, so end by **playing it**: start a fresh profile (Reset progress), play two runs, and say what looked wrong. Specifically watch whether pack #1 really does land after run 1 - if a first run earns well under 25 XP, the `XP_LEVEL_STEP` constant in `src/xp.ts` is the single number to adjust.

`POLICY_COVERAGE` needs no new entry: no card is added, removed, or changed in effect, legality or targeting. Every acquirable card already has its branch.
