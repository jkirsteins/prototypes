import { el } from "./render";
import type { GameEvent } from "../types";

export interface LogDrawer {
  root: HTMLElement;
  append(events: readonly GameEvent[]): void;
  clear(): void;
}

export function createLogDrawer(): LogDrawer {
  const root = el("div", "log-drawer");
  root.dataset.log = "";

  const header = el("div", "log-header");
  const title = el("span", "log-title", "Activity");
  const toggle = el("button", "log-toggle", "<") as HTMLButtonElement;
  toggle.type = "button";
  header.append(title, toggle);

  const entries = el("div", "log-entries");
  root.append(header, entries);

  let lastTurn = 0;

  toggle.addEventListener("click", () => {
    const collapsed = root.classList.toggle("collapsed");
    toggle.textContent = collapsed ? ">" : "<";
    // Entries are display:none while collapsed, so a scroll would no-op.
    if (!collapsed) entries.scrollTop = entries.scrollHeight;
  });

  return {
    root,
    append(events): void {
      for (const event of events) {
        if (event.turn !== lastTurn) {
          entries.append(el("div", "log-turn", `Turn ${event.turn}`));
          lastTurn = event.turn;
        }
        const entry = el("div", "log-entry", event.text);
        entry.dataset.side = event.side;
        if (event.deltas.length > 0) {
          entry.append(el("span", "log-deltas", event.deltas.join(", ")));
        }
        entries.append(entry);
      }
      if (events.length > 0) entries.scrollTop = entries.scrollHeight;
    },
    clear(): void {
      entries.textContent = "";
      lastTurn = 0;
    },
  };
}
