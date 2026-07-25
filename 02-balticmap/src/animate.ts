export interface Point {
  x: number;
  y: number;
}

export interface FlightStage {
  to: Point; // where the card's center ends up
  scale: number;
  durationMs: number;
  holdMs?: number; // pause after arriving, before the next stage
}

/** Spawns an absolutely positioned card element and flies it through the
 *  given stages with CSS transforms, then removes it. Timing is driven by
 *  setTimeout, not transitionend: happy-dom never fires transition events,
 *  and a dropped event must not leak the element. */
export function flyCard(
  container: HTMLElement,
  className: string,
  label: string,
  from: { x: number; y: number; width: number; height: number },
  stages: FlightStage[],
  onDone?: () => void,
): HTMLElement {
  const el = document.createElement("div");
  el.className = className ? `flying-card ${className}` : "flying-card";
  el.textContent = label;
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  el.style.width = `${from.width}px`;
  el.style.height = `${from.height}px`;
  container.appendChild(el);

  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  let delay = 20; // let the initial styles land before the first transition
  for (const s of stages) {
    setTimeout(() => {
      el.style.transitionDuration = `${s.durationMs}ms`;
      el.style.transform =
        `translate(${s.to.x - cx}px, ${s.to.y - cy}px) scale(${s.scale})`;
    }, delay);
    delay += s.durationMs + (s.holdMs ?? 0);
  }
  setTimeout(() => {
    el.remove();
    onDone?.();
  }, delay);
  return el;
}
