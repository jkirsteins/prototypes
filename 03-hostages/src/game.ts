import { chooseConvictAnswer, chooseConvictDiscard, chooseConvictLead } from "./ai";
import {
  CONVICT_DECK,
  NOT_YET_ID,
  PLAYER_DECK,
  SECRETS,
  VICTORY_CARD_ID,
  cardById,
} from "./content/cards";
import { OPENING } from "./content/scenario";
import { drawCard, discardCard, newPile } from "./deck";
import { applyAnswerEffect, applyLeadEffect, newMods } from "./effects";
import type { ExchangeMods } from "./effects";
import { canAnswer, canLead } from "./legality";
import type { Legality } from "./legality";
import { logCard, logNote } from "./log";
import { createRng } from "./rng";
import {
  HAND_CAP,
  INCAPACITATED_CLEAR_AT,
  INCAPACITATED_RECOVERY,
  STARTING_HAND,
} from "./types";
import type { CardDef, GameState, Side } from "./types";

export function newRun(seed: number): GameState {
  const rng = createRng(seed);
  return {
    phase: "openingEvent",
    turn: 0,
    player: { willpower: 6, vigor: 6, bound: true, toppled: false },
    wife: { vigor: 4, bond: 3 },
    convict: {
      willpower: 6,
      vigor: 6,
      distracted: 0,
      offBalance: false,
      weaponDown: false,
      incapacitated: false,
    },
    scene: { zone: "livingRoom", range: "near" },
    playerPile: newPile(PLAYER_DECK, rng),
    convictPile: newPile(CONVICT_DECK, rng),
    secretsRemaining: [...SECRETS],
    notYetSpent: false,
    coercionDefused: false,
    pendingLead: null,
    log: [],
    outcome: null,
    stats: {
      wifeLowestVigor: 4,
      secretsGiven: [],
      largestWillpowerSwing: null,
      notYetForced: false,
    },
    rng,
  };
}

export function chooseOpening(state: GameState, choiceId: string): void {
  const choice = OPENING.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`Unknown opening choice: ${choiceId}`);
  state.player.vigor = choice.apply.playerVigor;
  state.player.willpower = choice.apply.playerWillpower;
  state.wife.vigor = choice.apply.wifeVigor;
  state.stats.wifeLowestVigor = choice.apply.wifeVigor;
  state.convict.willpower = choice.apply.convictWillpower;
  state.scene.range = choice.apply.range;
  state.turn = 1;
  for (let i = 0; i < STARTING_HAND; i += 1) {
    drawCard(state.playerPile, state.rng);
    drawCard(state.convictPile, state.rng);
  }
  logNote(state, "system", "scene", choice.text);
  state.phase = "playerLead";
}

function assertPlayable(state: GameState): void {
  if (state.phase === "gameOver") throw new Error("The run is over");
}

function checkEnd(state: GameState): boolean {
  // An outcome may already be set by an effect (loseRun, or the fixture
  // victory) before this runs; only look for a fresh vigor-based outcome
  // when nothing has claimed the ending yet. Either way, there is exactly
  // one exit point below, so the ending line is logged exactly once.
  if (state.outcome === null) {
    if (state.player.vigor <= 0) {
      state.outcome = "lossVigor";
    } else if (state.wife.vigor <= 0) {
      state.outcome = "lossWife";
    }
  }
  if (state.outcome === null) return false;
  state.phase = "gameOver";
  logNote(state, "system", "outcome", endingLine(state));
  return true;
}

function endingLine(state: GameState): string {
  switch (state.outcome) {
    case "victory":
      return "You get his wrists behind him and start wrapping. It is over.";
    case "lossSecrets":
      return "He has what he came for. He does not need either of you now.";
    case "lossVigor":
      return "The room tilts and does not come back.";
    case "lossWife":
      return "She stops moving. Nothing after this matters to you.";
    default:
      return "";
  }
}

/** Resolve one exchange. Returns the mods so the caller can inspect coercion. */
function resolveExchange(
  state: GameState,
  lead: CardDef,
  leadBy: Side,
  answerId: string | null,
): ExchangeMods {
  const mods = newMods();
  if (answerId !== null) {
    const answer = cardById(answerId);
    const deltas: string[] = [];
    for (const effect of answer.effects) {
      deltas.push(...applyAnswerEffect(state, effect, mods, answer.name));
    }
    logCard(state, leadBy === "player" ? "convict" : "player", "answer", answerId, deltas);
  }
  const leadDeltas: string[] = [];
  for (const effect of lead.effects) {
    leadDeltas.push(...applyLeadEffect(state, effect, mods, lead.name));
  }
  if (leadDeltas.length > 0) {
    logNote(state, leadBy, "effect", mods.negated ? "It comes to nothing." : "It lands.", leadDeltas);
  } else if (mods.negated) {
    logNote(state, leadBy, "effect", "It comes to nothing.");
  }
  if (mods.runLost) state.outcome = "lossSecrets";
  return mods;
}

