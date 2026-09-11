// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&rules=turn:unlimited&hand=raid,grow-crops"}
/** The gauntlet's question, on the real screen: a run between duels puts its
 *  offer up and takes the board with it until the offer is answered.
 *
 *  It is here rather than in tests/gates.test.ts because the half that broke
 *  before is the wiring, not the table: `actionBlock` can be right while
 *  nothing raises the modal, or while nothing repaints when the lock lifts,
 *  and either of those is a hand greyed out with no question on screen. The
 *  URL names no `duel=`, so this boots on the state every fresh run opens on.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

let app: HTMLElement;

const overlayUp = (): boolean =>
  !app.querySelector(".harvest-overlay")!.classList.contains("hidden");
const cards = (): HTMLButtonElement[] =>
  [...app.querySelectorAll<HTMLButtonElement>(".hand .card")];
const endTurn = (): HTMLButtonElement =>
  app.querySelector<HTMLButtonElement>(".end-turn-btn")!;

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  SVGGeometryElement.prototype.isPointInFill = () => true;
  await import("../src/main");
  app = document.querySelector("#app") as HTMLElement;
});

describe("the duel pick on a booted run", () => {
  it("raises the offer, and the hand says it cannot be played", () => {
    expect(overlayUp()).toBe(true);
    expect(app.querySelector(".harvest-overlay .notice-title")?.textContent)
      .toContain("Which realm next");
    // Both halves, which is the whole point of the lock being derived: a
    // `:disabled` card that still draws playable is a card the player will
    // press, and pressing it does nothing and says nothing.
    expect(cards().length).toBeGreaterThan(0);
    for (const c of cards()) {
      expect(c.disabled).toBe(true);
      expect(c.classList.contains("unplayable")).toBe(true);
    }
    // `rules=turn:unlimited` is in the URL for this one line: under the
    // one-card rule End turn is disabled until a card has been played, so it
    // would say nothing about the gate.
    expect(endTurn().disabled).toBe(true);
  });

  it("hands the board back on the answer, without waiting to be hovered", async () => {
    // The repaint every derived lock owes on the way out. Nothing repaints
    // when the gate opens on its own, so the paint that drew the hand greyed
    // would be the one left on screen.
    const pick = [...app.querySelectorAll<HTMLButtonElement>(".harvest-option")]
      .find((b) => b.textContent?.startsWith("Duel "));
    expect(pick).toBeDefined();
    pick!.click();
    expect(overlayUp()).toBe(false);
    // The answer's own move is a transition, and the repaint that hands the
    // board back is owed on the way OUT of it - `finishChain`, once both
    // queues have drained. Waiting on that is the point: nothing repaints
    // when a derived lock goes false on its own.
    await vi.waitFor(() => expect(endTurn().disabled).toBe(false));
    expect(cards().some((c) => !c.disabled)).toBe(true);
  });
});
