import { describe, expect, test } from "vitest";
import { TICK, applyIntent, createFighter, tickFighter } from "../src/combat/fighter";
import { canBind } from "../src/combat/contact";
import {
  BIND_ADVANTAGE_MS, BIND_LOSS_MS, BIND_MS, FIRMNESS_EPSILON, GUARD_SETTLE_MS,
  createDuel, firmness, tickDuel,
} from "../src/combat/engine";
import { WEAPONS, bindTimeline, parryableMs } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

/**
 * TODO-7-pressure-and-winding.md: the decision inside the bind. Firmness is
 * derived once from the entry snapshot; hold/press/wind resolve as a hidden
 * simultaneous mixup (press beats hold, hold beats wind, wind beats press,
 * press-war to the firmer blade); the loser is exposed for BIND_LOSS_MS and
 * the winner's advantage is one immediate thrust on bindTimeline.
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

/** LS mirror: side 0's held guard meets side 1's thrust -> bind. */
function enterBind(x1 = 1180): Duel {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = x1;
  runMs(d, TICK, "parry", null);
  runMs(d, 600);
  for (let t = 0; t < 1600; t += TICK) {
    tickDuel(d, null, t === 0 ? "thrust" : null);
    if (d.bind !== null) return d;
  }
  throw new Error("no bind formed");
}

describe("firmness is a pure function of the snapshot", () => {
  const w = WEAPONS.longsword;
  test("a strike's firmness is its progress: soft at the start, hard near arrival", () => {
    expect(firmness({ kind: "strike", progress: 0.03 }, w)).toBeCloseTo(0.03, 5);
    expect(firmness({ kind: "strike", progress: 0.97 }, w)).toBeCloseTo(0.97, 5);
    expect(firmness({ kind: "strike", progress: 1 }, w)).toBe(1);
  });
  test("a guard's firmness is its settled time over GUARD_SETTLE_MS, capped", () => {
    expect(firmness({ kind: "guard", settledMs: TICK }, w)).toBeCloseTo(TICK / GUARD_SETTLE_MS, 5);
    expect(firmness({ kind: "guard", settledMs: GUARD_SETTLE_MS }, w)).toBe(1);
    expect(firmness({ kind: "guard", settledMs: 4000 }, w)).toBe(1); // no lifetime to normalise against
    expect(firmness({ kind: "guard", settledMs: 0 }, w)).toBe(0);
  });
  test("the entry stores the pair on the bind", () => {
    const d = enterBind();
    const b = d.bind;
    if (b === null) throw new Error("unreachable");
    expect(b.firmness[0]).toBe(1); // guard settled far past GUARD_SETTLE_MS
    expect(b.firmness[1]).toBeGreaterThanOrEqual(180 / 200); // strike met near arrival
  });
});

describe("the mixup matrix, all nine cells", () => {
  /** Enters a bind, injects the two choices (null = hold), runs to resolution. */
  function play(
    a: "press" | "wind" | null,
    b: "press" | "wind" | null,
    firm?: [number, number],
  ): { d: Duel; evs: DuelEvent[] } {
    const d = enterBind();
    if (firm && d.bind) d.bind.firmness = firm;
    // Stop on the resolution tick: the winner's advantage is a decaying
    // timer, so the matrix is judged at the moment the bind breaks.
    const evs: DuelEvent[] = [];
    let ia: Intent | null = a;
    let ib: Intent | null = b;
    for (let t = 0; t < BIND_MS + 2 * TICK && d.bind !== null; t += TICK) {
      evs.push(...tickDuel(d, ia, ib));
      ia = null;
      ib = null;
    }
    return { d, evs };
  }
  const won = (d: Duel, side: 0 | 1): boolean =>
    d.f[side].bindAdvantageMs > 0 &&
    d.f[side].state.kind === "ready" &&
    d.f[1 - side].state.kind === "exposed";
  const neutral = (d: Duel, evs: DuelEvent[]): boolean =>
    d.f[0].state.kind === "ready" && d.f[1].state.kind === "ready" &&
    d.f[0].bindAdvantageMs === 0 && d.f[1].bindAdvantageMs === 0 &&
    !evs.some((e) => e.kind === "bindBreak");

  test("hold vs hold: neutral, and silent", () => {
    const { d, evs } = play(null, null);
    expect(neutral(d, evs)).toBe(true);
  });
  test("wind vs wind: neutral", () => {
    const { d, evs } = play("wind", "wind");
    expect(neutral(d, evs)).toBe(true);
  });
  test("press beats hold, both ways", () => {
    const a = play("press", null);
    expect(won(a.d, 0)).toBe(true);
    const b = play(null, "press");
    expect(won(b.d, 1)).toBe(true);
  });
  test("hold beats wind, both ways", () => {
    const a = play(null, "wind");
    expect(won(a.d, 0)).toBe(true);
    const b = play("wind", null);
    expect(won(b.d, 1)).toBe(true);
  });
  test("wind beats press, both ways", () => {
    const a = play("wind", "press");
    expect(won(a.d, 0)).toBe(true);
    const b = play("press", "wind");
    expect(won(b.d, 1)).toBe(true);
  });
  test("press against press: the firmer wins, in both orders", () => {
    const a = play("press", "press", [0.9, 0.2]);
    expect(won(a.d, 0)).toBe(true);
    const b = play("press", "press", [0.2, 0.9]);
    expect(won(b.d, 1)).toBe(true);
  });
  test("press against press inside the epsilon band grinds neutral", () => {
    const { d, evs } = play("press", "press", [0.5, 0.5 + FIRMNESS_EPSILON - 0.01]);
    expect(neutral(d, evs)).toBe(true);
  });
  test("a decisive resolution emits one logged bindBreak; neutral emits none", () => {
    const a = play("press", null);
    expect(a.evs.filter((e) => e.kind === "bindBreak").length).toBe(1);
    expect(a.d.log.filter((e) => e.kind === "bindBreak").length).toBe(1);
  });
});