function convictAnswerFor(state: GameState, lead: CardDef): string | null {
  const id = chooseConvictAnswer(state, lead);
  if (id === null) return null;
  if (!canAnswer(state, "convict", cardById(id), lead).ok) return null;
  return id;
}

function spendConvictAnswer(state: GameState, answerId: string): void {
  if (answerId === NOT_YET_ID) {
    state.notYetSpent = true;
    state.stats.notYetForced = true;
    return;
  }
  discardCard(state.convictPile, answerId);
}

function spendPlayerAnswer(state: GameState, answerId: string, coerced: boolean): void {
  const card = cardById(answerId);
  if (card.tags.includes("secret")) {
    state.secretsRemaining = state.secretsRemaining.filter((id) => id !== answerId);
    state.stats.secretsGiven.push({ cardId: answerId, coerced });
    return;
  }
  discardCard(state.playerPile, answerId);
}

/** The convict acts. Returns true if the player must now answer. */
function convictTurn(state: GameState): boolean {
  state.turn += 1;

  if (state.convict.incapacitated) {
    state.convict.vigor += INCAPACITATED_RECOVERY;
    if (state.convict.vigor >= INCAPACITATED_CLEAR_AT) {
      state.convict.incapacitated = false;
      logNote(state, "convict", "recover", "He gets his knees under him and stands.", [
        `His vigor is ${state.convict.vigor}`,
      ]);
    } else {
      logNote(state, "convict", "recover", "He is face down and breathing hard.", [
        `His vigor is ${state.convict.vigor}`,
      ]);
    }
    return false;
  }

  if (state.player.toppled) {
    state.player.toppled = false;
    state.scene.range = "near";
    state.convict.offBalance = true;
    logNote(state, "convict", "haulUp", "He swears and hauls you and the chair back upright.", [
      "He is close",
      "He is off-balance",
    ]);
    return false;
  }

  drawCard(state.convictPile, state.rng);
  while (state.convictPile.hand.length > HAND_CAP) {
    const discardId = chooseConvictDiscard(state);
    discardCard(state.convictPile, discardId);
    logNote(state, "convict", "discard", "He drops something he cannot use.", [
      `He discards ${cardById(discardId).name}`,
    ]);
  }
  const leadId = chooseConvictLead(state);
  if (leadId === null) {
    logNote(state, "convict", "pass", "He paces and says nothing.");
    return false;
  }
  discardCard(state.convictPile, leadId);
  const lead = cardById(leadId);
  logCard(state, "convict", "lead", leadId, []);
  state.pendingLead = { cardId: leadId, by: "convict", coercion: lead.coercion === true };
  state.phase = "playerAnswer";
  return true;
}

function endConvictTurn(state: GameState): void {
  if (state.convict.distracted > 0) state.convict.distracted -= 1;
}

/**
 * Draw a card for the player, then decide whether the hand fits under the
 * cap. Every path that lands the player back at their own turn goes through
 * this so the discard prompt appears at the one predictable moment: the
 * start of the player's turn, however many draws led up to it.
 */
function drawThenDecidePlayerPhase(state: GameState): void {
  drawCard(state.playerPile, state.rng);
  state.phase = state.playerPile.hand.length > HAND_CAP ? "discardDown" : "playerLead";
}

function startPlayerTurn(state: GameState): void {
  state.turn += 1;
  drawThenDecidePlayerPhase(state);
}

/** After a player lead resolves: run the convict's turn until input is needed. */
function afterPlayerAction(state: GameState): void {
  if (checkEnd(state)) return;
  const needsAnswer = convictTurn(state);
  if (needsAnswer) return;
  endConvictTurn(state);
  if (checkEnd(state)) return;
  startPlayerTurn(state);
}

export function playerLead(state: GameState, cardId: string): void {
  assertPlayable(state);
  if (state.phase !== "playerLead") throw new Error("It is not your turn to lead");
  const card = cardById(cardId);
  const isFixture = cardId === VICTORY_CARD_ID;
  if (!isFixture && !state.playerPile.hand.includes(cardId)) {
    throw new Error(`Card ${cardId} is not available`);
  }
  const legality = canLead(state, "player", card);
  if (!legality.ok) throw new Error(`Card ${cardId} is not legal: ${legality.reason}`);

  if (!isFixture) discardCard(state.playerPile, cardId);
  logCard(state, "player", "lead", cardId, []);

  const answerId = convictAnswerFor(state, card);
  if (answerId !== null) spendConvictAnswer(state, answerId);
  resolveExchange(state, card, "player", answerId);

  if (isFixture && answerId === null) {
    state.outcome = "victory";
    logNote(state, "system", "outcome", endingLine(state));
    state.phase = "gameOver";
    return;
  }
  afterPlayerAction(state);
}

