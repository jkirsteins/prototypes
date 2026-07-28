import { describe, it, expect, beforeEach } from "vitest";
import { createHand, createBackFan } from "../src/ui/hand";
import { summarize } from "../src/content/card-text";
import { cardById } from "../src/content/cards";

const ok = { ok: true } as const;
const no = (reason: string) => ({ ok: false, reason }) as const;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("hand", () => {
  it("renders one card per option, in order", () => {
    const hand = createHand();
    hand.update(
      [
        { cardId: "stoic", legality: ok },
        { cardId: "stallHim", legality: ok },
      ],
      () => {},
      false,
    );
    const ids = [...hand.root.querySelectorAll(".card")].map((c) => (c as HTMLElement).dataset.cardId);
    expect(ids).toEqual(["stoic", "stallHim"]);
  });

  it("prints the card name and its derived summary on the face", () => {
    const hand = createHand();
    hand.update([{ cardId: "kickHisKnee", legality: ok }], () => {}, false);
    const card = hand.root.querySelector(".card") as HTMLElement;
    expect(card.querySelector(".card-name")?.textContent).toBe(cardById("kickHisKnee").name);
    expect(card.querySelector(".card-summary")?.textContent).toBe(summarize(cardById("kickHisKnee")));
  });

  it("carries the full rules, requirement and flavor in the detail panel", () => {
    const hand = createHand();
    hand.update([{ cardId: "kickHisKnee", legality: ok }], () => {}, false);
    const card = hand.root.querySelector(".card") as HTMLElement;
    expect(card.querySelector(".card-rules")?.textContent).toBe(cardById("kickHisKnee").rules);
    expect(card.querySelector(".card-requires")?.textContent).toContain("Needs:");
    expect(card.querySelector(".card-flavor")?.textContent).toBe(cardById("kickHisKnee").flavor);
  });

  it("reports a pick for a legal card", () => {
    const picks: string[] = [];
    const hand = createHand();
    hand.update([{ cardId: "stallHim", legality: ok }], (id) => picks.push(id), false);
    hand.root.querySelector<HTMLButtonElement>(".card")?.click();
    expect(picks).toEqual(["stallHim"]);
  });

  it("dims an illegal card in place and states the reason without removing it", () => {
    const hand = createHand();
    hand.update(
      [
        { cardId: "stoic", legality: ok },
        { cardId: "kickHisKnee", legality: no("needs: you are not bound") },
        { cardId: "stallHim", legality: ok },
      ],
      () => {},
      false,
    );
    const ids = [...hand.root.querySelectorAll(".card")].map((c) => (c as HTMLElement).dataset.cardId);
    expect(ids).toEqual(["stoic", "kickHisKnee", "stallHim"]);
    const card = hand.root.querySelector<HTMLButtonElement>(".card[data-card-id='kickHisKnee']");
    expect(card?.disabled).toBe(true);
    expect(card?.classList.contains("unplayable")).toBe(true);
    expect(card?.querySelector(".card-reason")?.textContent).toBe("needs: you are not bound");
  });

  it("does not fire a pick for an illegal card", () => {
    const picks: string[] = [];
    const hand = createHand();
    hand.update([{ cardId: "kickHisKnee", legality: no("nope") }], (id) => picks.push(id), false);
    hand.root.querySelector<HTMLButtonElement>(".card")?.click();
    expect(picks).toEqual([]);
  });

  it("locks every card while the table is busy without marking them unplayable", () => {
    const hand = createHand();
    hand.update([{ cardId: "stallHim", legality: ok }], () => {}, true);
    const card = hand.root.querySelector<HTMLButtonElement>(".card");
    expect(card?.disabled).toBe(true);
    expect(card?.classList.contains("unplayable")).toBe(false);
  });

  it("fans cards symmetrically around the middle", () => {
    const hand = createHand();
    hand.update(
      ["stoic", "stallHim", "flinch"].map((cardId) => ({ cardId, legality: ok })),
      () => {},
      false,
    );
    const cards = [...hand.root.querySelectorAll<HTMLElement>(".card")];
    expect(cards[1].style.transform).toContain("rotate(0deg)");
    expect(cards[0].style.transform).not.toBe(cards[2].style.transform);
  });

  it("replaces the previous hand rather than appending to it", () => {
    const hand = createHand();
    hand.update([{ cardId: "stoic", legality: ok }], () => {}, false);
    hand.update([{ cardId: "stallHim", legality: ok }], () => {}, false);
    expect(hand.root.querySelectorAll(".card")).toHaveLength(1);
  });

  it("returns null for a card it is not holding", () => {
    const hand = createHand();
    hand.update([{ cardId: "stoic", legality: ok }], () => {}, false);
    expect(hand.rectOf("stallHim")).toBeNull();
  });
});

describe("back fan", () => {
  it("shows one face-down card per held card", () => {
    const fan = createBackFan();
    fan.update(4);
    expect(fan.root.querySelectorAll(".card-back")).toHaveLength(4);
  });

  it("shows nothing for an empty hand", () => {
    const fan = createBackFan();
    fan.update(0);
    expect(fan.root.querySelectorAll(".card-back")).toHaveLength(0);
  });
});
