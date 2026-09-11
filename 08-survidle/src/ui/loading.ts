/** The bar that stands in for the world while the worker solves it. */
export function showLoading(stage: string, fraction: number): void {
  const el = document.getElementById("loading");
  if (!el) return;
  el.hidden = false;
  const bar = el.querySelector<HTMLElement>(".bar > i");
  const text = el.querySelector<HTMLElement>("p");
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  if (text) text.textContent = stage;
}

export function hideLoading(): void {
  const el = document.getElementById("loading");
  if (el) el.hidden = true;
}
