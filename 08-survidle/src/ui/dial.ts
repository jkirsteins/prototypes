import { AWAY_HOURS_MAX, fmtDuration, GAME_MINUTES_PER_REAL_SECOND } from "../units";

export interface AwayDial {
  /** Re-reads get() and shows it; a new life's dial does not carry the old one's display. */
  refresh(): void;
}

/**
 * The away dial: how many real hours the world runs on without the
 * player before the catch-up caps it. Static markup, mounted once like
 * the sound controls; the label distinguishes real and game time exactly.
 */
export function mountAwayDial(root: HTMLElement, get: () => number, set: (hours: number) => void): AwayDial {
  const input = root.querySelector<HTMLInputElement>("[data-away=hours]")!;
  const label = root.querySelector<HTMLElement>("[data-away=label]")!;
  input.min = "1";
  input.max = String(AWAY_HOURS_MAX);
  const clamp = (h: number) => Math.min(AWAY_HOURS_MAX, Math.max(1, Math.round(Number(h) || 1)));
  const show = (h: number) => {
    input.value = String(h);
    const gameTime = fmtDuration(h * 3600 * GAME_MINUTES_PER_REAL_SECOND).replace(/ 0 h$/, "");
    label.textContent = `${h} real h = ${gameTime} game`;
  };
  show(clamp(get()));
  input.addEventListener("input", () => {
    const h = clamp(Number(input.value));
    set(h);
    show(h);
  });
  return { refresh: () => show(clamp(get())) };
}
