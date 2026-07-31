# Card Rarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the rare and epic pack tiers from a measured impact number, and leave behind a rule that places every future card without a fresh argument.

**Architecture:** One ordered `RARITY_TIERS` table in `src/cards.ts` replaces `RARITY_WEIGHTS`, the hand-written `CardRarity` union and the tier thresholds. A new `npm run rarity` script plays several hundred random decks and regresses the human's final realm size on card presence; its coefficients are written to `src/data/card-impact.json`. A card's tier is the highest tier whose `minImpact` its coefficient meets, and a test enforces that the `rarity` field agrees. A coloured band drawn from the same table shows the tier on every pack-pool card.

**Tech Stack:** TypeScript, Vite, vitest, happy-dom. No new dependencies; the least-squares solve is written out in the script.

**Spec:** `docs/superpowers/specs/2026-07-31-card-rarity-design.md`

## Global Constraints

- `npm test` and `npm run build` must both pass before every commit.
- `npm run rarity` must NOT be added to `npm test`. It takes minutes.
- Never interpolate a card or faction name into a player-facing string. Use `t()`, `card()`, `faction()` from `src/rich-text.ts`. See `CLAUDE.md`. No task here writes player-facing prose, so this should not come up; if you find yourself writing one, stop and re-read that rule.
- Do not reorder the `CARDS` object. `buildAiDeck` consumes one rng draw per entry in declaration order, and reordering silently moves every committed AI-deck band.
- Never use em dashes or non-typable unicode in code, comments, or output. Use `-`, `->`, `"`, `...`.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`. Other sessions work in this repo at the same time.
- Run every command from `/Users/janis.kirsteins/Projects/prototypes/02-balticmap`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/cards.ts` (modify) | Holds `RARITY_TIERS`, the derived `CardRarity` union, `BASE_RARITY`, `rarityForImpact`. Card defs keep their `rarity` field. |
| `src/packs.ts` (modify) | Reads `RARITY_TIERS` instead of owning `RARITY_WEIGHTS` and its own tier list. |
| `src/sim.ts` (modify) | `GameSummary` gains `finalRealmSize`, the regression's response variable. |
| `src/data/card-impact.json` (create) | The measured impact per card. Written by the script, read by a test. |
| `scripts/rarity.ts` (create) | The bulk pass: random decks, seeded games, least-squares fit, JSON output. |
| `src/rarity-band.ts` (create) | One DOM helper that paints a card element's tier band. The single place three render sites share. |
| `src/style.css` (modify) | One `.rarity-band::after` rule using `var(--rarity)`. |
| `src/hud.ts`, `src/deck-screen.ts` (modify) | Call `applyRarityBand` at the three places a card is built. |
| `scripts/balance.ts` (modify) | Prints tier sizes and real per-card draw odds. |
| `CLAUDE.md` (modify) | Card gate gains the measured-impact line. |

---

### Task 1: The regression's response variable

`GameSummary` records outcome, subjugation turns and counts. None of those is continuous, and `victoryShare` over a few dozen games cannot separate eight cards. Add the human's final realm size.

**Files:**
- Modify: `src/sim.ts` (the `GameSummary` interface near line 93, and `summarize` near line 112)
- Test: `tests/sim.test.ts`

**Interfaces:**
- Consumes: `fullRealmOf(root, overlords, incorporated): Set<string>` from `src/relations.ts`.
- Produces: `GameSummary.finalRealmSize: number`, used by `scripts/rarity.ts` in Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `tests/sim.test.ts`, inside the existing `describe("summarize", ...)` block if there is one, otherwise as a new `describe` block at the end of the file:

```ts
describe("summarize finalRealmSize", () => {
  it("counts every land under the human, not just direct holdings", () => {
    const base = startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES));
    const state: GameState = {
      ...base,
      overlords: new Map([[SIM_FACTION_IDS[1], HUMAN]]),
      incorporated: { [SIM_FACTION_IDS[2]]: SIM_FACTION_IDS[1] },
    };
    // The human, their vassal, and the land that vassal annexed: three.
    expect(summarize(state, 1, HUMAN).finalRealmSize).toBe(3);
  });

  it("scores zero once the human has been incorporated", () => {
    const base = startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES));
    const state: GameState = {
      ...base,
      incorporated: { [HUMAN]: SIM_FACTION_IDS[1] },
    };
    expect(summarize(state, 1, HUMAN).finalRealmSize).toBe(0);
  });
});
```

