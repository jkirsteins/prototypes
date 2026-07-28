import type { CardDef, CardRequirement, Effect } from "../types";

function effectPhrase(effect: Effect): string | null {
  switch (effect.kind) {
    case "damage": {
      const who = effect.target === "convict" ? "his" : effect.target === "player" ? "your" : "her";
      return `-${effect.amount} ${who} vig`;
    }
    case "willpower": {
      const who = effect.target === "convict" ? "his" : "your";
      const sign = effect.amount > 0 ? "+" : "";
      return `${sign}${effect.amount} ${who} will`;
    }
    case "restoreWillpowerTo":
      return `will to ${effect.value}`;
    case "setBound":
      return effect.value ? "you are bound" : "hands free";
    case "setToppled":
      return effect.value ? "you fall" : "you stand";
    case "setDistracted":
      return `distract ${effect.turns}`;
    case "setOffBalance":
      return effect.value ? "off-balance" : null;
    case "setWeaponDown":
      return effect.value ? "knife down" : "he rearms";
    case "setRange":
      return effect.value === "near" ? "near" : "away";
    case "setZone":
      return effect.value === "bedroom" ? "bedroom" : "living room";
    case "bindOrHurt":
      return "rebind or hurt";
    case "reviveConvict":
      return `he is up at ${effect.vigor}`;
    case "negateLead":
      return "blocks";
    case "halveIncomingDamage":
      return "halve the hit";
    case "interposeForWife":
      return `take it for her (-${effect.selfDamage} your vig)`;
    case "stripCoercion":
      return "no answer owed";
  }
}

/** The compressed line printed on a card face. Derived from the effects so a
 *  balance change cannot leave stale prose behind. */
export function summarize(card: CardDef): string {
  const phrases = card.effects.map(effectPhrase).filter((p): p is string => p !== null);
  if (phrases.length === 0) return "hold on";
  return phrases.join(", ");
}

function requirementPhrases(req: CardRequirement): string[] {
  const out: string[] = [];
  if (req.bound !== undefined) out.push(req.bound ? "you are bound" : "you are not bound");
  if (req.toppled !== undefined) out.push(req.toppled ? "you are on the floor" : "you are upright");
  if (req.range !== undefined) out.push(req.range === "near" ? "he is near" : "he is away");
  if (req.zone !== undefined) {
    out.push(req.zone === "bedroom" ? "you are in the bedroom" : "you are in the living room");
  }
  if (req.convictDistracted !== undefined) {
    out.push(req.convictDistracted ? "he is distracted" : "he is not distracted");
  }
  if (req.convictOffBalance !== undefined) {
    out.push(req.convictOffBalance ? "he is off-balance" : "he is steady");
  }
  if (req.convictWeaponDown !== undefined) {
    out.push(req.convictWeaponDown ? "his knife is down" : "he is armed");
  }
  if (req.convictIncapacitated !== undefined) {
    out.push(req.convictIncapacitated ? "he is down" : "he is on his feet");
  }
  if (req.convictDistractedOrOffBalance) out.push("he is distracted or off-balance");
  if (req.coercionDefused !== undefined) out.push("you have defused a demand");
  if (req.answersCardId !== undefined) out.push("it answers one particular card");
  if (req.answersTag === "deception") out.push("he is answering a bluff");
  else if (req.answersTag !== undefined) out.push("he is threatening her");
  if (req.answersCoercion) out.push("he is making a demand");
  if (req.answersDamageToOwner) out.push("it would hurt you");
  if (req.answersDamageToConvictAtLeast !== undefined) out.push("it would hurt him");
  return out;
}

/** Prose for the hover panel. Empty string when a card is unconditional. */
export function requirementText(req: CardRequirement): string {
  const phrases = requirementPhrases(req);
  if (phrases.length === 0) return "";
  return `Needs: ${phrases.join(", ")}.`;
}
