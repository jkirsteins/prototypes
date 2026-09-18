import { describe, expect, it } from "vitest";
import { CODE_WORDS, drawCode, normalizeCode } from "../src/sync/code";
import { WORDS } from "../src/sync/words";

describe("the sync code", () => {
  it("draws three words from a list of 1024 unique, plain words", () => {
    expect(WORDS.length).toBe(1024);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
    // Sorted, so a diff to the file reads as words added or removed and never as a reorder.
    expect([...WORDS].sort()).toEqual([...WORDS]);
  });

  it("is three list words joined by dashes", () => {
    const code = drawCode();
    const words = code.split("-");
    expect(words.length).toBe(CODE_WORDS);
    for (const w of words) expect(WORDS).toContain(w);
    expect(drawCode((n) => n - 1)).toBe(`${WORDS[1023]}-${WORDS[1023]}-${WORDS[1023]}`);
  });

  it("reads a pasted or linked code leniently and a typo not at all", () => {
    const code = `${WORDS[0]}-${WORDS[1]}-${WORDS[2]}`;
    expect(normalizeCode(code)).toBe(code);
    expect(normalizeCode(` ${WORDS[0].toUpperCase()}  ${WORDS[1]} - ${WORDS[2]} `)).toBe(code);
    expect(normalizeCode(`${WORDS[0]}-${WORDS[1]}`)).toBeNull();
    expect(normalizeCode(`${WORDS[0]}-${WORDS[1]}-notaword`)).toBeNull();
    expect(normalizeCode("")).toBeNull();
  });
});
