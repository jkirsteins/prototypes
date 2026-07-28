import { describe, it, expect, beforeEach, afterEach } from "vitest";
import css from "../src/style.css?inline";
import { createLogDrawer } from "../src/ui/logdrawer";
import type { GameEvent } from "../src/types";

// tests/hand-layout.test.ts documents a case where new markup reused an old
// duel-screen class name and the old rule won by default because the new
// block never contested the property. `.log-entry` and `.log-deltas` (both
// introduced by src/ui/logdrawer.ts) hit the same old, still-live block
// (`.log-entry`, `.log-entry[data-side]`, `.log-deltas`, src/style.css around
// line 56) that the pre-refactor duel screen still uses.
//
// `.log-entry`'s own padding is contested by both rules and, because the new
// block is appended later in the file, its value correctly wins the cascade
// - this test pins that so a future reordering of the stylesheet cannot
// silently revert it. `.log-deltas` is NOT redeclared anywhere in the new
// block, so it is entirely governed by the old rule (font-size: 0.8rem,
// larger than the 0.72rem entry text it annotates) purely by accident of
// shared naming, not by any decision made for the new drawer. That is not a
// broken layout the way the flex-direction bug was, but it is an unowned
// dependency on old-screen CSS worth surfacing rather than leaving silent.
describe("log drawer layout (computed style, not inline)", () => {
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

  function sampleEvent(): GameEvent {
    return {
      turn: 1,
      side: "player",
      kind: "lead",
      text: "You lead.",
      deltas: ["Your vigor 6 -> 4"],
      vitals: {} as GameEvent["vitals"],
      piles: {} as GameEvent["piles"],
    };
  }

  it("lets the new block's padding win over the old duel screen's .log-entry rule", () => {
    const drawer = createLogDrawer();
    document.body.appendChild(drawer.root);
    drawer.append([sampleEvent()]);
    const entry = drawer.root.querySelector(".log-entry") as HTMLElement;
    // 0.15rem, not the old rule's 0.2rem (which would compute to 3.2px).
    expect(getComputedStyle(entry).paddingTop).toBe("2.4px");
  });

  it("documents that .log-deltas is still styled entirely by the old duel screen's rule", () => {
    const drawer = createLogDrawer();
    document.body.appendChild(drawer.root);
    drawer.append([sampleEvent()]);
    const entry = drawer.root.querySelector(".log-entry") as HTMLElement;
    const deltas = drawer.root.querySelector(".log-deltas") as HTMLElement;
    // Pinned from the old rule (font-size: 0.8rem) - larger than the entry
    // text it annotates (0.72rem). If this ever changes, it means someone
    // finally gave .log-deltas its own rule in the new block; update this
    // test deliberately rather than let it drift back unnoticed.
    expect(getComputedStyle(deltas).fontSize).toBe("12.8px");
    expect(getComputedStyle(entry).fontSize).toBe("11.52px");
  });
});