describe("locking and hiding", () => {
  test("the attack keys are the bind keys: cut presses, thrust winds", () => {
    // No new bindings: during a bind J (cut) locks press, K (thrust) locks
    // wind. Press beats hold, so the cut-key player beats a holding dummy.
    const d = enterBind();
    const evs = runMs(d, BIND_MS + 2 * TICK, "cut", null);
    expect(evs.some((e) => e.kind === "bindBreak")).toBe(true);
    expect(d.f[0].bindAdvantageMs).toBeGreaterThan(0);
    const d2 = enterBind();
    runMs(d2, TICK, "thrust", null); // K: wind
    expect(d2.bind?.lock[0]).toBe("wind");
  });

  test("locks are irrevocable: the second choice is ignored", () => {
    const d = enterBind();
    runMs(d, TICK, "press", null);
    runMs(d, TICK, "wind", null);
    expect(d.bind?.lock[0]).toBe("press");
    const evs = runMs(d, BIND_MS + 2 * TICK);
    expect(evs.some((e) => e.kind === "bindBreak")).toBe(true);
    expect(d.f[0].bindAdvantageMs).toBeGreaterThan(0); // press beat their hold
  });

  test("a locked choice is invisible: the observable projection is unchanged until resolution", () => {
    const project = (withLock: boolean): string[] => {
      const d = enterBind();
      const lines: string[] = [];
      // One side locks (or not); the other holds. Resolution is at BIND_MS
      // either way, so every tick before it must look identical.
      let ia: Intent | null = withLock ? "press" : null;
      for (let t = 0; t + 2 * TICK < BIND_MS; t += TICK) {
        const evs = tickDuel(d, ia, null);
        ia = null;
        lines.push(JSON.stringify({
          x: [d.f[0].x, d.f[1].x],
          states: [d.f[0].state.kind, d.f[1].state.kind],
          events: evs.map((e) => ({ kind: e.kind, side: e.side })),
        }));
      }
      return lines;
    };
    expect(project(true)).toEqual(project(false));
  });

  test("two locks resolve on the second lock's tick; any hold waits for BIND_MS", () => {
    const d = enterBind();
    runMs(d, TICK, "press", null);
    expect(d.bind).not.toBe(null); // one lock alone resolves nothing
    runMs(d, 5 * TICK);
    expect(d.bind).not.toBe(null);
    const evs = runMs(d, TICK, null, "wind"); // the second lock
    expect(d.bind).toBe(null); // resolved on this very tick
    expect(evs.some((e) => e.kind === "bindBreak")).toBe(true);
    // And with a hold in the pair, resolution waits for the full beat.
    const h = enterBind();
    runMs(h, TICK, "press", null);
    let ticks = 0;
    while (h.bind !== null && ticks < 40) {
      runMs(h, TICK);
      ticks++;
    }
    expect(ticks).toBe(Math.ceil(BIND_MS / TICK) - 1); // the lock's setup tick already ran
  });
});