`SIM_ETHNICITIES` must be added to the `../src/sim` import list at the top of the file if it is not already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim.test.ts -t "finalRealmSize"`
Expected: FAIL, `expected undefined to be 3`.

- [ ] **Step 3: Implement**

In `src/sim.ts`, add to the imports:

```ts
import { fullRealmOf } from "./relations";
```

Add the field to `GameSummary`, after `turns`:

```ts
  /** Lands under the human when the game ended, by `fullRealmOf` - the
   *  "how much of the map is theirs" question, per the two-realm-sizes rule in
   *  CLAUDE.md. Zero once the human has been incorporated: `realmOf` always
   *  includes its own root, so a conquered faction would otherwise score 1.
   *  This is the continuous outcome the rarity regression fits against; the
   *  other fields here are all counts or turn numbers. */
  finalRealmSize: number;
```

In `summarize`, add before the `return`:

```ts
  // Their land belongs to the conqueror, so nothing is theirs.
  const conquered = state.incorporated[humanFaction] !== undefined;
```

and add to the returned object:

```ts
    finalRealmSize: conquered
      ? 0
      : fullRealmOf(humanFaction, state.overlords, state.incorporated).size,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim.test.ts -t "finalRealmSize"`
Expected: PASS.

- [ ] **Step 5: Check nothing else broke**

Run: `npm test && npm run build`
Expected: both pass. `tests/rulers.test.ts` also builds `GameSummary` values; if it constructs one as an object literal it now needs `finalRealmSize`, and the compiler will say so.

- [ ] **Step 6: Commit**

```bash
git add src/sim.ts tests/sim.test.ts
git commit -m "feat(balticmap): a run's summary carries the realm it ended with"
```

---

### Task 2: One ordered tier table

`RARITY_WEIGHTS` in `src/packs.ts`, the `CardRarity` union in `src/cards.ts` and the tier order in `TIERS` are three statements of the same fact. Collapse them. This task changes no behaviour: the new thresholds start at positive infinity, so every card stays common.

**Files:**
- Modify: `src/cards.ts:1-20`, `src/packs.ts`
- Test: `tests/cards.test.ts`, `tests/packs.test.ts`

**Interfaces:**
- Produces: `RARITY_TIERS: readonly RarityTier[]`, `type CardRarity`, `BASE_RARITY: CardRarity`, `rarityForImpact(impact: number): CardRarity`, all exported from `src/cards.ts`. Task 3 uses `rarityForImpact`; Task 5 uses `RARITY_TIERS[n].colour`; Task 6 uses `weight` and `id`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/cards.test.ts`:

```ts
describe("rarity tiers", () => {
  it("orders tiers by ascending minImpact", () => {
    const mins = RARITY_TIERS.map((t) => t.minImpact);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it("gives a harder-to-reach tier a smaller weight", () => {
    const weights = RARITY_TIERS.map((t) => t.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("weights sum to 100, so they read as percentages", () => {
    expect(RARITY_TIERS.reduce((sum, t) => sum + t.weight, 0)).toBe(100);
  });

  it("puts the base tier first and lets anything reach it", () => {
    expect(RARITY_TIERS[0].id).toBe(BASE_RARITY);
    expect(rarityForImpact(Number.NEGATIVE_INFINITY)).toBe(BASE_RARITY);
  });

  it("returns the highest tier the impact reaches", () => {
    const top = RARITY_TIERS[RARITY_TIERS.length - 1];
    expect(rarityForImpact(top.minImpact)).toBe(top.id);
  });
});
```

Add `RARITY_TIERS, BASE_RARITY, rarityForImpact` to the existing `../src/cards` import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cards.test.ts -t "rarity tiers"`
Expected: FAIL, `RARITY_TIERS is not defined`.

- [ ] **Step 3: Implement the table in `src/cards.ts`**

Replace the existing `CardRarity` type declaration at the top of the file (lines 1-4) with:

```ts
/** One pack draw tier: how much of a slot it takes, what impact a card needs
 *  to reach it, and the colour of the band a card of that tier wears.
 *
 *  The table is ordered, ascending by minImpact, and the first entry is the
 *  base tier: it is what an unreachable threshold and an empty tier both fall
 *  back to. Adding a fourth tier is one entry here and nothing else.
 *
 *  `rollTier` consumes exactly one rng value whatever it returns, and
 *  `openPack` exactly two per slot, so a new tier does not shift the draw count
 *  and committed seeds stay comparable. It does change which tier a given roll
 *  lands in, which is expected - the same caution `CARDS` carries below about
 *  its own declaration order.
 *
 *  minImpact is in lands: the coefficient of the card in the realm-size
 *  regression run by `npm run rarity`. See the 2026-07-31 card-rarity design. */
