// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?seed=1&faction=ravalans&realm=2&armies=ravalans:4&march=ravalans>laanians;ravalans>jarvans"}
/** An army walking past the lands in between is not an army crossing water.
 *
 *  `crossingBetween` in src/borders.ts knows vertices and nothing else, so any
 *  pair sharing none is a strait to it - which was true while a march could
 *  only be declared at a neighbour, and stopped being true when an army could
 *  march three lands. Ravala borders Laanemaa and is two hops from Jarva once Harju
 *  is in the realm, so one boot puts both cases on the map at once.
 *
 *  The distinction is the GAME graph and not the geometry: a strait pair is
 *  adjacent and shares no vertex; an overland march is not adjacent at all. */
import { describe, it, expect, beforeAll } from "vitest";

let arrows: SVGGElement;

const arrowTo = (target: string): SVGGElement | null =>
  arrows.querySelector(`g[data-from="ravalans"][data-target="${target}"]`);

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  // happy-dom's isPointInFill wants the deprecated SVGPoint, and there is no
  // geometry behind it here to ask. It anchors threat badges, not arrows.
  SVGGeometryElement.prototype.isPointInFill = () => true;
  await import("../src/main");
  const svg = document.querySelector("#app svg.map") as SVGSVGElement;
  arrows = svg.querySelector(".march-arrows") as SVGGElement;
});

describe("a march past the lands in between", () => {
  it("dashes the two-hop arrow and leaves the neighbour's alone", () => {
    const near = arrowTo("laanians");
    const far = arrowTo("jarvans");
    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!.classList.contains("march-overland")).toBe(false);
    expect(far!.classList.contains("march-overland")).toBe(true);
  });

  it("says how far off the distant one is, and nothing about the near one", () => {
    // The other half of what an arrow standing on a border cannot otherwise
    // tell the player: a two-hop march is two turns out, a neighbour's is one.
    // The chip may still carry the landing ordinal - a rival is racing for
    // Laanemaa too - so what is asserted is that no arrival is printed on the
    // arrow that lands tomorrow, which is every arrow the game used to have.
    const text = (g: SVGGElement | null): string =>
      g?.querySelector(".march-order-text")?.textContent ?? "";
    expect(text(arrowTo("laanians"))).not.toContain("lands in");
    expect(text(arrowTo("jarvans"))).toContain("lands in 2");
  });
});
