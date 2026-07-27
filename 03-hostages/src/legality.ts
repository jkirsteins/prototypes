import { NOT_YET_ID } from "./content/cards-convict";
import { cardById } from "./content/cards";
import type { CardDef, GameState, Side, Target } from "./types";

export type Legality = { ok: true } | { ok: false; reason: string };

const OK: Legality = { ok: true };

function no(reason: string): Legality {
  return { ok: false, reason };
}

export function leadDamageTo(card: CardDef, target: Target): number {
  let total = 0;
  for (const effect of card.effects) {
    if (effect.kind === "damage" && effect.target === target) total += effect.amount;
  }
  return total;
}

function checkSharedRequirements(state: GameState, card: CardDef): Legality {
  const req = card.requires;
  if (req.bound !== undefined && state.player.bound !== req.bound) {
    return no(req.bound ? "needs: you are bound" : "needs: you are not bound");
  }
  if (req.toppled !== undefined && state.player.toppled !== req.toppled) {
    return no(req.toppled ? "needs: you are on the floor" : "needs: you are upright");
  }
  if (req.range !== undefined && state.scene.range !== req.range) {
    return no(req.range === "near" ? "needs: he is near" : "needs: he is away");
  }
  if (req.zone !== undefined && state.scene.zone !== req.zone) {
    return no(
      req.zone === "bedroom" ? "needs: you are in the bedroom" : "needs: you are in the living room",
    );
  }
  if (req.convictDistracted !== undefined) {
    const distracted = state.convict.distracted > 0;
    if (distracted !== req.convictDistracted) {
      return no(req.convictDistracted ? "needs: he is distracted" : "needs: he is not distracted");
    }
  }
  if (req.convictOffBalance !== undefined && state.convict.offBalance !== req.convictOffBalance) {
    return no(req.convictOffBalance ? "needs: he is off-balance" : "needs: he is steady");
  }
  if (req.convictWeaponDown !== undefined && state.convict.weaponDown !== req.convictWeaponDown) {
    return no(req.convictWeaponDown ? "needs: his knife is down" : "needs: he is armed");
  }
  if (
    req.convictIncapacitated !== undefined &&
    state.convict.incapacitated !== req.convictIncapacitated
  ) {
    return no(req.convictIncapacitated ? "needs: he is incapacitated" : "needs: he is on his feet");
  }
  if (req.convictDistractedOrOffBalance) {
    if (state.convict.distracted === 0 && !state.convict.offBalance) {
      return no("needs: he is distracted or off-balance");
    }
  }
  if (req.coercionDefused !== undefined && state.coercionDefused !== req.coercionDefused) {
    return no("needs: you have defused a demand");
  }
  return OK;
}

export function canLead(state: GameState, side: Side, card: CardDef): Legality {
  if (card.side !== side) return no("not your card");
  if (card.kind !== "offensive") return no("defensive cards cannot be led");
  return checkSharedRequirements(state, card);
}

export function canAnswer(
  state: GameState,
  side: Side,
  card: CardDef,
  lead: CardDef,
): Legality {
  if (card.side !== side) return no("not your card");
  if (card.kind !== "defensive") return no("offensive cards cannot answer");
  if (card.tags.includes("secret") && !state.secretsRemaining.includes(card.id)) {
    return no("already given up");
  }
  if (card.id === NOT_YET_ID && state.notYetSpent) return no("already used");

  const req = card.requires;
  if (req.answersCardId !== undefined && lead.id !== req.answersCardId) {
    return no(`only answers ${cardById(req.answersCardId).name}`);
  }
  if (req.answersTag !== undefined && !lead.tags.includes(req.answersTag)) {
    return no(
      req.answersTag === "deception"
        ? "needs: he is answering a bluff"
        : "needs: he is threatening her",
    );
  }
  if (req.answersCoercion && !lead.coercion) return no("needs: he is making a demand");
  if (req.answersDamageToOwner) {
    const target: Target = side === "player" ? "player" : "convict";
    if (leadDamageTo(lead, target) <= 0) return no("needs: it would hurt you");
  }
  if (req.answersDamageToConvictAtLeast !== undefined) {
    if (leadDamageTo(lead, "convict") < req.answersDamageToConvictAtLeast) {
      return no("needs: it would hurt him");
    }
  }
  return checkSharedRequirements(state, card);
}