export interface RarityTier {
  id: string;
  weight: number;
  minImpact: number;
  colour: string;
}

export const RARITY_TIERS = [
  { id: "common", weight: 70, minImpact: Number.NEGATIVE_INFINITY, colour: "#6d6355" },
  { id: "rare",   weight: 25, minImpact: Number.POSITIVE_INFINITY, colour: "#1f6fd0" },
  { id: "epic",   weight:  5, minImpact: Number.POSITIVE_INFINITY, colour: "#7b2fbf" },
] as const satisfies readonly RarityTier[];

export type CardRarity = (typeof RARITY_TIERS)[number]["id"];

/** The tier nothing can fail to reach. Also the fallback when a rolled tier
 *  holds no cards. */
export const BASE_RARITY: CardRarity = RARITY_TIERS[0].id;

/** The highest tier this impact reaches. Relies on the ascending minImpact
 *  order, which `tests/cards.test.ts` enforces. */
export function rarityForImpact(impact: number): CardRarity {
  let out: CardRarity = BASE_RARITY;
  for (const tier of RARITY_TIERS) {
    if (impact >= tier.minImpact) out = tier.id;
  }
  return out;
}
```

The two `POSITIVE_INFINITY` thresholds are deliberate. Nothing reaches rare or epic until Task 4 measures the pool, so this task is behaviour-preserving.

Update the comment on `CardDef.rarity` (was line 16) to:

```ts
  /** Pack draw tier. Set from the measured impact table, not by hand; see
   *  `rarityForImpact` and tests/cards.test.ts. */
  rarity: CardRarity;
```

- [ ] **Step 4: Rewrite `src/packs.ts` to read the table**

Replace the imports, `RARITY_WEIGHTS`, `TIERS` and `rollTier` with:

```ts
import {
  BASE_RARITY, CARDS, RARITY_TIERS, type CardRarity, type Rng,
} from "./cards";

/** Cards revealed per pack. Two is enough for a reveal to have a beat to it
 *  without a pack becoming a whole screen of cards. */
export const PACK_SIZE = 2;

function rollTier(rng: Rng): CardRarity {
  const total = RARITY_TIERS.reduce((sum, t) => sum + t.weight, 0);
  let roll = rng() * total;
  for (const tier of RARITY_TIERS) {
    roll -= tier.weight;
    if (roll < 0) return tier.id;
  }
  return BASE_RARITY;
}
```

In `openPack`, replace the `byTier` and `commons` lines with:

```ts
  const byTier = new Map<CardRarity, string[]>(
    RARITY_TIERS.map((t) => [
      t.id,
      acquirableIds.filter((id) => CARDS[id]?.rarity === t.id),
    ]),
  );
  const base = byTier.get(BASE_RARITY) ?? [];
```

and replace the `commons` reference inside the loop with `base`. Leave the rest of `openPack` exactly as it is: the two-rng-values-per-slot contract and the duplicate behaviour must not change.

- [ ] **Step 5: Fix the test import**

`tests/packs.test.ts` imports `RARITY_WEIGHTS` from `../src/packs`. That export is gone. Change its import to take `PACK_SIZE, openPack` from `../src/packs` and `RARITY_TIERS` from `../src/cards`, and update any assertion that named `RARITY_WEIGHTS` to read `RARITY_TIERS.find((t) => t.id === "common")?.weight` and so on.

Run this first to find every reference:

```bash
grep -rn "RARITY_WEIGHTS" src tests scripts
```

Expected after the fix: no matches.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run build`
Expected: both pass. Pack behaviour is unchanged, so no pack test should need new expectations.

- [ ] **Step 7: Commit**

```bash
git add src/cards.ts src/packs.ts tests/cards.test.ts tests/packs.test.ts
git commit -m "refactor(balticmap): the pack tiers are one ordered table"
```

---

### Task 3: The bulk pass

Measure every deck-buildable card's impact by regressing final realm size on card presence across several hundred random decks.

