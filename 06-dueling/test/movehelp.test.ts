import { describe, expect, test } from "vitest";
import { MOVE_HELP, moveControlsLines, moveKeyGroups, renderMoveHelpHtml } from "../src/ui/movehelp";
import { KEYBOARD_LABELS, PAD_LABELS, resolveLabels } from "../src/input/scheme";

describe("the movement help panel stays current and concise", () => {
  const html = renderMoveHelpHtml();

  test("every entry has label, what and player text, one sentence each", () => {
    for (const e of Object.values(MOVE_HELP)) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.what.length).toBeLessThan(160);
      expect(e.player.length).toBeLessThan(160);
    }
  });

  test("no unresolved {action} tokens leak into the rendered panel", () => {
    expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
    for (const kind of ["xbox", "ps"] as const) {
      expect(renderMoveHelpHtml(PAD_LABELS[kind])).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  test("every entry's tokens resolve in every scheme", () => {
    for (const e of Object.values(MOVE_HELP)) {
      for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
        expect(resolveLabels(e.what + e.player, labels)).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });

  test("legend lines fit the canvas in every scheme", () => {
    for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
      for (const line of moveControlsLines(labels)) expect(line.length).toBeLessThanOrEqual(110);
    }
    const all = moveControlsLines().join(" | ");
    for (const group of moveKeyGroups(KEYBOARD_LABELS)) {
      for (const [key, action] of group) expect(all).toContain(`${key} ${action}`);
    }
  });
});
