/** The defense-score core: every polygon carries a static `defenseMax` sized
 *  from its 1184 population and a current `defense`, floored at 0 and capped
 *  at max. Hostile cards damage the score, heals restore it, and subjugation
 *  and independence are thresholds on it - see the 2026-08-08 defense-score
 *  design doc. Pure helpers; GameState owns the stores.
 *
 *  A "polygon" is a land's own faction id - regions and factions are 1:1, and
 *  the id is stable through vassalage and incorporation. The home polygon of
 *  faction F is F's own id. */

export const DEFENSE_PER_POPULATION = 500;

/** defenseMax for a world nobody handed a map to, the DEFAULT_SITE_CAP
 *  convention: tests get polygons big enough to exercise both gates without
 *  passing a map in. The real map derives 20..180. */
export const DEFAULT_DEFENSE_MAX = 60;

/** Subjugate is legal while the target's HOME polygon sits at or below this
 *  share of its max. */
export const SUBJUGATION_GATE = 0.25;

/** A vassal whose home polygon has climbed back to this share of its max
 *  regains independence at the start of its own turn. */
export const INDEPENDENCE_GATE = 0.75;

export const RAID_DAMAGE = 1;
export const GREAT_RAID_DAMAGE = 0.5;
export const WAR_COUNCIL_LEADERSHIP = 5;
export const PLAGUE_DAMAGE_PER_STACK = 10;
export const HILLFORT_HEAL = 15;
export const HARVEST_FEAST_HEAL = 5;
/** Fortify's heal, on the one land it is aimed at.
 *
 *  It used to be `1 per Favourable omens reading held`, realm-wide, which read
 *  as a scaling card and behaved as a dead one: a seat holding no readings
 *  healed nothing, and Fortify is a third of all plays in the game, so a third
 *  of the plays in the game did nothing at all. A flat heal on a chosen land
 *  is what the card was always pretending to be.
 *
 *  Below `HILLFORT_HEAL` on purpose. Fortify is what every deck STARTS with,
 *  five copies of it; Hillfort is the same shape, twice as strong, and has to
 *  be harvested. */
export const FORTIFY_HEAL = 4;

/** polygon id -> current defense. A key is present ONLY while the polygon is
 *  damaged; absent means "at defenseMax" - the missing-key-means-pristine
 *  convention the old Relations store kept for 0. `applyHeal` deletes a key
 *  the moment it reaches max, so the store never materialises a no-op. */
export type Defense = Readonly<Record<string, number>>;

/** polygon id -> owner faction id -> stacks. Stacks are OWNED: two rivals can
 *  sicken the same polygon and each holds its own count. An owner at 0 is
 *  absent, like a healed polygon above. */
export type Disease = Readonly<Record<string, Readonly<Record<string, number>>>>;

export interface DefenseView {
  defense: Defense;
  defenseMax: Record<string, number>;
}

export function defenseMaxOf(view: DefenseView, polygon: string): number {
  return view.defenseMax[polygon] ?? DEFAULT_DEFENSE_MAX;
}

/** Current defense, clamped into [0, max]. The clamp is defensive - the two
 *  writers below keep the range - but a boot override or a hand-edited store
 *  must read sane rather than leak an impossible number into a gate. */
export function defenseOf(view: DefenseView, polygon: string): number {
  const max = defenseMaxOf(view, polygon);
  const cur = view.defense[polygon];
  if (cur === undefined) return max;
  return Math.max(0, Math.min(max, cur));
}

export function applyDamage(
  view: DefenseView, polygon: string, amount: number,
): Defense {
  if (amount <= 0) return view.defense;
  return {
    ...view.defense,
    [polygon]: Math.max(0, defenseOf(view, polygon) - amount),
  };
}

export function applyHeal(
  view: DefenseView, polygon: string, amount: number,
): Defense {
  if (amount <= 0) return view.defense;
  const max = defenseMaxOf(view, polygon);
  const healed = Math.min(max, defenseOf(view, polygon) + amount);
  if (healed >= max) {
    if (!(polygon in view.defense)) return view.defense;
    const { [polygon]: _, ...rest } = view.defense;
    return rest;
  }
  return { ...view.defense, [polygon]: healed };
}

/** The one spelling of each gate line, floored so the boundary is a whole
 *  number the badge can print: a 600 polygon opens at 150 and frees at 450. */
export function subjugationGateOpen(
  view: DefenseView, factionId: string,
): boolean {
  return (
    defenseOf(view, factionId) <=
    Math.floor(SUBJUGATION_GATE * defenseMaxOf(view, factionId))
  );
}

export function independenceGateOpen(
  view: DefenseView, factionId: string,
): boolean {
  return (
    defenseOf(view, factionId) >=
    Math.ceil(INDEPENDENCE_GATE * defenseMaxOf(view, factionId))
  );
}

/** The three bands the map badge colours: at or above the independence line,
 *  between the gates, at or under the subjugation line - the open state is
 *  the one that must pop. */
export type GateBand = "high" | "middle" | "open";

export function gateBandOf(view: DefenseView, polygon: string): GateBand {
  if (subjugationGateOpen(view, polygon)) return "open";
  return independenceGateOpen(view, polygon) ? "high" : "middle";
}

export function diseaseOn(
  disease: Disease, polygon: string, owner: string,
): number {
  return disease[polygon]?.[owner] ?? 0;
}

export function addDisease(
  disease: Disease, polygon: string, owner: string, n: number,
): Disease {
  if (n <= 0) return disease;
  return {
    ...disease,
    [polygon]: {
      ...disease[polygon],
      [owner]: diseaseOn(disease, polygon, owner) + n,
    },
  };
}

/** Plague's reset: the actor's stacks vanish everywhere, other owners'
 *  untouched. Polygons emptied by the removal drop their key. */
export function clearDiseaseOf(disease: Disease, owner: string): Disease {
  const out: Record<string, Readonly<Record<string, number>>> = {};
  for (const [polygon, owners] of Object.entries(disease)) {
    if (!(owner in owners)) {
      out[polygon] = owners;
      continue;
    }
    const { [owner]: _, ...rest } = owners;
    if (Object.keys(rest).length > 0) out[polygon] = rest;
  }
  return out;
}

/** Foul winds: every stack on every polygon, whoever owns it, becomes
 *  `owner`'s - counts merged per polygon. */
export function transferAllDiseaseTo(disease: Disease, owner: string): Disease {
  const out: Record<string, Readonly<Record<string, number>>> = {};
  for (const [polygon, owners] of Object.entries(disease)) {
    const total = Object.values(owners).reduce((a, b) => a + b, 0);
    if (total > 0) out[polygon] = { [owner]: total };
  }
  return out;
}

/** The map-derived store, `population / 50`: 200 (Pilsotas) to 1800 (Eastern
 *  Aukstaitija). Keyed by faction id like `siteCaps` - the map's region ids
 *  are translated by the caller. */
export function defenseMaxFromPopulations(
  populations: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(populations).map(([id, pop]) => [
      id, Math.round(pop / DEFENSE_PER_POPULATION),
    ]),
  );
}
