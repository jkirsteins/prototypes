// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import {
  animations, createAnimationQueue, flyCard, runAnimation,
} from "../src/animate";

describe("flyCard", () => {
  it("spawns at the source, transitions through stages, then removes itself", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const done = vi.fn();
    const flight = flyCard(
      host,
      "back",
      "",
      { x: 10, y: 20, width: 88, height: 126 },
      [
        { to: { x: 200, y: 300 }, scale: 1.6, durationMs: 350, holdMs: 700 },
        { to: { x: 30, y: 40 }, scale: 0.6, durationMs: 350 },
      ],
      done,
    );
    const el = flight.el;
    expect(host.contains(el)).toBe(true);
    expect(el.className).toBe("flying-card back");
    expect(el.style.left).toBe("10px");
    expect(el.style.top).toBe("20px");

    vi.advanceTimersByTime(30); // past the initial 20ms kick-off
    // stage 1: center moves from (54, 83) to (200, 300)
    expect(el.style.transform).toBe("translate(146px, 217px) scale(1.6)");

    vi.advanceTimersByTime(350 + 700); // stage 1 flight + hold done
    expect(el.style.transform).toBe("translate(-24px, -43px) scale(0.6)");

    vi.advanceTimersByTime(350); // stage 2 flight done -> removal
    expect(host.contains(el)).toBe(false);
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("cancel() removes the element and fires onDone exactly once", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const done = vi.fn();
    const flight = flyCard(
      host,
      "",
      "",
      { x: 0, y: 0, width: 88, height: 126 },
      [{ to: { x: 100, y: 100 }, scale: 1, durationMs: 350 }],
      done,
    );
    flight.cancel();
    expect(host.contains(flight.el)).toBe(false);
    expect(done).toHaveBeenCalledOnce();

    // A late natural completion (or a second cancel) must not fire twice.
    flight.cancel();
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("reports totalMs derived from the stages, for a caller's own deadline", () => {
    const host = document.createElement("div");
    const flight = flyCard(
      host,
      "",
      "",
      { x: 0, y: 0, width: 88, height: 126 },
      [
        { to: { x: 200, y: 300 }, scale: 1.6, durationMs: 350, holdMs: 700 },
        { to: { x: 30, y: 40 }, scale: 0.6, durationMs: 350 },
      ],
    );
    // happy-dom has no WAAPI, so this is the fallback's 20ms kick-off + the
    // sum of every stage's duration and hold.
    expect(flight.totalMs).toBe(20 + 350 + 700 + 350);
    flight.cancel();
  });
});

describe("runAnimation", () => {
  it("falls back to a single timeout of exactly durationMs when there is no WAAPI", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const done = vi.fn();
    runAnimation(el, [{ transform: "scale(1.12)", offset: 0.5 }], 450, done);
    vi.advanceTimersByTime(449);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("cancel() fires onDone once and stops the pending timeout", () => {
    vi.useFakeTimers();
    const el = document.createElement("div");
    const done = vi.fn();
    const { cancel } = runAnimation(el, [], 450, done);
    cancel();
    expect(done).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("drives a real Animation via the Web Animations API when available", () => {
    const el = document.createElement("div");
    const listeners: { onfinish: (() => void) | null; oncancel: (() => void) | null } = {
      onfinish: null,
      oncancel: null,
    };
    const seenFrames: unknown[] = [];
    let seenOptions: unknown = null;
    const fakeAnim = {
      set onfinish(fn: (() => void) | null) { listeners.onfinish = fn; },
      get onfinish() { return listeners.onfinish; },
      set oncancel(fn: (() => void) | null) { listeners.oncancel = fn; },
      get oncancel() { return listeners.oncancel; },
      cancel: vi.fn(),
      finish: vi.fn(),
    };
    (el as unknown as { animate: (frames: unknown, options: unknown) => unknown }).animate =
      (frames: unknown, options: unknown) => {
        seenFrames.push(frames);
        seenOptions = options;
        return fakeAnim;
      };

    const done = vi.fn();
    const frames = [
      { offset: 0, transform: "scale(1)" },
      { offset: 1, transform: "scale(1.12)" },
    ];
    const { cancel } = runAnimation(el, frames, 450, done);

    expect(seenFrames[0]).toBe(frames);
    expect(seenOptions).toEqual({ duration: 450, fill: "forwards" });
    expect(done).not.toHaveBeenCalled();

    listeners.onfinish?.();
    expect(done).toHaveBeenCalledOnce();

    // A cancel after it already finished must not fire onDone twice.
    cancel();
    expect(fakeAnim.cancel).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });
});

describe("the animation queue", () => {
  it("runs one step at a time, in the order they were asked for", () => {
    const q = createAnimationQueue();
    const order: string[] = [];
    const releases: (() => void)[] = [];
    for (const name of ["first", "second", "third"]) {
      q.push((done) => {
        order.push(name);
        releases.push(done);
      });
    }
    // Only the first has started: the other two are waiting on it.
    expect(order).toEqual(["first"]);
    releases[0]();
    expect(order).toEqual(["first", "second"]);
    releases[1]();
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("is busy from the moment something is queued until the last step releases", () => {
    const q = createAnimationQueue();
    expect(q.busy()).toBe(false);
    const releases: (() => void)[] = [];
    q.push((done) => releases.push(done));
    q.push((done) => releases.push(done));
    expect(q.busy()).toBe(true);
    releases[0]();
    // The second step is now running and has not released.
    expect(q.busy()).toBe(true);
    releases[1]();
    expect(q.busy()).toBe(false);
  });

  it("ignores a step calling its done twice, so the queue cannot skip ahead", () => {
    const q = createAnimationQueue();
    const order: string[] = [];
    const releases: (() => void)[] = [];
    q.push((done) => releases.push(done));
    q.push((done) => { order.push("second"); releases.push(done); });
    q.push((done) => { order.push("third"); done(); });
    releases[0]();
    releases[0]();
    // The second is still running: a stale release must not start the third.
    expect(order).toEqual(["second"]);
    releases[1]();
    expect(order).toEqual(["second", "third"]);
  });

  it("releases the queue when a step throws - a broken animation must not wedge the game", () => {
    const q = createAnimationQueue();
    const after = vi.fn();
    q.push(() => { throw new Error("animation blew up"); });
    q.push((done) => { after(); done(); });
    expect(after).toHaveBeenCalledOnce();
    expect(q.busy()).toBe(false);
  });

  it("onIdle fires immediately on an empty queue and after the last step otherwise", () => {
    const q = createAnimationQueue();
    const now = vi.fn();
    q.onIdle(now);
    expect(now).toHaveBeenCalledOnce();

    const releases: (() => void)[] = [];
    q.push((done) => releases.push(done));
    const later = vi.fn();
    q.onIdle(later);
    expect(later).not.toHaveBeenCalled();
    releases[0]();
    expect(later).toHaveBeenCalledOnce();
  });

  it("clear() drops what has not started and leaves the step in flight to finish", () => {
    const q = createAnimationQueue();
    const started = vi.fn();
    const releases: (() => void)[] = [];
    q.push((done) => releases.push(done));
    q.push(() => started());
    q.clear();
    expect(started).not.toHaveBeenCalled();
    // The running step still owns DOM its own done has to clean up, so it is
    // left alone - and releasing it finds nothing behind it.
    releases[0]();
    expect(started).not.toHaveBeenCalled();
    expect(q.busy()).toBe(false);
  });

  it("ships one queue for the whole screen", () => {
    // A module singleton because there is one screen: two queues would be two
    // things overlapping again, which is what the queue exists to stop.
    expect(animations.busy()).toBe(false);
    expect(animations).not.toBe(createAnimationQueue());
  });
});
