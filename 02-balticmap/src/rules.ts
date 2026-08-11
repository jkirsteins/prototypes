import type { MetaStorage } from "./meta";

/** The rules the player can swap before a game. Organized as AXES: each axis
 *  is a group of mutually exclusive options and a game carries exactly one
 *  pick per axis, so "both options of one axis" is unrepresentable and picks
 *  on different axes combine freely. See the 2026-08-08 rule-variants design
 *  doc.
 *
 *  The `copies` axis retired with the deck picker (2026-08-08 defense-score
 *  design): with a growing deck there is no build-time copy count to cap, and
 *  `maxPerDeck` gating harvest offers is the successor rule. Stored prefs
 *  naming it degrade silently through `mergeRules`'s unknown-axis drop. */
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
  hand: "keep" | "sweep";
}

export const RULE_AXES: RuleAxis[] = [
  {
    id: "turn",
    name: "Turn structure",
    defaultOption: "standard",
    options: [
      // Neither line names a hand size, and a test holds them to it. The size
      // is `handLimitFor` in src/playability.ts and grows with the realm, so
      // any number written here would be a promise the game breaks by the
      // third land - the live number belongs on the HUD's hand chip, which is
      // free to read the constants. The refill is the same under both options:
      // this axis decides what a turn ACCEPTS, not what you hold.
      {
        id: "standard",
        name: "One card per turn",
        text: "Play or discard one card each turn, plus any repeats it opens; your hand refills at turn start, to a size that grows with your realm.",
      },
      {
        id: "unlimited",
        name: "Unlimited plays",
        text: "Play any number of cards each turn; your hand refills at turn start, to a size that grows with your realm.",
      },
    ],
  },
  {
    id: "hand",
    name: "Cards left over",
    defaultOption: "keep",
    options: [
      {
        id: "keep",
        name: "Keep your hand",
        text: "Cards you do not play stay in hand from turn to turn.",
      },
      {
        id: "sweep",
        name: "Discard at turn's end",
        text: "Every card still in hand when your turn ends is discarded. Your deck comes round faster, and a card held for later is a card lost.",
      },
    ],
  },
];

/** A literal rather than a derivation, so the conformance test in
 *  tests/rules.test.ts can catch the two drifting apart. */
export const DEFAULT_RULES: RuleSelections = { turn: "standard", hand: "keep" };

/** Whether a turn ending throws away what is left in hand.
 *
 *  Its own axis rather than a rider on the turn structure, because the two
 *  ask different questions - how many cards a turn may play, and what happens
 *  to the ones it did not - and every combination of them is a game somebody
 *  might want. */
export function sweepsHandAtTurnEnd(rules: RuleSelections): boolean {
  return rules.hand === "sweep";
}

/** Whether a turn with nothing playable in hand must still spend a card to
 *  end.
 *
 *  The forced discard exists to get a stuck turn moving, and a standard turn
 *  has no other way to move: playing or discarding IS how it ends. An
 *  unlimited turn ends on End turn instead, and if the rules sweep the hand
 *  that click bins the dead cards anyway - so making the player pick one of
 *  them by hand first is asking for a decision that changes nothing. */
export function forcesDiscardWhenStuck(rules: RuleSelections): boolean {
  return rules.turn !== "unlimited" || !sweepsHandAtTurnEnd(rules);
}

/** Folds unknown-checked picks over the defaults: an axis or option that does
 *  not exist falls back to that axis's default. Every reader of untrusted
 *  picks (storage, a URL) comes through here, so the fallback is one rule -
 *  and a stored `copies` pick from before that axis retired is dropped here
 *  without ceremony. */
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

/** The build screen's one-line overview: the picked option's name per axis. */
export function summarizeRules(rules: RuleSelections): string {
  return RULE_AXES
    .map((a) => a.options.find((o) => o.id === rules[a.id])?.name ?? "")
    .filter((s) => s.length > 0)
    .join(", ");
}

/** Last-used picks, remembered game to game. A preference, not progression,
 *  so it lives beside the log prefs, through the same MetaStorage
 *  abstraction. */
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
