import {
  type TargetBlockReason,
  type TargetEligibility,
} from "./playability";
import { DOUBLABLE_CARDS } from "./cards";

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
      return [
        `Need a Might or Status lead of ${reason.requiredLead} because their realm has ${lands}${settled}.`,
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
