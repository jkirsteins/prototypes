// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&armies=ravalans:3&march=ravalans>harjuans&hand=raid,grow-crops"}
/** The arrow hover, which is DERIVED from where the pointer is rather than
 *  remembered from an arrow's own enter and leave - see `arrowFocus` in
 *  src/main.ts. The whole arrow layer is destroyed and rebuilt on every
 *  refresh, and an element that dies under a stationary pointer never fires
 *  pointerleave, so a remembered focus survived both the arrow and the pointer
 *  and narrowed the map for the rest of the run.
 *
 *  What this file can and cannot see: happy-dom hit-tests nothing, so `arrowAt`
 *  answers "no arrow" here and a rebuild always derives to none. That pins the
 *  regression that mattered - a rebuild REACHES the derivation at all - and not
 *  the in-flight case where the rebuilt arrow is still under the pointer. Nor
 *  the march that resolves away: an end-turn click does not carry the AI round
 *  through under happy-dom. Both of those are the browser pass's, per the rule
 *  in AGENTS.md, and the arming case below is the same rebuild reached by a
 *  path this environment can actually drive. */
import { describe, it, expect, beforeAll } from "vitest";

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

  it("does not survive a rebuild the pointer never hears about", () => {
    // Arming a card rebuilds the arrows and takes them out of hit-testing, so
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
