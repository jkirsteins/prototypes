/**
 * The arena's rule constants, in a leaf module on purpose: the scene,
 * the renderer and the help panel all read them, and the help panel
 * interpolates at module load - a home inside scenes/arena.ts put the
 * import cycle's partial module in front of that read (TDZ crash).
 */

/** Drawing or sheathing the sword: a committed action with the duel's
 *  action-track bar. Falling sheathes instantly and shows no bar. */
export const DRAW_MS = 350;
/** How close to a lip the enemy's own policy lets its feet come (cm):
 *  its ledge safety, applied to every step it chooses. */
export const EDGE_MARGIN = 60;
