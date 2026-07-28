/** Headless balance run: how fast does a new player get subjugated, and does
 *  arming enemy decks with Subjugate and Raid change that?
 *
 *  npm run simulate -- --games=500 --cap=150 --seed=1 --arms=baseline,aggressive,control
 */
import { writeFileSync } from "node:fs";
import {
  aggregate, byFaction, pairedDelta, runBatch, DECK_ARMS,
  type ArmStats, type GameSummary,
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

const games = num("games", 500);
const turnCap = num("cap", 150);
const firstSeed = num("seed", 1);
const arms = flag("arms", "baseline,aggressive,control").split(",");
const jsonPath = flag("json", "");

for (const arm of arms) {
  if (!(arm in DECK_ARMS)) {
    throw new Error(
      `unknown arm "${arm}"; known: ${Object.keys(DECK_ARMS).join(", ")}`,
    );
  }
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const n1 = (x: number | null): string => (x === null ? "-" : x.toFixed(1));

const results = new Map<string, GameSummary[]>();
for (const arm of arms) {
  const started = process.hrtime.bigint();
  results.set(arm, runBatch({ games, turnCap, firstSeed, arm }));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`ran ${arm}: ${games} games in ${(ms / 1000).toFixed(1)}s`);
}

const stats: ArmStats[] = arms.map((arm) => aggregate(arm, results.get(arm)!));

console.log(
  `\n${games} games per arm, ${turnCap}-turn cap, seeds ${firstSeed}..${firstSeed + games - 1}` +
    `, human deck: 10x Grow potatoes\n`,
);

const cols = [
  ["arm", (s: ArmStats) => s.arm],
  ["subjugated", (s: ArmStats) => pct(s.subjugatedShare)],
  ["median turn", (s: ArmStats) => n1(s.medianFirstSubjugation)],
  ["mean turn", (s: ArmStats) => n1(s.meanFirstSubjugation)],
  ["never", (s: ArmStats) => String(s.neverSubjugated)],
  ["defeated", (s: ArmStats) => pct(s.defeatShare)],
  ["median defeat", (s: ArmStats) => n1(s.medianDefeatTurn)],
  ["times vassal", (s: ArmStats) => n1(s.meanSubjugations)],
  ["times freed", (s: ArmStats) => n1(s.meanReleases)],
] as const;

const rows = [
  cols.map(([h]) => h),
  ...stats.map((s) => cols.map(([, f]) => f(s))),
];
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const [i, row] of rows.entries()) {
  console.log(row.map((c, j) => c.padEnd(widths[j])).join("  "));
  if (i === 0) console.log(widths.map((w) => "-".repeat(w)).join("  "));
}

const reference = results.get(arms[0])!;
if (arms.length > 1) {
  console.log(`\npaired against ${arms[0]}, same seed and same starting land:`);
  for (const arm of arms.slice(1)) {
    const d = pairedDelta(results.get(arm)!, reference);
    const dir =
      d.meanTurnDelta === null ? "" : d.meanTurnDelta < 0 ? " sooner" : " later";
    console.log(
      `  ${arm}: ${n1(d.meanTurnDelta === null ? null : Math.abs(d.meanTurnDelta))}` +
        ` turns${dir} on average over ${d.bothSubjugated} shared games` +
        ` (subjugated only here: ${d.onlyThisArm}, only in ${arms[0]}: ${d.onlyReference})`,
    );
  }
}

for (const arm of arms) {
  const lands = byFaction(results.get(arm)!);
  const fmt = (f: (typeof lands)[number]): string =>
    `${f.factionId} ${n1(f.medianFirstSubjugation)} (${pct(f.subjugatedShare)} of ${f.games})`;
  console.log(`\n${arm} - fastest to fall: ${lands.slice(0, 5).map(fmt).join(", ")}`);
  console.log(`${arm} - longest held out: ${lands.slice(-5).reverse().map(fmt).join(", ")}`);
}

if (jsonPath !== "") {
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        config: { games, turnCap, firstSeed, arms },
        stats,
        byFaction: Object.fromEntries(
          arms.map((a) => [a, byFaction(results.get(a)!)]),
        ),
        games: Object.fromEntries(arms.map((a) => [a, results.get(a)!])),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${jsonPath}`);
}
