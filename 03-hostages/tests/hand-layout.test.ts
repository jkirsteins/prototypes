import { describe, it, expect, beforeEach, afterEach } from "vitest";
import css from "../src/style.css?inline";
import { createHand } from "../src/ui/hand";

// Unit tests in hand.test.ts only assert the inline `transform` string on
// each card, which happy-dom is happy to report correctly even when the
// surrounding flexbox is laid out top-to-bottom instead of side-by-side.
// That is exactly what happened here: an old, still-live rule from the
// pre-refactor duel screen (`.hand, .choices { flex-direction: column }`,
// src/style.css) matches `.hand` at the same specificity as the new hand
// block and was never contested by it, so `column` won the cascade and the
// fan rendered as a vertical stack.
//
// This test guards against a repeat by loading the actual stylesheet text
// (via Vite's `?inline` import, not a stub and not an inline style) into a
// document and reading the computed flex-direction back out, the same way
// a real browser would resolve the cascade.
describe("hand layout (computed style, not inline)", () => {
  let styleTag: HTMLStyleElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    styleTag = document.createElement("style");
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  });

  afterEach(() => {
    document.head.removeChild(styleTag);
  });

  it("lays the fan out as a row, not the old duel screen's column stack", () => {
    const hand = createHand();
    document.body.appendChild(hand.root);
    expect(getComputedStyle(hand.root).flexDirection).toBe("row");
  });
});
