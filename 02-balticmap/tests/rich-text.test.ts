// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  t, card, faction, theFaction, factionIds, plainText, renderSegments, cardName,
  type NameLookup, type RichTextHooks,
} from "../src/rich-text";

const NAMES: NameLookup = {
  factionName: (id) => (id === "lietuva" ? "Lietuva" : id === "selonians" ? "Selonians" : id),
  isPlaceName: (id) => id === "lietuva",
};

function move(el: HTMLElement, x = 10, y = 20): void {
  el.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
}

describe("cardName", () => {
  it("resolves a real card id, and falls back to the raw id otherwise", () => {
    expect(cardName("raid")).toBe("Raid");
    expect(cardName("not-a-card")).toBe("not-a-card");
    expect(cardName(undefined)).toBe("");
  });
});

describe("factionIds", () => {
  it("lists every faction named, in order, once each", () => {
    const segs = [
      faction("selonians"), t(" submits to "), theFaction("lietuva"),
      t(", against "), faction("selonians"),
    ];
    expect(factionIds(segs)).toEqual(["selonians", "lietuva"]);
  });

  it("is empty for a line that names no faction", () => {
    expect(factionIds([t("You drew "), card("raid")])).toEqual([]);
  });
});

describe("plainText", () => {
  it("renders a mix of text, card and faction segments", () => {
    const segs = [
      card("shrewd-marriage"), t(" played against you by "), faction("selonians"), t("."),
    ];
    expect(plainText(segs, NAMES)).toBe("Shrewd marriage played against you by Selonians.");
  });

  it("adds an article mid-sentence except for a place-name faction", () => {
    expect(plainText([theFaction("selonians")], NAMES)).toBe("the Selonians");
    expect(plainText([theFaction("lietuva")], NAMES)).toBe("Lietuva");
  });
});

describe("renderSegments", () => {
  it("produces the same text as plainText, across text/card/faction segments", () => {
    const segs = [
      card("raid"), t(" by "), theFaction("selonians"), t(" - "), faction("lietuva"),
    ];
    const frag = renderSegments(segs, { ...NAMES });
    const host = document.createElement("div");
    host.appendChild(frag);
    expect(host.textContent).toBe(plainText(segs, NAMES));
  });

  it("wraps card and faction segments in their own spans", () => {
    const frag = renderSegments([t("You played "), card("raid")], { ...NAMES });
    const host = document.createElement("div");
    host.appendChild(frag);
    expect(host.querySelectorAll(".rt-card")).toHaveLength(1);
    expect(host.querySelector(".rt-card")!.textContent).toBe("Raid");
  });

  it("shows the card's name and rules text on hover, and hides on mouseleave", () => {
    const showTip = vi.fn();
    const hideTip = vi.fn();
    const hooks: RichTextHooks = { ...NAMES, showTip, hideTip };
    const frag = renderSegments([card("raid")], hooks);
    const span = frag.querySelector(".rt-card")!;
    move(span as HTMLElement);
    expect(showTip).toHaveBeenCalledWith(
      [{ text: "Raid" }, { text: expect.stringContaining("Might") }],
      10, 20,
    );
    span.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(hideTip).toHaveBeenCalledOnce();
  });

  it("highlights the faction's realm on hover, and clears it on mouseleave", () => {
    const highlightFaction = vi.fn();
    const hideTip = vi.fn();
    const hooks: RichTextHooks = { ...NAMES, highlightFaction, hideTip };
    const frag = renderSegments([faction("selonians")], hooks);
    const span = frag.querySelector(".rt-faction")!;
    move(span as HTMLElement);
    expect(highlightFaction).toHaveBeenCalledWith("selonians");
    span.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(highlightFaction).toHaveBeenCalledWith(null);
    expect(hideTip).toHaveBeenCalledOnce();
  });

  it("never throws when the hover hooks are absent", () => {
    const frag = renderSegments([card("raid"), faction("selonians")], { ...NAMES });
    const cardSpan = frag.querySelector(".rt-card")!;
    const factionSpan = frag.querySelector(".rt-faction")!;
    expect(() => {
      move(cardSpan as HTMLElement);
      cardSpan.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      move(factionSpan as HTMLElement);
      factionSpan.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    }).not.toThrow();
  });
});
