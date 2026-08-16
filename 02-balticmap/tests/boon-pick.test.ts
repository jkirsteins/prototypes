// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&rules=turn:unlimited&hand=raid,grow-crops&realm=5&duel=none"}
/** The rest before an act's boss, on the real screen.
 *
 *  Same reasoning as tests/duel-pick.test.ts: the half that breaks is the
 *  wiring rather than the table. `pickOwed` can be right while nothing raises
 *  the modal, or while nothing repaints when the lock lifts, and either of
 *  those is a hand greyed out with no question on screen.
 *
 *  Two things make up the fixture, and both are load-bearing. `realm=5` is act
 *  1's exit on the 26-land Baltic map, and `duel=none` declines the offer the
 *  run opens on - because the boss is summoned only when the run is BETWEEN
 *  duels, so a board with a fight already running would never reach it.
 *
 *  It drives real rounds rather than asserting on the boot state: boot params
 *  apply after the fast-forward, and the summon happens at a round WRAP and
 *  nowhere else, so a test that found the boss already summoned at boot would
 *  be testing a state the engine cannot hold.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

let app: HTMLElement;

const overlayUp = (): boolean =>
  !app.querySelector(".harvest-overlay")!.classList.contains("hidden");
const title = (): string =>
  app.querySelector(".harvest-overlay .notice-title")?.textContent ?? "";
const options = (): HTMLButtonElement[] =>
  [...app.querySelectorAll<HTMLButtonElement>(".harvest-option")];
const cards = (): HTMLButtonElement[] =>
  [...app.querySelectorAll<HTMLButtonElement>(".hand .card")];
const endTurn = (): HTMLButtonElement =>
  app.querySelector<HTMLButtonElement>(".end-turn-btn")!;
const sharedButton = (): HTMLButtonElement | null =>
  app.querySelector<HTMLButtonElement>(".harvest-overlay .harvest-cancel");

/** True once the rest is the thing on screen. Both halves, because the overlay
 *  is shared with the pick and the stake screens and its title survives being
 *  hidden - a check on the words alone would read a modal that is not up. */
const restIsUp = (): boolean =>
  overlayUp() && title().includes("One thing for the road");

/** Ends turns until the rest comes round, dismissing each round summary on the
 *  way.
 *
 *  It waits for EITHER outcome in one pass rather than for the rest and then
 *  for the button: a decline spends a whole unscoped world round, so the wrap
 *  that summons is several seconds of real transitions away, and a wait that
 *  asked only about the rest would fall through to a wait on an End turn the
 *  rest itself has just disabled. */
async function playUntilTheRest(limit: number): Promise<number> {
  for (let i = 1; i <= limit; i++) {
    await vi.waitFor(
      () => expect(restIsUp() || !endTurn().disabled).toBe(true),
      { timeout: 8000 },
    );
    if (restIsUp()) return i;
    endTurn().click();
    await vi.waitFor(
      () => {
        const cont = app.querySelector<HTMLButtonElement>(
          ".notice-overlay:not(.hidden) .notice-continue",
        );
        cont?.click();
        expect(restIsUp() || !endTurn().disabled).toBe(true);
      },
      { timeout: 8000 },
    );
    if (restIsUp()) return i;
  }
  throw new Error("the rest never came round");
}

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  SVGGeometryElement.prototype.isPointInFill = () => true;
  await import("../src/main");
  app = document.querySelector("#app") as HTMLElement;
});

describe("the rest before an act's boss", () => {
  // A generous timeout: this one drives several real AI rounds through the
  // real transition queue, which is seconds rather than milliseconds.
  it("is raised at the wrap that finds the realm big enough", async () => {
    await playUntilTheRest(6);
    expect(overlayUp()).toBe(true);
    // The prophecy names the boss as a segment, so pointing at it lights that
    // realm on the map behind the modal - which is how a player reads a
    // sentence about a land they may never have looked at.
    expect(app.querySelector(".harvest-overlay .rt-faction")).not.toBeNull();
    // The lock spans the rest exactly as it spans the pick: the two are one
    // question in two screens on one overlay.
    expect(cards().length).toBeGreaterThan(0);
    for (const c of cards()) {
      expect(c.disabled).toBe(true);
      expect(c.classList.contains("unplayable")).toBe(true);
    }
    expect(endTurn().disabled).toBe(true);
  }, 30000);

  it("offers the boons, and no way to refuse them", () => {
    const labels = options().map((b) => b.textContent ?? "");
    expect(labels.length).toBeGreaterThanOrEqual(2);
    expect(labels.some((l) => l.startsWith("Mend the realm"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Grow your seat"))).toBe(true);
    // The shared button takes a boon rather than dismissing the question. A
    // rest that could be waved away would be a rest the player never took and
    // a modal that came straight back.
    expect(sharedButton()?.textContent).toContain("Take the first");
  });

  it("goes on to a boss offer holding exactly one fight", async () => {
    options().find((b) => b.textContent?.startsWith("Mend"))!.click();
    await vi.waitFor(() => expect(title()).toContain("Which realm next"));
    expect(overlayUp()).toBe(true);
    expect(options().filter((b) => b.textContent?.startsWith("Duel ")))
      .toHaveLength(1);
    // And no way past it: the shared button on an ordinary offer declines the
    // whole border, and the act's last fight has no such door.
    expect(sharedButton()?.textContent ?? "").not.toContain("Let the world");
  });
});
