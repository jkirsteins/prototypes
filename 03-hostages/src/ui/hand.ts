import { cardById } from "../content/cards";
import { requirementText, summarize } from "../content/card-text";
import { el } from "./render";
import type { Legality } from "../legality";

export const FAN_ANGLE_DEG = 4;
export const FAN_DROP_PX = 5;

export interface HandOption {
  cardId: string;
  legality: Legality;
}

export interface Hand {
  root: HTMLElement;
  update(options: HandOption[], onPick: (cardId: string) => void, locked: boolean): void;
  rectOf(cardId: string): DOMRect | null;
}

function cardButton(
  option: HandOption,
  onPick: (cardId: string) => void,
  locked: boolean,
): HTMLElement {
  const card = cardById(option.cardId);
  const button = el("button", "card") as HTMLButtonElement;
  button.dataset.cardId = option.cardId;
  button.type = "button";
  button.append(el("span", "card-name", card.name));
  button.append(el("span", "card-summary", summarize(card)));

  const detail = el("span", "card-detail");
  detail.append(el("span", "card-rules", card.rules));
  const requires = requirementText(card.requires);
  if (requires.length > 0) detail.append(el("span", "card-requires", requires));
  detail.append(el("span", "card-flavor", card.flavor));
  if (!option.legality.ok) detail.append(el("span", "card-reason", option.legality.reason));
  button.append(detail);

  // Unplayable is about the game state, locked is about the animation being
  // mid-flight. Both disable, only the first is worth marking: a card that
  // greys out for a moment while cards fly would read as a rules change.
  button.classList.toggle("unplayable", !option.legality.ok);
  button.disabled = locked || !option.legality.ok;
  if (!button.disabled) button.addEventListener("click", () => onPick(option.cardId));
  return button;
}

export function createHand(): Hand {
  const root = el("div", "hand");
  root.dataset.hand = "player";

  return {
    root,
    update(options, onPick, locked): void {
      root.textContent = "";
      const n = options.length;
      options.forEach((option, i) => {
        const button = cardButton(option, onPick, locked);
        const offset = i - (n - 1) / 2;
        const angle = offset * FAN_ANGLE_DEG;
        button.style.transform =
          `rotate(${angle}deg) translateY(${Math.abs(offset) * FAN_DROP_PX}px)`;
        // The hover panel is a child of the card, so it inherits this rotation.
        // A legal card flattens on hover and the panel comes upright with it;
        // an unplayable one deliberately does not move, so style.css cancels
        // the angle on the panel alone, and needs to know what it was.
        button.style.setProperty("--fan-rotate", `${angle}deg`);
        root.append(button);
      });
    },
    rectOf(cardId: string): DOMRect | null {
      const node = root.querySelector<HTMLElement>(`.card[data-card-id="${cardId}"]`);
      return node === null ? null : node.getBoundingClientRect();
    },
  };
}

export function createBackFan(): { root: HTMLElement; update(count: number): void } {
  const root = el("div", "hand hand-backs");
  root.dataset.hand = "convict";
  return {
    root,
    update(count: number): void {
      root.textContent = "";
      for (let i = 0; i < count; i += 1) root.append(el("div", "card-back"));
    },
  };
}