**Files:**
- Create: `scripts/rarity.ts`
- Create: `src/data/card-impact.json` (a stub here; Task 4 fills it with the real measurement)
- Modify: `package.json` (one script entry)

**Interfaces:**
- Consumes: `GameSummary.finalRealmSize` (Task 1), `rarityForImpact` (Task 2), `runGame`, `HUMAN_POLICIES`, `SIM_FACTION_IDS`, `seededRng` from `src/sim.ts`, `CARDS`, `DECK_SIZE`, `shuffle`, `ACQUIRABLE_CARDS`, `type Rng` from `src/cards.ts`.
- Produces: `src/data/card-impact.json` shaped `{ games, firstSeed, turnCap, impact: Record<string, number> }`. Task 4 writes the conformance tests that read it.

This task has no unit test. Its deliverable is a script, like `scripts/balance.ts`, which has none either. Step 6 is its verification. The conformance tests that check a card's tier against this data live in Task 4, where they go green in the same commit that measures.

- [ ] **Step 1: Create the stub data file**

`src/data/card-impact.json`:

```json
{
  "games": 0,
  "firstSeed": 0,
  "turnCap": 0,
  "impact": {}
}
```

- [ ] **Step 2: Write the script**

`scripts/rarity.ts`:

```ts
/** The rarity pass: how much is each card actually worth?
 *
 *  Builds random legal decks, plays each with the competent policy on a fixed
 *  seed, and regresses the human's final realm size on which cards the deck
 *  held. Each card's coefficient is its impact in lands. That number is what
 *  decides its pack tier - see `rarityForImpact` in src/cards.ts and the
 *  2026-07-31 card-rarity design doc.
 *
 *  Deliberately not part of `npm test` or `npm run balance`: it plays hundreds
 *  of full games. Run it when a batch of card work settles.
 *
 *  npm run rarity
 *  npm run rarity -- --games=800 --cap=150 --seed=1
 */
import { writeFileSync } from "node:fs";
import {
  ACQUIRABLE_CARDS, CARDS, DECK_SIZE, rarityForImpact, shuffle, type Rng,
} from "../src/cards";
import { HUMAN_POLICIES, SIM_FACTION_IDS, runGame, seededRng } from "../src/sim";

function flag(name: string, fallback: string): string {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

function num(name: string, fallback: number): number {
  const raw = flag(name, String(fallback));
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--${name} must be a positive number, got "${raw}"`);
  }
  return Math.floor(n);
}

const games = num("games", 500);
const turnCap = num("cap", 150);
const firstSeed = num("seed", 1);

/** Every card a deck may hold, basics excluded. The starting cards are in here
 *  too: they never take a tier, but their impact is the scale the thresholds
 *  are read against. */
const POOL: string[] = Object.values(CARDS)
  .filter((c) => c.deckBuildable && c.maxPerDeck !== null)
  .map((c) => c.id);

/** A deck holding between 3 and 8 non-basics, padded with Grow turnips.
 *  Not a uniform draw over the pool: with 12 non-basics and 10 slots, a
 *  uniform deck holds nearly everything and the fit sees no contrast. */
function randomDeck(rng: Rng): string[] {
  const k = 3 + Math.floor(rng() * 6);
  const picked = shuffle(POOL, rng).slice(0, k);
  return [
    ...picked,
    ...Array.from({ length: DECK_SIZE - picked.length }, () => "grow-crops"),
  ];
}

