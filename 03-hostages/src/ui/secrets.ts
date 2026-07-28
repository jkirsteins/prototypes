import { SECRETS, cardById } from "../content/cards";
import { el } from "./render";

export interface Secrets {
  root: HTMLElement;
  update(held: readonly string[], onPick: ((cardId: string) => void) | null): void;
  rectOf(cardId: string): DOMRect | null;
}

/** Your side. All three stay on the table for the whole run; the ones he has
 *  taken sit there spent, so the loss condition is a row that drains rather
 *  than a counter that ticks. */
export function createSecrets(): Secrets {
  const root = el("div", "secrets");
  root.dataset.secrets = "held";
  root.append(el("span", "secrets-label", "what he wants:"));
  const row = el("div", "secrets-row");
  root.append(row);

  return {
    root,
    update(held, onPick): void {
      row.textContent = "";
      for (const cardId of SECRETS) {
        const button = el("button", "secret") as HTMLButtonElement;
        button.type = "button";
        button.dataset.cardId = cardId;
        button.textContent = cardById(cardId).name;
        const stillHeld = held.includes(cardId);
        button.classList.toggle("spent", !stillHeld);
        button.disabled = !stillHeld || onPick === null;
        if (!button.disabled && onPick !== null) {
          button.addEventListener("click", () => onPick(cardId));
        }
        row.append(button);
      }
    },
    rectOf(cardId: string): DOMRect | null {
      const node = row.querySelector<HTMLElement>(`.secret[data-card-id="${cardId}"]`);
      return node === null ? null : node.getBoundingClientRect();
    },
  };
}

/** His side: what he has already got out of you. */
export function createTaken(): { root: HTMLElement; update(held: readonly string[]): void } {
  const root = el("div", "secrets");
  root.dataset.secrets = "taken";
  const label = el("span", "secrets-label", "taken from you:");
  const row = el("div", "secrets-row");
  root.append(label, row);

  return {
    root,
    update(held): void {
      row.textContent = "";
      const taken = SECRETS.filter((id) => !held.includes(id));
      label.classList.toggle("hidden", taken.length === 0);
      for (const cardId of taken) {
        const node = el("div", "secret taken", cardById(cardId).name);
        node.dataset.cardId = cardId;
        row.append(node);
      }
    },
  };
}
