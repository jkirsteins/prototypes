import type { MapData } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Pastel palettes echoing the Nordregio original: EE greens, LV oranges, LT tans.
const PALETTES: Record<string, string[]> = {
  EE: ["#b8cf9b", "#dde3c0", "#9fbf7f", "#e9ead2", "#c9d8a8"],
  LV: ["#e5b28e", "#f0cbb0", "#d99b72", "#f6dfcb", "#e0a67f", "#c98a5e"],
  LT: [
    "#d8c294", "#e6d5b0", "#c9b17f", "#efe3c5", "#bfa571",
    "#e0cda2", "#d2ba89", "#ecdbb8", "#c6ac7c", "#dbc79b",
  ],
};

export function regionFill(country: string, indexInCountry: number): string {
  const palette = PALETTES[country] ?? ["#cccccc"];
  return palette[indexInCountry % palette.length];
}

function el<K extends string>(name: K): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}

export function renderMap(data: MapData, container: HTMLElement): RenderResult {
  const svg = el("svg") as SVGSVGElement;
  svg.classList.add("map");
  svg.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

  const sea = el("rect");
  sea.classList.add("sea");
  sea.setAttribute("x", "0");
  sea.setAttribute("y", "0");
  sea.setAttribute("width", String(data.width));
  sea.setAttribute("height", String(data.height));
  svg.appendChild(sea);

  const neighborsGroup = el("g");
  neighborsGroup.classList.add("neighbors");
  for (const n of data.neighbors) {
    const p = el("path");
    p.classList.add("neighbor");
    p.setAttribute("d", n.path);
    neighborsGroup.appendChild(p);
  }
  svg.appendChild(neighborsGroup);

  const regionsGroup = el("g");
  regionsGroup.classList.add("regions");
  const regionPaths = new Map<string, SVGPathElement>();
  const countryCounters: Record<string, number> = {};
  for (const r of data.regions) {
    const index = countryCounters[r.country] ?? 0;
    countryCounters[r.country] = index + 1;
    const p = el("path") as SVGPathElement;
    p.classList.add("region");
    p.setAttribute("d", r.path);
    p.setAttribute("data-id", r.id);
    p.setAttribute("fill", regionFill(r.country, index));
    regionsGroup.appendChild(p);
    regionPaths.set(r.id, p);
  }
  svg.appendChild(regionsGroup);

  const labelsGroup = el("g");
  labelsGroup.classList.add("labels");
  for (const l of data.labels) {
    const t = el("text");
    t.classList.add("country-label");
    t.setAttribute("x", String(l.x));
    t.setAttribute("y", String(l.y));
    t.textContent = l.text;
    labelsGroup.appendChild(t);
  }
  svg.appendChild(labelsGroup);

  container.appendChild(svg);

  const attribution = document.createElement("div");
  attribution.className = "attribution";
  attribution.textContent = data.attribution;
  container.appendChild(attribution);

  return { svg, regionPaths };
}