/** Solves `a x = b` by Gauss-Jordan with partial pivoting. `a` is square and
 *  is modified in place. Written out rather than pulled in: the repo carries
 *  no statistics dependency and this is the only linear algebra in it. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) {
      throw new Error(
        `singular normal equations at column ${col} - some card is present in ` +
          "every deck or in none, so its effect cannot be separated",
      );
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    const d = a[col][col];
    for (let j = col; j < n; j++) a[col][j] /= d;
    b[col] /= d;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = a[row][col];
      if (f === 0) continue;
      for (let j = col; j < n; j++) a[row][j] -= f * a[col][j];
      b[row] -= f * b[col];
    }
  }
  return b;
}

// One row per game: a leading 1 for the intercept, then one 0/1 per card.
const rows: number[][] = [];
const y: number[] = [];

const started = process.hrtime.bigint();
for (let i = 0; i < games; i++) {
  const seed = firstSeed + i;
  const deck = randomDeck(seededRng(seed));
  const summary = runGame({
    seed,
    humanFaction: SIM_FACTION_IDS[i % SIM_FACTION_IDS.length],
    turnCap,
    humanDeck: deck,
    humanTurn: HUMAN_POLICIES.competent,
  });
  const held = new Set(deck);
  rows.push([1, ...POOL.map((id) => (held.has(id) ? 1 : 0))]);
  y.push(summary.finalRealmSize);
}
const ms = Number(process.hrtime.bigint() - started) / 1e6;

// Normal equations: (X'X) beta = X'y.
const p = POOL.length + 1;
const xtx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
const xty: number[] = new Array(p).fill(0);
for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  for (let i = 0; i < p; i++) {
    xty[i] += row[i] * y[r];
    for (let j = 0; j < p; j++) xtx[i][j] += row[i] * row[j];
  }
}
const beta = solve(xtx, xty);

const impact: Record<string, number> = {};
POOL.forEach((id, i) => {
  impact[id] = Math.round(beta[i + 1] * 1000) / 1000;
});

console.log(
  `${games} random decks, ${turnCap}-turn cap, seeds ` +
    `${firstSeed}..${firstSeed + games - 1}, ran in ${(ms / 1000).toFixed(1)}s`,
);
console.log(`baseline realm size (intercept) ${beta[0].toFixed(2)} lands\n`);

console.log("impact in lands, per card");
const width = Math.max(...POOL.map((id) => id.length));
const ranked = [...POOL].sort((a, b) => impact[b] - impact[a]);
for (const id of ranked) {
  const inPool = ACQUIRABLE_CARDS.includes(id);
  const tier = inPool ? rarityForImpact(impact[id]) : "-";
  console.log(
    `  ${id.padEnd(width)}  ${impact[id].toFixed(3).padStart(7)}  ` +
      `${inPool ? tier : "(not in packs)"}`,
  );
}

writeFileSync(
  new URL("../src/data/card-impact.json", import.meta.url),
  `${JSON.stringify({ games, firstSeed, turnCap, impact }, null, 2)}\n`,
);
console.log("\nwrote src/data/card-impact.json");
```

- [ ] **Step 3: Add the npm script**

In `package.json`, after the `"balance"` entry:

```json
    "rarity": "vite-node scripts/rarity.ts",
```

- [ ] **Step 4: Smoke-test the script cheaply**

Run: `npm run rarity -- --games=40 --cap=60`
Expected: it prints a ranked impact table, every card listed once, and "wrote src/data/card-impact.json". Forty games is far too few to trust the numbers; this step only proves the script runs and the solve does not go singular.

If it throws `singular normal equations`, the deck sampler is not producing contrast. Check that `randomDeck` is drawing `k` from 3 to 8 and not filling every slot.

- [ ] **Step 5: Restore the stub before committing**

The smoke run overwrote the stub with untrustworthy numbers. Put the stub back:

```bash
git checkout src/data/card-impact.json
```

The real measurement is Task 4. Committing 40-game numbers would look like evidence and is not.

- [ ] **Step 6: Verify the gate**

Run: `npm test && npm run build`
Expected: both pass. Nothing in this task changes game behaviour.

- [ ] **Step 7: Commit**

```bash
git add scripts/rarity.ts src/data/card-impact.json package.json
git commit -m "feat(balticmap): a card's worth is measured, not argued"
```

---

### Task 4: Measure, then set the thresholds

The only task with a judgement in it. Everything before it is machinery; everything after reads the result.

**Files:**
- Modify: `src/data/card-impact.json` (regenerated), `src/cards.ts` (two thresholds, eight `rarity` fields), `tests/cards.test.ts` (the conformance tests and the exact-props assertions)

**Interfaces:**
- Consumes: `npm run rarity` from Task 3, `rarityForImpact` and `BASE_RARITY` from Task 2.
- Produces: the frozen `minImpact` values for rare and epic.

- [ ] **Step 1: Write the failing conformance tests**

Add to `tests/cards.test.ts`:

```ts
import impactData from "../src/data/card-impact.json";

describe("rarity assignment", () => {
  it("gives every pack-pool card the tier its measured impact reaches", () => {
    const impact: Record<string, number> = impactData.impact;
    for (const id of ACQUIRABLE_CARDS) {
      expect(impact[id], `no measured impact for ${id}`).toBeTypeOf("number");
      expect(CARDS[id].rarity).toBe(rarityForImpact(impact[id]));
    }
  });

  it("keeps every card outside the pack pool at the base tier", () => {
    for (const card of Object.values(CARDS)) {
      if (ACQUIRABLE_CARDS.includes(card.id)) continue;
      expect(card.rarity, `${card.id} is not in a pack`).toBe(BASE_RARITY);
    }
  });
});
```

These two together are what stop a card being hand-tagged.

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `npx vitest run tests/cards.test.ts -t "rarity assignment"`
Expected: the first FAILS with `no measured impact for shrewd-marriage`, because the stub table is empty. The second PASSES: every card is still common.

- [ ] **Step 3: Run the real measurement**

Run: `npm run rarity`
Expected: about two minutes at the measured 246ms per game. It prints the ranked table and rewrites `src/data/card-impact.json`.

- [ ] **Step 4: Confirm the ranking is stable**

Run: `npm run rarity -- --seed=2000`
Compare the two rankings. The top three and bottom three should be the same cards. If they are not, the fit is noise: rerun with `--games=1500` and use that, and say so in the commit message.

Then rerun `npm run rarity` with no flags so the committed JSON is the default-seed run.

- [ ] **Step 5: Choose the two thresholds**

Read the printed table, restricted to the eight cards marked as in-pool. Pick:

- `E`, the epic threshold, so that **1 or 2** cards reach it.
- `R`, the rare threshold, so that **2 or 3** more cards reach it.

The rest fall to common. Put each threshold in the gap between two cards' impacts, not on a card's exact value, so a rerun that moves a coefficient by 0.001 does not silently re-tier anything.

Sanity check against the starting cards, which are printed but never tiered. If no pool card reaches Subjugate's impact, the epic tier is describing something weaker than a card the player already owns. That is allowed, but note it in the commit message.

- [ ] **Step 6: Write the thresholds into the table**

In `src/cards.ts`, replace the two `Number.POSITIVE_INFINITY` values in `RARITY_TIERS` with the chosen numbers, and add a comment recording where they came from:

```ts
export const RARITY_TIERS = [
  { id: "common", weight: 70, minImpact: Number.NEGATIVE_INFINITY, colour: "#6d6355" },
  // Thresholds set once from the 500-deck run in src/data/card-impact.json and
  // then frozen. They are cut points in the gaps between measured impacts, so a
  // rerun that nudges a coefficient does not re-tier a card the player owns.
  { id: "rare",   weight: 25, minImpact: 0.00, colour: "#1f6fd0" },
  { id: "epic",   weight:  5, minImpact: 0.00, colour: "#7b2fbf" },
] as const satisfies readonly RarityTier[];
```

Replace both `0.00` with the values chosen in Step 5.

- [ ] **Step 7: Retag the eight pool cards**

For each id in `ACQUIRABLE_CARDS`, set its `rarity` field in `CARDS` to the tier `rarityForImpact` gives it. The conformance test from Task 3 is the check; do not guess.

The eight are: `shrewd-marriage`, `incorporate`, `assassinate-ruler`, `alliance`, `extended-diplomacy`, `bodyguard`, `favourable-omens`, `found-settlement`.

Leave every other card at `"common"`.

- [ ] **Step 8: Update the exact-props test**

`tests/cards.test.ts` has an assertion that spells out every field of every card, including `rarity`. Update the `rarity` argument for the eight retagged cards. Its `it(...)` title says "nine card types" and is already stale; leave the title alone unless you are fixing it deliberately.

- [ ] **Step 9: Run the tests**

Run: `npm test && npm run build`
Expected: both pass, including both "rarity assignment" tests.

- [ ] **Step 10: Check the packs still open**

Run: `npx vitest run tests/packs.test.ts`
Expected: PASS. If a pack test asserted a specific drawn card by scripting the rng, it may now land in a different tier and need its expected id updated. Update the expectation, not `openPack`.

- [ ] **Step 11: Commit**

```bash
git add src/cards.ts src/data/card-impact.json tests/cards.test.ts
git commit -m "feat(balticmap): rare and epic have cards in them at last"
```

Put the ranked table in the commit body, and the reason each threshold sits where it does.

---

### Task 5: The coloured band

Three places build a card element. The tier colour must be read from `RARITY_TIERS` in exactly one of them.

**Files:**
- Create: `src/rarity-band.ts`
- Modify: `src/style.css`, `src/hud.ts:963`, `src/deck-screen.ts:148`, `src/deck-screen.ts:189`
- Test: `tests/deck-screen.test.ts`

**Interfaces:**
- Consumes: `RARITY_TIERS`, `CARDS`, `ACQUIRABLE_CARDS` from `src/cards.ts`.
- Produces: `applyRarityBand(el: HTMLElement, cardId: string): void`.

- [ ] **Step 1: Write the failing test**

Add to `tests/deck-screen.test.ts`:

```ts
describe("rarity band", () => {
  it("bands a pack-pool card with its tier colour", () => {
    const el = document.createElement("div");
    const id = ACQUIRABLE_CARDS[0];
    applyRarityBand(el, id);
    const tier = RARITY_TIERS.find((t) => t.id === CARDS[id].rarity);
    expect(el.classList.contains("rarity-band")).toBe(true);
    expect(el.style.getPropertyValue("--rarity")).toBe(tier?.colour);
  });

  it("leaves a card that never came from a pack unbanded", () => {
    const el = document.createElement("div");
    applyRarityBand(el, "grow-crops");
    expect(el.classList.contains("rarity-band")).toBe(false);
    expect(el.style.getPropertyValue("--rarity")).toBe("");
  });
});
```

Import `applyRarityBand` from `../src/rarity-band` and `ACQUIRABLE_CARDS, CARDS, RARITY_TIERS` from `../src/cards`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/deck-screen.test.ts -t "rarity band"`
Expected: FAIL, cannot resolve `../src/rarity-band`.

- [ ] **Step 3: Write the helper**

`src/rarity-band.ts`:

```ts
import { ACQUIRABLE_CARDS, CARDS, RARITY_TIERS } from "./cards";

/** Paints a card element's tier band.
 *
 *  One helper rather than three call sites each reaching into RARITY_TIERS,
 *  for the reason CLAUDE.md records about `cardName` being written twice: a
 *  colour spelled in three files follows a rename in none of them. The colour
 *  travels as a custom property so `src/style.css` needs one rule for every
 *  tier, present and future.
 *
 *  A card outside the pack pool gets no band. Rarity says how a card is
 *  acquired, and Grow turnips, the tribute cards and Revolt are never drawn. */
