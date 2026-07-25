import type { MapData } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends string>(name: K): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}

export function renderMap(data: MapData, container: HTMLElement): RenderResult {
  const peopleColors = new Map(data.peoples.map((p) => [p.id, p.color]));

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
  for (const r of data.regions) {
    const fill = peopleColors.get(r.peoples[0]);
    if (!fill) throw new Error(`Unknown people ${r.peoples[0]} for ${r.id}`);
    const p = el("path") as SVGPathElement;
    p.classList.add("region");
    p.setAttribute("d", r.path);
    p.setAttribute("data-id", r.id);
    p.setAttribute("fill", fill);
    regionsGroup.appendChild(p);
    regionPaths.set(r.id, p);
  }
  svg.appendChild(regionsGroup);

  const labelsGroup = el("g");
  labelsGroup.classList.add("labels");
  for (const l of data.labels) {
    const t = el("text");
    t.classList.add(`label-${l.kind}`);
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
