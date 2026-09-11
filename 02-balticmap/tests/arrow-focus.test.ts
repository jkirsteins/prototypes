// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&armies=ravalans:3&duel=laanians&march=ravalans>harjuans&hand=raid,grow-crops"}
/** The duel enemy is NOT the arrow's far end, deliberately: `duel=` is
 *  answered through the real offer, and the offer prefers a land with a
 *  chief. Naming a quiet neighbour boots on `picking` instead, which locks
 *  input behind the offer modal and refuses every click this file makes. */
/** The arrow hover, which is DERIVED from where the pointer is rather than
 *  remembered from an arrow's own enter and leave - see `arrowFocus` in
 *  src/main.ts. An arrow that resolves away under a stationary pointer fires
 *  no pointerleave, and the scene takes it out of hit-testing the moment it
 *  starts to fade, so a remembered focus survived both the arrow and the
 *  pointer and narrowed the map for the rest of the run.
 *
 *  What this file can and cannot see: happy-dom hit-tests nothing, so `arrowAt`
 *  answers "no arrow" here and a repaint always derives to none. That pins the
 *  regression that mattered - a repaint REACHES the derivation at all - and not
 *  the in-flight case where the arrow is still under the pointer. Nor the
 *  march that resolves away: an end-turn click does not carry the AI round
 *  through under happy-dom. Both of those are the browser pass's, per the rule
 *  in AGENTS.md, and the arming case below is the same repaint reached by a
 *  path this environment can actually drive. */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const focused = (): boolean => svg.classList.contains("arrow-focused");
const narrowed = (): number =>
  svg.querySelectorAll(".arrow-faded, .focus-faded, .arrow-end").length;

let svg: SVGSVGElement;
let arrows: SVGGElement;

/** Bubbling, because the listener is on the svg and reads the move's own
 *  target - the browser has already hit-tested it. */
const moveOnto = (el: Element): void => {
  el.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
};

const marchArrow = (): SVGGElement | null =>
  arrows.querySelector('g[data-from="ravalans"][data-target="harjuans"]');

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  // happy-dom's isPointInFill demands the deprecated SVGPoint where a browser
  // takes a DOMPoint, and there is no geometry behind it here to ask anyway.
  // It decides where a threat badge is anchored, which is not this file's
  // subject.
  SVGGeometryElement.prototype.isPointInFill = () => true;
  await import("../src/main");
  svg = document.querySelector("#app svg.map") as SVGSVGElement;
  arrows = svg.querySelector(".march-arrows") as SVGGElement;
});

