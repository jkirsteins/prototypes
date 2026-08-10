import { REGIONS, type RegionDef, type RegionId } from "./regions";

export interface RegionsScreenDeps {
  activeId: RegionId;
  /** Persist + reboot into the picked region. Not called for the active tile. */
  onPick(id: RegionId): void;
  onClose(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** A read-only sketch of the region's own map: one path per land, filled with
 *  its faction's colour. Not the playable map - no interaction, no legend,
 *  no labels - just enough geometry that a tile reads as "that place" at a
 *  glance. */
function buildPreview(region: RegionDef): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${region.map.width} ${region.map.height}`);
  svg.classList.add("rs-preview");
  const colorByFaction = new Map(
    region.map.factions.map((f) => [f.id, f.color]),
  );
  for (const r of region.map.regions) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", r.path);
    path.setAttribute("fill", colorByFaction.get(r.faction) ?? "#8a7c66");
    path.setAttribute("stroke", "#1b1710");
    path.setAttribute("stroke-width", "0.75");
    svg.appendChild(path);
  }
  return svg;
}

function buildTile(region: RegionDef, deps: RegionsScreenDeps): HTMLElement {
  const tile = document.createElement("button");
  tile.className = "rs-tile";
  const active = region.id === deps.activeId;
  tile.classList.toggle("active", active);

  const name = document.createElement("strong");
  name.className = "rs-name";
  name.textContent = region.name;

  const era = document.createElement("span");
  era.className = "rs-era";
  era.textContent = region.era;

  const preview = buildPreview(region);

  const blurb = document.createElement("p");
  blurb.className = "rs-blurb";
  blurb.textContent = region.blurb;

  tile.append(name, era, preview, blurb);

  if (active) {
    const badge = document.createElement("span");
    badge.className = "rs-active-badge";
    badge.textContent = "Active";
    tile.appendChild(badge);
  } else {
    tile.addEventListener("click", () => deps.onPick(region.id));
  }

  return tile;
}

/** Builds the overlay, appends it to `parent`, returns it. Dark screen in
 *  the .deck-screen mould: it declares its own `color`. */
export function createRegionsScreen(
  parent: HTMLElement,
  deps: RegionsScreenDeps,
): HTMLElement {
  const root = document.createElement("div");
  root.className = "regions-screen";

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "Regions";

  const tileRow = document.createElement("div");
  tileRow.className = "rs-tiles";
  for (const region of Object.values(REGIONS)) {
    tileRow.appendChild(buildTile(region, deps));
  }

  // Outside the tile row's scroll region, the build-screen rule: the only
  // control on this page stays reachable on a short window.
  const back = document.createElement("button");
  back.className = "rs-back";
  back.textContent = "Back";
  back.addEventListener("click", () => deps.onClose());

  root.append(title, tileRow, back);
  parent.appendChild(root);
  return root;
}
