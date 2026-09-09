/**
 * What the ground under the pointer is, and what can be done about it.
 *
 * The region panel described sixteen square kilometres and was read as a
 * description of the ground under foot: he stood in a region it called
 * thick with hare, roe deer, elk and perch and said "there are no eggs, no
 * nothing i can click". Almost all of it was either a Do row said twice or
 * a fact about the whole region, and only a handful of things it held were
 * genuinely about one cell. Those things are here, on the one panel that
 * has cells.
 *
 * Everything drawn here changes as the pointer moves. Nothing else does:
 * the position is written onto the element by bars.ts and never enters
 * this markup, because a string that changed on every mousemove would put
 * the map's redraw budget through the floor.
 */
import { calendar, type Calendar } from "../sim/calendar";
import { cellPossibilities } from "../sim/camp";
import { listItems, weight } from "../sim/inventory";
import { itemLabel } from "../sim/items";
import { isRead, readLine } from "../sim/knowledge";
import { isKnown } from "../sim/mapped";
import { campCellOf, cellOf, kmBetween, SPOT_WORDS } from "../sim/position";
import { regionState } from "../sim/regionstate";
import { protectionOf, PROTECTION_WORDS } from "../sim/shelter";
import { check, whereIs } from "../sim/tasks";
import type { GameState, Inventory } from "../sim/types";
import { plain } from "../sim/voice";
import { fmtKg } from "../units";
import { walkableIce } from "../sim/weather";
import { cellAt, regionAt, terrainPeek, type World } from "../world/gen";
import { esc } from "./render";
import { DEFAULT_TRAVEL_DISPLAY, formatTravel, type TravelDisplay } from "./travel";
import { compactEquipmentHtml } from "./equipment";

/** What each terrain is called in a sentence, rather than by its glyph. */
const GROUND: Record<string, string> = {
  spruce: "spruce forest",
  pine: "pine forest",
  birch: "birch wood",
  fell: "open fell",
  rock: "bare rock",
  bog: "bog",
  meadow: "meadow",
  water: "water",
};

/**
 * Everything the tooltip's text depends on, as one string.
 *
 * The cell, what stands on it and what lies on it - and deliberately not
 * the clock or the pointer. A tooltip that redrew every minute would churn
 * for a reader who is looking at it for two seconds, and one that redrew
 * on every mousemove would be the map's whole budget.
 */
export function tipKey(state: GameState, world: World, cell: number): string {
  const st = regionState(state, world, state.player.region);
  const heap = state.piles[cell] ? weight(state.piles[cell]).toFixed(1) : "";
  const known = isKnown(state, cell) ? "k" : "";
  const trap = st.trap?.cell === cell ? "T" : "";
  const site = cellAt(world, cell).region === state.player.region ? st.sites[cell] : undefined;
  const protection = site ? `P${protectionOf(site)}` : "";
  return `${cell}|${cellOf(state, world)}|${known}|${heap}|${st.campCell}|${trap}|${st.fire.lit ? "F" : ""}|${protection}`;
}

/** The named place this cell is, if it is one. */
function spotAt(world: World, cell: number): string | null {
  const r = regionAt(world, cellAt(world, cell).region);
  const spot = r.spots.find((s) => s.cell === cell);
  return spot ? SPOT_WORDS[spot.id] : null;
}

/** A heading is a heading wherever it came from: a region's name, a spot's, or a terrain's. */
function head(name: string): string {
  return name ? name[0].toUpperCase() + name.slice(1) : name;
}

/** The map heading's compact direction, in place of "a spot 1.3 km east". */
function compactWhere(where: string): string {
  const match = /^a spot ([0-9.]+ km) (north|south|east|west)$/.exec(where);
  if (!match) return where;
  const direction = { north: "N", south: "S", east: "E", west: "W" }[match[2]];
  return `${match[1]} ${direction}`;
}

/** An inventory in the compact words used by the map's always-visible stores. */
function inventoryItems(inv: Inventory | undefined): string {
  const items = inv ? listItems(inv) : [];
  return items.length ? items.map(({ item, qty }) => itemLabel(item, qty)).join(", ") : "nothing";
}

function inventoryRow(label: string, inv: Inventory | undefined): string {
  return inv && weight(inv) > 0 ? `<div><b>${label}:</b> ${esc(inventoryItems(inv))}</div>` : "";
}