export function applyRarityBand(el: HTMLElement, cardId: string): void {
  if (!ACQUIRABLE_CARDS.includes(cardId)) return;
  const tier = RARITY_TIERS.find((t) => t.id === CARDS[cardId]?.rarity);
  if (tier === undefined) return;
  el.classList.add("rarity-band");
  el.style.setProperty("--rarity", tier.colour);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/deck-screen.test.ts -t "rarity band"`
Expected: PASS.

- [ ] **Step 5: Add the one CSS rule**

In `src/style.css`, after the `.card.card-armed` block:

```css
/* The tier band. One rule for every tier: the colour arrives as --rarity from
   applyRarityBand, so a new tier is an entry in RARITY_TIERS and nothing here.
   Saturated on purpose - the map's faction fills are all muted pastels, so a
   band never reads as somebody's territory. */
.rarity-band::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 4px;
  background: var(--rarity);
  border-radius: 0 0 7px 7px;
  pointer-events: none;
}
```

`.card` is already `position: relative`. `.ds-card` and `.ds-pack-card` are not. Add `position: relative;` to both rules, or the band will anchor to the wrong box.

- [ ] **Step 6: Wire the three call sites**

`src/hud.ts`, in `renderHand`, immediately after `card.className = "card";`:

```ts
      applyRarityBand(card, cardId);
