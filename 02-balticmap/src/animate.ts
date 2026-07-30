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

/** A running animation. `totalMs` exists only so a caller can derive a
 *  last-resort deadline (see `Hud.afterPlayAnimation`) - it must never be
 *  copied into a second timer that tries to reproduce the animation itself.
 *  The animation reporting `onDone` is always the real signal. */
export interface Flight {
  el: HTMLElement;
  totalMs: number;
  /** Ends the flight immediately. `onDone` still fires, exactly once. */
  cancel(): void;
}

/** Runs `frames` via the Web Animations API when the platform has one, and
 *  calls `onDone` when the animation (or a `cancel()`) ends - never on a
 *  second, independently-timed clock. Falls back to a single `setTimeout` of
 *  `durationMs` where there is no WAAPI (happy-dom in tests; every real
 *  browser this ships to has had WAAPI for years). Both paths report through
 *  the same `onDone`, so a caller cannot observe which one ran.
 *
 *  A visibility listener finishes the animation the instant the tab is
 *  hidden: a backgrounded rAF can otherwise stall `onfinish` indefinitely,
 *  and nobody is watching a card fly on a tab nobody is looking at. */
export function runAnimation(
  el: HTMLElement,
  frames: Keyframe[],
  durationMs: number,
  onDone?: () => void,
): { cancel(): void } {
  let done = false;
  function finish(): void {
    if (done) return;
    done = true;
    onDone?.();
  }

  if (typeof el.animate === "function") {
    const anim = el.animate(frames, { duration: durationMs, fill: "forwards" });
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") anim.finish();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const cleanup = (): void =>
      document.removeEventListener("visibilitychange", onVisibility);
    anim.onfinish = () => { cleanup(); finish(); };
    anim.oncancel = () => { cleanup(); finish(); };
    return { cancel: () => anim.cancel() };
  }

  const id = setTimeout(finish, durationMs);
  return { cancel: () => { clearTimeout(id); finish(); } };
}

/** One keyframe list covering every stage, offsets normalized to `sumMs`. A
 *  hold is an explicit repeated keyframe at the same transform rather than an
 *  implicit gap - WAAPI has no notion of "pause here". */
function buildFlightFrames(
  stages: FlightStage[],
  sumMs: number,
  cx: number,
  cy: number,
): Keyframe[] {
  let t = 0;
  const frames: Keyframe[] = [
    { offset: 0, transform: "translate(0px, 0px) scale(1)", easing: "ease" },
  ];
  for (const s of stages) {
    t += s.durationMs;
    const transform =
      `translate(${s.to.x - cx}px, ${s.to.y - cy}px) scale(${s.scale})`;
    frames.push({ offset: t / sumMs, transform, easing: "ease" });
    if (s.holdMs) {
      t += s.holdMs;
      frames.push({ offset: t / sumMs, transform, easing: "ease" });
    }
  }
  return frames;
}

/** Spawns a fixed-position card element and flies it through the given
 *  stages, then removes it and reports `onDone`. The WAAPI branch is one
 *  `Animation` covering every stage; the fallback below re-derives nothing
 *  from it and is a separate, self-contained scheduler kept only because
 *  happy-dom has no WAAPI to drive tests with. */
export function flyCard(
  container: HTMLElement,
  className: string,
  label: string,
  from: { x: number; y: number; width: number; height: number },
  stages: FlightStage[],
  onDone?: () => void,
): Flight {
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
  const sumMs = stages.reduce((sum, s) => sum + s.durationMs + (s.holdMs ?? 0), 0);

  function finish(): void {
    el.remove();
    onDone?.();
  }

  if (typeof el.animate === "function") {
    const frames = buildFlightFrames(stages, sumMs, cx, cy);
    const { cancel } = runAnimation(el, frames, sumMs, finish);
    return { el, totalMs: sumMs, cancel };
  }

  // Fallback: a per-stage setTimeout scheduler driving CSS transitions.
  // Timing is by clock, not `transitionend`: happy-dom never fires transition
  // events, and a dropped event must not leak the element. The 20ms kick-off
  // lets the initial inline styles land before the first transition starts -
  // WAAPI needs no such flush, which is why only this branch pays for it.
  let done = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let delay = 20;
  for (const s of stages) {
    timers.push(setTimeout(() => {
      el.style.transitionDuration = `${s.durationMs}ms`;
      el.style.transform =
        `translate(${s.to.x - cx}px, ${s.to.y - cy}px) scale(${s.scale})`;
    }, delay));
    delay += s.durationMs + (s.holdMs ?? 0);
  }
  timers.push(setTimeout(() => { done = true; finish(); }, delay));
  return {
    el,
    totalMs: 20 + sumMs,
    cancel(): void {
      if (done) return;
      done = true;
      for (const id of timers) clearTimeout(id);
      finish();
    },
  };
}