describe("what winning is worth", () => {
  function winAsPlayer(): Duel {
    // Gap 190: the immediate thrust (resolving ~277ms into a 320ms
    // exposure) kills regardless, while the seven-tick-late one resolves
    // ~393ms - the loser is free from ~333ms, and the void's first 60ms
    // of travel carry it past the longsword's 200cm reach. At 180 the
    // same void would still be caught; the escape is a measure fact.
    const d = enterBind(1190);
    runMs(d, TICK, "press", null); // press beats the dummy's hold at BIND_MS
    while (d.bind !== null) runMs(d, TICK);
    return d;
  }

  test("the loser is exposed: no intents, exactly BIND_LOSS_MS, then ready", () => {
    const d = winAsPlayer();
    expect(d.f[1].state.kind).toBe("exposed");
    runMs(d, 5 * TICK, null, "cut");
    expect(d.f[1].state.kind).toBe("exposed"); // refused
    expect(d.f[1].buffered).toBe(null);
    let ticks = 5;
    while (d.f[1].state.kind === "exposed" && ticks < 40) {
      runMs(d, TICK);
      ticks++;
    }
    expect(d.f[1].state.kind).toBe("ready");
    expect(ticks).toBe(Math.ceil(BIND_LOSS_MS / TICK));
  });

  test("the immediate thrust kills inside the exposure", () => {
    const d = winAsPlayer();
    const evs = runMs(d, 600, "thrust", null);
    expect(evs.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    expect(d.winner).toBe(0);
  });

  test("a thrust seven ticks late resolves after the exposure; the loser escapes it", () => {
    const d = winAsPlayer();
    runMs(d, 7 * TICK);
    // The loser's first free act is a void; the late thrust finds air.
    let voided = false;
    const evs: DuelEvent[] = [];
    let ia: Intent | null = "thrust";
    for (let t = 0; t < 1200; t += TICK) {
      let ib: Intent | null = null;
      if (!voided && d.f[1].state.kind === "ready") {
        ib = "void";
        voided = true;
      }
      evs.push(...tickDuel(d, ia, ib));
      ia = null;
    }
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
    expect(d.over).toBe(false);
  });

  test("the advantage decays; on its last positive tick the thrust still launches from the bind", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(400, 1, w);
    f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    for (let t = 0; t + TICK < BIND_ADVANTAGE_MS; t += TICK) tickFighter(f, TICK);
    expect(f.bindAdvantageMs).toBeGreaterThan(0);
    applyIntent(f, "thrust");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("refused");
    expect(s.timeline.strikeStart).toBe(0); // bindTimeline
    expect(f.bindAdvantageMs).toBe(0); // consumed
  });

  test("expired, the same thrust launches on the normal timeline", () => {
    const w = WEAPONS.longsword;
    const f = createFighter(400, 1, w);
    f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    for (let t = 0; t < BIND_ADVANTAGE_MS + 2 * TICK; t += TICK) tickFighter(f, TICK);
    expect(f.bindAdvantageMs).toBe(0);
    applyIntent(f, "thrust");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("refused");
    expect(s.timeline.strikeStart).toBe(w.attacks.thrust.windup + w.attacks.thrust.beat);
  });

  test("every other accepted intent clears the advantage and proceeds normally", () => {
    const w = WEAPONS.longsword;
    const intents: Intent[] = ["cut", "advance", "void", "parry"];
    for (const intent of intents) {
      const f = createFighter(400, 1, w);
      f.bindAdvantageMs = BIND_ADVANTAGE_MS;
      const r = applyIntent(f, intent);
      expect(r).toBe("accepted");
      expect(f.bindAdvantageMs).toBe(0);
      if (intent === "cut") {
        const s = f.state;
        if (s.kind !== "attack") throw new Error("unreachable");
        expect(s.timeline.strikeStart).toBe(w.attacks.cut.windup + w.attacks.cut.beat); // full price
      }
    }
    // A refused intent does not clear it: the advantage is lost by acting.
    const f = createFighter(400, 1, w);
    f.bindAdvantageMs = BIND_ADVANTAGE_MS;
    expect(applyIntent(f, "parryRelease")).toBe("ignored");
    expect(f.bindAdvantageMs).toBe(BIND_ADVANTAGE_MS);
  });
});

