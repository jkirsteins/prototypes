// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  DETAIL_LAYERS, GROUP_LABEL_CLASS, mapInkBoxes,
} from "../src/map-detail";

const NS = "http://www.w3.org/2000/svg";

/** A map with one label per class, each 100 wide and 20 tall at a distinct
 *  place, so a box that comes back can be told from every other box. happy-dom
 *  implements no `getBBox`, which is exactly the seam the real code guards
 *  with a try/catch, so the boxes are stubbed on. */
function mapWith(...classes: string[]): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
  svg.classList.add("map");
  const labels = document.createElementNS(NS, "g");
  labels.classList.add("labels");
  svg.appendChild(labels);
  classes.forEach((cls, i) => {
    const t = document.createElementNS(NS, "text") as SVGTextElement;
    t.classList.add(cls);
    t.textContent = cls;
    // The settlement labels are drawn outside the `.labels` group, and the
    // selector has to reach them there.
    (cls === "settlement-label" ? svg : labels).appendChild(t);
    (t as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: i * 200, y: 0, width: 100, height: 20 }) as DOMRect;
  });
  return svg;
}

describe("mapInkBoxes", () => {
  it("hands back the ground every visible label stands on", () => {
    // The chip's keep-out set was the threat badges alone, so a `1st` chip
    // could stand with all 114 of its pixels inside the word SELONIANS. A
    // people's name is ink the map put down before any arrow existed.
    const svg = mapWith("label-people", "label-river", "settlement-label");
    const boxes = mapInkBoxes(svg);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toEqual({ x: 0, y: 0, w: 100, h: 20 });
  });

  it("leaves out a layer the detail ladder has taken off the map", () => {
    // A layer that is not drawn is not ink. A chip still dodging it would be
    // stepping around nothing, and stepping onto something.
    const svg = mapWith("label-people", "label-river");
    const layer = DETAIL_LAYERS.find((l) => l.selector === ".label-people")!;
    svg.classList.add(layer.hideClass);
    const boxes = mapInkBoxes(svg);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBe(200);
  });

  it("counts the group headings exactly while they are shown", () => {
    // The one layer that is SHOWN by a class rather than hidden by one: it
    // stands in for the people labels when those are too small to read.
    const svg = mapWith("label-group");
    expect(mapInkBoxes(svg)).toHaveLength(0);
    svg.classList.add(GROUP_LABEL_CLASS);
    expect(mapInkBoxes(svg)).toHaveLength(1);
  });

  it("picks up a settlement label founded mid-run", () => {
    // Founded settlements are drawn during play, so the list cannot be built
    // once at boot and kept.
    const svg = mapWith("label-people");
    expect(mapInkBoxes(svg)).toHaveLength(1);
    const t = document.createElementNS(NS, "text") as SVGTextElement;
    t.classList.add("settlement-label");
    svg.appendChild(t);
    (t as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 500, y: 500, width: 40, height: 10 }) as DOMRect;
    expect(mapInkBoxes(svg)).toHaveLength(2);
  });

  it("never caches a label it could not measure", () => {
    // A zero box means "not laid out yet", not "takes no room". Cached, the
    // label would be out of the keep-out set for the life of the page.
    const svg = mapWith("label-people");
    const t = svg.querySelector("text")!;
    let w = 0;
    (t as unknown as { getBBox: () => DOMRect }).getBBox = () =>
      ({ x: 10, y: 10, width: w, height: 20 }) as DOMRect;
    expect(mapInkBoxes(svg)).toHaveLength(0);
    w = 80;
    expect(mapInkBoxes(svg)).toEqual([{ x: 10, y: 10, w: 80, h: 20 }]);
  });
});
