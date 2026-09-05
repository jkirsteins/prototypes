import { AWAY_HOURS_MAX } from "../units";

/**
 * The away dial: how many real hours the world runs on without the
 * player before the catch-up caps it. Static markup, mounted once like
 * the sound controls; the label spells the hours out.
 */
export function mountAwayDial(root: HTMLElement, get: () => number, set: (hours: number) => void): void {
  const input = root.querySelector<HTMLInputElement>("[data-away=hours]")!;
  const label = root.querySelector<HTMLElement>("[data-away=label]")!;
  input.min = "1";
  input.max = String(AWAY_HOURS_MAX);
  const clamp = (h: number) => Math.min(AWAY_HOURS_MAX, Math.max(1, Math.round(Number(h) || 1)));
  const show = (h: number) => { input.value = String(h); label.textContent = `${h} hour${h === 1 ? "" : "s"}`; };
  show(clamp(get()));
  input.addEventListener("input", () => {
    const h = clamp(Number(input.value));
    set(h);
    show(h);
  });
}
