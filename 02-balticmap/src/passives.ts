/** Passive statuses: standing properties of a LAND, not of whoever holds it.
 *
 *  One table and five hooks. `strippedOnCapture` is the axis that keeps the
 *  two kinds apart: a status describing a land nobody holds dies the moment
 *  somebody takes it, while a status describing the ground - or the fact that
 *  the land has no ambitions of its own - survives every change of hands.
 *
 *  `keeps-to-itself` is why this module is small and the rest of the game did
 *  not have to grow a second kind of land. A quiet faction is an ordinary
 *  faction that skips its turn: it can be raided, subjugated, poached, healed
 *  and incorporated by the rules that already exist, and a card that removed
 *  the status would hand it back the turns and the deck it was dealt at the
 *  start.
 *
 *  A new status is a row here plus the one hook that reads it, and it does not
 *  ship until the land hover names it. */

export interface PassiveDef {
  id: string;
  name: string; // player-facing, shown on the land hover
  text: string; // one line, what it does
  strippedOnCapture: boolean;
}

export const PASSIVES: Record<string, PassiveDef> = {
  "keeps-to-itself": {
    id: "keeps-to-itself", name: "Keeps to itself",
    text: "This land takes no turns and plays no cards.",
    strippedOnCapture: false,
  },
  "wild-lands": {
    id: "wild-lands", name: "Wild lands",
    text: "10% chance each round to recover 1 defense.",
    strippedOnCapture: true,
  },
  "no-successor": {
    id: "no-successor", name: "No successor",
    text: "If its ruler is killed, the land falls to the killer.",
    strippedOnCapture: true,
  },
  "hill-country": {
    id: "hill-country", name: "Hill country",
    text: "Incoming attack damage reduced by a quarter.",
    strippedOnCapture: false,
  },
  "river-trade": {
    id: "river-trade", name: "River trade",
    text: "Earns its holder 1 extra wealth a turn.",
    strippedOnCapture: false,
  },
};

/** What a land that does not act starts with. Only the last two are stripped
 *  when somebody takes it: a conquest stops repairing itself and stops falling
 *  to an assassin, but it stays quiet. */
export const QUIET_PASSIVES: readonly string[] = [
  "keeps-to-itself", "wild-lands", "no-successor",
];

export const WILD_LANDS_HEAL_CHANCE = 0.1;
export const WILD_LANDS_HEAL = 1;
export const HILL_COUNTRY_REDUCTION = 0.25;

/** polygon id -> the statuses it carries. Absent key means none, the sparse
 *  convention `defense` and `armies` already keep. */
export type Passives = Readonly<Record<string, readonly string[]>>;

export function passivesOn(p: Passives, polygon: string): readonly string[] {
  return p[polygon] ?? [];
}

export function hasPassive(p: Passives, polygon: string, id: string): boolean {
  return passivesOn(p, polygon).includes(id);
}

export function addPassive(p: Passives, polygon: string, id: string): Passives {
  if (hasPassive(p, polygon, id)) return p;
  return { ...p, [polygon]: [...passivesOn(p, polygon), id] };
}

/** What a land keeps when it changes hands. */
export function stripOnCapture(p: Passives, polygon: string): Passives {
  const had = passivesOn(p, polygon);
  const kept = had.filter((id) => PASSIVES[id]?.strippedOnCapture !== true);
  if (kept.length === had.length) return p;
  if (kept.length === 0) {
    const { [polygon]: _, ...rest } = p;
    return rest;
  }
  return { ...p, [polygon]: kept };
}

/** Whether this faction takes its turn at all. The one question the turn loop
 *  asks; everything else about a quiet land is the ordinary rules. */
export function playsTurns(p: Passives, factionId: string): boolean {
  return !hasPassive(p, factionId, "keeps-to-itself");
}

/** Hostile damage after the ground has had its say. The one spelling, called
 *  by both sites that deal damage and by the card preview, so what a tip
 *  promises and what lands cannot drift. */
export function damageAfterTerrain(
  view: { passives: Passives }, polygon: string, damage: number,
): number {
  return hasPassive(view.passives, polygon, "hill-country")
    ? damage * (1 - HILL_COUNTRY_REDUCTION)
    : damage;
}
