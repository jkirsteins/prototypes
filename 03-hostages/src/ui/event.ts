import { OPENING } from "../content/scenario";
import { el, clear } from "./render";
import type { Actions } from "./render";

export function renderEvent(root: HTMLElement, actions: Actions): void {
  clear(root);
  const screen = el("section", "screen");
  screen.dataset.screen = "event";
  screen.append(el("p", "prose", OPENING.prose));
  const list = el("div", "choices");
  for (const choice of OPENING.choices) {
    const button = el("button", "choice", choice.label);
    button.dataset.choiceId = choice.id;
    button.addEventListener("click", () => actions.choose(choice.id));
    list.append(button);
  }
  screen.append(list);
  root.append(screen);
}
