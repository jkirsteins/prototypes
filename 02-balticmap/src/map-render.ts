import type { MapData } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
  settlementDots: Map<string, SVGCircleElement>;
  realmOutlineGroup: SVGGElement;
  realmHoverGroup: SVGGElement;
  vassalOverlayGroup: SVGGElement;
  peopleLabels: Map<string, SVGTextElement[]>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** Darkens a "#rrggbb" hex color by multiplying each channel by `factor`
 *  (values are floored to the nearest integer). Handles only 6-digit hex. */
export function darkenColor(hex: string, factor: number): string {
  const channel = (start: number): string => {
    const value = Math.floor(parseInt(hex.slice(start, start + 2), 16) * factor);
    return value.toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Brightens a "#rrggbb" color by moving each channel toward 255 by
 *  `factor` (0..1). Used for the realm halo. */
export function brightenColor(hex: string, factor: number): string {
  const channel = (start: number): string => {
    const v = parseInt(hex.slice(start, start + 2), 16);
    const value = Math.round(v + (255 - v) * factor);
    return value.toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function el<K extends string>(name: K): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}

export function renderMap(data: MapData, container: HTMLElement): RenderResult {
  const factionColors = new Map(data.factions.map((f) => [f.id, f.color]));

  const svg = el("svg") as SVGSVGElement;
  svg.classList.add("map");
  svg.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

  const defs = el("defs");
  for (const f of data.factions) {
    const pattern = el("pattern");
    pattern.setAttribute("id", `vassal-stripes-${f.id}`);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", "8");
    pattern.setAttribute("height", "8");
    pattern.setAttribute("patternTransform", "rotate(45)");
    const stripe = el("rect");
    stripe.setAttribute("width", "4");
    stripe.setAttribute("height", "8");
    stripe.setAttribute("fill", f.color);
    stripe.setAttribute("opacity", "0.45");
    pattern.appendChild(stripe);
    defs.appendChild(pattern);
  }
  svg.appendChild(defs);

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

  const realmOutlineGroup = el("g") as SVGGElement;
  realmOutlineGroup.classList.add("realm-outline");
  svg.appendChild(realmOutlineGroup);

  // under the regions: a thick stroke here reads as one outline around a
  // whole realm, because the fills above cover every shared inner edge
  const realmHoverGroup = el("g") as SVGGElement;
  realmHoverGroup.classList.add("realm-hover-halo");
  svg.appendChild(realmHoverGroup);

  const regionsGroup = el("g");
  regionsGroup.classList.add("regions");
  const regionPaths = new Map<string, SVGPathElement>();
  for (const r of data.regions) {
    const fill = factionColors.get(r.faction);
    if (!fill) throw new Error(`Unknown faction ${r.faction} for ${r.id}`);
    const p = el("path") as SVGPathElement;
    p.classList.add("region");
    p.setAttribute("d", r.path);
    p.setAttribute("data-id", r.id);
    p.setAttribute("fill", fill);
    regionsGroup.appendChild(p);
    regionPaths.set(r.id, p);
  }
  svg.appendChild(regionsGroup);

  const vassalOverlayGroup = el("g") as SVGGElement;
  vassalOverlayGroup.classList.add("vassal-overlay");
  svg.appendChild(vassalOverlayGroup);

  const riversGroup = el("g");
  riversGroup.classList.add("rivers");
  for (const r of data.rivers) {
    const p = el("path");
    p.classList.add("river");
    if (r.major) p.classList.add("river-major");
    p.setAttribute("d", r.path);
    riversGroup.appendChild(p);
  }
  svg.appendChild(riversGroup);

  const settlementsGroup = el("g");
  settlementsGroup.classList.add("settlements");
  const settlementDots = new Map<string, SVGCircleElement>();
  for (const s of data.settlements) {
    if (!s.unlocked) continue;
    const c = el("circle") as SVGCircleElement;
    c.classList.add("settlement");
    c.setAttribute("cx", String(s.x));
    c.setAttribute("cy", String(s.y));
    c.setAttribute("r", "3.5");
    c.setAttribute("data-settlement-id", s.id);
    settlementsGroup.appendChild(c);
    settlementDots.set(s.id, c);
    const t = el("text");
    t.classList.add("settlement-label");
    t.setAttribute("x", String(s.x));
    t.setAttribute("y", String(s.y + (s.labelDy ?? -7)));
    t.textContent = s.name;
    settlementsGroup.appendChild(t);
  }
  svg.appendChild(settlementsGroup);

  const labelsGroup = el("g");
  labelsGroup.classList.add("labels");
  const peopleLabels = new Map<string, SVGTextElement[]>();
  for (const l of data.labels) {
    const t = el("text") as SVGTextElement;
    t.classList.add(`label-${l.kind}`);
    t.setAttribute("x", String(l.x));
    t.setAttribute("y", String(l.y));
    t.textContent = l.text;
    if (l.kind === "people" || l.kind === "people-minor") {
      const people = data.peoples.find((p) => p.name.toUpperCase() === l.text);
      if (people) {
        t.setAttribute("data-people", people.id);
        const list = peopleLabels.get(people.id) ?? [];
        list.push(t);
        peopleLabels.set(people.id, list);
      }
    }
    labelsGroup.appendChild(t);
  }
  svg.appendChild(labelsGroup);

  container.appendChild(svg);

  return {
    svg, regionPaths, settlementDots, realmOutlineGroup, realmHoverGroup,
    vassalOverlayGroup, peopleLabels,
  };
}
