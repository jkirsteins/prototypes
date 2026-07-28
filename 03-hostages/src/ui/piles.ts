import { el } from "./render";

export const PULSE_MS = 260;

export interface Pile {
  root: HTMLElement;
  update(count: number): void;
  pulse(): void;
}

/** Cosmetic stack depth: more cards -> visibly thicker pile, capped at 4.
 *  The point is that a draining deck is legible at a glance, not that the
 *  layers are countable. */
export function pileLayers(count: number): number {
  if (count <= 0) return 0;
  if (count < 4) return 1;
  if (count < 8) return 2;
  if (count < 13) return 3;
  return 4;
}

export function createPile(key: string, label: string): Pile {
  const root = el("div", "pile");
  root.dataset.pile = key;
  const stack = el("div", "pile-stack");
  const count = el("div", "pile-count", "0");
  const labelNode = el("div", "pile-label", label);
  root.append(stack, count, labelNode);

  return {
    root,
    update(n: number): void {
      count.textContent = String(n);
      stack.classList.toggle("empty", n === 0);
      stack.textContent = "";
      for (let i = 0; i < pileLayers(n); i += 1) {
        const back = el("div", "card-back");
        back.style.translate = `${-2 * i}px ${-2 * i}px`;
        stack.append(back);
      }
    },
    pulse(): void {
      root.classList.add("pulse");
      setTimeout(() => root.classList.remove("pulse"), PULSE_MS);
    },
  };
}
