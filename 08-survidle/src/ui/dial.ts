import { AWAY_HOURS_MAX, GAME_MINUTES_PER_REAL_SECOND } from "../units";

export interface AwayDial {
  /** Re-reads get() and shows it; a new life's dial does not carry the old one's display. */
  refresh(): void;
}

/**
 * The away dial: how many real hours the world runs on without the
 * player before the catch-up caps it. Static markup, mounted once like
 * the sound controls; the label spells out the hours and the game days
 * they buy, which is the unit the forecast beside it answers in.
 */
export function mountAwayDial(root: HTMLElement, get: () => number, set: (hours: number) => void): AwayDial {
  const input = root.querySelector<HTMLInputElement>("[data-away=hours]")!;
  const label = root.querySelector<HTMLElement>("[data-away=label]")!;
  input.min = "1";
  input.max = String(AWAY_HOURS_MAX);
  const clamp = (h: number) => Math.min(AWAY_HOURS_MAX, Math.max(1, Math.round(Number(h) || 1)));
  // The hours are what the player sets; the days are what they buy, and the
  // days are the unit the forecast beside this answers in.
  const show = (h: number) => {
    input.value = String(h);
    const days = Math.round((h * 3600 * GAME_MINUTES_PER_REAL_SECOND) / 1440);
    label.textContent = `${h} hour${h === 1 ? "" : "s"} - ${days} day${days === 1 ? "" : "s"} pass`;
  };
  show(clamp(get()));
  input.addEventListener("input", () => {
    const h = clamp(Number(input.value));
    set(h);
    show(h);
  });
  return { refresh: () => show(clamp(get())) };
}
