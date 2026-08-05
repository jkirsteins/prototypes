import type { MoveInput } from "./movement";

const LEFT_CODES = new Set(["KeyA", "ArrowLeft"]);
const RIGHT_CODES = new Set(["KeyD", "ArrowRight"]);

/** Tracks held movement keys. Blur clears everything so a key released
 *  while the tab is unfocused cannot stick. */
export function trackKeys(): MoveInput {
  const input: MoveInput = { left: false, right: false };
  const set = (code: string, down: boolean): void => {
    if (LEFT_CODES.has(code)) input.left = down;
    if (RIGHT_CODES.has(code)) input.right = down;
  };
  window.addEventListener("keydown", (e) => set(e.code, true));
  window.addEventListener("keyup", (e) => set(e.code, false));
  window.addEventListener("blur", () => {
    input.left = false;
    input.right = false;
  });
  return input;
}
