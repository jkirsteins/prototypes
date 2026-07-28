import { describe, it, expect, beforeEach, afterEach } from "vitest";
import css from "../src/style.css?inline";
import { createLogDrawer } from "../src/ui/logdrawer";
import type { GameEvent } from "../src/types";

// tests/hand-layout.test.ts documents a case where new markup reused an old
// duel-screen class name and the old rule won by default because the new
// block never contested the property. `.log-entry` and `.log-deltas` (both
// introduced by src/ui/logdrawer.ts) used to hit exactly that: an old
// still-live block from the text duel screen also declared them.
//
// That screen and its rules are gone now, and the log drawer's own block owns
// both classes outright. These tests read the values back out of the real
// stylesheet so a stray rule reintroducing either selector - or a reordering
// of the file - cannot quietly take ownership back.
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

  it("gives an entry the drawer block's own padding", () => {
    const drawer = createLogDrawer();
    document.body.appendChild(drawer.root);
    drawer.append([sampleEvent()]);
    const entry = drawer.root.querySelector(".log-entry") as HTMLElement;
    // 0.15rem, the log drawer block's value.
    expect(getComputedStyle(entry).paddingTop).toBe("2.4px");
    expect(getComputedStyle(entry).fontSize).toBe("11.52px"); // 0.72rem
  });

  it("styles the deltas from the drawer block, a step under the entry text", () => {
    const drawer = createLogDrawer();
    document.body.appendChild(drawer.root);
    drawer.append([sampleEvent()]);
    const entry = drawer.root.querySelector(".log-entry") as HTMLElement;
    const deltas = drawer.root.querySelector(".log-deltas") as HTMLElement;
    // 0.7rem: smaller than the 0.72rem entry it annotates, and on its own
    // line. The old duel screen's rule made it 0.8rem, i.e. larger than the
    // text it hangs under, purely by accident of a shared class name.
    expect(getComputedStyle(deltas).fontSize).toBe("11.2px");
    expect(getComputedStyle(deltas).display).toBe("block");
    expect(
      Number.parseFloat(getComputedStyle(deltas).fontSize),
    ).toBeLessThan(Number.parseFloat(getComputedStyle(entry).fontSize));
  });
});
