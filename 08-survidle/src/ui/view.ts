/**
 * The two views: the survivor, and the camp.
 *
 * Roadmap item P, part 1. This is a top-level switch and not a map control.
 * Survivor view is the page as it has always been - the board follows the
 * person, and the work on offer is the person's: gather, hunt, explore.
 * Camp view puts the board on a camp and leaves it there while the survivor
 * walks away, and offers the camp's work: build, keep, tend, make.
 *
 * It exists for the minutes the survivor is asleep or away. The 09-10 tester
 * spent sixteen of them looking for a wake button; the answer is not an
 * override but something to do with those minutes, which is planning.
 *
 * One order list underneath. The view chooses which end of it is shown, so
 * nothing here adds a scope to an order or changes what the queue runs.
 */
import { regionAt, type World } from "../world/gen";
import { patchXY } from "../world/spatial";
import { cellOf } from "../sim/position";
import { regionState } from "../sim/regionstate";
import type { GameState } from "../sim/types";
import { esc } from "./render";
import { readDisplay, writeDisplay } from "./display-settings";
import type { Panes } from "./panes";
import { PURPOSES, type SubtabId } from "./purpose";

export type View = "survivor" | "camp";
export const VIEWS: View[] = ["survivor", "camp"];
export const VIEW_WORDS: Record<View, string> = { survivor: "Survivor", camp: "Camp" };
export const VIEW_KEY = "view";
export const DEFAULT_VIEW: View = "survivor";

/**
 * Which view a subtab's work belongs to. Gather, Hunt and Explore are things
 * a person does out in the country; Camp, Make and Build are things that
 * happen where the camp stands.
 */
const SUBTAB_VIEW: Record<SubtabId, View> = {
  Gather: "survivor", Hunt: "survivor", Explore: "survivor",
  Camp: "camp", Make: "camp", Build: "camp",
};

/**
 * The purposes that sit in the other view from their subtab.
 *
 * A trap line is camp work - it is set once and emptied on a round, the same
 * shape as a woodpile to keep at forty kilos - but it lives under Hunt
 * because a snare catches an animal. Rather than move the row (its home is
 * `purpose.ts`'s business, and `tests/purpose.test.ts` holds every row to
 * exactly one) the view reads it where it is. So Hunt shows in both views:
 * the game in one, the trap line in the other.
 */
const PURPOSE_VIEW: Record<string, View> = { "Hunt/Traps": "camp" };

export function purposeView(subtab: SubtabId, purpose: string): View {
  return PURPOSE_VIEW[`${subtab}/${purpose}`] ?? SUBTAB_VIEW[subtab];
}

/** The purposes of a subtab that belong to this view, in the order the pane shows them. */
export function purposesInView(subtab: SubtabId, view: View): string[] {
  return PURPOSES[subtab].filter((purpose) => purposeView(subtab, purpose) === view);
}

/**
 * The subtabs with any work in this view, in the order the view shows them.
 *
 * Camp view leads with Camp rather than with Hunt: the strip's first tab is
 * what the view opens on, and a camp view opening on the trap line - which
 * is empty until a snare is set - is the empty-panel opening `panes.ts`
 * already has one scar from.
 */
const VIEW_ORDER: Record<View, SubtabId[]> = {
  survivor: ["Gather", "Hunt", "Explore"],
  camp: ["Camp", "Build", "Make", "Hunt"],
};

export function subtabsInView(view: View): SubtabId[] {
  return VIEW_ORDER[view].filter((subtab) => purposesInView(subtab, view).length > 0);
}

export function subtabInView(subtab: SubtabId, view: View): boolean {
  return purposesInView(subtab, view).length > 0;
}

/**
 * Every region the lineage has a camp in, lowest first. The camp view's
 * picker, and the reason a second camp founded by accident (09-07, notes
 * 223-224) becomes a thing you can look at rather than a thing you lost.
 */
export function campRegions(state: GameState): number[] {
  return Object.keys(state.regions)
    .map(Number)
    .filter((id) => state.regions[id]?.campCell !== null && state.regions[id]?.campCell !== undefined)
    .sort((a, b) => a - b);
}

/**
 * The camp the camp view is looking at: the one chosen, if it still has a
 * camp, else the one the survivor stands in, else the first there is. Null
 * when the lineage has no camp anywhere, which is a real state on a landing
 * and is why camp view can be empty rather than absent.
 */
export function viewedCampRegion(state: GameState, chosen: number | null): number | null {
  const camps = campRegions(state);
  if (chosen !== null && camps.includes(chosen)) return chosen;
  if (camps.includes(state.player.region)) return state.player.region;
  return camps[0] ?? null;
}

/** The camp cell the camp view centres on, or null with no camp to look at. */
export function viewedCampCell(state: GameState, chosen: number | null): number | null {
  const region = viewedCampRegion(state, chosen);
  return region === null ? null : (state.regions[region]?.campCell ?? null);
}

