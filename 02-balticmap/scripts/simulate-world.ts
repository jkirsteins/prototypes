/** Headless conquest run: how long does a world of equal decks take to
 *  resolve, and do the scaling Raid and Favourable omens shorten it?
 *
 *  npm run simulate:world -- --games=52 --cap=200 --seed=1 --arms=conquest-flat,conquest-scaled,conquest-omens
 */
import {
  WORLD_ARMS, aggregateWorld, runWorldBatch,
  type WorldStats, type WorldSummary,
} from "../src/sim";

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

const games = num("games", 52);
const turnCap = num("cap", 200);
const firstSeed = num("seed", 1);
const arms = flag(
  "arms",
  "conquest-flat,conquest-scaled,conquest-omens",
).split(",");

for (const arm of arms) {
  if (!(arm in WORLD_ARMS)) {
    throw new Error(
      `unknown world arm "${arm}"; known: ${Object.keys(WORLD_ARMS).join(", ")}`,
    );
  }
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const n1 = (x: number | null): string => (x === null ? "-" : x.toFixed(1));

const results = new Map<string, WorldSummary[]>();
for (const arm of arms) {
  const started = process.hrtime.bigint();
  results.set(arm, runWorldBatch({ games, turnCap, firstSeed, arm }));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`ran ${arm}: ${games} worlds in ${(ms / 1000).toFixed(1)}s`);
}

const stats: WorldStats[] = arms.map((arm) =>
  aggregateWorld(arm, results.get(arm)!),
);

console.log(
  `\n${games} worlds per arm, ${turnCap}-turn cap, ` +
    `seeds ${firstSeed}..${firstSeed + games - 1}, 26 equal seats\n`,
);

const cols: [string, (s: WorldStats) => string][] = [
  ["arm", (s) => s.arm],
  ["unified", (s) => pct(s.unifiedShare)],
  ["median end", (s) => n1(s.medianEndTurn)],
  ["mean end", (s) => n1(s.meanEndTurn)],
  ["capped", (s) => pct(s.capShare)],
  ["median stall", (s) => n1(s.medianStallTurns)],
  ["median biggest realm", (s) => n1(s.medianLargestRealm)],
  ["mean subjugations", (s) => n1(s.meanSubjugations)],
  ["mean incorporations", (s) => n1(s.meanIncorporations)],
];

const widths = cols.map(([head, get]) =>
  Math.max(head.length, ...stats.map((s) => get(s).length)),
);
const row = (cells: string[]): string =>
  cells.map((c, i) => c.padEnd(widths[i])).join("  ");

console.log(row(cols.map(([head]) => head)));
console.log(row(widths.map((w) => "-".repeat(w))));
for (const s of stats) console.log(row(cols.map(([, get]) => get(s))));
