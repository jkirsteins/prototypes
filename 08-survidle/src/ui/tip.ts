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
import type { Calendar } from "../sim/calendar";
import { siteLine, siteReport } from "../sim/camp";
import { weight } from "../sim/inventory";
import { isRead, readLine } from "../sim/knowledge";
import { isKnown } from "../sim/mapped";
import { cellOf, kmBetween, SPOT_WORDS } from "../sim/position";
import { regionState } from "../sim/regionstate";
import { check, whereIs } from "../sim/tasks";
import type { GameState } from "../sim/types";
import { plain } from "../sim/voice";
import { fmtDuration, fmtKg, fmtKm } from "../units";
import { walkableIce } from "../sim/weather";
import { cellAt, regionAt, terrainPeek, type World } from "../world/gen";
import { wayIntoHtml } from "./panels";
import { esc } from "./render";

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
  return `${cell}|${cellOf(state, world)}|${known}|${heap}|${st.campCell}|${trap}|${st.fire.lit ? "F" : ""}`;
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

export function tipHtml(state: GameState, world: World, cal: Calendar, cell: number): string {
  // Held, the box says so and offers the way out of it. Only previewing, it
  // says what a click would buy - which is the one place the interface has
  // to teach itself, since a box that follows the pointer looks like one
  // that cannot be reached.
  // A touch has no leave to give, so the box keeps its own way out; nothing
  // else in it is pressed.
  const close = `<button class="mini tip-close" data-act="tip-close" title="Close">x</button>`;
  const region = cellAt(world, cell).region;
  const regionName = esc(head(regionAt(world, region).name));
  const heading = (name: string, where = "") => `<div class="tiphead"><b>${esc(head(name))}</b><span class="dim">${regionName}${where ? `, ${esc(where)}` : ""}</span>${close}</div>`;

  // Another region first, and before the fog: ground over the border is not
  // somewhere to walk, it is somewhere to go, and an unexplored one is
  // exactly the region worth offering to explore. Answering that with "you
  // have never been here" would be true and useless. This is what puts the
  // regions on the map rather than in a list of names beside it.
  if (region !== state.player.region) {
    if (!isKnown(state, cell)) return `${heading("Unknown ground")}${wayIntoHtml(state, world, cal, region)}`;
    const x = cell % world.w;
    const y = Math.floor(cell / world.w);
    const terrain = terrainPeek(world, x, y);
    const name = spotAt(world, cell) ?? GROUND[terrain] ?? terrain;
    return `${heading(name)}${wayIntoHtml(state, world, cal, region)}`;
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
    const dist = km === null ? "no way there" : fmtKm(km);
    // What it would cost to stand there, said rather than offered: the walk
    // itself is the places box's, in the corner it has always been in.
    const cost = walk.ok ? `, ${fmtDuration(walk.duration)} walk` : `, ${plain(walk.why)}`;
    lines.push(`<div>${esc(dist)}${esc(cost)}</div>`);
  }

  // What stands on it, in the words the rest of the game uses.
  const marks: string[] = [];
  if (cell === st.campCell) marks.push("your camp");
  if (cell === st.campCell && st.fire.lit) marks.push("the fire is lit");
  if (st.trap?.cell === cell) marks.push(st.trap.kg > 0 ? `a trap, ${st.trap.kg.toFixed(1)} kg in it` : "a trap, empty");
  if (marks.length) lines.push(`<div>${esc(marks.join("; "))}</div>`);

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

  // What it would be as a camp. He took the landing camp as given, twice,
  // and paid a 2.4 km each-way walk for sticks; nothing ever told him
  // siting was a lever he held.
  if (cell !== st.campCell) {
    lines.push(`<div class="dim">as a camp: ${esc(siteLine(siteReport(state, world, cell)))}</div>`);
  }

  const where = spot ? "" : compactWhere(whereIs(state, world, cell));
  return `${heading(name, where)}${lines.join("")}`;
}
