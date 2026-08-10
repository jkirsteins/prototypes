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

/** The share of its ceiling a land's HOME polygon must be at or below before a
 *  DEMAND can be made of it - the Subjugate claim's gate, and the band the map
 *  badge turns red at.
 *
 *  Zero: a land submits to a demand when its defenses are gone, and not a
 *  moment sooner. One number for one rule, so the badge that turns red and the
 *  claim that lands mean the same thing. A fractional gate meant a land could
 *  be demanded while it was still standing, which is a second way to lose a
 *  land and a second number to read.
 *
 *  An ARMY is the other door and asks a different question - see
 *  `capturesOnArrival`. A land still holding defenders is taken by force that
 *  overwhelms them, without ever passing this line.
 *
 *  Kept as a share rather than folded away because it is the dial: the whole
 *  rule moves by changing this line. */
export const SUBJUGATION_GATE = 0;

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
 *  Two, because an arriving army takes a land it OVERWHELMS and not one it
 *  merely flattens (`capturesOnArrival`): the point a heal puts back is the
 *  point between holding and changing hands, and a one-point heal could not
 *  answer the Strong raid every deck can build.
 *
 *  It reaches `HILLFORT_HEAL` in its strong form, and that is not a card made
 *  redundant. What separates them is the cost, not the number: a fortify
 *  spends one of the land's settlements and may repeat, while Hillfort spends
 *  nothing, repeats nothing, and has to be harvested. */
export const FORTIFY_HEAL = 2;

/** What the "strong" version of a starting card adds. Flat, and one: on a
 *  board of 2..18 a single point is a quarter of a small land's ceiling, and
 *  the point of the pair is that a harvest offers something better than the
 *  card the seat already holds four of - not something different in kind. */
export const STRONG_BONUS = 1;

/** What each attack card deals to one polygon before the leader and the
 *  readings have their say, by card id. The sibling of `SINGLE_LAND_HEAL`
 *  below, and a table for the same reason: `attackDamageFor` used a ternary on
 *  the card id, so a new attack card silently inherited a Raid's damage from
 *  the else branch rather than failing to compile.
 *
 *  Great raid is absent no longer having a number of its own - it is several
 *  Raids, so an arrow of one is worth what a Raid is worth, and the table says
 *  so rather than a comment somewhere else. */
export const ATTACK_DAMAGE: Readonly<Record<string, number>> = {
  "raid": RAID_DAMAGE,
  "strong-raid": RAID_DAMAGE + STRONG_BONUS,
  "great-raid": RAID_DAMAGE,
};

/** How much each single-land heal restores, by card id. One table, because
 *  three things read it: the play resolves through it, the hover quotes it
 *  before the click, and `SINGLE_LAND_HEALS` in src/cards.ts is its key set.
 *  A heal whose amount lived at the play alone would preview as a card that
 *  does nothing in particular. */
export const SINGLE_LAND_HEAL: Readonly<Record<string, number>> = {
  "hillfort": HILLFORT_HEAL,
  "fortify": FORTIFY_HEAL,
  "strong-fortify": FORTIFY_HEAL + STRONG_BONUS,
};

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
 *  number the badge can print: a 6 polygon opens at 1 and frees at 5. */
export function subjugationGateOpen(
  view: DefenseView, factionId: string,
): boolean {
  return (
    defenseOf(view, factionId) <=
    Math.floor(SUBJUGATION_GATE * defenseMaxOf(view, factionId))
  );
}

/** Whether an army arriving takes the land: what it deals must EXCEED what is
 *  standing there. Equal is a flattening and not a conquest - the land is left
 *  at 0, holding nothing, and the next arrival walks in.
 *
 *  Not a gate on a share of the ceiling like the two above, because this is not
 *  a question about how broken a land is. It is a question about the blow: a
 *  land holding one defender falls to two armies and holds against one,
 *  whatever its size. That is what makes the ceiling worth having and a
 *  fortify worth playing on the turn an arrow is already in the air.
 *
 *  Both readers pass POST-TERRAIN damage, the `SINGLE_LAND_HEAL` rule: the
 *  resolution in `resolveMarches` and the hover preview in
 *  src/target-explanations.ts. A preview reading the raw number would promise a
 *  conquest that hill country shaves away.
 *
 *  A land at 0 is taken by anything that reaches it, since any blow that lands
 *  is at least 1 - which is the whole of the old "walks into a flattened land"
 *  rule, now a case of this one rather than a branch beside it. */
export function capturesOnArrival(dealt: number, standing: number): boolean {
  return dealt > standing;
}

/** What two deploys must agree about before a blow lands, gathered so the wire
 *  can fingerprint it - `CARD_RULES` in src/cards.ts folds this in.
 *
 *  A card's damage table says what an arrow carries; these say what that
 *  buys. Change either and two builds that shook hands play different games:
 *  the host resolves the arrival its way while the guest's own hover already
 *  promised the other, which is a click its map called a conquest coming back
 *  as a scratch.
 *
 *  `capture` is a NAME rather than a number because the rule is a predicate,
 *  and a name is the only thing a hash can hold of one. It is hand-kept, so
 *  tests/cards.test.ts pins it to `capturesOnArrival` itself: the two cannot
 *  move apart without a red test. */
export interface CombatRules {
  subjugationGate: number;
  independenceGate: number;
  /** The rule by which an arriving army takes a land, as `capturesOnArrival`
   *  spells it. "excess": strictly more than what stands. */
  capture: string;
}

export const COMBAT_RULES: CombatRules = {
  subjugationGate: SUBJUGATION_GATE,
  independenceGate: INDEPENDENCE_GATE,
  capture: "excess",
};

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
 *  untouched. Polygons emptied by the removal drop their key.
 *
 *  `skip` is the polygons the Plague never reached, left exactly as they were
 *  - stacks and all. It must be the SAME predicate the damage loop skipped on:
 *  burning the stacks off a land the plague was forbidden to strike would take
 *  the cost of the card without its effect, and the log would say nothing
 *  happened there while the store quietly emptied. */
export function clearDiseaseOf(
  disease: Disease, owner: string, skip: (polygon: string) => boolean = () => false,
): Disease {
  const out: Record<string, Readonly<Record<string, number>>> = {};
  for (const [polygon, owners] of Object.entries(disease)) {
    if (skip(polygon) || !(owner in owners)) {
      out[polygon] = owners;
      continue;
    }
    const { [owner]: _, ...rest } = owners;
    if (Object.keys(rest).length > 0) out[polygon] = rest;
  }
  return out;
}

/** Foul winds: every stack on every polygon, whoever owns it, becomes
 *  `owner`'s - counts merged per polygon.
 *
 *  `skip` is the polygons the claim does not reach, left exactly as they were.
 *  It takes a predicate rather than a set because the caller's reason is a
 *  rule, not a list - see `aimsUpOwnChain` - and because the store and the
 *  `winds-shifted` events must skip the SAME polygons or the walk that feeds
 *  the log and the round summary drifts from the store for the rest of the
 *  run. One argument, one answer, both callers reading it. */
export function transferAllDiseaseTo(
  disease: Disease, owner: string, skip: (polygon: string) => boolean = () => false,
): Disease {
  const out: Record<string, Readonly<Record<string, number>>> = {};
  for (const [polygon, owners] of Object.entries(disease)) {
    if (skip(polygon)) {
      out[polygon] = owners;
      continue;
    }
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