```

`src/deck-screen.ts`, immediately after `el.className = "ds-pack-card";`:

```ts
            applyRarityBand(el, r.id);
```

`src/deck-screen.ts`, immediately after `card.className = "ds-card";`:

```ts
        applyRarityBand(card, id);
```

Add `import { applyRarityBand } from "./rarity-band";` to both files.

- [ ] **Step 7: Run the suite**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 8: Look at it**

Start the root dev server and open `http://127.0.0.1:4173/prototypes/`, then this prototype. Do not serve this prototype at a bare root; the repo `CLAUDE.md` says why.

```bash
cd /Users/janis.kirsteins/Projects/prototypes && npm run dev
```

Check three things and read the text in any screenshot you take, per the reading rule in `CLAUDE.md`:

1. Cards in hand carry a band at the bottom edge, and Grow turnips does not.
2. The deck screen's picker shows the same band on the same cards, on its light boxes.
3. A pack reveal shows the band on its dark `.ds-pack-card` boxes, and the band is visible against `#1b1710`.

If the epic colour disappears on the dark pack card, lighten it in `RARITY_TIERS` rather than adding a second colour anywhere.

- [ ] **Step 9: Commit**

```bash
git add src/rarity-band.ts src/style.css src/hud.ts src/deck-screen.ts tests/deck-screen.test.ts
git commit -m "feat(balticmap): a card wears the tier it was drawn from"
```

