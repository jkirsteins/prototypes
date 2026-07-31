export interface SelectionState {
  hovered: string | null;
  selected: string | null;
}

export const initialState: SelectionState = { hovered: null, selected: null };

export function withHover(state: SelectionState, id: string | null): SelectionState {
  return { ...state, hovered: id };
}

/** A click while something is selected only ever clears it - including a click
 *  on a different region, which then takes a second click to select. A
 *  selection pins the map's whole highlight and dims the activity log to one
 *  faction; letting a stray click slide that onto whatever land happened to be
 *  under the cursor loses the thing the player was reading. Clicking the
 *  background (null) clears too. */
export function withClick(state: SelectionState, id: string | null): SelectionState {
  return { ...state, selected: state.selected !== null || id === null ? null : id };
}
