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
import { fmtDuration, fmtKg, fmtKm, fmtReal } from "../units";
import { walkableIce } from "../sim/weather";
import { regionAt, terrainPeek, type World } from "../world/gen";
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
function spotAt(state: GameState, world: World, cell: number): string | null {
  const r = regionAt(world, state.player.region);
  const spot = r.spots.find((s) => s.cell === cell);
  return spot ? SPOT_WORDS[spot.id] : null;
}

export function tipHtml(state: GameState, world: World, cal: Calendar, cell: number): string {
  const close = `<button class="mini" data-act="tip-close" title="Close">x</button>`;

  // Fog first: ground nobody has walked has nothing to report, and saying
  // so is the honest answer rather than describing land out of a survivor's
  // reach who has never seen it.
  if (!isKnown(state, cell)) {
    return `<div class="tiphead"><b>Unknown ground</b>${close}</div><div class="dim">You have never been here.</div>`;
  }

  const here = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const terrain = terrainPeek(world, x, y);
  const spot = spotAt(state, world, cell);
  const name = spot ?? GROUND[terrain] ?? terrain;

  const lines: string[] = [];

  // Where it is, and what it costs to stand there.
  if (cell === here) {
    lines.push(`<div>You are here.</div>`);
  } else {
    const km = kmBetween(state, world, here, cell, walkableIce(state.weather));
    const walk = check(state, world, cal, "walk", `cell:${cell}`);
    const dist = km === null ? "no way there" : fmtKm(km);
    const go = walk.ok
      ? `<button class="mini" data-act="task" data-id="walk" data-arg="cell:${cell}">walk (${fmtDuration(walk.duration)}, ${fmtReal(walk.duration)})</button>`
      : `<span class="dim">${esc(plain(walk.why))}</span>`;
    lines.push(`<div>${esc(dist)} ${go}</div>`);
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

  const where = spot ? "" : `<span class="dim"> ${esc(whereIs(state, world, cell))}</span>`;
  return `<div class="tiphead"><b>${esc(name)}</b>${where}${close}</div>${lines.join("")}`;
}
