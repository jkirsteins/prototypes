/**
 * Rendering a Do row in the pane it belongs to.
 *
 * The panel shows one subtab and one purpose at a time, so a test that
 * wants to look at a row has to say where the row lives. purpose.ts
 * already knows, and its coverage test holds it to knowing, so a test
 * never has to name the pane by hand and can never name it wrongly.
 */
import type { Calendar } from "../src/sim/calendar";
import type { GameState, TaskId } from "../src/sim/types";
import { doHtml } from "../src/ui/dopanel";
import { PURPOSES, purposeOf, subtabOf } from "../src/ui/purpose";
import { newUiState, type UiState } from "../src/ui/render";
import type { World } from "../src/world/gen";

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
  return doHtml(state, world, cal, paneFor(id, arg, over));
}

/** Every row of every pane, as one string: for the tests that only ask whether a row is offered at all. */
export function allPanesHtml(state: GameState, world: World, cal: Calendar, over: Partial<UiState> = {}): string {
  const ui = { ...newUiState(), ...over };
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
