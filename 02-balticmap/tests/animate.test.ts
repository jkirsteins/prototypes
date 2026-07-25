// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { flyCard } from "../src/animate";

describe("flyCard", () => {
  it("spawns at the source, transitions through stages, then removes itself", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const done = vi.fn();
    const el = flyCard(
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
});
