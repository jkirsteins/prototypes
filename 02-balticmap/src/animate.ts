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
  /** `Element`, not `HTMLElement`: the march-resolution flash animates SVG
   *  nodes, and `animate` is an Element-level API. Nothing here touches
   *  anything HTML-specific. */
  el: Element,
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


/** ONE animation at a time, in the order they were asked for.
 *
 *  Every visible sequence in the game goes through here rather than starting
 *  the moment its caller happens to run: a card flying to the discard, a
 *  harvest revealing what it gave, a score rising off a land, a march flashing
 *  where it landed. Started freely, they overlapped - a Turnip harvest was
 *  still flying to the discard while the card it granted faded in over the
 *  board, and the player was shown two answers to two different questions at
 *  once.
 *
 *  A queue and not a set of waits: "wait for the flight before revealing" is
 *  one rule written at one call site, and the next pair of animations has to
 *  learn it again. The order things are ASKED for is already the order they
 *  should be seen in, so the queue is the whole rule.
 *
 *  Each step is handed a `done` it must call exactly once - the same contract
 *  `runAnimation`'s `onDone` already has, so a step is usually one call. A
 *  step that throws still releases the queue: a broken animation must not
 *  wedge the game behind it. */
export interface AnimationQueue {
  /** Runs `step` when everything queued before it has finished. */
  push(step: (done: () => void) => void): void;
  /** True while a step is running or waiting to. Callers that must not act
   *  mid-animation ask this rather than tracking flights of their own. */
  busy(): boolean;
  /** Runs `fn` once the queue has drained. Fires immediately when it is
   *  already empty, so a caller can always wait on it without asking. */
  onIdle(fn: () => void): void;
  /** Drops everything not yet started. The step in flight is left to finish -
   *  it owns DOM that has to be cleaned up by its own `done`. */
  clear(): void;
}

export function createAnimationQueue(): AnimationQueue {
  const pending: ((done: () => void) => void)[] = [];
  const idle: (() => void)[] = [];
  let running = false;

  function drain(): void {
    if (running) return;
    const step = pending.shift();
    if (step === undefined) {
      const waiting = idle.splice(0, idle.length);
      for (const fn of waiting) fn();
      return;
    }
    running = true;
    let released = false;
    const done = (): void => {
      if (released) return;
      released = true;
      running = false;
      drain();
    };
    try {
      step(done);
    } catch {
      done();
    }
  }

  return {
    push(step) {
      pending.push(step);
      drain();
    },
    busy() {
      return running || pending.length > 0;
    },
    onIdle(fn) {
      if (!running && pending.length === 0) {
        fn();
        return;
      }
      idle.push(fn);
    },
    clear() {
      pending.length = 0;
    },
  };
}

/** The one queue the whole game animates through. A module singleton because
 *  there is one screen: the HUD and the map both draw on it, and two queues
 *  would be two things overlapping again. */
export const animations = createAnimationQueue();
