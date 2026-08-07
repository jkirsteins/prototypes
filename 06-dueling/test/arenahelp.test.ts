import { describe, expect, test } from "vitest";
import { ARENA_HELP, arenaControlsLines, renderArenaHelpHtml } from "../src/ui/arenahelp";
import { DRAW_MS } from "../src/scenes/arena";
import { KEYBOARD_LABELS, PAD_LABELS } from "../src/input/scheme";

describe("the arena help panel stays current and concise", () => {
  test("all tokens resolve for every scheme", () => {
    for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
      expect(renderArenaHelpHtml(labels)).not.toMatch(/\{[a-zA-Z]+\}/);
      for (const line of arenaControlsLines(labels)) expect(line).not.toMatch(/\{/);
    }
  });

  test("the panel cites the shipping draw duration, derived not written", () => {
    expect(renderArenaHelpHtml(KEYBOARD_LABELS)).toContain(String(DRAW_MS));
  });

  test("entries stay concise: one sentence each side, bounded length", () => {
    for (const e of Object.values(ARENA_HELP)) {
      expect(e.what.length).toBeLessThan(160);
      expect(e.player.length).toBeLessThan(160);
    }
  });

  test("legend lines fit the canvas in every scheme", () => {
    for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
      for (const line of arenaControlsLines(labels)) expect(line.length).toBeLessThanOrEqual(110);
    }
  });
});
