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
  // The shuffle first, the size second. seededRng's FIRST output moves only
  // about 0.0004 per unit of seed, so drawing the size from it gave every
  // deck in a run of consecutive seeds the same size - 4 or 5 and nothing
  // else across 500 games. Eleven draws into the stream it is flat over 3..8.
  const order = shuffle(POOL, rng);
  const k = 3 + Math.floor(rng() * 6);
  const picked = order.slice(0, k);
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
