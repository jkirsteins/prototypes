import { chooseConvictAnswer, chooseConvictLead } from "./ai";
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
      vigor: 8,
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
      turningPoint: null,
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
  if (state.outcome !== null) {
    state.phase = "gameOver";
    return true;
  }
  if (state.player.vigor <= 0) {
    state.outcome = "lossVigor";
  } else if (state.wife.vigor <= 0) {
    state.outcome = "lossWife";
  }
  if (state.outcome !== null) {
    state.phase = "gameOver";
    logNote(state, "system", "outcome", endingLine(state));
    return true;
  }
  return false;
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
      deltas.push(...applyAnswerEffect(state, effect, mods));
    }
    logCard(state, leadBy === "player" ? "convict" : "player", "answer", answerId, deltas);
  }
  const leadDeltas: string[] = [];
  for (const effect of lead.effects) {
    leadDeltas.push(...applyLeadEffect(state, effect, mods));
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

function startPlayerTurn(state: GameState): void {
  state.turn += 1;
  drawCard(state.playerPile, state.rng);
  state.phase = "playerLead";
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
  // The led card stays in hand until the whole exchange (including any
  // convict turn this call drives forward) has resolved. Discarding it
  // earlier would let a same-call draw immediately reshuffle it back out
  // of the discard pile when this pile's economy has nothing else in it.
  afterPlayerAction(state);
  if (!isFixture) discardCard(state.playerPile, cardId);
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
    const legality = canAnswer(state, "player", card, lead);
    if (!legality.ok) throw new Error(`Card ${cardId} is not legal: ${legality.reason}`);
    if (!card.tags.includes("secret") && !state.playerPile.hand.includes(cardId)) {
      throw new Error(`Card ${cardId} is not available`);
    }
    spendPlayerAnswer(state, cardId, false);
  } else {
    logNote(state, "player", "decline", "You take it.");
  }

  const mods = resolveExchange(state, lead, "convict", cardId);
  state.pendingLead = null;

  if (checkEnd(state)) return;

  if (pending.coercion && !mods.coercionStripped) {
    if (state.player.willpower <= 0) {
      logNote(state, "convict", "coercion", "He waits. You have nothing left to hold onto.");
      state.phase = "forcedSurrender";
      return;
    }
    state.coercionDefused = true;
    logNote(state, "player", "coercion", "You hold. He does not get his answer.");
  } else if (pending.coercion && mods.coercionStripped) {
    state.coercionDefused = true;
  }

  endConvictTurn(state);
  startPlayerTurn(state);
}

export function playerSurrender(state: GameState, secretId: string): void {
  assertPlayable(state);
  if (state.phase !== "forcedSurrender") throw new Error("You are not being pressed");
  if (!state.secretsRemaining.includes(secretId)) throw new Error(`No such secret: ${secretId}`);

  const card = cardById(secretId);
  state.secretsRemaining = state.secretsRemaining.filter((id) => id !== secretId);
  state.stats.secretsGiven.push({ cardId: secretId, coerced: true });

  // The convict's turn that produced this demand concludes here. Tick down
  // whatever distraction carried into this moment before the secret's own
  // effects (which may set fresh distraction) are applied, so a secret that
  // distracts him is not immediately docked a turn by its own resolution.
  endConvictTurn(state);

  const mods = newMods();
  const deltas: string[] = [];
  for (const effect of card.effects) {
    deltas.push(...applyAnswerEffect(state, effect, mods));
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
