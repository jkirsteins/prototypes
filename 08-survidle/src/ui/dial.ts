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
  const show = (h: number) => { input.value = String(h); label.textContent = `${h} hour${h === 1 ? "" : "s"}`; };
  show(get());
  input.addEventListener("input", () => {
    const h = Math.min(AWAY_HOURS_MAX, Math.max(1, Math.round(Number(input.value) || 1)));
    set(h);
    show(h);
  });
}
