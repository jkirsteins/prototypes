import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { current } from "../src/sim/record";
import { catchUp } from "../src/sim/save";
import { third, voice } from "../src/sim/voice";
import { awayHtml, logHtml } from "../src/ui/panels";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/**
 * Every string literal in the sim with a bare you or your, outside comments
 * and outside the properties that are panel copy rather than log lines
 * (`detail:`, `desc:`, `title=`, `why:` reasons are lines too, so they count).
 */
function bareYou(): string[] {
  const bad: string[] = [];
  // voice.ts holds the tokens themselves; the capability rows and the season's asks are panel copy that never reaches the log.
  for (const f of walk("src/sim").filter((f) => !/voice\.ts$|capabilities\.ts$|spine\.ts$/.test(f))) {
    const src = readFileSync(f, "utf8").split("\n");
    src.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/^\s*(\*|\/\*)/.test(line)) return;
      if (/\b(detail|desc):/.test(code)) return;
      for (const m of code.matchAll(/(["`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
        if (/(?<![{A-Za-z])[Yy]our?\b(?!\})/.test(m[2])) bad.push(`${f}:${i + 1}: ${m[2].slice(0, 70)}`);
      }
    });
  }
  return bad;
}

describe("the voice", () => {
  it("conjugates by rule and by the table", () => {
    expect(third("reach")).toBe("reaches");
    expect(third("fill")).toBe("fills");
    expect(third("empty")).toBe("empties");
    expect(third("fix")).toBe("fixes");
    expect(third("go")).toBe("goes");
    expect(third("wash")).toBe("washes");
    expect(third("are")).toBe("is");
    expect(third("have")).toBe("has");
    expect(third("do")).toBe("does");
    expect(third("stay")).toBe("stays");
  });

  it("renders second and third person from one template", () => {
    expect(voice("{You} {reach} Grey Shore.", null)).toBe("You reach Grey Shore.");
    expect(voice("{You} {reach} Grey Shore.", "Veikko")).toBe("Veikko reaches Grey Shore.");
    expect(voice("{You} {are} thirsty.", "Aino")).toBe("Aino is thirsty.");
    expect(voice("{Your} ribs show.", "Aino")).toBe("Aino's ribs show.");
    expect(voice("{Your} ribs show.", null)).toBe("Your ribs show.");
    expect(voice("Too tired to stand, {you} {sleep} where {you} {are}.", "Veikko")).toBe("Too tired to stand, Veikko sleeps where Veikko is.");
    expect(voice("{You} {crawl} out soaked.", "Aino")).toBe("Aino crawls out soaked.");
    expect(voice("{You} {empty} the trap.", "Aino")).toBe("Aino empties the trap.");
    expect(voice("The elk turns on {you}.", "Aino")).toBe("The elk turns on Aino.");
    expect(voice("No tokens here.", "Aino")).toBe("No tokens here.");
  });

  it("has no bare you in any sim string that could reach the log", () => {
    expect(bareYou()).toEqual([]);
  });

  it("marks what the catch-up wrote as away, and the panels render it by name", () => {
    const { state, world } = newGame(17);
    const before = state.log.length;
    const away = catchUp(state, world, 6 * 3600);
    const written = state.log.slice(before);
    expect(written.length).toBeGreaterThan(0);
    for (const e of written) expect(e.away).toBe(true);
    expect(state.log[0].away).toBeUndefined();
    const name = current(state).name.first;
    const html = awayHtml(away, 6 * 3600, false, "Nothing worth telling.", current(state).person, name);
    expect(html).not.toMatch(/<time>[^<]*<\/time>You /);
    expect(html).toContain(`</time>${name} `);
    const log = logHtml(state);
    expect(log).toContain(voice(state.log[0].text, null).slice(0, 20));
  });
});
