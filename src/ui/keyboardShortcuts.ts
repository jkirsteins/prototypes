import type { Verb } from "../game/types";

export const verbKeyboardShortcuts: Record<Verb, string> = {
  "Look at": "l",
  Use: "u",
  Take: "t",
  Open: "o",
  Push: "p",
  Pull: "Shift+P",
  Turn: "Shift+T",
};

export type KeyboardShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export function getVerbForKeyboardShortcut(event: KeyboardShortcutEvent): Verb | undefined {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }

  if (event.shiftKey) {
    if (event.key === "P") {
      return "Pull";
    }

    if (event.key === "T") {
      return "Turn";
    }

    return undefined;
  }

  switch (event.key.toLocaleLowerCase()) {
    case "l":
      return "Look at";
    case "u":
      return "Use";
    case "t":
      return "Take";
    case "o":
      return "Open";
    case "p":
      return "Push";
    default:
      return undefined;
  }
}
