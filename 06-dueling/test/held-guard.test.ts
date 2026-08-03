import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter } from "../src/combat/fighter";
import { createDuel, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

/**
 * TODO-5-held-guard.md: the guard stands as long as the key does. No timer,
 * no expiry - release, attack, void, contact or death are the only ways
 * out, each at recovery price. Tap stays attack-bound (the latch), hold is
 * key-bound.
 */

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null): DuelEvent[] {
  const evs: DuelEvent[] = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

describe("regression: parry then step away must not strand the guard", () => {
  test("a tapped guard whose attack whiffs after the defender retreats comes down at the whiff", () => {
    // The playtested bug: latch onto an incoming attack, step out of its
    // reach, and the guard stood forever "awaiting the thrust". The guard
    // must end when the awaited attack ends - the whiff - never later.
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1190;
    let evs = runMs(d, TICK, null, "cut"); // the AI's cut becomes visible
    evs = evs.concat(runMs(d, TICK, "parry", null)); // latch onto it
    evs = evs.concat(runMs(d, TICK, "parryRelease", null)); // a tap: key gone
    // Step away so the cut will whiff.
    evs = evs.concat(runMs(d, 400, "retreat", null));
    evs = evs.concat(runMs(d, 400, "retreat", null));
    expect(d.f[0].parry).not.toBe(null); // still awaiting its attack
    // Advance to the exact tick the guard comes down: it must be the whiff
    // tick, and the recovery must be charged on it.
    for (let i = 0; i < 60 && d.f[0].parry !== null; i++) evs = evs.concat(runMs(d, TICK));
    expect(evs.some((e) => e.kind === "whiff" && e.side === 1)).toBe(true);
    expect(d.f[0].parry).toBe(null); // down with the attack it awaited
    expect(d.f[0].parryRecoveryMs).toBe(WEAPONS.rapier.parryRecoveryMs);
    // And it never lingers: run on, no guard reappears.
    runMs(d, 1000);
    expect(d.f[0].parry).toBe(null);
  });
});

describe("the held lifecycle", () => {
  test("held two seconds, a matching attack is still parried", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    runMs(d, TICK, "parry", null); // cold press, held (no release)
    runMs(d, 2000);
    expect(d.f[0].parry?.phase).toBe("held");
    // The AI thrust arrives on the covered line (low inside). Two
    // longswords: the stop is a bind since sustained-bind - its logged
    // event is the guard answering, and nobody is hit.
    const evs = runMs(d, 1400, null, "thrust");
    expect(evs.some((e) => e.kind === "bind" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });

  test("release drops from rising, held and shifting alike, at recovery price", () => {
    const w = WEAPONS.longsword;
    // From rising.
    const a = createFighter(400, 1, w);
    applyIntent(a, "parry");
    expect(a.parry?.phase).toBe("rising");
    applyIntent(a, "parryRelease");
    expect(a.parry).toBe(null);
    expect(a.parryRecoveryMs).toBe(w.parryRecoveryMs);
    // From held.
    const b = createFighter(400, 1, w);
    applyIntent(b, "parry");
    if (b.parry !== null) b.parry.phase = "held";
    applyIntent(b, "parryRelease");
    expect(b.parry).toBe(null);
    expect(b.parryRecoveryMs).toBe(w.parryRecoveryMs);
    // From shifting.
    const c = createFighter(400, 1, w);
    applyIntent(c, "parry");
    if (c.parry !== null) c.parry.phase = "held";
    applyIntent(c, "stanceUp");
    expect(c.parry?.phase).toBe("shifting");
    applyIntent(c, "parryRelease");
    expect(c.parry).toBe(null);
  });

  test("an attack from the guard launches undelayed; the recovery runs concurrently", () => {
    const w = WEAPONS.longsword;
    const g = createFighter(400, 1, w);
    applyIntent(g, "parry");
    if (g.parry !== null) g.parry.phase = "held";
    applyIntent(g, "cut");
    const s = g.state;
    if (s.kind !== "attack") throw new Error("attack refused from guard");
    expect(g.parry).toBe(null); // coverage gone on the acceptance tick
    expect(g.parryRecoveryMs).toBe(w.parryRecoveryMs);
    // The timeline equals a from-ready cut's: no added delay.
    const fresh = createFighter(0, 1, w);
    applyIntent(fresh, "cut");
    const fs = fresh.state;
    if (fs.kind !== "attack") throw new Error("unreachable");
    expect(s.timeline).toEqual(fs.timeline);
  });
});

describe("shifts on a held guard", () => {
  function heldGuard() {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    runMs(d, TICK, "parry", null);
    const p = d.f[0].parry;
    if (p === null) throw new Error("no parry");
    p.phase = "held";
    p.phaseDurationMs = 0;
    return { d, p };
  }

  test("shifts repeat while held, one at a time, each at full travel", () => {
    const { d } = heldGuard();
    runMs(d, TICK, "stanceUp", null);
    expect(d.f[0].parry?.phase).toBe("shifting");
    runMs(d, WEAPONS.longsword.guardShiftMs + 2 * TICK);
    const p1 = d.f[0].parry;
    expect(p1?.phase).toBe("held");
    expect(p1?.coveredLine.height).toBe("high");
    runMs(d, TICK, "stanceDown", null); // a second full shift: legal
    expect(d.f[0].parry?.phase).toBe("shifting");
    runMs(d, WEAPONS.longsword.guardShiftMs + 2 * TICK);
    expect(d.f[0].parry?.coveredLine.height).toBe("low");
  });

  test("settledMs resets on each completed shift and counts through the travel", () => {
    const { d } = heldGuard();
    runMs(d, 300);
    const before = d.f[0].parry?.settledMs ?? 0;
    expect(before).toBeGreaterThan(280);
    runMs(d, TICK, "stanceUp", null);
    runMs(d, Math.round(WEAPONS.longsword.guardShiftMs / 2 / TICK) * TICK);
    // Mid-shift the OLD line's clock keeps counting.
    expect(d.f[0].parry?.settledMs).toBeGreaterThan(before);
    runMs(d, WEAPONS.longsword.guardShiftMs);
    const after = d.f[0].parry?.settledMs ?? -1;
    expect(after).toBeGreaterThanOrEqual(0);
    expect(after).toBeLessThan(WEAPONS.longsword.guardShiftMs + 3 * TICK); // freshly reset
  });

  test("a shift is refused while rising", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    runMs(d, TICK, "parry", null);
    expect(d.f[0].parry?.phase).toBe("rising");
    runMs(d, TICK, "stanceUp", null);
    expect(d.f[0].parry?.phase).toBe("rising"); // unchanged: no shift, no restart
  });

  test("a side shift with no attack visible toggles to the opposite side", () => {
    // With a threat the shift re-aims at it; without one it is still a
    // meaningful order - flip to the other side - so Caps Lock can work
    // the side axis the way Left Shift works the heights. The travel is
    // simulated either way.
    const { d } = heldGuard();
    runMs(d, TICK, "sideShift", null);
    const p = d.f[0].parry;
    expect(p?.phase).toBe("shifting");
    expect(p?.targetLine.side).toBe("outside");
    expect(p?.coveredLine.side).toBe("inside"); // old side covered until arrival
    runMs(d, WEAPONS.longsword.sideChangeMs + 2 * TICK);
    expect(d.f[0].parry?.coveredLine.side).toBe("outside");
    // And back: the toggle repeats, one travel at a time.
    runMs(d, TICK, "sideShift", null);
    expect(d.f[0].parry?.targetLine.side).toBe("inside");
  });

  test("a side shift re-aims at the visible attack's side over sideChangeMs", () => {
    const { d } = heldGuard();
    runMs(d, TICK, null, "cut"); // a cut (outside) becomes visible
    runMs(d, TICK, "sideShift", null);
    const p = d.f[0].parry;
    expect(p?.phase).toBe("shifting");
    expect(p?.targetLine.side).toBe("outside");
    runMs(d, WEAPONS.longsword.sideChangeMs + 2 * TICK);
    expect(d.f[0].parry?.coveredLine.side).toBe("outside");
    expect(d.f[0].guardSide).toBe("outside");
  });
});
