import { describe, expect, test } from "vitest";
import { HELP, controlsLine, controlsLines, keyGroups, renderHelpHtml } from "../src/ui/help";
import { KEYBOARD_LABELS, PAD_LABELS } from "../src/input/scheme";
import { WEAPONS } from "../src/combat/weapons";

/**
 * Currency: the "?" panel is the player-facing statement of the rules and
 * must cite the tuning that actually ships. Type-level exhaustiveness (HELP
 * is a Record over the state and phase unions) covers "a state exists but
 * is undocumented"; these cover staleness and bloat.
 */
describe("the help panel stays current and concise", () => {
  const html = renderHelpHtml();

  test("every entry has label, what and player text", () => {
    for (const e of Object.values(HELP)) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.what.length).toBeGreaterThan(0);
      expect(e.player.length).toBeGreaterThan(0);
    }
  });

  test("concise means one sentence each, not a paragraph", () => {
    // If an entry needs more, the mechanic is too complicated, not the
    // explanation (AGENTS.md).
    for (const e of Object.values(HELP)) {
      expect(e.what.length).toBeLessThan(160);
      expect(e.player.length).toBeLessThan(160);
    }
  });

  test("every derived duration renders with the current WEAPONS value", () => {
    for (const e of Object.values(HELP)) {
      if (!e.ms) continue;
      for (const w of Object.values(WEAPONS)) {
        expect(html).toContain(`${e.ms(w)}ms`);
      }
    }
  });

  test("the parryable interval is stated with current numbers", () => {
    for (const w of Object.values(WEAPONS)) {
      const t = w.attacks.thrust;
      expect(html).toContain(`${t.strike * 0.5}ms`); // meetable half
      expect(html).toContain(`${w.firmUpMs}ms`); // the guard's rise
      expect(html).toContain(`${w.firmUpMs - t.strike * 0.5}ms`); // press deadline before the strike
      expect(html).toContain(`${t.recovery * w.whiffRecoveryFactor}ms`); // whiff cost
      expect(html).toContain(`${t.recovery + w.parriedPenalty}ms`); // parried cost
      expect(html).toContain(`${w.feintRecoveryMs}ms`); // feint cost
    }
  });

  test("the key list is the same table the control line draws from", () => {
    const line = controlsLine();
    for (const group of keyGroups(KEYBOARD_LABELS)) {
      for (const [key, action] of group) {
        expect(line).toContain(`${key} ${action}`);
        expect(html).toContain(action);
      }
    }
  });

  test("every legend line fits the canvas: instructions are always visible", () => {
    // The HUD centres each line on a 960px canvas in 11px monospace
    // (~6.6px per glyph), so anything past ~142 characters clips at both
    // edges - which is exactly how the legend shipped clipped once. Every
    // key must also appear on one of the lines, so nothing fell off in
    // the split.
    const lines = controlsLines();
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(140);
    const all = lines.join(" | ");
    for (const group of keyGroups(KEYBOARD_LABELS)) {
      for (const [key, action] of group) expect(all).toContain(`${key} ${action}`);
    }
    // The pad scheme's legend obeys the same bound - both kinds.
    for (const kind of ["xbox", "ps"] as const) {
      for (const line of controlsLines(PAD_LABELS[kind])) {
        expect(line.length).toBeLessThanOrEqual(140);
      }
    }
  });
});
