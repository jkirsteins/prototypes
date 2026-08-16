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
  /** The KEYWORD (src/cards.ts) whose cards this leader's leadership is added
   *  to. The whole rule, machine-readable: the damage site asks the card for
   *  its keyword and the leader for an ability boosting it, so a fourth raid
   *  card is one field on that card and nothing here.
   *
   *  A keyword id and not a list of card ids on purpose. A list would be a
   *  third place stating what "a raid card" means, beside the cards' own
   *  keyword and the class sets - and the one that nobody updates. */
  boostsKeyword?: string;
}

/** The ability that makes a ruler's leadership count on a raid. Named rather
 *  than inlined at the one place that seeds it; the RULE does not name it -
 *  see `boostsKeyword`. */
export const RAID_LEADERSHIP = "war-leader";

export const LEADER_ABILITIES: Record<string, AbilityDef> = {
  "war-leader": {
    id: "war-leader", name: "War leader",
    text: "Their people ride behind them: every raid this leader sends deals its leadership on top of its own damage.",
    boostsKeyword: "raid",
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

/** Whether this leader holds any ability that adds their leadership to cards
 *  of `keywordId`. The one reader of `boostsKeyword`, so the rule is a lookup
 *  rather than a branch per ability. */
export function boostsKeyword(
  a: LeaderAbilities, factionId: string, keywordId: string,
): boolean {
  return abilitiesOf(a, factionId).some(
    (id) => LEADER_ABILITIES[id]?.boostsKeyword === keywordId,
  );
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
