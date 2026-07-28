import { el } from "./render";
import type { Notice } from "../notices";

export interface NoticeModal {
  root: HTMLElement;
  show(notice: Notice, onDismiss: () => void): void;
  hide(): void;
  isOpen(): boolean;
}

export function createNotice(): NoticeModal {
  const root = el("div", "notice-overlay hidden");
  root.dataset.notice = "";
  const card = el("div", "notice-card");
  const title = el("h2", "notice-title");
  const what = el("p", "notice-what");
  const flavor = el("p", "notice-flavor");
  const rows = el("div", "notice-rows");
  const button = el("button", "notice-continue", "Continue") as HTMLButtonElement;
  button.type = "button";
  card.append(title, what, flavor, rows, button);
  root.append(card);

  // Cleared on dismissal so a stale second click cannot report twice.
  let pending: (() => void) | null = null;

  function dismiss(): void {
    const done = pending;
    pending = null;
    root.classList.add("hidden");
    done?.();
  }

  button.addEventListener("click", dismiss);

  return {
    root,
    show(notice, onDismiss): void {
      title.textContent = notice.title;
      what.textContent = notice.what;
      flavor.textContent = notice.flavor;
      flavor.classList.toggle("hidden", notice.flavor.length === 0);
      rows.textContent = "";
      rows.classList.toggle("hidden", notice.rows.length === 0);
      for (const row of notice.rows) rows.append(el("div", "notice-row", row));
      pending = onDismiss;
      root.classList.remove("hidden");
      button.focus();
    },
    hide(): void {
      pending = null;
      root.classList.add("hidden");
    },
    isOpen: () => !root.classList.contains("hidden"),
  };
}
