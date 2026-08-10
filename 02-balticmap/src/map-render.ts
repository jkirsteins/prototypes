import type { MapData, Settlement } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
  settlementDots: Map<string, SVGCircleElement>;
  /** Draws a settlement that starts locked, once it is founded in play. Safe to
   *  call again for one already revealed - the caller drives this from game
   *  state on every refresh rather than tracking what it has drawn. */
  revealSettlement: (s: Settlement) => void;
  /** Removes every settlement `revealSettlement` drew. The map is rendered once
   *  per page load and a new game reuses it, so without this the last game's
   *  settlements would stay on the map. */
  clearFoundedSettlements: () => void;
  realmOutlineGroup: SVGGElement;
  realmUnionGroup: SVGGElement;
  realmHoverGroup: SVGGElement;
  realmEdgeGroup: SVGGElement;
  vassalOverlayGroup: SVGGElement;
  /** Empty layer for the ruler's-seat keeps, above settlements and below
   *  labels; `renderSeatMarkers` in main.ts owns its contents. */
  seatGroup: SVGGElement;
  peopleLabels: Map<string, SVGTextElement[]>;
  /** Appends a `<mask>` to `group` that hides everything inside `paths` and
   *  shows everything outside them, and returns the `url(#id)` to reference it
   *  by. The box is map plus margin - the sea rect's - because a realm on the
   *  map's edge strokes outward past the map itself. */
  outsideMask: (
    group: SVGGElement, maskId: string, paths: string[],
  ) => string;
  /** Appends to `group` one outline tracing only the OUTER boundary of
   *  `regionPaths` taken together: where two of them meet, nothing is drawn.
   *  `maskId` must be unique among the outlines alive at the same time.
   *  Returns the path so the caller can set its stroke.
   *
   *  This replaces stroking each member polygon and letting the region fills
   *  above cover the halves that fall inside the realm. That only works if those
   *  fills are opaque, and they are not - `.region.dimmed` and the vassal
   *  stripes let the band show straight through. So every seam *inside* a realm
   *  came out as a full-width line drawn twice, once from each side, while the
   *  realm's real border was drawn once: a realm read as several outlined lands
   *  rather than one outlined realm, which is the opposite of the point.
   *
   *  The seams are removed geometrically instead. One path holds every member's
   *  subpaths and is masked by its own filled shape, so everything inside the
   *  union is hidden - precisely the seams, plus the inner half of the border -
   *  and what survives is the outer half of the outer edge. A stroke-width of N
   *  therefore reads as N/2, which is what the CSS widths are set against. No
   *  polygon-union arithmetic, and nothing left to drift when a fill's opacity
   *  changes.
   *
   *  The mask keeps SVG's default nonzero fill rule on purpose: two members'
   *  polygons can overlap (Sēlija and Jersika both carry the same two scraps
   *  from the Daugava bank split), and evenodd would punch those back open. */
  outerOutline: (
    group: SVGGElement, maskId: string, regionPaths: string[],
  ) => SVGPathElement;
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
    pattern.setAttribute("width", "14");
    pattern.setAttribute("height", "14");
    pattern.setAttribute("patternTransform", "rotate(45)");
    // 12 of the tile's 14 units, near-opaque. At 4 units and 0.45 the two
    // colours split the land half and half and it read as a third colour
    // belonging to nobody; at 0.62 the stripe still took a wash of the fill
    // under it. A vassal's land has to read as its OVERLORD's at a glance, so
    // the stripe is the overlord's colour and very little else. The vassal
    // keeps the gaps, which is both what identifies it and what keeps this
    // reading as stripes - and stripes are what say "held", as opposed to
    // incorporated.
    //
    // A wide tile with a narrow gap rather than a narrow tile with the same
    // ratio: the gaps are what the eye counts, so FEWER of them is what makes
    // a realm of vassals read as one hue with a marking on it instead of as a
    // hatch pattern in two colours.
    const stripe = el("rect");
    stripe.setAttribute("width", "12");
    stripe.setAttribute("height", "14");
    stripe.setAttribute("fill", f.color);
    stripe.setAttribute("opacity", "0.94");
    pattern.appendChild(stripe);
    defs.appendChild(pattern);
  }
  svg.appendChild(defs);

  const sea = el("rect");
  sea.classList.add("sea");
  sea.setAttribute("x", String(-data.margin));
  sea.setAttribute("y", String(-data.margin));
  sea.setAttribute("width", String(data.width + 2 * data.margin));
  sea.setAttribute("height", String(data.height + 2 * data.margin));
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

  // the always-on version of the same trick, for every realm of 2+ regions:
  // below the hover halo so a hover always wins, above realm-outline so a
  // neighbour's outline is not swallowed by the human halo's fill
  const realmUnionGroup = el("g") as SVGGElement;
  realmUnionGroup.classList.add("realm-union");
  svg.appendChild(realmUnionGroup);

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

  // Above the fills, because it carries the state stroke - threat, ownership,
  // hover, targeting - that a realm member is no longer allowed to draw for
  // itself. One masked copy of each member, clipped to the realm's outer edge,
  // so a land keeps its colour without painting it along a seam with its own
  // realm. See renderRealmEdges in main.ts.
  const realmEdgeGroup = el("g") as SVGGElement;
  realmEdgeGroup.classList.add("realm-edges");
  svg.appendChild(realmEdgeGroup);

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
  const foundedElements = new Map<string, Element[]>();
  const drawSettlement = (s: Settlement, founded: boolean): void => {
    const drawn: Element[] = [];
    const c = el("circle") as SVGCircleElement;
    c.classList.add("settlement");
    if (founded) c.classList.add("settlement-founded");
    c.setAttribute("cx", String(s.x));
    c.setAttribute("cy", String(s.y));
    c.setAttribute("r", "3.5");
    c.setAttribute("data-settlement-id", s.id);
    settlementsGroup.appendChild(c);
    settlementDots.set(s.id, c);
    drawn.push(c);
    // Every site is named, so every dot gets a label. The pipeline's label
    // guard is what keeps two of them off each other, using this same offset.
    const t = el("text");
    t.classList.add("settlement-label");
    t.setAttribute("x", String(s.x));
    t.setAttribute("y", String(s.y + (s.labelDy ?? -7)));
    t.textContent = s.name;
    settlementsGroup.appendChild(t);
    drawn.push(t);
    if (founded) foundedElements.set(s.id, drawn);
  };
  for (const s of data.settlements) {
    if (s.unlocked) drawSettlement(s, false);
  }
  svg.appendChild(settlementsGroup);
  const revealSettlement = (s: Settlement): void => {
    if (settlementDots.has(s.id)) return;
    drawSettlement(s, true);
  };
  const clearFoundedSettlements = (): void => {
    for (const [id, drawn] of foundedElements) {
      for (const node of drawn) node.remove();
      settlementDots.delete(id);
    }
    foundedElements.clear();
  };

  // Seat markers live above the settlement dots they must never be confused
  // with, and below the labels and the threat badges (main.ts appends the
  // badge group last, so it stays on top). Empty at build time: seats are
  // play-state, so `renderSeatMarkers` in main.ts clears and redraws this
  // group on every refresh, the way the badge group works.
  const seatGroup = el("g") as SVGGElement;
  seatGroup.classList.add("seats");
  svg.appendChild(seatGroup);

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

  // The mask has to cover everything the stroke can reach, and a realm on the
  // map's edge strokes outward past it - so this is the sea rect's box, which
  // already spans map plus margin, and nothing narrower.
  const outsideMask = (
    group: SVGGElement, maskId: string, paths: string[],
  ): string => {
    const mask = el("mask");
    mask.setAttribute("id", maskId);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("x", String(-data.margin));
    mask.setAttribute("y", String(-data.margin));
    mask.setAttribute("width", String(data.width + 2 * data.margin));
    mask.setAttribute("height", String(data.height + 2 * data.margin));
    const show = el("rect");
    show.setAttribute("x", String(-data.margin));
    show.setAttribute("y", String(-data.margin));
    show.setAttribute("width", String(data.width + 2 * data.margin));
    show.setAttribute("height", String(data.height + 2 * data.margin));
    const hide = el("path");
    hide.setAttribute("d", paths.join(" "));
    // Inline, not `fill=` attributes. A mask lives inside the group it serves,
    // so a descendant rule written for that group's own shapes reaches into it
    // too: `.realm-union path { fill: none }` blanked this very path, the mask
    // lost the shape it hides with, and every mask in that group silently
    // became a no-op that showed everything. An inline style outranks any
    // author rule, so the mask cannot be switched off from a stylesheet that
    // has never heard of it. The `>` combinators in style.css are the second
    // half of the same fix.
    show.style.fill = "#fff";
    hide.style.fill = "#000";
    mask.appendChild(show);
    mask.appendChild(hide);
    // Inside the group rather than <defs>: the caller clears the group on every
    // refresh, so the mask cannot outlive the shapes it belongs to.
    group.appendChild(mask);
    return `url(#${maskId})`;
  };

  const outerOutline = (
    group: SVGGElement, maskId: string, paths: string[],
  ): SVGPathElement => {
    const mask = outsideMask(group, maskId, paths);
    const p = el("path") as SVGPathElement;
    p.setAttribute("d", paths.join(" "));
    p.setAttribute("mask", mask);
    group.appendChild(p);
    return p;
  };

  return {
    svg, regionPaths, settlementDots, revealSettlement, clearFoundedSettlements,
    realmOutlineGroup, realmUnionGroup, realmHoverGroup, realmEdgeGroup,
    vassalOverlayGroup, seatGroup, peopleLabels, outerOutline, outsideMask,
  };
}
