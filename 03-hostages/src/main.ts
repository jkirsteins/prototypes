import {
  chooseOpening,
  newRun,
  playerAnswer,
  playerDiscard,
  playerLead,
  playerPass,
  playerSurrender,
} from "./game";
import { renderDuel } from "./ui/duel";
import { renderEnding } from "./ui/ending";
import { renderEvent } from "./ui/event";
import { renderTitle } from "./ui/title";
import type { Actions } from "./ui/render";
import type { GameState } from "./types";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");
let state: GameState | null = null;

function nextSeed(): number {
  return Math.floor(performance.now() * 1000) % 2147483647;
}

const actions: Actions = {
  start() {
    state = newRun(nextSeed());
    draw();
  },
  choose(id) {
    if (state) chooseOpening(state, id);
    draw();
  },
  lead(id) {
    if (state) playerLead(state, id);
    draw();
  },
  pass() {
    if (state) playerPass(state);
    draw();
  },
  answer(id) {
    if (state) playerAnswer(state, id);
    draw();
  },
  surrender(id) {
    if (state) playerSurrender(state, id);
    draw();
  },
  discard(id) {
    if (state) playerDiscard(state, id);
    draw();
  },
  restart() {
    state = null;
    draw();
  },
};

function draw(): void {
  if (!root) return;
  if (state === null) {
    renderTitle(root, actions);
    return;
  }
  if (state.phase === "openingEvent") {
    renderEvent(root, actions);
    return;
  }
  if (state.phase === "gameOver") {
    renderEnding(root, state, actions);
    return;
  }
  renderDuel(root, state, actions);
}

draw();