describe("bindTimeline and its cues", () => {
  test("every mark before strikeStart is zero; strike and recovery are the thrust's own", () => {
    for (const w of Object.values(WEAPONS)) {
      const tl = bindTimeline(w);
      const t = w.attacks.thrust;
      expect(tl.riseStart).toBe(0);
      expect(tl.riseEnd).toBe(0);
      expect(tl.strikeStart).toBe(0);
      expect(tl.parryableUntil).toBe(parryableMs(t));
      expect(tl.strikeEnd).toBe(t.strike);
      expect(tl.recoveryEnd).toBe(t.strike + t.recovery);
    }
  });

  test("no windup event, one swing, one outcome sound - in the simulation, at its instants", () => {
    const d = winAndCollect();
    expect(d.evs.some((e) => e.kind === "windup" && e.side === 0)).toBe(false);
    expect(d.evs.filter((e) => e.kind === "swing" && e.side === 0).length).toBe(1);
    expect(d.evs.filter((e) => e.kind === "hit" && e.side === 0).length).toBe(1);
  });

  function winAndCollect(): { evs: DuelEvent[] } {
    const d = enterBind();
    runMs(d, TICK, "press", null);
    while (d.bind !== null) runMs(d, TICK);
    const evs = runMs(d, 600, "thrust", null);
    return { evs };
  }

  test("the reward arithmetic holds for every pairing canBind sustains", () => {
    // The §2.3 promise per weapon: the bind thrust resolves inside the
    // loser's exposure, so taking the opening immediately kills. Computed
    // from WEAPONS and the shared derivation, never asserted per name.
    const ws = Object.values(WEAPONS);
    let pairings = 0;
    for (const a of ws) {
      for (const b of ws) {
        if (!canBind(a, b)) continue;
        pairings++;
        expect(bindTimeline(a).strikeEnd).toBeLessThan(BIND_LOSS_MS);
        expect(bindTimeline(b).strikeEnd).toBeLessThan(BIND_LOSS_MS);
      }
    }
    expect(pairings).toBeGreaterThan(0); // the matrix is not vacuous
  });
});

describe("the bind prompt", () => {
  test("unlocked it teaches the keys; locked it confirms the tap, without naming a beat to act on", async () => {
    const { bindPrompt } = await import("../src/render/draw");
    const open = bindPrompt(null);
    expect(open).toContain("J");
    expect(open).toContain("K");
    expect(bindPrompt("press")).toMatch(/locked/);
    expect(bindPrompt("wind")).toMatch(/locked/);
    // The confirmation must not reveal which choice would win - it names
    // the player's own lock only, which they already know.
    expect(bindPrompt("press")).toContain("press");
    expect(bindPrompt("wind")).toContain("wind");
  });
});

describe("AI in the bind", () => {
  test("same seed, same fight: the duelist's bind play replays exactly", async () => {
    const { aiDecide, createAiState } = await import("../src/combat/ai");
    const play = (): string => {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      const ai = createAiState(21);
      const lines: string[] = [];
      for (let tick = 0; tick < 900; tick++) {
        const ia: Intent | null = tick === 40 ? "parry" : null;
        const evs = tickDuel(d, ia, aiDecide(d, 3, ai, TICK));
        lines.push(JSON.stringify(evs.map((e) => ({ k: e.kind, s: e.side, t: e.time }))));
        if (d.over) break;
      }
      return lines.join("\n");
    };
    expect(play()).toBe(play());
  });

  test("over seeds, the duelist's mixed strategy uses all three choices", async () => {
    const { aiDecide, createAiState } = await import("../src/combat/ai");
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30 && seen.size < 3; seed++) {
      const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
      d.f[0].x = 1000;
      d.f[1].x = 1180;
      const ai = createAiState(seed);
      let lastLock: string | null = null;
      for (let tick = 0; tick < 2400; tick++) {
        // The player parries LATE in the windup - visible for less than
        // the duelist's quickest reaction at commitment, so the redirect
        // never steers around it, and still formed before the blade
        // arrives. (An instant press would be feinted past every time and
        // no bind would ever form.)
        const os = d.f[1].state;
        const me = d.f[0];
        const free = me.state.kind === "ready" && me.parry === null && me.parryRecoveryMs <= 0;
        const oppCommitting = os.kind === "attack" && os.phase === "windup" && os.elapsedMs >= 340;
        let ia: Intent | null = null;
        if (os.kind === "attack" && os.phase === "windup" && free) {
          if (os.height !== me.height && me.heightTo === null && os.elapsedMs < 340) {
            // Match the height first - a low guard against a high cut
            // never binds, it just dies.
            ia = os.height === "high" ? "stanceUp" : "stanceDown";
          } else if (oppCommitting && me.heightTo === null) {
            ia = "parry";
          }
        }
        tickDuel(d, ia, aiDecide(d, 3, ai, TICK));
        if (d.bind !== null) lastLock = d.bind.lock[1] ?? "hold";
        if (d.over) break;
      }
      if (lastLock !== null) seen.add(lastLock);
    }
    expect(seen).toEqual(new Set(["hold", "press", "wind"]));
  });
});
