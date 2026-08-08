/** The balance report: is any card ignored, wasted, dominant, or targeted with
 *  an unintended bias, and do worlds still resolve?
 *
 *  Run it when a batch of card work settles, when a card feels wrong, or when a
 *  playtest went badly and you want to know why. It is not part of `npm test`.
 *
 *  npm run balance
 *  npm run balance -- --games=24 --cap=200 --arm=conquest-scaled
 */
import { ACQUIRABLE_CARDS, CARDS, RARITY_TIERS } from "../src/cards";
import { PACK_SIZE } from "../src/packs";
import { aggregateWorld, runWorldBatch, WORLD_ARMS } from "../src/sim";

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
const arm = flag("arm", "full-deck");

if (!(arm in WORLD_ARMS)) {
  throw new Error(
    `unknown world arm "${arm}"; known: ${Object.keys(WORLD_ARMS).join(", ")}`,
  );
}

const pct = (x: number | null): string =>
  x === null ? "-" : `${(x * 100).toFixed(1)}%`;
const n1 = (x: number | null): string => (x === null ? "-" : x.toFixed(1));

const started = process.hrtime.bigint();
const stats = aggregateWorld(arm, runWorldBatch({ games, turnCap, firstSeed, arm }));
const ms = Number(process.hrtime.bigint() - started) / 1e6;

console.log(
  `${games} worlds on the ${arm} deck, ${turnCap}-turn cap, ` +
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

// A card in the arm's deck that never got played is the "ignored" case the
// report exists to surface. Cards outside the deck are silent by construction,
// so listing every unplayed id in CARDS would bury the real signal.
const inDeck = new Set(WORLD_ARMS[arm]);
const ignored = [...inDeck].filter((id) => !(id in stats.playShareByCard));
console.log(
  ignored.length === 0
    ? "\nevery card in this deck was played at least once"
    : `\nIGNORED - in the deck, never played: ${ignored.join(", ")}`,
);

console.log("\ntargeting");
console.log(
  `  first legal target  ${pct(stats.firstLegalTargetShare)}` +
    ` of ${stats.targetedPlaysSeen} plays with 2+ legal targets`,
);
console.log(
  `  pacts on own target ${pct(stats.alliancesOnOwnTargetsShare)} of pacts sealed`,
);

console.log("\nwaste");
console.log(`  untested guards        ${n1(stats.meanUntestedGuards)} per world`);
console.log(`  unused omen boosts     ${n1(stats.meanUnusedBoosts)} per world`);
console.log(`  settlements walked off ${pct(stats.settlementsWalkedOffShare)}`);
console.log(
  `  revolts sown ${stats.revoltsSownTotal}, of which played ${stats.revoltsPlayedTotal}`,
);

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
