import { el, clear } from "./render";
import type { Actions } from "./render";

export function renderTitle(root: HTMLElement, actions: Actions): void {
  clear(root);
  const screen = el("section", "screen");
  screen.dataset.screen = "title";
  screen.append(el("h1", "title", "Hostages"));
  screen.append(
    el(
      "p",
      "blurb",
      "A man with a knife wants to know where the money is. You have three answers " +
        "and only two of them are survivable.",
    ),
  );
  const start = el("button", "primary", "New game");
  start.id = "start";
  start.addEventListener("click", () => actions.start());
  screen.append(start);
  root.append(screen);
}
