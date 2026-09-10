import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { CULTURES, cultureOfFirst, cultureOfLast, FIRST_NAMES, fmtName, LAST_NAMES, MEN, nameTaken, rollName, sexOfName, surnameFor, WOMEN } from "../src/sim/names";

describe("names", () => {
  it("draws from Nordic and Baltic pools for either sex", () => {
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(MEN).toContain("Eirik");
    expect(MEN).toContain("Janis");
    expect(WOMEN).toContain("Aino");
    expect(WOMEN).toContain("Ilze");
    expect(LAST_NAMES.map((s) => surnameFor(s, "m"))).toContain("Kalnins");
    expect(LAST_NAMES.map((s) => surnameFor(s, "f"))).toContain("Kalnina");
    expect(LAST_NAMES).toContain("Berg");
  });

  it("keeps the Norwegian letters in Norwegian names", () => {
    const norwegian = CULTURES.find((culture) => culture.id === "norwegian");
    expect(norwegian?.men).toContain("Bj\u00f8rn");
    expect(norwegian?.surnames).toContain("Nyg\u00e5rd");
    expect(norwegian?.men).not.toContain("Bjorn");
    expect(norwegian?.surnames).not.toContain("Nygard");
  });

  it("is deterministic per rng and never offers a taken name", () => {
    const a = rollName(new Rng(5), "m", []);
    const b = rollName(new Rng(5), "m", []);
    expect(a).toEqual(b);
    const c = rollName(new Rng(5), "m", [a]);
    expect(nameTaken(c, [a])).toBe(false);
    expect(fmtName(a)).toBe(`${a.first} ${a.last}`);
  });

  it("gives a woman the feminine Latvian or Lithuanian form and a man never", () => {
    const women = new Set<string>();
    const men = new Set<string>();
    for (let s = 0; s < 300; s++) {
      women.add(rollName(new Rng(s), "f", []).last);
      men.add(rollName(new Rng(s), "m", []).last);
    }
    expect(women.has("Kalnina") || women.has("Kazlauskaite") || women.has("Ozola")).toBe(true);
    expect(women.has("Kalnins")).toBe(false);
    expect(women.has("Kazlauskas")).toBe(false);
    expect(men.has("Kalnina")).toBe(false);
    expect(men.has("Kazlauskaite")).toBe(false);
    for (let s = 0; s < 300; s++) expect(WOMEN).toContain(rollName(new Rng(s), "f", []).first);
  });

  it("keeps a name inside one culture: the surname never comes from another language", () => {
    for (let s = 0; s < 400; s++) {
      for (const sex of ["f", "m"] as const) {
        const n = rollName(new Rng(s), sex, []);
        const first = cultureOfFirst(n.first);
        expect(first, fmtName(n)).not.toBeNull();
        expect(cultureOfLast(n.last), fmtName(n)).toBe(first);
      }
    }
  });

  it("reaches every culture, so the grouping narrows nothing away", () => {
    const seen = new Set<string>();
    for (let s = 0; s < 400; s++) seen.add(cultureOfFirst(rollName(new Rng(s), "m", []).first) ?? "?");
    for (const c of CULTURES) expect(seen, c.id).toContain(c.id);
  });

  it("knows which list a first name is in", () => {
    expect(sexOfName("Aino")).toBe("f");
    expect(sexOfName("Eirik")).toBe("m");
    expect(sexOfName("Zed")).toBeNull();
  });
});
