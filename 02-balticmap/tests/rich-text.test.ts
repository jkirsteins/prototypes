// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  t, card, faction, theFaction, factionIds, joinSegments, plainText, possessive,
  renderSegments, cardName, verb,
  type NameLookup, type RichTextHooks,
} from "../src/rich-text";

const NAMES: NameLookup = {
  factionName: (id) => (id === "lietuva" ? "Lietuva" : id === "selonians" ? "Selonians" : id),
  isPlaceName: (id) => id === "lietuva",
};

function move(el: HTMLElement, x = 10, y = 20): void {
  el.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true }));
}

describe("joinSegments", () => {
  const names = (...ids: string[]) => plainText(joinSegments(ids.map((id) => [faction(id)])), NAMES);

  it("joins one, two and three runs the way English does", () => {
    expect(names("selonians")).toBe("Selonians");
    expect(names("selonians", "lietuva")).toBe("Selonians and Lietuva");
    expect(names("a", "b", "c")).toBe("a, b and c");
  });

  it("is empty for no runs, so a caller never has to special-case it", () => {
    expect(joinSegments([])).toEqual([]);
  });

  /** Each item is a run, not a single segment: the tribute footnote joins card
   *  segments and the release line joins faction ones, and a run may be more
   *  than one segment long. */
  it("keeps every segment of a multi-segment run", () => {
    expect(plainText(joinSegments([[t("held by "), faction("selonians")], [card("raid")]]), NAMES))
      .toBe("held by Selonians and Raid");
  });
});

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
      card("subjugate"), t(" played against you by "), faction("selonians"), t("."),
    ];
    expect(plainText(segs, NAMES)).toBe("Subjugate played against you by Selonians.");
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
    // Name, rules text, and EVERY keyword block the card carries, in the order
    // it declares them - the rule is learned from the card that has it rather
    // than from somewhere else the player has to go looking.
    expect(showTip).toHaveBeenCalledWith(
      [
        { text: "Raid" },
        { text: expect.stringContaining("1 damage") },
        { text: "Keyword: Raid", blockStart: true },
        { text: expect.stringContaining("leaves your turn open") },
        { text: "Keyword: Hostile", blockStart: true },
        { text: expect.stringContaining("up your own chain of fealty") },
      ],
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

describe("verb", () => {
  /** The person axis. `plural` in plural.ts owns the number axis; these are the
   *  two halves of English agreement and neither substitutes for the other. */
  it("agrees the present tense with its subject", () => {
    expect(verb("second", "fail")).toEqual({ kind: "text", text: "fail" });
    expect(verb("third", "fail")).toEqual({ kind: "text", text: "fails" });
    expect(verb("second", "pay")).toEqual({ kind: "text", text: "pay" });
    expect(verb("third", "pay")).toEqual({ kind: "text", text: "pays" });
  });

  it("treats a people as singular, as the allegiance lines always have", () => {
    // "Vironians submits to", not "submit to" - a faction is one actor.
    expect(verb("third", "submit")).toEqual({ kind: "text", text: "submits" });
  });

  it("gives one past form to both, since the past never disagrees", () => {
    for (const person of ["second", "third"] as const) {
      expect(verb(person, "draw", "past")).toEqual({ kind: "text", text: "drew" });
      expect(verb(person, "play", "past")).toEqual({ kind: "text", text: "played" });
    }
  });

  /** The reason this is a table and not a `+s`/`+ed` rule: a helper that
   *  guessed would have produced "drawed", "breaked", "standed" and "payed". */
  it("carries the irregular forms a rule would have got wrong", () => {
    expect(verb("second", "draw", "past")).toEqual({ kind: "text", text: "drew" });
    expect(verb("second", "break", "past")).toEqual({ kind: "text", text: "broke" });
    expect(verb("second", "stand", "past")).toEqual({ kind: "text", text: "stood" });
    expect(verb("second", "pay", "past")).toEqual({ kind: "text", text: "paid" });
    expect(verb("third", "unify")).toEqual({ kind: "text", text: "unifies" });
  });

  it("agrees the possessive too", () => {
    expect(possessive("second")).toEqual({ kind: "text", text: "your" });
    expect(possessive("third")).toEqual({ kind: "text", text: "their" });
  });
});
