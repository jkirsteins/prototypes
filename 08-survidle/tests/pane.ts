/**
 * Rendering a Do row in the pane it belongs to.
 *
 * The panel shows one subtab and one purpose at a time, so a test that
 * wants to look at a row has to say where the row lives. purpose.ts
 * already knows, and its coverage test holds it to knowing, so a test
 * never has to name the pane by hand and can never name it wrongly.
 */
import type { Calendar } from "../src/sim/calendar";
import { TOOL_IDS } from "../src/sim/items";
import { allOpportunityDefs } from "../src/sim/opportunity-catalog";
import type { GameState, TaskId } from "../src/sim/types";
import { doHtml } from "../src/ui/dopanel";
import { PURPOSES, purposeOf, subtabOf } from "../src/ui/purpose";
import { newUiState, type UiState } from "../src/ui/render";
import type { World } from "../src/world/gen";

/**
 * Every opportunity discovered, so the panel draws every row it could.
 *
 * The Do pane gates a row on the opportunity that reveals it, which is why
 * a landing draws two rows and not eighty-four. That gate is the subject of
 * `tests/reveal-gate.test.ts`. Every other test about the panel is asking
 * what a row looks like, or where it lives, or what its more block holds -
 * questions that have nothing to do with whether the run has reached it.
 * Those tests say so by calling this, rather than each one arranging a
 * camp and a season to see a row it only wanted to read.
 */
export function revealEverything(state: GameState): GameState {
  for (const def of allOpportunityDefs()) state.opportunities.discoveredAt[def.key] ??= 0;
  // A row that needs a tool draws only while the survivor holds it, so a
  // test that wants to read every row hands them every tool as well. The
  // tool rule itself is the subject of tests/reveal-gate.test.ts.
  for (const id of TOOL_IDS) if (!state.player.tools.some((t) => t.id === id)) state.player.tools.push({ id, durability: 100 });
  return state;
}

/** A UiState showing the pane this row lives in, with anything else laid over the top. */
export function paneFor(id: TaskId, arg?: string, over: Partial<UiState> = {}): UiState {
  const subtab = subtabOf(id, arg);
  const purpose = purposeOf(id, arg);
  if (subtab === null || purpose === null) throw new Error(`no pane holds ${id}:${arg ?? ""}`);
  return { ...newUiState(), ...over, panes: { pane: "do", subtab, purpose } };
}

/** The Do panel as it draws the pane this row lives in. */
export function paneHtml(
  state: GameState,
  world: World,
  cal: Calendar,
  id: TaskId,
  arg?: string,
  over: Partial<UiState> = {},
): string {
  return doHtml(revealEverything(state), world, cal, paneFor(id, arg, over));
}

/** Every row of every pane, as one string: for the tests that only ask whether a row is offered at all. */
export function allPanesHtml(state: GameState, world: World, cal: Calendar, over: Partial<UiState> = {}): string {
  const ui = { ...newUiState(), ...over };
  revealEverything(state);
  const seen = new Set<string>();
  let html = "";
  for (const subtab of ["Gather", "Hunt", "Camp", "Make", "Build"] as const) {
    for (const purpose of PURPOSES[subtab]) {
      const key = `${subtab}/${purpose}`;
      if (seen.has(key)) continue;
      seen.add(key);
      html += doHtml(state, world, cal, { ...ui, panes: { pane: "do", subtab, purpose } });
    }
  }
  return html;
}
