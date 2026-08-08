import type { MetaStorage } from "./meta";

/** The rules the player can swap before a game. Organized as AXES: each axis
 *  is a group of mutually exclusive options and a game carries exactly one
 *  pick per axis, so "both options of one axis" is unrepresentable and picks
 *  on different axes combine freely. No recalibration ships with a pick:
 *  `npm run balance` runs the standard rules, and calibration against another
 *  set happens only when asked for by name. See the 2026-08-08 rule-variants
 *  design doc. */
export interface RuleOption {
  id: string;
  name: string;
  /** One line of rules text, shown only in the picker modal. */
  text: string;
}

export interface RuleAxis {
  id: keyof RuleSelections;
  name: string;
  options: RuleOption[];
  defaultOption: string;
}

/** One pick per axis, always complete. Typed literally rather than as
 *  Record<string, string> so a choke point reading `state.rules.turn` is
 *  checked by tsc, and a future axis extends this type. */
export interface RuleSelections {
  turn: "standard" | "unlimited";
  copies: "single" | "double";
}

export const RULE_AXES: RuleAxis[] = [
  {
    id: "turn",
    name: "Turn structure",
    defaultOption: "standard",
    options: [
      {
        id: "standard",
        name: "One card per turn",
        text: "Play or discard one card each turn; draw one at turn start.",
      },
      {
        // The "4" restates HAND_REFILL (OPENING_HAND + 1) in src/game.ts,
        // which cannot be imported here without a cycle (game.ts imports
        // rules.ts) - change both together.
        id: "unlimited",
        name: "Unlimited plays",
        text: "Play any number of cards each turn; your hand refills to 4 at turn start. No discards - a dead hand waits for the board to change.",
      },
    ],
  },
  {
    id: "copies",
    name: "Deck copies",
    defaultOption: "single",
    options: [
      {
        id: "single",
        name: "1 of each card",
        text: "A deck holds at most one copy of each card.",
      },
      {
        id: "double",
        name: "Up to 2 of each card",
        text: "A deck holds up to two copies of each card - enemy decks may double up too.",
      },
    ],
  },
];

/** A literal rather than a derivation, so the conformance test in
 *  tests/rules.test.ts can catch the two drifting apart. */
export const DEFAULT_RULES: RuleSelections = { turn: "standard", copies: "single" };

/** Whether this rule set's turns include discarding at all. The unlimited
 *  turn structure removes discards entirely: a hand with nothing playable
 *  waits, and the turn ends by the explicit End turn action alone. Consumed
 *  by `playableSet`, so "no discards" is decided once, not per call site. */
export function allowsDiscards(rules: RuleSelections): boolean {
  return rules.turn !== "unlimited";
}

/** How many copies of one card a deck may hold under this rule set. The cap
 *  applies to deck-buildable non-basics only - Grow turnips filler is outside
 *  it (`maxPerDeck: null`). Consumed by every enforcement point rather than
 *  each reading `rules.copies` itself: the deck screen's click cycle,
 *  `buildPlayerDeck`, and `buildAiDeck` via `pickFaction`'s default deck. */
export function copiesAllowed(rules: RuleSelections): number {
  return rules.copies === "double" ? 2 : 1;
}

/** Folds unknown-checked picks over the defaults: an axis or option that does
 *  not exist falls back to that axis's default, the same drop rule `rel=`
 *  applies to an unknown track. Every reader of untrusted picks (storage, a
 *  URL) comes through here, so the fallback is one rule, not three copies. */
export function mergeRules(picks: Record<string, unknown>): RuleSelections {
  const out: Record<string, string> = { ...DEFAULT_RULES };
  for (const axis of RULE_AXES) {
    const v = picks[axis.id];
    if (typeof v === "string" && axis.options.some((o) => o.id === v)) {
      out[axis.id] = v;
    }
  }
  return out as unknown as RuleSelections;
}

/** The deck screen's one-line overview: the picked option's name per axis.
 *  Names only - the options themselves appear nowhere but the modal. */
export function summarizeRules(rules: RuleSelections): string {
  return RULE_AXES
    .map((a) => a.options.find((o) => o.id === rules[a.id])?.name ?? "")
    .filter((s) => s.length > 0)
    .join(", ");
}

/** Last-used picks, remembered game to game. A preference, not progression,
 *  so it lives beside the log prefs rather than in MetaRecord - and through
 *  the same MetaStorage abstraction, for the same reason LogPrefs does. */
export const RULES_PREFS_KEY = "balticmap-rules-prefs-v1";

export function loadRulesPrefs(storage: MetaStorage): RuleSelections {
  try {
    const raw = storage.getItem(RULES_PREFS_KEY);
    if (raw === null) return { ...DEFAULT_RULES };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_RULES };
    }
    return mergeRules(parsed as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveRulesPrefs(
  storage: MetaStorage, rules: RuleSelections,
): void {
  try {
    storage.setItem(RULES_PREFS_KEY, JSON.stringify(rules));
  } catch {
    // storage unavailable or full: the pick still holds for the session,
    // it just does not survive a reload - same tradeoff meta.ts accepts.
  }
}