describe("the arrow hover", () => {
  it("lights the arrow the pointer is on, and lets go when it moves off", () => {
    const arrow = marchArrow();
    expect(arrow).not.toBeNull();
    moveOnto(arrow!);
    expect(focused()).toBe(true);
    expect(narrowed()).toBeGreaterThan(0);

    moveOnto(svg.querySelector("path.region[data-id]") as Element);
    expect(focused()).toBe(false);
    expect(narrowed()).toBe(0);
  });

  it("lets go when the pointer leaves the map without passing over a land", () => {
    moveOnto(marchArrow()!);
    expect(focused()).toBe(true);
    svg.dispatchEvent(new MouseEvent("pointerleave"));
    expect(focused()).toBe(false);
    expect(narrowed()).toBe(0);
  });

  it("does not survive a repaint the pointer never hears about", () => {
    // Arming a card repaints the arrows and takes them out of hit-testing, so
    // no pointerleave can arrive. Read AFTER disarming, because the paint is
    // suppressed for as long as the targeting cues own the map.
    moveOnto(marchArrow()!);
    expect(focused()).toBe(true);
    const raid = [...document.querySelectorAll(".card")].find(
      (c) => c.querySelector(".card-name")?.textContent === "Raid",
    );
    expect(raid).toBeDefined();
    (raid as HTMLElement).click();
    expect(arrows.classList.contains("aiming")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(arrows.classList.contains("aiming")).toBe(false);
    expect(focused()).toBe(false);
    expect(narrowed()).toBe(0);
  });

});

/** The pin's dim, which is decided by a different surface from the one that
 *  draws the arrows. An arrow states its whole class attribute every time it is
 *  drawn, so the pin is a standing answer every paint asks for rather than a
 *  mark some other pass makes afterwards - written on after the fact it went
 *  wrong in both directions at once, wiped by the next repaint and, once that
 *  was fixed, arriving too late for the fade that was still bringing a new
 *  arrow in. */
describe("the pin's dim", () => {
  // Escape unpins when nothing is armed and is a no-op when nothing is
  // pinned either, so it is a safe reset regardless of what the previous
  // test left behind - a clean start each test needs, since `clickOn`
  // toggles: a click while something (anything) is already selected
  // deselects rather than reselecting the land it landed on.
  beforeEach(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  const clickOn = (el: Element): void => {
    el.dispatchEvent(new MouseEvent(
      "pointerdown", { bubbles: true, clientX: 10, clientY: 10 },
    ));
    el.dispatchEvent(new MouseEvent(
      "pointerup", { bubbles: true, clientX: 10, clientY: 10 },
    ));
  };

  /** A land the arrow runs between neither of - so the pin is about somebody
   *  else's business and the arrow recedes with everything else. */
  const elsewhere = (): Element =>
    [...svg.querySelectorAll("path.region[data-id]")].find((el) => {
      const id = (el as SVGElement).dataset.id ?? "";
      return id !== "ravala" && id !== "harjumaa";
    })!;

  it("does not survive a card being armed, and does not come back on disarm", () => {
    const land = elsewhere();
    clickOn(land);
    expect(marchArrow()?.classList.contains("arrow-dim")).toBe(true);
    expect(land.classList.contains("selected")).toBe(true);

    // A pin does not survive an interaction: `onPlayCard` unpins through the
    // same route a deselect takes the moment a card is armed, so the land is
    // genuinely let go rather than merely receded for the length of
    // targeting - and disarming has nothing left to bring back.
    const raid = [...document.querySelectorAll(".card")].find(
      (c) => c.querySelector(".card-name")?.textContent === "Raid",
    );
    (raid as HTMLElement).click();
    expect(arrows.classList.contains("aiming")).toBe(true);
    expect(land.classList.contains("selected")).toBe(false);
    expect(marchArrow()?.classList.contains("arrow-dim")).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(land.classList.contains("selected")).toBe(false);
    expect(marchArrow()?.classList.contains("arrow-dim")).toBe(false);
    clickOn(land);
    expect(marchArrow()?.classList.contains("arrow-dim")).toBe(true);
  });

  it("clears every surface that answers for the pin - the hud, the panel and the arrows - the moment a card is armed", () => {
    const land = elsewhere();
    clickOn(land);
    expect(land.classList.contains("selected")).toBe(true);
    expect(
      document.querySelector(".pinned-panel:not(.pinned-tip)")
        ?.classList.contains("hidden"),
    ).toBe(false);
    expect(
      document.querySelector(".activity-log")?.classList.contains("filter-realm"),
    ).toBe(true);
    expect(marchArrow()?.classList.contains("arrow-dim")).toBe(true);

    const raid = [...document.querySelectorAll(".card")].find(
      (c) => c.querySelector(".card-name")?.textContent === "Raid",
    );
    (raid as HTMLElement).click();
    expect(arrows.classList.contains("aiming")).toBe(true);

    // Nothing is left half-cleared: the map's own selection, the docked panel
    // that read the land's tooltip, the log's realm filter and the arrow's
    // dim all move off the pin together, because they all read the same
    // `pinnedRegion` that `onPlayCard` just let go of.
    expect(land.classList.contains("selected")).toBe(false);
    expect(
      document.querySelector(".pinned-panel:not(.pinned-tip)")
        ?.classList.contains("hidden"),
    ).toBe(true);
    expect(
      document.querySelector(".activity-log")?.classList.contains("filter-realm"),
    ).toBe(false);
    expect(marchArrow()?.classList.contains("arrow-dim")).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
});
