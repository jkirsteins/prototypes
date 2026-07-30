// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { flyCard, runAnimation } from "../src/animate";

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
