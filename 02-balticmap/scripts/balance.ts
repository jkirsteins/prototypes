/** The balance report: is any card ignored, wasted, dominant, or targeted with
 *  an unintended bias, and do worlds still resolve?
 *
 *  Run it when a batch of card work settles, when a card feels wrong, or when a
 *  playtest went badly and you want to know why. It is not part of `npm test`.
 *
 *  npm run balance
 *  npm run balance -- --games=24 --cap=200 --arm=all-warpath
 */
import { CARDS } from "../src/cards";
import {
  aggregateWorld, BUILD_ARMS, runWorldBatch, type BuildArm,
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

const games = num("games", 12);
const turnCap = num("cap", 150);
const firstSeed = num("seed", 1);
const arm = flag("arm", "mixed") as BuildArm;

if (!BUILD_ARMS.includes(arm)) {
  throw new Error(
    `unknown build arm "${arm}"; known: ${BUILD_ARMS.join(", ")}`,
  );
}

const pct = (x: number | null): string =>
  x === null ? "-" : `${(x * 100).toFixed(1)}%`;
const n1 = (x: number | null): string => (x === null ? "-" : x.toFixed(1));

const started = process.hrtime.bigint();
const stats = aggregateWorld(arm, runWorldBatch({ games, turnCap, firstSeed, arm }));
const ms = Number(process.hrtime.bigint() - started) / 1e6;

console.log(
  `${games} worlds on the ${arm} arm, ${turnCap}-turn cap, ` +
    `seeds ${firstSeed}..${firstSeed + games - 1}, ran in ${(ms / 1000).toFixed(1)}s\n`,
);

console.log("resolution");
console.log(`  unified            ${pct(stats.unifiedShare)}`);
console.log(`  capped             ${pct(stats.capShare)}`);
console.log(`  median end turn    ${n1(stats.medianEndTurn)}`);
// The stalemate number: turns of silence before a capped world gave up.
console.log(`  median stall turns ${n1(stats.medianStallTurns)}`);
console.log(`  median vassalage   ${n1(stats.medianVassalTenure)} turns`);

console.log("\nplay share by card");
const played = Object.entries(stats.playShareByCard).sort((a, b) => b[1] - a[1]);
const width = Math.max(...Object.keys(CARDS).map((id) => id.length));
for (const [id, share] of played) {
  console.log(`  ${id.padEnd(width)}  ${pct(share).padStart(6)}`);
}

// A deck-buildable card nobody ever kept from a harvest is the "ignored" case
// the report exists to surface: the offer is the whole acquisition route now,
// so an unpicked card is a card the game effectively does not have.
console.log("\nharvest picks");
const picked = Object.entries(stats.harvestPickShareByCard)
  .sort((a, b) => b[1] - a[1]);
for (const [id, share] of picked) {
  console.log(`  ${id.padEnd(width)}  ${pct(share).padStart(6)}`);
}
console.log(`  skipped offers: ${stats.harvestsSkippedTotal}`);
const neverPicked = Object.values(CARDS)
  .filter((c) => c.deckBuildable && c.id !== "grow-crops")
  .map((c) => c.id)
  .filter((id) => !(id in stats.harvestPickShareByCard));
console.log(
  neverPicked.length === 0
    ? "every deck-buildable card was kept at least once"
    : `NEVER PICKED: ${neverPicked.join(", ")}`,
);

console.log("\ntargeting");
console.log(
  `  first legal target  ${pct(stats.firstLegalTargetShare)}` +
    ` of ${stats.targetedPlaysSeen} plays with 2+ legal targets`,
);

console.log("\neconomy");
console.log(`  damage dealt    ${n1(stats.meanDamageDealt)} per world`);
console.log(`  defense healed  ${n1(stats.meanDefenseHealed)} per world`);
console.log(`  settlements     ${n1(stats.meanSettlementsFounded)} per world`);
console.log(`  untested guards ${n1(stats.meanUntestedGuards)} per world`);