/**
 * The patch the board is centred on: the survivor, or the camp being looked
 * at. Camp view falls back to the survivor when there is no camp, so the
 * board is never centred on nothing.
 *
 * This is the whole of what the view does to the map. What is *visible* is
 * not centred here and never was: `seeFrom` and the viewshed are computed
 * from where the survivor stands, so pointing the board at a camp reveals
 * nothing - it only decides which known ground is on screen.
 */
export function viewCentre(state: GameState, world: World, view: View, chosen: number | null): { x: number; y: number } {
  if (view === "camp") {
    const cell = viewedCampCell(state, chosen);
    if (cell !== null) return patchXY(cell);
  }
  return patchXY(cellOf(state, world));
}

/** The camp's name for the picker and the strip: its region's. */
export function campLabel(world: World, region: number): string {
  return regionAt(world, region).name;
}

/** Whether a camp stands in the region the survivor is in, for the picker's "here" mark. */
export function campHere(state: GameState, world: World): boolean {
  return regionState(state, world, state.player.region).campCell !== null;
}

/**
 * The Do pane, moved into a view. A subtab or purpose that belongs to the
 * other view would leave the pane showing work the view does not own, so
 * switching takes the player to the nearest thing that does exist here:
 * their own subtab when it has work in this view, else its first.
 */
export function panesInView(panes: Panes, view: View): Panes {
  const here = purposesInView(panes.subtab, view);
  if (here.length > 0) {
    return here.includes(panes.purpose) ? panes : { ...panes, purpose: here[0] };
  }
  const subtab = subtabsInView(view)[0];
  return { ...panes, subtab, purpose: purposesInView(subtab, view)[0] };
}

/**
 * Moving to a subtab inside a view: its first purpose *in this view*, not
 * simply its first. `toSubtab` (panes.ts) takes `PURPOSES[subtab][0]`, which
 * in camp view would put Hunt on Game - survivor work, in the wrong view.
 *
 * This is the guard that lets everything downstream assume the showing
 * purpose belongs to the showing view, so no row, count or pane has to
 * filter for it again.
 */
export function toSubtabInView(panes: Panes, subtab: SubtabId, view: View): Panes {
  const here = purposesInView(subtab, view);
  return { ...panes, subtab, purpose: here[0] ?? PURPOSES[subtab][0] };
}

/**
 * The view a reload returns to. A player who has chosen one gets it back.
 *
 * One who has not gets the view the game's current ask lives in, for the same
 * reason `defaultPanes` follows that ask rather than a constant: on a landing
 * the one job is to site a camp, which is camp work, and opening on the
 * survivor would show a board and a pane with nothing to do on them.
 */
export function loadView(storage: Storage = localStorage, at?: { subtab: SubtabId; purpose: string } | null): View {
  const value = readDisplay(storage)[VIEW_KEY];
  if (VIEWS.includes(value as View)) return value as View;
  return at ? purposeView(at.subtab, at.purpose) : DEFAULT_VIEW;
}

export function saveView(view: View, storage: Storage = localStorage): void {
  writeDisplay({ [VIEW_KEY]: view }, storage);
}

/**
 * The switch itself: two buttons and nothing else.
 *
 * Which camp is being looked at used to sit beside them, and read as a third
 * tab - the tester's "visually it seems to blur together" (playtest
 * 2026-09-19, note 140), earned in one change. It belongs on the board it
 * describes, which is `campViewHtml` below.
 */
export function viewSwitchHtml(view: View): string {
  // Drawn as the map's own controls are drawn, not as a panel laid on top:
  // the board already has a convention for a control that lives on it - the
  // zoom's `.maptools`, box-less with a shadow behind its words - and one
  // bordered card floating over the ground is the odd thing out.
  return VIEWS
    .map((id) => `<button class="mini${id === view ? " on" : ""}" data-act="view" data-view="${id}">${VIEW_WORDS[id]}</button>`)
    .join("");
}

/**
 * The camp the board is showing, written on the board, beside the survivor's
 * own carried line. Empty in survivor view, so the overlay is not there at
 * all: the board is centred on the person and has nothing to caption.
 *
 * A lineage with one camp gets its name. A second camp - founded on purpose
 * or by accident - turns it into a row of choices, which is also the answer
 * to 09-07's notes 223-224. With no camp at all it says so rather than
 * vanishing, because a landing has none and a caption that disappears reads
 * as the feature breaking rather than as the camp missing.
 */
export function campViewHtml(state: GameState, world: World, view: View, chosen: number | null): string {
  if (view !== "camp") return "";
  const camps = campRegions(state);
  const looking = viewedCampRegion(state, chosen);
  const label = `<span class="mapinv-label">camp</span> `;
  if (looking === null) return `${label}<b>none yet</b> - site one and the board comes here`;
  if (camps.length === 1) return `${label}<b>${esc(campLabel(world, looking))}</b>`;
  const picker = camps
    .map((id) => `<button class="mini${id === looking ? " on" : ""}" data-act="camp-view" data-region="${id}">${esc(campLabel(world, id))}${id === state.player.region ? " (here)" : ""}</button>`)
    .join("");
  return `${label}${picker}`;
}
