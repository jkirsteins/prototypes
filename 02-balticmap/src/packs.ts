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

/** The new-card guarantee each of the first packs carries, by pack index -
 *  the descending welcome: the strongest card first, then the tiers the
 *  collection is mostly made of. Indexed by packs OPENED, whatever earned
 *  them, so an early turnip-milestone pack spends a slot like any other.
 *  One epic guarantee, not two: the pool holds two epics, and handing both
 *  out by pack two would leave no chase card. Length is pinned to
 *  `EARLY_PACKS` by tests/packs.test.ts. */
export const NEW_CARD_GUARANTEES: readonly CardRarity[] = [
  "epic", "rare", "rare", "common", "common",
];

export interface PackGuarantee {
  /** `meta.packsOpened` at open time; past `NEW_CARD_GUARANTEES` it is inert. */
  packIndex: number;
  /** Acquirable ids the player does not yet know. */
  unknownIds: string[];
}

/** The ids the guaranteed slot may pick from, or null when the guarantee does
 *  not apply (past the schedule, or nothing left to learn). The scheduled
 *  tier holding no unknown card falls to the nearest tier below, then climbs
 *  above - descending rarity in spirit, but a nearly-complete collection
 *  still gets its new card. */
function guaranteePool(
  acquirableIds: string[], guarantee: PackGuarantee | undefined,
): string[] | null {
  if (!guarantee) return null;
  const scheduled = NEW_CARD_GUARANTEES[guarantee.packIndex];
  if (scheduled === undefined) return null;
  const wanted = new Set(guarantee.unknownIds);
  const unknown = acquirableIds.filter((id) => wanted.has(id));
  if (unknown.length === 0) return null;
  const at = RARITY_TIERS.findIndex((t) => t.id === scheduled);
  const ladder = [
    ...RARITY_TIERS.slice(0, at + 1).reverse(),
    ...RARITY_TIERS.slice(at + 1),
  ];
  for (const tier of ladder) {
    const pool = unknown.filter((id) => CARDS[id]?.rarity === tier.id);
    if (pool.length > 0) return pool;
  }
  return unknown;
}

/** Draws PACK_SIZE cards. Each slot rolls a tier, then picks uniformly inside
 *  it; an empty tier falls back to the base tier, which is what makes a tier
 *  nobody has qualified for harmless rather than a crash waiting to happen.
 *  The base tier is whichever one `RARITY_TIERS` lists first, not the literal
 *  "common" - naming the tier here is the drift the table exists to prevent.
 *
 *  A `guarantee` makes the first slot a new card from `guaranteePool` above;
 *  the other slot, and every slot once the guarantee window is spent, never
 *  consults what the player already knows: a duplicate is a real outcome,
 *  shown as "already known" at reveal. Consumes exactly two rng values per
 *  slot whatever the tier - the guaranteed slot burns the draw its tier roll
 *  would have taken - so a seed maps to a stable pack and to the same
 *  downstream draws with or without a guarantee. */
export function openPack(
  acquirableIds: string[], rng: Rng, guarantee?: PackGuarantee,
): string[] {
  if (acquirableIds.length === 0) return [];
  const byTier = new Map<CardRarity, string[]>(
    RARITY_TIERS.map((t) => [
      t.id,
      acquirableIds.filter((id) => CARDS[id]?.rarity === t.id),
    ]),
  );
  const base = byTier.get(BASE_RARITY) ?? [];
  const guaranteed = guaranteePool(acquirableIds, guarantee);
  const drawn: string[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot++) {
    if (slot === 0 && guaranteed !== null) {
      rng();
      drawn.push(guaranteed[Math.floor(rng() * guaranteed.length)]);
      continue;
    }
    const tier = rollTier(rng);
    const pool = byTier.get(tier)?.length ? byTier.get(tier)! : base;
    const from = pool.length > 0 ? pool : acquirableIds;
    drawn.push(from[Math.floor(rng() * from.length)]);
  }
  return drawn;
}
