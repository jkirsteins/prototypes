import { summarize } from "../summary";
import { el, clear } from "./render";
import type { Actions } from "./render";
import type { GameState } from "../types";

export function renderEnding(root: HTMLElement, state: GameState, actions: Actions): void {
  clear(root);
  const screen = el("section", "screen");
  screen.dataset.screen = "ending";
  const summary = summarize(state);
  screen.append(el("h2", "headline", summary.headline));
  const list = el("ul", "summary");
  for (const line of summary.lines) list.append(el("li", "summary-line", line));
  screen.append(list);
  const again = el("button", "primary", "Play again");
  again.id = "restart";
  again.addEventListener("click", () => actions.restart());
  screen.append(again);
  root.append(screen);
}
