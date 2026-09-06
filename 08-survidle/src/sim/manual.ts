/**
 * The one-page manual (tables audit spec, section 8): four sections of two
 * to four lines in the game's own voice, and the handbooks it was read
 * against. Opened once, unasked, on a world's first landing; there when
 * wanted after that.
 */
import type { GameState } from "./types";

export const MANUAL_SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: "The first days, in order",
    lines: [
      "A fire tonight. A roof by the second night.",
      "Water every day, from the shore or a bucket.",
      "Then food. Nothing else comes before those four.",
    ],
  },
  {
    title: "What kills you, and how fast",
    lines: [
      "Cold kills in hours: wet clothes and a night in the open.",
      "Thirst kills in days. Hunger takes weeks, but the work gets slow long before.",
      'The log warns before each: "You are shivering hard", "You are thirsty", "You are getting thin".',
      "The dark is slow going without a torch.",
    ],
  },
  {
    title: "Food and the seasons",
    lines: [
      "Hare alone starves you; you need fat: marrow, oily fish, eggs and roe in their season.",
      "A trap in the water works while you sleep. Berries are a season, and two litres is a day's worth.",
      "A deer is weeks of food that rots in a day unless you dry it.",
      "Winter needs a hut or a snow shelter, a woodpile, and stores.",
    ],
  },
  {
    title: "Orders and being away",
    lines: [
      "You give orders; the game keeps them, and earns you longer ones as your skills grow.",
      "Away is riskier than playing: the runner does what you asked and nothing more.",
      "Death keeps the world. The next survivor lands months later, near the old camp, carrying a quarter of what you knew.",
    ],
  },
];

export const MANUAL_LINKS: { title: string; url: string }[] = [
  { title: "Forsvarsmakten, Handbok Overlevnad (1988), free to read", url: "https://archive.org/details/handbok_overlevnad_1988" },
  { title: "Mors Kochanski, Northern Bushcraft, free to read", url: "https://archive.org/details/northern-bushcraft_202210" },
  { title: "The Norwegian Army's Overlevelseshandbok for Haeren (2025)", url: "https://www.forsvaret.no/aktuelt-og-presse/aktuelt/overlevelse-handbok" },
];

/** True once per world, on the first survivor's landing; a heir's landing never opens it. */
export function openManualOnFirstLanding(state: GameState, heir: boolean): boolean {
  if (heir || state.manualSeen) return false;
  state.manualSeen = true;
  return true;
}
