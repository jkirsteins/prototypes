import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { FIRST_NAMES, fmtName, LAST_NAMES, MEN, nameTaken, rollName, sexOfName, surnameFor, WOMEN } from "../src/sim/names";

describe("names", () => {
  it("draws from pools that mix Scandinavian and Baltic names for either sex", () => {
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

  it("mixes the regions: a Scandinavian first name on a Baltic surname and the reverse both happen", () => {
    const baltic = new Set(["Kalnins", "Berzins", "Ozols", "Liepa", "Krumins", "Balodis", "Zarins", "Vitols", "Eglitis", "Dzenis", "Kazlauskas", "Petrauskas", "Jankauskas", "Zukauskas", "Butkus", "Urbonas", "Tamm", "Saar", "Sepp", "Magi", "Kask", "Kukk"]);
    const balticFirst = new Set(["Janis", "Andris", "Maris", "Juris", "Valdis", "Jonas", "Vytas", "Kazys", "Mart", "Toomas", "Priit"]);
    let scandOnBaltic = false;
    let balticOnScand = false;
    for (let s = 0; s < 300; s++) {
      const n = rollName(new Rng(s), "m", []);
      if (!balticFirst.has(n.first) && baltic.has(n.last)) scandOnBaltic = true;
      if (balticFirst.has(n.first) && !baltic.has(n.last)) balticOnScand = true;
    }
    expect(scandOnBaltic).toBe(true);
    expect(balticOnScand).toBe(true);
  });

  it("knows which list a first name is in", () => {
    expect(sexOfName("Aino")).toBe("f");
    expect(sexOfName("Eirik")).toBe("m");
    expect(sexOfName("Zed")).toBeNull();
  });
});
