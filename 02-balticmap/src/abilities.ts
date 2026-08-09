/** Leader abilities: standing properties of a RULER, not of a land and not of
 *  a card.
 *
 *  The sibling of src/passives.ts, and the same shape for the same reason: one
 *  table, one hook each, and nothing ships until a surface names it. What
 *  keeps them apart is what carries them. A passive describes ground and
 *  outlives everyone standing on it; an ability describes the person in the
 *  chair, is handed to a successor when that person is killed, and says
 *  nothing about the land.
 *
 *  `war-leader` exists because "plus your leadership" was written into three
 *  card texts and added by the damage rule to every attack whoever was
 *  leading. That made leadership a property of the cards, which it is not:
 *  War council raises a RULER, an assassin's knife lowers one, and a people
 *  who never learned to fight behind a chief should get nothing from either.
 *  So the raids deal what they say, and the leader adds what the leader is
 *  worth. */

export interface AbilityDef {
  id: string;
  name: string; // player-facing, shown wherever a ruler is named
  text: string; // one line, what it does
}

/** The ability that makes a ruler's leadership count. Named rather than
 *  inlined at its one reader, so the seeding, the hover and the rule all mean
 *  the same string. */
export const RAID_LEADERSHIP = "war-leader";

export const LEADER_ABILITIES: Record<string, AbilityDef> = {
  "war-leader": {
    id: "war-leader", name: "War leader",
    text: "Their people ride behind them: every raid this leader sends deals its leadership on top of its own damage.",
  },
};

/** faction id -> the abilities its CURRENT ruler holds. Absent means none, the
 *  sparse convention every other store keeps. Projected from the rulers by
 *  `abilitiesByFaction` in src/rulers.ts, never read off a Ruler here - the
 *  rules see a view, not the store. */
export type LeaderAbilities = Readonly<Record<string, readonly string[]>>;

export function abilitiesOf(
  a: LeaderAbilities, factionId: string,
): readonly string[] {
  return a[factionId] ?? [];
}

export function hasAbility(
  a: LeaderAbilities, factionId: string, id: string,
): boolean {
  return abilitiesOf(a, factionId).includes(id);
}

/** What each build's ruler is granted at the deal. The build screen reads this
 *  to say what a pick confers, `pickFaction` reads it to seat the abilities,
 *  and a build with none contributes an empty list rather than a special case.
 *
 *  Keyed by the strategy id rather than typed against `Strategy` so this
 *  module stays a leaf - it knows nothing about decks, and src/cards.ts knows
 *  nothing about rulers. */
export const BUILD_ABILITIES: Readonly<Record<string, readonly string[]>> = {
  warpath: [RAID_LEADERSHIP],
  pestilence: [],
};
