export interface SelectionState {
  hovered: string | null;
  selected: string | null;
}

export const initialState: SelectionState = { hovered: null, selected: null };

export function withHover(state: SelectionState, id: string | null): SelectionState {
  return { ...state, hovered: id };
}

/** Clicking the background (null) or the already-selected region deselects. */
export function withClick(state: SelectionState, id: string | null): SelectionState {
  return { ...state, selected: id === null || id === state.selected ? null : id };
}
