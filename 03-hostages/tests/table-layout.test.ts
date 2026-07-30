import { describe, it, expect, beforeEach, afterEach } from "vitest";
import css from "../src/style.css?inline";
import { CENTER_SCALE } from "../src/ui/table";
import { createSecrets, createTaken } from "../src/ui/secrets";
import { el } from "../src/ui/render";

// Same reasoning as hand-layout.test.ts and log-layout.test.ts: the unit tests
// over happy-dom assert structure, never geometry, so a rule that is shadowed
// or that quietly disagrees with a constant in src/ui/table.ts passes them all
// and only shows up in a browser. These load the real stylesheet text and read
// the cascade back out.
describe("table layout (computed style, not inline)", () => {
  let styleTag: HTMLStyleElement;

  const rem = (value: string): number => Number.parseFloat(value.replace("rem", ""));

  beforeEach(() => {
    document.body.innerHTML = "";
    styleTag = document.createElement("style");
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
  });

  afterEach(() => {
    document.head.removeChild(styleTag);
  });

  // The centre slot is the target flyCard aims at and the box the face-up card
  // lands in, and the two are sized from different places: the slot from CSS,
  // the flight from CENTER_SCALE. If they drift, a card visibly snaps to a
  // different size the instant it stops moving.
  it("sizes the centre slot to exactly CENTER_SCALE times a fan card", () => {
    const card = el("button", "card");
    const hand = el("div", "hand");
    hand.append(card);
    const slot = el("div", "slot");
    document.body.append(hand, slot);

    const slotStyle = getComputedStyle(slot);
    const cardStyle = getComputedStyle(card);
    expect(rem(slotStyle.width)).toBeCloseTo(rem(cardStyle.width) * CENTER_SCALE, 5);
    expect(rem(slotStyle.minHeight)).toBeCloseTo(rem(cardStyle.height) * CENTER_SCALE, 5);
  });

  // A fan card is a <button>, which the UA already sizes border-box; the centre
  // card is a <div>, so it has to say so itself or it renders its padding and
  // border outside the width it shares with the slot.
  it("gives the centre card the slot's own box, border-box and all", () => {
    const slot = el("div", "slot");
    const face = el("div", "card center-card");
    slot.append(face);
    document.body.append(slot);

    const faceStyle = getComputedStyle(face);
    expect(faceStyle.boxSizing).toBe("border-box");
    expect(rem(faceStyle.width)).toBeCloseTo(rem(getComputedStyle(slot).width), 5);
  });

  // happy-dom does no flex layout, so this cannot assert that the fan fits the
  // board; it asserts the one declaration that lets it, which is the part a
  // later edit would drop as redundant-looking. Without it a 7-card fan does
  // not shrink, and because the overflow is centred the leftmost card sits off
  // the left edge of the window with no scrollbar to reveal it.
  it("lets the fan and its cards shrink below their max-content width", () => {
    const hand = el("div", "hand");
    const card = el("button", "card");
    hand.append(card);
    document.body.append(hand);

    expect(Number.parseFloat(getComputedStyle(hand).minWidth)).toBe(0);
    expect(Number.parseFloat(getComputedStyle(card).minWidth)).toBe(0);
  });

  // His row holds his plate, his hand, both his piles and the secrets he has
  // taken. It is over budget the moment he takes one, and by source order the
  // item that wrapped was his discard pile, which landed under his plate. The
  // taken block is ordered last so it is the thing that wraps, on its own.
  it("wraps the taken row, not his piles, when he has taken something", () => {
    const held = createSecrets();
    const taken = createTaken();
    const row = el("div", "table-row table-top");
    const pile = el("div", "pile");
    row.append(taken.root, pile, held.root);
    document.body.append(row);

    // happy-dom reports "" rather than "0" for an order nobody set, so the
    // other two are asserted as "not pushed to the end" rather than as "0".
    expect(getComputedStyle(taken.root).order).toBe("1");
    expect(getComputedStyle(pile).order).not.toBe("1");
    expect(getComputedStyle(held.root).order).not.toBe("1");
  });
});