---

### Task 6: The report block and the gate

A tier's share is fixed but a card's share falls as its tier fills, so a tier can quietly become undrawable. The report has to say so.

**Files:**
- Modify: `scripts/balance.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: `RARITY_TIERS`, `ACQUIRABLE_CARDS`, `CARDS` from `src/cards.ts`, `PACK_SIZE` from `src/packs.ts`.

- [ ] **Step 1: Add the rarity block**

In `scripts/balance.ts`, extend the imports:

```ts
import { ACQUIRABLE_CARDS, CARDS, RARITY_TIERS } from "../src/cards";
import { PACK_SIZE } from "../src/packs";
```

and append at the end of the file:

```ts
// Tier weight is fixed; a card's share of it falls as the tier fills, and an
// empty tier hands its weight to the base tier via openPack's fallback. Print
// what a player's odds actually are rather than what the weights say.
console.log("\nrarity");
const members = new Map(
  RARITY_TIERS.map((t) => [
    t.id,
    ACQUIRABLE_CARDS.filter((id) => CARDS[id]?.rarity === t.id),
  ]),
);
const baseId = RARITY_TIERS[0].id;
const effective = new Map(RARITY_TIERS.map((t) => [t.id, t.weight]));
for (const tier of RARITY_TIERS) {
  if ((members.get(tier.id) ?? []).length === 0 && tier.id !== baseId) {
    effective.set(tier.id, 0);
    effective.set(baseId, (effective.get(baseId) ?? 0) + tier.weight);
  }
}
const totalWeight = RARITY_TIERS.reduce((sum, t) => sum + t.weight, 0);
const tierWidth = Math.max(...RARITY_TIERS.map((t) => t.id.length));
for (const tier of RARITY_TIERS) {
  const cards = members.get(tier.id) ?? [];
  const slotShare = (effective.get(tier.id) ?? 0) / totalWeight;
  const perCard = cards.length === 0 ? 0 : slotShare / cards.length;
  const perPack = 1 - (1 - perCard) ** PACK_SIZE;
  console.log(
    `  ${tier.id.padEnd(tierWidth)}  ${String(cards.length).padStart(2)} cards` +
      `  ${pct(slotShare).padStart(6)} of a slot` +
      `  ${pct(perPack).padStart(6)} per pack per card`,
  );
  if (cards.length > 0 && perPack < 0.02) {
    console.log(
      `    WARNING - ${tier.id} holds ${cards.length} cards, so one of them ` +
        "shows up less than once in 50 packs",
    );
  }
}
```

- [ ] **Step 2: Run the report**

Run: `npm run balance`
Expected: the existing report, then a `rarity` block listing all three tiers with their card counts and real odds. With eight cards split roughly 4/3/1, no warning should fire.

- [ ] **Step 3: Add the gate line**

In `02-balticmap/CLAUDE.md`, in the `## Card changes` section, after the `NOTICE_RULES` sentence:

```markdown
A new deck-buildable card also needs a measured impact and the tier that
follows from it. Run `npm run rarity` with the card added to `CARDS`, or, for
a single card, one arm against the frozen reference deck; then set its
`rarity` from `rarityForImpact`. The conformance test in
`tests/cards.test.ts` fails until you do, and hand-tagging a card fails it
too. Cards outside `ACQUIRABLE_CARDS` are common by rule and wear no band.
See the 2026-07-31 card-rarity design doc.
```

- [ ] **Step 4: Run the full gate**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/balance.ts CLAUDE.md
git commit -m "feat(balticmap): the report says what a tier is really worth"
```

---

## Deferred

Named here so a later reader knows they were decided, not forgotten:

- The single-arm placement of one new card against a frozen reference deck is documented in the spec and in the gate line above, but no script is written for it. Eight cards is small enough that `npm run rarity` is the honest tool today. Write the single-arm script when the pool passes roughly 20 cards and a full pass stops being cheap.
- The 70 / 25 / 5 weights are the acquisition spec's numbers and are not retuned here.