/** Camp stores, plus a non-empty known pile on the cell currently highlighted. */
export function mapInventoryHtml(state: GameState, world: World, highlighted: number | null): string;
export function mapInventoryHtml(state: GameState, world: World, cal: Calendar, highlighted: number | null): string;
export function mapInventoryHtml(state: GameState, world: World, calOrHighlighted: Calendar | number | null, highlightedArg?: number | null): string {
  const cal = typeof calOrHighlighted === "object" && calOrHighlighted !== null ? calOrHighlighted : calendar(state.minute, state.startDoy);
  const highlighted = typeof calOrHighlighted === "object" && calOrHighlighted !== null ? (highlightedArg ?? null) : calOrHighlighted;
  const camp = campCellOf(state, world);
  const here = cellOf(state, world);
  const rows = [
    inventoryRow("Camp", camp === null ? undefined : state.piles[camp]),
    inventoryRow("Carried", state.player.pack),
    here !== camp ? inventoryRow("Here", state.piles[here]) : "",
    highlighted !== null && highlighted !== camp && highlighted !== here && isKnown(state, highlighted)
      ? inventoryRow("Highlighted", state.piles[highlighted])
      : "",
  ].join("");
  const equipment = compactEquipmentHtml(state, world, cal);
  return rows || equipment ? `<div class="mapinv-label">Inventory</div>${rows}${equipment}` : "";
}

export function tipHtml(state: GameState, world: World, cal: Calendar, cell: number, display: TravelDisplay = DEFAULT_TRAVEL_DISPLAY): string {
  const region = cellAt(world, cell).region;
  const regionName = esc(head(regionAt(world, region).name));
  const heading = (name: string, where = "") => `<div class="tiphead"><b>${esc(head(name))}</b><span class="dim">${regionName}${where ? `, ${esc(where)}` : ""}</span></div>`;

  // Another region first. The hover surface reports facts only; movement is
  // controlled by the map and surveying lives under Explore.
  if (region !== state.player.region) {
    if (!isKnown(state, cell)) return `${heading("Unknown ground")}<div class="dim">You have never been here.</div>`;
    const x = cell % world.w;
    const y = Math.floor(cell / world.w);
    const terrain = terrainPeek(world, x, y);
    const name = spotAt(world, cell) ?? GROUND[terrain] ?? terrain;
    return heading(name);
  }

  // Fog next: ground nobody has walked has nothing to report, and saying
  // so is the honest answer rather than describing land out of a survivor's
  // reach who has never seen it.
  if (!isKnown(state, cell)) {
    return `${heading("Unknown ground")}<div class="dim">You have never been here.</div>`;
  }

  const here = cellOf(state, world);
  const st = regionState(state, world, state.player.region);

  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const terrain = terrainPeek(world, x, y);
  const spot = spotAt(world, cell);
  const name = spot ?? GROUND[terrain] ?? terrain;

  const lines: string[] = [];

  // Where it is, and what it costs to stand there.
  if (cell === here) {
    lines.push(`<div>You are here.</div>`);
  } else {
    const km = kmBetween(state, world, here, cell, walkableIce(state.weather));
    const walk = check(state, world, cal, "walk", `cell:${cell}`);
    const text = walk.ok && km !== null ? esc(formatTravel(km, walk.duration, display)) : esc(plain(walk.why));
    lines.push(walk.ok
      ? `<div><button class="tip-route" data-act="task" data-id="walk" data-arg="cell:${cell}">${text}</button></div>`
      : `<div>${text}</div>`);
  }

  // What stands on it, in the words the rest of the game uses.
  const marks: string[] = [];
  if (cell === st.campCell) marks.push("your camp");
  if (cell === st.campCell && st.fire.lit) marks.push("the fire is lit");
  if (st.trap?.cell === cell) marks.push(st.trap.kg > 0 ? `a trap, ${st.trap.kg.toFixed(1)} kg in it` : "a trap, empty");
  if (marks.length) lines.push(`<div>${esc(marks.join("; "))}</div>`);
  const site = st.sites[cell] ?? null;
  if (site) lines.push(`<div><b>Protection:</b> ${esc(PROTECTION_WORDS[protectionOf(site)])}</div>`);

  // What is lying there. He died of cold beside twenty kilos of his own
  // firewood, so a heap is worth saying wherever it sits.
  const heap = state.piles[cell] ? weight(state.piles[cell]) : 0;
  if (heap > 0) lines.push(`<div>${esc(fmtKg(heap))} lying here</div>`);

  // What the water has been read to hold, which is the read skill's payoff
  // and belongs on the water it is about.
  if (terrain === "water" && isRead(state, cell)) {
    const read = readLine(state, world, cal, cell);
    if (read) lines.push(`<div class="dim">${esc(plain(read))}</div>`);
  }

  const possibilities = cellPossibilities(world, cell);
  if (possibilities.length) lines.push(`<div class="dim">${esc(possibilities.join(", "))}</div>`);

  const where = spot ? "" : compactWhere(whereIs(state, world, cell));
  return `${heading(name, where)}${lines.join("")}`;
}
