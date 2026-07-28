import { legalPlayerAnswers, legalPlayerDiscards, legalPlayerLeads } from "../game";
import { cardById } from "../content/cards";
import { summarize } from "../content/card-text";
import { createBeats } from "./beats";
import { centerOf, flyCard } from "./animate";
import { createBackFan, createHand } from "./hand";
import type { HandOption } from "./hand";
import { createLogDrawer } from "./logdrawer";
import { createNotice } from "./notice";
import { createPile } from "./piles";
import { createPlate } from "./plates";
import { createSecrets, createTaken } from "./secrets";
import { el } from "./render";
import type { Actions } from "./render";
import type { GameEvent, GameState, Side } from "../types";

const CARD_W = 112; // matches .hand .card in style.css
const CARD_H = 120;
const CENTER_SCALE = 1.25;

export function bannerText(state: GameState): string {
  if (state.phase === "playerAnswer") return "HE IS WAITING - answer or take it";
  if (state.phase === "forcedSurrender") return "HE HAS YOU - give up a secret";
  if (state.phase === "discardDown") return "YOUR HAND IS FULL - discard one";
  return "YOUR TURN - lead a card";
}

export interface Table {
  root: HTMLElement;
  present(state: GameState, onSettled: () => void): void;
}

export function createTable(actions: Actions): Table {
  const root = el("section", "table");
  root.dataset.screen = "duel";

  const convictPlate = createPlate("convict");
  const playerPlate = createPlate("player");
  const wifePlate = createPlate("wife");
  const backs = createBackFan();
  const taken = createTaken();
  const secrets = createSecrets();
  const hand = createHand();
  const log = createLogDrawer();
  const notice = createNotice();

  const piles = {
    "player-deck": createPile("player-deck", "Deck"),
    "player-discard": createPile("player-discard", "Discard"),
    "convict-deck": createPile("convict-deck", "Deck"),
    "convict-discard": createPile("convict-discard", "Discard"),
  };

  const topRow = el("div", "table-row table-top");
  topRow.append(
    convictPlate.root,
    backs.root,
    taken.root,
    piles["convict-deck"].root,
    piles["convict-discard"].root,
  );

  const banner = el("h2", "banner");
  banner.dataset.banner = "";

  const center = el("div", "center");
  center.dataset.center = "";
  const leadSlot = el("div", "slot");
  leadSlot.dataset.slot = "lead";
  const answerSlot = el("div", "slot");
  answerSlot.dataset.slot = "answer";
  center.append(leadSlot, answerSlot);

  // Your piles sit beside your plate, the way his sit beside his in the top
  // row. That leaves the hand row holding nothing but the fan, and the
  // choices a row of their own below it.
  //
  // The fan is the widest thing on the board and it changes width constantly:
  // 7 cards at 112px plus gaps is 808px against a board of 878px (the 72rem
  // shell less the 16rem drawer and its gap). Seven is the real ceiling -
  // HAND_CAP is 5, but playerPass draws without a cap check, so a turn can
  // start at 6 and draw to 7 before discardDown. Sharing the row with the
  // two piles (109px) and a button as wide as "Wait and watch (draw a card)"
  // (278px) overran that badly enough to wrap, which reflowed the surface
  // the player is aiming at every time their hand size changed.
  const youRow = el("div", "table-row table-you");
  youRow.append(
    playerPlate.root,
    wifePlate.root,
    piles["player-deck"].root,
    piles["player-discard"].root,
    secrets.root,
  );

  const handRow = el("div", "table-row table-hand");
  handRow.append(hand.root);

  const choicesRow = el("div", "table-row table-choices");
  const choices = el("div", "choices");
  choicesRow.append(choices);

  const board = el("div", "board");
  board.append(topRow, banner, center, youRow, handRow, choicesRow);

  const shell = el("div", "table-shell");
  shell.append(board, log.root);
  root.append(shell, notice.root);

  /** Renders the parts that a beat can step through, from that beat's own
   *  snapshot rather than from final state. Without this the table would
   *  snap to the end result on the first beat and the chain would animate
   *  against numbers that had already moved. */
  function paintEvent(event: GameEvent): void {
    convictPlate.update(event.vitals);
    playerPlate.update(event.vitals);
    wifePlate.update(event.vitals);
    piles["player-deck"].update(event.piles.player.deck);
    piles["player-discard"].update(event.piles.player.discard);
    piles["convict-deck"].update(event.piles.convict.deck);
    piles["convict-discard"].update(event.piles.convict.discard);
    backs.update(event.piles.convict.hand);
  }

  const rectOf = (node: HTMLElement): DOMRect => node.getBoundingClientRect();
  const spawn = (r: DOMRect): { x: number; y: number; width: number; height: number } => ({
    x: r.x,
    y: r.y,
    width: CARD_W,
    height: CARD_H,
  });

  function animate(event: GameEvent): void {
    const side: Side = event.side === "convict" ? "convict" : "player";
    if (event.kind === "draw") {
      const deck = piles[side === "player" ? "player-deck" : "convict-deck"].root;
      const target = side === "player" ? hand.root : backs.root;
      flyCard(root, "back", "", spawn(rectOf(deck)), [
        { to: centerOf(rectOf(target)), scale: 1, durationMs: 170 },
      ]);
      return;
    }
    if (event.kind === "reshuffle") {
      piles[side === "player" ? "player-deck" : "convict-deck"].pulse();
      return;
    }
    if (event.kind === "lead" || event.kind === "answer") {
      if (event.cardId === undefined) return;
      const card = cardById(event.cardId);
      // rectOf returns null once the card has left the fan, which is the
      // normal case by the time a lead animates: fall back to the fan itself.
      const origin =
        (side === "player" ? hand.rectOf(event.cardId) : null) ??
        rectOf(side === "player" ? hand.root : backs.root);
      const slot = event.kind === "lead" ? leadSlot : answerSlot;
      flyCard(root, "", card.name, spawn(origin), [
        { to: centerOf(rectOf(slot)), scale: CENTER_SCALE, durationMs: 220 },
      ]);
      return;
    }
    if (event.kind === "surrender" && event.cardId !== undefined) {
      const origin = secrets.rectOf(event.cardId) ?? rectOf(secrets.root);
      flyCard(root, "", cardById(event.cardId).name, spawn(origin), [
        { to: centerOf(rectOf(taken.root)), scale: 0.9, durationMs: 280 },
      ]);
      return;
    }
    if (event.kind === "discard") {
      const discard = piles[side === "player" ? "player-discard" : "convict-discard"].root;
      const origin = rectOf(side === "player" ? hand.root : backs.root);
      flyCard(root, "back", "", spawn(origin), [
        { to: centerOf(rectOf(discard)), scale: 0.8, durationMs: 170 },
      ]);
    }
  }

  function renderCenter(state: GameState): void {
    leadSlot.textContent = "";
    answerSlot.textContent = "";
    if (state.pendingLead === null) return;
    const card = cardById(state.pendingLead.cardId);
    const face = el("div", "card center-card");
    face.dataset.cardId = card.id;
    face.append(el("span", "card-name", card.name));
    face.append(el("span", "card-summary", summarize(card)));
    leadSlot.append(face);
  }

  /** Secrets live in their own row for the whole run, so they are filtered
   *  out of the fan even when they are legal answers. Showing a card in two
   *  places at once would make the row look like a duplicate rather than the
   *  place the secret actually lives. */
  const notSecret = (option: HandOption): boolean =>
    !cardById(option.cardId).tags.includes("secret");

  function handOptions(state: GameState): HandOption[] {
    if (state.phase === "playerLead") return legalPlayerLeads(state).filter(notSecret);
    if (state.phase === "playerAnswer") return legalPlayerAnswers(state).filter(notSecret);
    if (state.phase === "discardDown") {
      return legalPlayerDiscards(state).map((cardId) => ({ cardId, legality: { ok: true } }));
    }
    return [];
  }

  /** The secrets row is where a secret is ever played from: as an answer
   *  while he is pressing you, or as the forced surrender when your
   *  willpower is gone. It is inert the rest of the time. */
  function secretHandler(state: GameState): ((id: string) => void) | null {
    if (state.phase === "forcedSurrender") return (id) => actions.surrender(id);
    if (state.phase !== "playerAnswer") return null;
    const legal = new Set(
      legalPlayerAnswers(state)
        .filter((o) => o.legality.ok && !notSecret(o))
        .map((o) => o.cardId),
    );
    if (legal.size === 0) return null;
    return (id) => {
      if (legal.has(id)) actions.answer(id);
    };
  }

  function pickFor(state: GameState): (cardId: string) => void {
    if (state.phase === "playerAnswer") return (id) => actions.answer(id);
    if (state.phase === "discardDown") return (id) => actions.discard(id);
    return (id) => actions.lead(id);
  }

  function renderChoices(state: GameState): void {
    choices.textContent = "";
    if (state.phase === "playerLead") {
      const pass = el("button", "secondary", "Wait and watch (draw a card)") as HTMLButtonElement;
      pass.type = "button";
      pass.id = "pass";
      pass.addEventListener("click", () => actions.pass());
      choices.append(pass);
    } else if (state.phase === "playerAnswer") {
      const decline = el("button", "secondary", "Take it") as HTMLButtonElement;
      decline.type = "button";
      decline.id = "decline";
      decline.addEventListener("click", () => actions.answer(null));
      choices.append(decline);
    }
  }

  /** The one full paint, and only ever at rest. Painting mid-chain would put
   *  the end of the exchange on screen before the beats have shown it: his
   *  answering lead would appear in the center slot while your own card was
   *  still flying into that same slot, and the banner would say he is
   *  waiting before he had visibly done anything. */
  function paintState(state: GameState): void {
    banner.textContent = bannerText(state);
    hand.update(handOptions(state), pickFor(state), false);
    renderChoices(state);
    renderCenter(state);
    taken.update(state.secretsRemaining);
    secrets.update(state.secretsRemaining, secretHandler(state));
  }

  /** Takes input away for the length of a chain without redrawing anything:
   *  what is on screen is the position the player just acted from, and it
   *  stays until the beats have caught up with it. The fan keeps its cards,
   *  which is also what lets a lead animate out of its real place in it. */
  function lockInput(): void {
    for (const button of hand.root.querySelectorAll("button")) button.disabled = true;
    for (const button of secrets.root.querySelectorAll("button")) button.disabled = true;
    choices.textContent = "";
  }

  let current: GameState | null = null;
  let settledCallback: (() => void) | null = null;

  const beats = createBeats({
    play(event) {
      paintEvent(event);
      animate(event);
      log.append([event]);
    },
    notice(n, done) {
      notice.show(n, done);
    },
    settled() {
      if (current !== null) paintState(current);
      const done = settledCallback;
      settledCallback = null;
      done?.();
    },
  });

  return {
    root,
    present(state, onSettled): void {
      current = state;
      settledCallback = onSettled;
      lockInput();
      // On first mount there is nothing on screen to keep: an empty queue
      // settles synchronously inside run(), so paintState still lands here.
      beats.run(state);
    },
  };
}
