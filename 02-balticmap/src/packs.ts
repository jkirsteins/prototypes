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
