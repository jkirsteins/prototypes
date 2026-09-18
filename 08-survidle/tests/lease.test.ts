import { describe, expect, it } from "vitest";
import { acquire, GRACE_MS, heartbeat, lapsed, mayAcquire, mayWrite, view } from "../src/sync/lease";

/** The pure rules the Worker and the client both import: who may run the world. */
describe("the lease", () => {
  const t0 = 1_000_000;
  const held = acquire("desktop-1", "desktop", t0, "tok-1");

  it("is free when nobody holds it", () => {
    expect(mayAcquire(null, "phone-1", t0, false)).toBe(true);
  });

  it("is not given away while the holder is live", () => {
    expect(mayAcquire(held, "phone-1", t0 + 1000, false)).toBe(false);
    expect(mayAcquire(held, "phone-1", t0 + GRACE_MS, false)).toBe(false);
  });

  it("lapses once the holder has been quiet past the grace period", () => {
    expect(lapsed(held, t0 + GRACE_MS)).toBe(false);
    expect(lapsed(held, t0 + GRACE_MS + 1)).toBe(true);
    expect(mayAcquire(held, "phone-1", t0 + GRACE_MS + 1, false)).toBe(true);
  });

  it("is the holder's own to retake", () => {
    expect(mayAcquire(held, "desktop-1", t0 + 1000, false)).toBe(true);
  });

  it("is taken by force from a live holder", () => {
    expect(mayAcquire(held, "phone-1", t0 + 1000, true)).toBe(true);
  });

  it("moves lastSeen on a heartbeat with the right token and not otherwise", () => {
    expect(heartbeat(held, "tok-1", t0 + 5000)).toEqual({ ...held, lastSeen: t0 + 5000 });
    expect(heartbeat(held, "tok-2", t0 + 5000)).toBe(held);
    expect(heartbeat(null, "tok-1", t0)).toBeNull();
  });

  it("lets only the holder's token write, and never an empty one", () => {
    expect(mayWrite(held, "tok-1")).toBe(true);
    expect(mayWrite(held, "tok-2")).toBe(false);
    expect(mayWrite(null, "tok-1")).toBe(false);
    expect(mayWrite({ ...held, token: "" }, "")).toBe(false);
  });

  it("draws a token nobody can guess, and shows the other device the lease without it", () => {
    const a = acquire("d", "desktop", t0);
    const b = acquire("d", "desktop", t0);
    expect(a.token).toMatch(/^[0-9a-f]{32}$/);
    expect(a.token).not.toBe(b.token);
    expect(view(a)).toEqual({ holder: "d", label: "desktop", since: t0, lastSeen: t0 });
    expect("token" in view(a)).toBe(false);
  });
});
