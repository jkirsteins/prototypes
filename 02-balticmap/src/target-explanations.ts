import {
  type TargetBlockReason,
  type TargetEligibility,
} from "./playability";

export interface TargetExplanation {
  factionId: string;
  lines: string[];
  available: boolean;
}

function explainReason(reason: TargetBlockReason): string[] {
  switch (reason.code) {
    case "alliance":
      return [`Blocked by Alliance until turn ${reason.expiresTurn}.`];
    case "insufficient-lead":
      return [
        `Need a Might or Status lead of ${reason.requiredLead} because their realm has ${reason.realmSize} ${reason.realmSize === 1 ? "land" : "lands"}.`,
        `Current leads: Might ${reason.mightLead}, Status ${reason.statusLead}.`,
      ];
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
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function explainTargetEligibility(
  entries: TargetEligibility[],
  factionName: (id: string) => string,
): TargetExplanation[] {
  return entries.flatMap((entry): TargetExplanation[] => {
    if (entry.state === "irrelevant") return [];
    if (entry.state === "available") {
      return [{
        factionId: entry.factionId,
        lines: [factionName(entry.factionId), "Available."],
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
