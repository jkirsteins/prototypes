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
 *  and incorporated by the rules that already exist. Taking one strips the
 *  status, so it wakes up holding the deck it was dealt at the start - which
 *  is also the whole rule behind "only unheld lands raid on their own". That
 *  is not a condition anybody writes down twice; it is what the status means.
 *
 *  A new status is a row here plus the one hook that reads it, and it does not
 *  ship until the land hover names it. */

import type { Rng } from "./cards";

export interface PassiveDef {
  id: string;
  name: string; // player-facing, shown on the land hover
  text: string; // one line, what it does
  strippedOnCapture: boolean;
}

export const PASSIVES: Record<string, PassiveDef> = {
  "keeps-to-itself": {
    id: "keeps-to-itself", name: "Keeps to itself",
    text: "Answers to nobody: takes no turns and plays no cards, but its people raid a neighbour about one round in four. Taking the land dissolves this, and its people join the game.",
    strippedOnCapture: true,
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

/** What a land that does not act starts with. All three are stripped when
 *  somebody takes it: a conquest stops repairing itself, stops falling to an
 *  assassin, and stops keeping to itself - its people join the game as their
 *  new lord's vassal, with turns, a deck and tribute to pay. */
export const QUIET_PASSIVES: readonly string[] = [
  "keeps-to-itself", "wild-lands", "no-successor",
];

/** How often a land that keeps to itself sends a raid of its own at a
 *  neighbour.
 *
 *  A land that takes no turns is not a land that does nothing: twenty-one of
 *  them sitting perfectly still made the middle of the map a queue rather than
 *  a frontier, and a raid nobody chose to send is the cheapest way for the
 *  ground between two players to be dangerous.
 *
 *  It stops the moment somebody takes the land, and there is no second rule
 *  saying so: `strippedOnCapture` takes the status off, and the raid asks for
 *  the status. A vassal picking its own fights in its lord's name would need
 *  the status back to do it. */
export const RESTLESS_RAID_CHANCE = 0.25;

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

/** Which lands could plausibly carry which ground, read off what the map
 *  already says about each region in its own flavour text: hills and uplands
 *  for `hill-country`, the trade rivers for `river-trade`. Random placement
 *  that ignored this put hills on the Semigallian plain, which the map calls
 *  flat and fertile two lines away.
 *
 *  A land absent from the table gets no terrain status, which is the honest
 *  answer for the plains and the islands. */
export const TERRAIN_ELIGIBILITY: Readonly<Record<string, readonly string[]>> = {
  // Highlands, uplands and wooded hills.
  "eastern-aukstaitian-confederacy": ["hill-country"],
  "sakalans": ["hill-country"],
  "selonians": ["hill-country"],
  "ugandians": ["hill-country"],
  "samogitian-confederacy": ["hill-country"],
  // The trade rivers: the Daugava, the Gauja, the Nemunas, the Lielupe, the
  // Vistula.
  "jersikans": ["river-trade"],
  "lower-daugava-livs": ["river-trade"],
  "talavians": ["river-trade"],
  "lietuva": ["river-trade"],
  "dainavians": ["river-trade"],
  "nadruvians": ["river-trade"],
  "semigallian-confederacy": ["river-trade"],
  "pomesanians": ["river-trade"],
};

/** How often an eligible land actually carries its ground. Half, so two runs
 *  of the same map are different maps to fight over. */
export const TERRAIN_CHANCE = 0.5;

/** Two draws per eligible land, in faction order: whether it carries anything
 *  and which of its own options it gets. A frozen contract like every other
 *  draw in the deal - tests/rng-isolation.test.ts replays it. */
export function rollTerrain(factionIds: string[], rng: Rng): Passives {
  let out: Passives = {};
  for (const land of factionIds) {
    const eligible = TERRAIN_ELIGIBILITY[land];
    if (eligible === undefined || eligible.length === 0) continue;
    if (rng() >= TERRAIN_CHANCE) continue;
    out = addPassive(out, land, eligible[Math.floor(rng() * eligible.length)]);
  }
  return out;
}

/** The statuses a fresh game starts with: the ground, rolled, plus the quiet
 *  set on every faction that does not act. */
export function seedPassives(
  factionIds: string[], acting: readonly string[], rng: Rng,
): Passives {
  let out = rollTerrain(factionIds, rng);
  for (const land of factionIds) {
    if (acting.includes(land)) continue;
    for (const id of QUIET_PASSIVES) out = addPassive(out, land, id);
  }
  return out;
}

/** Hostile damage after the ground has had its say. The one spelling, called
 *  by both sites that deal damage and by the card preview, so what a tip
 *  promises and what lands cannot drift. */
export function damageAfterTerrain(
  view: { passives: Passives }, polygon: string, damage: number,
): number {
  if (!hasPassive(view.passives, polygon, "hill-country")) return damage;
  // Whole numbers out. A quarter off a raid of 1 is 0.75, and a score that
  // reads 0.75/6 on a badge is a score nobody can plan against - the reduction
  // is only worth having where there is enough damage for a quarter of it to
  // be worth a number. Never below 1, and never ABOVE what was coming: a hill
  // must not make a half-damage Great raid hit harder than it would on a
  // plain.
  const reduced = Math.round(damage * (1 - HILL_COUNTRY_REDUCTION));
  return Math.min(damage, Math.max(1, reduced));
}
