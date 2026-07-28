import { NOT_YET_ID, cardById } from "./content/cards";
import { canAnswer, canLead, leadDamageTo } from "./legality";
import type { CardDef, GameState } from "./types";

function legalLeads(state: GameState): CardDef[] {
  return state.convictPile.hand
    .map((id) => cardById(id))
    .filter((card) => canLead(state, "convict", card).ok);
}

function firstWithId(cards: CardDef[], id: string): CardDef | undefined {
  return cards.find((card) => card.id === id);
}

function willpowerCost(card: CardDef): number {
  let total = 0;
  for (const effect of card.effects) {
    if (effect.kind === "willpower" && effect.target === "player" && effect.amount < 0) {
      total += -effect.amount;
    }
  }
  return total;
}

export function chooseConvictLead(state: GameState): string | null {
  const legal = legalLeads(state);
  if (legal.length === 0) return null;

  const snatch = firstWithId(legal, "snatchItBack");
  if (state.convict.weaponDown && snatch) return snatch.id;

  if (state.player.willpower <= 2) {
    const demands = legal.filter((card) => card.coercion);
    if (demands.length > 0) {
      demands.sort((a, b) => willpowerCost(b) - willpowerCost(a));
      return demands[0].id;
    }
  }

  const tighten = firstWithId(legal, "tightenTheRopes");
  if (!state.player.bound && tighten) return tighten.id;

  const fingers = firstWithId(legal, "breakHerFingers");
  if (state.coercionDefused && fingers && state.player.willpower > 4) return fingers.id;

  const ransack = firstWithId(legal, "ransackTheRoom");
  if (ransack && state.player.willpower > 3) return ransack.id;

  const ranked = [...legal].sort(
    (a, b) => leadDamageTo(b, "player") - leadDamageTo(a, "player"),
  );
  return ranked[0].id;
}

/** Damage a lead would actually do to him right now, bonus included. */
function effectiveDamageToConvict(state: GameState, lead: CardDef): number {
  let total = 0;
  for (const effect of lead.effects) {
    if (effect.kind !== "damage" || effect.target !== "convict") continue;
    total += effect.amount;
    if (effect.offBalanceBonus !== undefined && state.convict.offBalance) {
      total += effect.offBalanceBonus;
    }
  }
  return total;
}

/**
 * The card the convict throws away when he draws over the hand cap. He
 * discards the first OFFENSIVE card in hand that he currently cannot lead,
 * keeping his defensive cards (Brace, Expert Knots, I've Heard That Before)
 * in reserve. If every offensive card in hand is currently legal, he
 * discards the first defensive card instead. If neither case applies (no
 * offensive cards are dead and no defensive card is held), he discards the
 * first card in hand. Deterministic and does not mutate state.
 */
export function chooseConvictDiscard(state: GameState): string {
  const hand = state.convictPile.hand;
  const cards = hand.map((id) => cardById(id));
  const offensive = cards.filter((card) => card.kind === "offensive");
  const deadOffensive = offensive.find((card) => !canLead(state, "convict", card).ok);
  if (deadOffensive) return deadOffensive.id;
  const everyOffensiveLegal = offensive.every((card) => canLead(state, "convict", card).ok);
  if (everyOffensiveLegal) {
    const defensive = cards.find((card) => card.kind === "defensive");
    if (defensive) return defensive.id;
  }
  return hand[0];
}

export function chooseConvictAnswer(state: GameState, lead: CardDef): string | null {
  const candidates = state.notYetSpent
    ? [...state.convictPile.hand]
    : [NOT_YET_ID, ...state.convictPile.hand];
  const legal = candidates
    .map((id) => cardById(id))
    .filter((card) => canAnswer(state, "convict", card, lead).ok);
  if (legal.length === 0) return null;

  const notYet = firstWithId(legal, NOT_YET_ID);
  if (notYet) return notYet.id;

  const knots = firstWithId(legal, "expertKnots");
  if (knots) return knots.id;

  const heard = firstWithId(legal, "heardThatBefore");
  if (heard && state.convict.willpower <= 3) return heard.id;

  const brace = firstWithId(legal, "brace");
  if (brace && effectiveDamageToConvict(state, lead) > 3) return brace.id;

  return null;
}
