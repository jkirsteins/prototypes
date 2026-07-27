import { cardById } from "../content/cards";
import { legalPlayerAnswers, legalPlayerLeads } from "../game";
import { el, clear } from "./render";
import type { Actions } from "./render";
import type { GameState } from "../types";

function stat(board: HTMLElement, key: string, label: string, value: string): void {
  const row = el("span", "stat");
  row.dataset.stat = key;
  row.textContent = `${label} ${value}`;
  board.append(row);
}

function renderStatus(state: GameState): HTMLElement {
  const board = el("div", "status");
  board.id = "status";

  stat(board, "player-willpower", "Your willpower", String(state.player.willpower));
  stat(board, "player-vigor", "Your vigor", String(state.player.vigor));
  stat(board, "wife-vigor", "Her vigor", String(state.wife.vigor));
  stat(board, "convict-willpower", "His willpower", String(state.convict.willpower));
  stat(board, "convict-vigor", "His vigor", String(state.convict.vigor));
  stat(board, "secrets", "Secrets left", String(state.secretsRemaining.length));

  const zone = el("span", "scene-bit", state.scene.zone === "bedroom" ? "Bedroom" : "Living room");
  zone.dataset.scene = "zone";
  const range = el("span", "scene-bit", state.scene.range === "near" ? "He is near" : "He is away");
  range.dataset.scene = "range";
  board.append(zone, range);

  const flags: string[] = [];
  if (state.player.bound) flags.push("You are bound");
  if (state.player.toppled) flags.push("You are on the floor");
  if (state.convict.distracted > 0) flags.push(`He is distracted (${state.convict.distracted})`);
  if (state.convict.offBalance) flags.push("He is off-balance");
  if (state.convict.weaponDown) flags.push("His knife is down");
  if (state.convict.incapacitated) flags.push("He is down");
  for (const flag of flags) board.append(el("span", "flag", flag));

  return board;
}

function renderLog(state: GameState): HTMLElement {
  const list = el("ul", "log");
  list.id = "log";
  for (const entry of state.log) {
    const item = el("li", "log-entry");
    item.dataset.side = entry.side;
    item.append(el("span", "log-text", entry.text));
    if (entry.deltas.length > 0) {
      item.append(el("span", "log-deltas", entry.deltas.join(", ")));
    }
    list.append(item);
  }
  return list;
}

function cardButton(
  cardId: string,
  ok: boolean,
  reason: string | undefined,
  onClick: () => void,
): HTMLElement {
  const card = cardById(cardId);
  const button = el("button", "card");
  button.dataset.cardId = cardId;
  button.append(el("span", "card-name", card.name));
  button.append(el("span", "card-rules", card.rules));
  button.append(el("span", "card-flavor", card.flavor));
  if (!ok) {
    (button as HTMLButtonElement).disabled = true;
    button.append(el("span", "card-reason", reason ?? "not available"));
  } else {
    button.addEventListener("click", onClick);
  }
  return button;
}

function bannerText(state: GameState): string {
  if (state.phase === "playerAnswer") return "HE IS WAITING - answer or decline";
  if (state.phase === "forcedSurrender") return "HE HAS YOU - give up a secret";
  return "YOUR TURN - lead a card";
}

export function renderDuel(root: HTMLElement, state: GameState, actions: Actions): void {
  clear(root);
  const screen = el("section", "screen");
  screen.dataset.screen = "duel";

  const banner = el("h2", "banner", bannerText(state));
  banner.id = "turn-banner";
  screen.append(banner);
  screen.append(renderStatus(state));
  screen.append(renderLog(state));

  const hand = el("div", "hand");

  if (state.phase === "playerLead") {
    for (const option of legalPlayerLeads(state)) {
      hand.append(
        cardButton(
          option.cardId,
          option.legality.ok,
          option.legality.ok ? undefined : option.legality.reason,
          () => actions.lead(option.cardId),
        ),
      );
    }
    const pass = el("button", "secondary", "Wait and watch (draw a card)");
    pass.id = "pass";
    pass.addEventListener("click", () => actions.pass());
    hand.append(pass);
  } else if (state.phase === "playerAnswer" && state.pendingLead) {
    const lead = cardById(state.pendingLead.cardId);
    screen.append(el("p", "prompt", `Answering: ${lead.name}. ${lead.rules}`));
    for (const option of legalPlayerAnswers(state)) {
      hand.append(
        cardButton(
          option.cardId,
          option.legality.ok,
          option.legality.ok ? undefined : option.legality.reason,
          () => actions.answer(option.cardId),
        ),
      );
    }
    const decline = el("button", "secondary", "Take it");
    decline.id = "decline";
    decline.addEventListener("click", () => actions.answer(null));
    hand.append(decline);
  } else if (state.phase === "forcedSurrender") {
    screen.append(el("p", "prompt", "You have nothing left to hold onto. Give him something."));
    for (const secretId of state.secretsRemaining) {
      hand.append(cardButton(secretId, true, undefined, () => actions.surrender(secretId)));
    }
  }

  screen.append(hand);
  root.append(screen);
}