export function playerPass(state: GameState): void {
  assertPlayable(state);
  if (state.phase !== "playerLead") throw new Error("It is not your turn to lead");
  drawCard(state.playerPile, state.rng);
  logNote(state, "player", "pass", "You keep still and wait for an opening.");
  afterPlayerAction(state);
}

export function playerAnswer(state: GameState, cardId: string | null): void {
  assertPlayable(state);
  if (state.phase !== "playerAnswer" || state.pendingLead === null) {
    throw new Error("There is nothing to answer");
  }
  const pending = state.pendingLead;
  const lead = cardById(pending.cardId);

  if (cardId !== null) {
    const card = cardById(cardId);
    if (!card.tags.includes("secret") && !state.playerPile.hand.includes(cardId)) {
      throw new Error(`Card ${cardId} is not available`);
    }
    const legality = canAnswer(state, "player", card, lead);
    if (!legality.ok) throw new Error(`Card ${cardId} is not legal: ${legality.reason}`);
    spendPlayerAnswer(state, cardId, false);
  } else {
    logNote(state, "player", "decline", "You take it.");
  }

  // The convict's turn that produced this lead concludes here, exactly
  // once, before the answering card (or lack of one) resolves against it.
  // This must fire even when the exchange turns out to force a surrender:
  // playerSurrender is a continuation of this same turn, not a new one, so
  // it must not tick distraction again.
  endConvictTurn(state);
  const mods = resolveExchange(state, lead, "convict", cardId);
  state.pendingLead = null;

  if (checkEnd(state)) return;

  if (pending.coercion && !mods.coercionStripped) {
    if (state.player.willpower <= 0) {
      logNote(state, "convict", "coercion", "He waits. You have nothing left to hold onto.");
      state.phase = "forcedSurrender";
      return;
    }
    const gaveSecret = cardId !== null && cardById(cardId).tags.includes("secret");
    if (gaveSecret) {
      // A secret is capitulation, not resistance: he got his answer, so the
      // coercion clause is not defused and nothing here counts as holding out.
      logNote(state, "convict", "coercion", "He got what he wanted. He does not need to ask again.");
    } else {
      state.coercionDefused = true;
      logNote(state, "player", "coercion", "You hold. He does not get his answer.");
    }
  } else if (pending.coercion && mods.coercionStripped) {
    state.coercionDefused = true;
  }

  startPlayerTurn(state);
}

export function playerDiscard(state: GameState, cardId: string): void {
  assertPlayable(state);
  if (state.phase !== "discardDown") throw new Error("You are not discarding");
  if (!state.playerPile.hand.includes(cardId)) {
    throw new Error(`Card ${cardId} is not in hand`);
  }
  discardCard(state.playerPile, cardId);
  state.phase = state.playerPile.hand.length > HAND_CAP ? "discardDown" : "playerLead";
}

export function legalPlayerDiscards(state: GameState): string[] {
  return [...state.playerPile.hand];
}

export function playerSurrender(state: GameState, secretId: string): void {
  assertPlayable(state);
  if (state.phase !== "forcedSurrender") throw new Error("You are not being pressed");
  if (!state.secretsRemaining.includes(secretId)) throw new Error(`No such secret: ${secretId}`);

  const card = cardById(secretId);
  state.secretsRemaining = state.secretsRemaining.filter((id) => id !== secretId);
  state.stats.secretsGiven.push({ cardId: secretId, coerced: true });

  // No endConvictTurn here: this call is the deferred conclusion of the
  // same convict turn that playerAnswer already ticked once, immediately
  // before resolving the coercive lead that led to this forced surrender.
  const mods = newMods();
  const deltas: string[] = [];
  for (const effect of card.effects) {
    deltas.push(...applyAnswerEffect(state, effect, mods, card.name));
  }
  logCard(state, "player", "answer", secretId, deltas);
  if (mods.runLost) state.outcome = "lossSecrets";

  if (checkEnd(state)) return;
  startPlayerTurn(state);
}

function options(
  state: GameState,
  ids: string[],
  check: (card: CardDef) => Legality,
): Array<{ cardId: string; legality: Legality }> {
  return ids.map((cardId) => ({ cardId, legality: check(cardById(cardId)) }));
}

export function legalPlayerLeads(
  state: GameState,
): Array<{ cardId: string; legality: Legality }> {
  const ids = [...state.playerPile.hand, VICTORY_CARD_ID];
  return options(state, ids, (card) => canLead(state, "player", card));
}

export function legalPlayerAnswers(
  state: GameState,
): Array<{ cardId: string; legality: Legality }> {
  if (state.pendingLead === null) return [];
  const lead = cardById(state.pendingLead.cardId);
  const ids = [...state.playerPile.hand, ...state.secretsRemaining];
  return options(state, ids, (card) => canAnswer(state, "player", card, lead)).filter(
    ({ cardId }) => cardById(cardId).kind === "defensive",
  );
}
