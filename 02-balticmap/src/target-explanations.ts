import {
  INCORPORATE_RAMP, incorporationChance, isDoubled, loyaltyOf, raidGainFor,
  subjugationChance, targetEligibilityFor,
  type CardBlockReason,
  type RulesView,
  type TargetBlockReason,
  type TargetEligibility,
} from "./playability";
import { CARDS, DOUBLABLE_CARDS } from "./cards";
import { leadsOf } from "./relations";
import { standingChangeText } from "./view";
import type { TooltipLine } from "./panel";

export interface TargetExplanation {
  factionId: string;
  lines: string[];
  available: boolean;
}

function explainReason(reason: TargetBlockReason): string[] {
  switch (reason.code) {
    case "alliance":
      return [`Blocked by Alliance until turn ${reason.expiresTurn}.`];
    case "insufficient-lead": {
      const lands = `${reason.realmSize} ${reason.realmSize === 1 ? "land" : "lands"}`;
      const settled =
        reason.settlements === 0
          ? ""
          : ` and ${reason.settlements} ${reason.settlements === 1 ? "settlement" : "settlements"}`;
      // The surcharge is named separately or the bar looks wrong: a one-land
      // vassal demanding a lead of 5 makes no sense until you are told that 2
      // of it is the price of prising it off its current lord.
      const poached =
        reason.poachSurcharge === 0
          ? ""
          : `, plus ${reason.poachSurcharge} to prise them off their overlord`;
      // Naming the tracks separately is the whole point once they diverge: the
      // shorter bar is the route to take, and a player told only the taller one
      // would read a settled realm as further out of reach than it is.
      const need =
        reason.required.might === reason.required.status
          ? `Need a Might or Status lead of ${reason.required.might}`
          : `Need a Might lead of ${reason.required.might} or a Status lead of ${reason.required.status}`;
      return [
        `${need} because their realm has ${lands}${settled}${poached}.`,
        `Current leads: Might ${reason.mightLead}, Status ${reason.statusLead}.`,
      ];
    }
    case "already-vassal":
      return ["Already your vassal."];
    case "actor-subjugated":
      return ["Unavailable while you are subjugated."];
    case "overlord-prohibited":
      return ["You cannot target your overlord."];
    case "incorporated":
      return ["Already incorporated."];
    case "self":
      return ["You cannot target yourself."];
    case "not-your-vassal":
      return ["Not your vassal."];
    case "already-settled":
      return ["Already settled this game."];
    case "no-free-site":
      return ["No room for another settlement."];
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function explainTargetEligibility(
  entries: TargetEligibility[],
  factionName: (id: string) => string,
  /** Extra lines appended to available targets, e.g. what a Raid there gains.
   *  Blocked targets get none: the block reason is the useful answer. */
  annotate: (factionId: string) => string[] = () => [],
): TargetExplanation[] {
  return entries.flatMap((entry): TargetExplanation[] => {
    if (entry.state === "irrelevant") return [];
    if (entry.state === "available") {
      return [{
        factionId: entry.factionId,
        lines: [factionName(entry.factionId), "Available.", ...annotate(entry.factionId)],
        available: true,
      }];
    }
    return [{
      factionId: entry.factionId,
      lines: [
        factionName(entry.factionId),
        ...entry.reasons.flatMap(explainReason),
      ],
      available: false,
    }];
  });
}

/** Odds lines for a card whose resolution is a roll, for one candidate target.
 *  Empty for every deterministic card and for every deterministic target, so a
 *  player is never shown "100%" where no roll exists and never left guessing
 *  where one does.
 *
 *  Both rolls spend the card on a miss, which is the part a player must know
 *  BEFORE committing - so it is stated on every line rather than only on the
 *  long odds.
 *
 *  Lives here beside the block reasons because it answers the same question
 *  ("what happens if I aim here") and so that one test covers both halves of
 *  what a target tooltip says. */
export function targetOddsLines(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): string[] {
  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  if (cardId === "subjugate") {
    const chance = subjugationChance(view, targetFactionId);
    if (chance >= 1) return [];
    return [
      `${pct(chance)} chance to succeed - they already have an overlord.`,
      "A failed attempt still spends the card.",
    ];
  }
  if (cardId === "incorporate") {
    const chance = incorporationChance(view, actorFactionId, targetFactionId);
    const held = loyaltyOf(view, targetFactionId, actorFactionId);
    if (chance >= 1) {
      return [`Certain: held ${held} turns, ${INCORPORATE_RAMP} needed.`];
    }
    return [
      `${pct(chance)} chance to succeed - held ${held} of the ${INCORPORATE_RAMP} turns needed.`,
      "A failed attempt still spends the card.",
    ];
  }
  return [];
}

/** What the armed card would do to one land's standing, as the map hover says
 *  it: the human's signed lead before and after, `formatLead`'s convention, the
 *  same one the badges and the round summary use. */
function standingMove(
  view: RulesView,
  actorFactionId: string,
  targetFactionId: string,
  track: "might" | "status",
  after: (before: number) => number,
  doubled: boolean,
): string {
  const before = leadsOf(view.relations, actorFactionId, targetFactionId)[track];
  return (
    standingChangeText({ track, before, after: after(before) }) +
    (doubled ? " (doubled)" : "")
  );
}

/** What playing the armed card here would get you, in one line. Only ever
 *  called for a target the rules already allow, so every branch can quote a
 *  real number rather than hedging. */
function availableImpact(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): string {
  const doubled = isDoubled(view, actorFactionId, cardId);
  if (cardId === "raid") {
    const { gain } = raidGainFor(view, actorFactionId, targetFactionId);
    return standingMove(
      view, actorFactionId, targetFactionId, "might", (b) => b + gain, doubled,
    );
  }
  if (cardId === "shrewd-marriage") {
    return standingMove(
      view, actorFactionId, targetFactionId, "status",
      (b) => b + (doubled ? 2 : 1), doubled,
    );
  }
  if (cardId === "assassinate-ruler") {
    // The card levels the Status lead rather than adding to it, so the "after"
    // is 0 whichever side was ahead. A Bodyguard on the target would nullify
    // it, and this deliberately does not say so: the guard is theirs to know.
    return standingMove(
      view, actorFactionId, targetFactionId, "status", () => 0, false,
    );
  }
  if (cardId === "subjugate" || cardId === "incorporate") {
    const odds = targetOddsLines(view, actorFactionId, cardId, targetFactionId);
    if (odds.length > 0) return odds[0];
    return cardId === "subjugate"
      ? "Becomes your vassal."
      : "Absorbed into your realm.";
  }
  if (cardId === "alliance") {
    const turns = view.diplomacyBoost.includes(actorFactionId) ? 10 : 5;
    return `No hostile cards between you for ${turns} turns.`;
  }
  if (cardId === "found-settlement") {
    return "+1 to the lead others need to subjugate you.";
  }
  return "Available.";
}

/** One line for the map hover while a card is armed: what this card would do
 *  to this land, or why it cannot be aimed there. Null for a card that takes no
 *  target, or a faction the rules have never heard of.
 *
 *  Deliberately quotes no card name. A name in player-facing prose has to be a
 *  segment the player can point at (see AGENTS.md), `TooltipLine` is plain
 *  text, and the armed card is already named on the HUD anyway. */
export function targetImpactLine(
  view: RulesView,
  actorFactionId: string,
  cardId: string,
  targetFactionId: string,
): TooltipLine | null {
  if (!CARDS[cardId]?.targeted) return null;
  const entry = targetEligibilityFor(view, actorFactionId, cardId).find(
    (e) => e.factionId === targetFactionId,
  );
  if (entry === undefined) return null;
  // Your own land, before anything else. The rules reach it two different ways
  // - "irrelevant" because a realm does not border itself, or a `self` block
  // once an annexation puts your own id back in your reach - and both would
  // otherwise print an answer ("Out of reach") that is nonsense for the land
  // you are standing on. Never reached by Found a settlement, which is aimed
  // at your own realm and comes back available.
  if (entry.state !== "available" && targetFactionId === actorFactionId) {
    return { text: "Your own land.", tone: "bad" };
  }
  if (entry.state === "irrelevant") {
    return {
      text:
        cardId === "found-settlement"
          ? "Not in your realm."
          : "Out of reach.",
      tone: "bad",
    };
  }
  if (entry.state === "blocked") {
    // The first reason only. `targetEligibilityFor` pushes the structural
    // blocks (self, incorporated, subjugated, already a vassal) before the
    // lead shortfall, so the first is the one that has to be fixed first, and
    // a hover has room for one line. The card tip still lists them all.
    return { text: explainReason(entry.reasons[0])[0], tone: "bad" };
  }
  return {
    text: availableImpact(view, actorFactionId, cardId, targetFactionId),
    tone: "good",
  };
}

/** Why a card in hand is greyed out, in one line, for its hover tip.
 *
 *  One line per rule, not per card: `cardBlockReason` already reduced fourteen
 *  cards to six answers, and this is the only place those six are put into
 *  words. A fifteenth card that reuses an existing rule needs nothing here.
 *
 *  Names no card. The forced card is the one still lit up in the hand, which
 *  says which it is better than a name in a tip the player has to hover a
 *  different card to read. */
export function cardBlockLine(reason: CardBlockReason): string {
  switch (reason.code) {
    case "forced-first":
      return "A forced card must be played first.";
    case "needs-overlord":
      return "Only while you are somebody's vassal.";
    case "already-held":
      return "You are already holding an unspent one.";
    case "revolt-live":
      return "A revolt is already sown in your deck.";
    case "no-target":
      return "Nothing in reach is a legal target.";
    case "unavailable":
      return "Not playable now.";
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

/** The slice of state the modifier lines need. `GameState` satisfies this
 *  structurally, so the caller passes the game straight in. */
export interface ModifierView {
  omens: string[];
  diplomacyBoost: string[];
  bodyguards: string[];
}

/** What is currently affecting this card for this faction, in words, for the
 *  hover tip. Two of these were invisible before: a player could hold an
 *  Extended diplomacy or a Bodyguard and have no way to see it. */
export function cardModifierLines(
  view: ModifierView,
  factionId: string,
  cardId: string,
): string[] {
  const lines: string[] = [];
  if (view.omens.includes(factionId)) {
    if (DOUBLABLE_CARDS.has(cardId)) {
      lines.push("Favourable omens: this card counts double.");
    }
    if (cardId === "favourable-omens") {
      lines.push("A reading is already in hand.");
    }
  }
  if (cardId === "alliance" && view.diplomacyBoost.includes(factionId)) {
    lines.push("Extended diplomacy: this Alliance lasts 10 turns.");
  }
  if (cardId === "bodyguard" && view.bodyguards.includes(factionId)) {
    lines.push("A bodyguard is already posted.");
  }
  return lines;
}
