/**
 * Pure movement state, in meters at human scale: the Xbot mannequin is
 * ~1.8 m tall, so world units stay the glTF's own meters. The renderer
 * maps them to screen space through the orthographic camera.
 */

/** Ground speed while walking. The walk clip's timeScale is derived from
 *  this in character.ts, so feet and ground agree by construction. */
export const WALK_SPEED_M_S = 1.4;
/** How far the character may walk from center before clamping; keeps it
 *  inside the fixed camera's view. */
export const WALK_RANGE_M = 3.8;

export interface MoveInput {
  left: boolean;
  right: boolean;
}

export interface Movement {
  /** Position along the piste; 0 is screen center, +x is right. */
  x: number;
  /** 1 faces right, -1 faces left. Persists when movement stops. */
  facing: 1 | -1;
  moving: boolean;
}

export function createMovement(): Movement {
  return { x: 0, facing: 1, moving: false };
}

export function updateMovement(m: Movement, input: MoveInput, dtSeconds: number): void {
  const dir = input.right === input.left ? 0 : input.right ? 1 : -1;
  m.moving = dir !== 0;
  if (dir === 0) return;
  m.facing = dir;
  m.x = Math.min(WALK_RANGE_M, Math.max(-WALK_RANGE_M, m.x + dir * WALK_SPEED_M_S * dtSeconds));
}
