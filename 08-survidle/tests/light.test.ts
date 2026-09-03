import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, "../src/style.css"), "utf8");

/** The declaration block of the first rule whose selector list is exactly `selector`. */
export function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

describe("terrain colour", () => {
  const backgrounds: Record<string, string> = {
    water: "#0a1633", spruce: "#0b1f11", pine: "#0e2415", birch: "#1a2a12",
    meadow: "#171f0f", bog: "#0b221f", rock: "#1a1c20", fell: "#22252b",
  };

  it("every terrain glyph sits on a dark background of its own hue", () => {
    for (const [t, bg] of Object.entries(backgrounds)) {
      expect(rule(`.grid .c.t-${t}`)).toContain(`background: ${bg}`);
    }
  });

  it("the region and route highlights are overlays, not backgrounds", () => {
    for (const sel of [".grid .c.cur", ".grid .c.sel", ".grid .c.rt"]) {
      const body = rule(sel);
      expect(body).toContain("box-shadow: inset 0 0 0 20px");
      expect(body).not.toContain("background");
    }
  });
});
