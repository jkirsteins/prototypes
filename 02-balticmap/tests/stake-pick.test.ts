// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&rules=turn:unlimited&hand=raid,grow-crops&realm=5"}
/** The stake screen, on the real screen.
 *
 *  Same reasoning as tests/duel-pick.test.ts: the half that breaks is the
 *  wiring rather than the table. `pickOwed` can be right while nothing raises
 *  the modal, or while nothing repaints when the lock lifts, and either of
 *  those is a hand greyed out with no question on screen.
 *
 *  `realm=5` is the fixture: a realm holding more than one land is the only
 *  board that is ASKED what it puts up, since a one-land realm has nothing to
 *  bet that is not the run itself.
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

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  SVGGeometryElement.prototype.isPointInFill = () => true;
  await import("../src/main");
  app = document.querySelector("#app") as HTMLElement;
});

describe("the stake screen", () => {
  it("follows the enemy pick when the realm has something to bet", async () => {
    expect(title()).toContain("Which realm next");
    const pick = options().find((b) => b.textContent?.startsWith("Duel "));
    expect(pick).toBeDefined();
    pick!.click();
    // The same overlay, a second question. The gauntlet is still `picking`
    // behind both, so the lock spans the pair with nothing extra holding it.
    expect(title()).toContain("What do you put up");
    expect(overlayUp()).toBe(true);
    for (const c of cards()) expect(c.disabled).toBe(true);
    // Every row is one of the player's own lands, named as a segment.
    const rows = options().filter((b) => b.textContent?.startsWith("Stake "));
    expect(rows.length).toBeGreaterThan(0);
    expect(app.querySelector(".harvest-overlay .rt-faction")).not.toBeNull();
  });

  it("goes BACK to the enemy list rather than declining", () => {
    // Reading the stakes must cost nothing: a cancel that spent a world tick
    // from this screen would charge the player a round for looking.
    expect(sharedButton()?.textContent).toContain("Choose another realm");
    sharedButton()!.click();
    expect(title()).toContain("Which realm next");
  });

  it("hands the board back once a stake is named", async () => {
    options().find((b) => b.textContent?.startsWith("Duel "))!.click();
    const stake = options().find((b) => b.textContent?.startsWith("Stake "));
    expect(stake).toBeDefined();
    stake!.click();
    expect(overlayUp()).toBe(false);
    // The repaint every derived lock owes on the way out.
    await vi.waitFor(() => expect(endTurn().disabled).toBe(false));
  });
});
