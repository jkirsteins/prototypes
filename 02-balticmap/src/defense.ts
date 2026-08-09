/** The defense-score core: every polygon carries a static `defenseMax` sized
 *  from its 1184 population and a current `defense`, floored at 0 and capped
 *  at max. Hostile cards damage the score, heals restore it, and subjugation
 *  and independence are thresholds on it - see the 2026-08-08 defense-score
 *  design doc. Pure helpers; GameState owns the stores.
 *
 *  A "polygon" is a land's own faction id - regions and factions are 1:1, and
 *  the id is stable through vassalage and incorporation. The home polygon of
 *  faction F is F's own id. */

export const DEFENSE_PER_POPULATION = 5000;

/** defenseMax for a world nobody handed a map to, the DEFAULT_SITE_CAP
 *  convention: tests get polygons big enough to exercise both gates without
 *  passing a map in. The real map derives 2..18. */
export const DEFAULT_DEFENSE_MAX = 6;

/** Subjugate is legal while the target's HOME polygon sits at or below this
 *  share of its max. */
export const SUBJUGATION_GATE = 0.25;

/** A vassal whose home polygon has climbed back to this share of its max
 *  regains independence at the start of its own turn. */
export const INDEPENDENCE_GATE = 0.75;

/** Defense ceiling per army a land may field, and per turnip its people owe
 *  before a harvest comes in.
 *
 *  One constant for both on purpose: a land's ceiling is the one number that
 *  says how big it is, so how many armies it can raise and how long its
 *  seasons take are two readings of the same fact. Growing a land (see
 *  `LAND_GROWTH`) therefore works toward another army and, at the same time,
 *  toward slower harvests - which is what keeps growth a decision rather than
 *  a free upgrade. */
export const DEFENSE_PER_ARMY = 3;

/** How many armies a land of this ceiling may field. At least one: a land
 *  that could raise none could never attack and never answer an attack, which
 *  is not a smaller land but a land outside the game.
 *
 *  `perArmy` is the divisor a passive status may raise - see `perArmyOn` in
 *  src/passives.ts. It is a parameter rather than a second function because
 *  the floor and the minimum of one are the parts that must not be respelled. */
export function armyCapFor(
  defenseMax: number, perArmy: number = DEFENSE_PER_ARMY,
): number {
  return Math.max(1, Math.floor(defenseMax / perArmy));
}

/** Grow turnips plays this land's people owe before a Turnip harvest is
 *  earned. Same divisor as the army cap, rounded the other way: a part-grown
 *  land musters no army for the remainder, but its people still eat, so a 5
 *  owes 2 seasons where it fields 1 army. */
export function turnipThresholdFor(defenseMax: number): number {
  return Math.max(1, Math.ceil(defenseMax / DEFENSE_PER_ARMY));
}

/** How far Prosperous proliferation lifts a land's ceiling. One: growth is
 *  meant to be a run of good years compounding, not a card that buys an army
 *  outright - three of them is what `DEFENSE_PER_ARMY` asks for the next
 *  army, and that is the pace. */
export const LAND_GROWTH = 1;

export const RAID_DAMAGE = 1;
export const GREAT_RAID_DAMAGE = 0.5;
export const WAR_COUNCIL_LEADERSHIP = 1;
export const PLAGUE_DAMAGE_PER_STACK = 1;
export const HILLFORT_HEAL = 3;
export const HARVEST_FEAST_HEAL = 1;
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
export const FORTIFY_HEAL = 1;

/** What the "strong" version of a starting card adds. Flat, and one: on a
 *  board of 2..18 a single point is a quarter of a small land's ceiling, and
 *  the point of the pair is that a harvest offers something better than the
 *  card the seat already holds five of - not something different in kind. */
export const STRONG_BONUS = 1;

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

/** The map-derived store: 2 (Pilsotas) to 18 (Eastern Aukstaitija). Keyed by
 *  faction id like `siteCaps` - the map's region ids are translated by the
 *  caller. */
export function defenseMaxFromPopulations(
  populations: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(populations).map(([id, pop]) => [
      id, Math.round(pop / DEFENSE_PER_POPULATION),
    ]),
  );
}
