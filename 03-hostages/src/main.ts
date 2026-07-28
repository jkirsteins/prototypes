import {
  chooseOpening,
  newRun,
  playerAnswer,
  playerDiscard,
  playerLead,
  playerPass,
  playerSurrender,
} from "./game";
import { createTable } from "./ui/table";
import type { Table } from "./ui/table";
import { renderEnding } from "./ui/ending";
import { renderEvent } from "./ui/event";
import { renderTitle } from "./ui/title";
import { clear } from "./ui/render";
import type { Actions } from "./ui/render";
import type { GameState } from "./types";
import "./style.css";

const root = document.querySelector<HTMLDivElement>("#app");
let state: GameState | null = null;
let table: Table | null = null;

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

/** The table is kept alive across turns so its elements can animate; every
 *  other screen is a plain re-render and drops it. */
function leaveTable(): void {
  table = null;
}

function draw(): void {
  if (!root) return;
  const current = state;
  if (current === null) {
    leaveTable();
    renderTitle(root, actions);
    return;
  }
  if (current.phase === "openingEvent") {
    leaveTable();
    renderEvent(root, actions);
    return;
  }
  if (table === null) {
    clear(root);
    table = createTable(actions);
    root.append(table.root);
  }
  table.present(current, () => {
    if (current.phase !== "gameOver") return;
    leaveTable();
    clear(root);
    renderEnding(root, current, actions);
  });
}

draw();
