export function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  node.textContent = "";
}

export interface Actions {
  start(): void;
  choose(id: string): void;
  lead(id: string): void;
  pass(): void;
  answer(id: string | null): void;
  surrender(id: string): void;
  restart(): void;
}
