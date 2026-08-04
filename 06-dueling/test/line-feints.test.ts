import { describe, expect, test } from "vitest";
import { PLAYER_REACTION_MS, aiDecide, createAiState } from "../src/combat/ai";
import { TICK, applyIntent, createFighter } from "../src/combat/fighter";
import { createDuel, tickDuel } from "../src/combat/engine";
import { PARRYABLE_FRACTION, WEAPONS } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

/**
 * TODO-4-line-feints.md: an attack in its sold windup may change height
 * (arrow), side (the other attack key), or both - once. The defender's
 * raised guard may shift its covered line once per raise. The parry's
 * snapshot never follows the blade on its own.
 */

const ws = Object.values(WEAPONS);

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null): DuelEvent[] {
  const evs: DuelEvent[] = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

describe("invariants: the answer windows", () => {
  test("a height redirect is answerable by every weapon pair", () => {
    for (const atk of ws) {
      for (const def of ws) {
        const deadline = atk.redirectHeightMs + atk.attacks.thrust.strike * PARRYABLE_FRACTION;
        expect(PLAYER_REACTION_MS + def.guardShiftMs).toBeLessThanOrEqual(deadline);
      }
    }
  });

  test("a side redirect is answerable except from the rapier: the disengage must fail", () => {
    for (const atk of ws) {
      for (const def of ws) {
        const deadline = atk.redirectSideMs + atk.attacks.thrust.strike * PARRYABLE_FRACTION;
        const answerable = PLAYER_REACTION_MS + def.sideChangeMs <= deadline;
        expect(answerable).toBe(atk.id !== "rapier");
      }
    }
  });

  test("shifting a formed guard beats starting cold, and rotating beats travelling", () => {
    for (const w of ws) {
      expect(w.guardShiftMs).toBeLessThan(w.heightChangeMs);
      expect(w.sideChangeMs).toBeLessThan(w.guardShiftMs);
    }
  });
});

describe("redirect legality", () => {
  /** A windup at `elapsed`, low stance; returns the redirect acceptance. */
  function tryRedirect(elapsed: number, intent: Intent): { r: string; f: ReturnType<typeof createFighter> } {
    const f = createFighter(400, 1, WEAPONS.longsword);
    applyIntent(f, "thrust");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("unreachable");
    s.elapsedMs = elapsed;
    return { r: applyIntent(f, intent), f };
  }

  const tl = () => {
    const f = createFighter(0, 1, WEAPONS.longsword);
    applyIntent(f, "thrust");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("unreachable");
    return s.timeline;
  };

  test("accepted anywhere in the windup, for height and for side", () => {
    const t = tl();
    expect(tryRedirect(t.riseEnd + 1, "stanceUp").r).toBe("accepted"); // the beat
    expect(tryRedirect(t.riseEnd + 1, "cut").r).toBe("accepted");
    expect(tryRedirect(t.riseEnd - 100, "cut").r).toBe("accepted"); // mid-rise: a weak feint, but legal
    expect(tryRedirect(2, "stanceUp").r).toBe("accepted"); // the same door the F-cancel uses
  });
  test("refused from commitment on: strike and recovery steer nothing", () => {
    const t = tl();
    expect(tryRedirect(t.strikeStart, "stanceUp").r).toBe("ignored");
    expect(tryRedirect(t.strikeStart + 10, "cut").r).toBe("ignored");
  });
  test("the same attack kind is not a redirect", () => {
    const t = tl();
    expect(tryRedirect(t.riseEnd + 1, "thrust").r).toBe("ignored");
  });
  test("one redirect per attack, whichever axis", () => {
    const t = tl();
    const { f } = tryRedirect(t.riseEnd + 1, "stanceUp");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("unreachable");
    expect(applyIntent(f, "cut")).toBe("ignored");
    expect(applyIntent(f, "stanceDown")).toBe("ignored");
  });

  test("the timeline is replaced from the redirect instant with the new kind's timings", () => {
    const t = tl();
    const at = t.riseEnd + 20;
    const { f } = tryRedirect(at, "cut"); // thrust -> cut: side redirect
    const s = f.state;
    if (s.kind !== "attack") throw new Error("unreachable");
    expect(s.attack).toBe("cut");
    expect(s.redirected).toBe(true);
    const w = WEAPONS.longsword;
    const c = w.attacks.cut;
    expect(s.timeline.strikeStart).toBeCloseTo(at + w.redirectSideMs, 5);
    expect(s.timeline.parryableUntil).toBeCloseTo(at + w.redirectSideMs + c.strike * PARRYABLE_FRACTION, 5);
    expect(s.timeline.strikeEnd).toBeCloseTo(at + w.redirectSideMs + c.strike, 5);
    expect(s.timeline.recoveryEnd).toBeCloseTo(at + w.redirectSideMs + c.strike + c.recovery, 5);
    expect(s.timeline.riseEnd).toBe(t.riseEnd); // the past is not rewritten
    expect(s.phase).toBe("windup");
  });

  test("a height redirect moves the attacker's stance with the blade", () => {
    const t = tl();
    const { f } = tryRedirect(t.riseEnd + 1, "stanceUp");
    const s = f.state;
    if (s.kind !== "attack") throw new Error("unreachable");
    expect(s.height).toBe("high");
    expect(f.height).toBe("high"); // the body went there
  });
});

describe("the lies land against a snapshotted guard", () => {
  /**
   * The AI-side telegraphed thrust; the player parries on the tell (latched,
   * low inside), then the attack redirects. The parry must keep its snapshot
   * and miss.
   */
  function feintExchange(redirect: Intent): DuelEvent[] {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, null, "thrust"); // AI thrust: low inside, visible
    evs = evs.concat(runMs(d, 250 - TICK, "parry", null)); // player latches low inside
    const t = WEAPONS.longsword.attacks.thrust;
    const riseEnd = t.windup;
    evs = evs.concat(runMs(d, riseEnd + 20 - 250)); // into the sold half
    evs = evs.concat(runMs(d, TICK, null, redirect)); // the lie
    evs = evs.concat(runMs(d, 1600));
    return evs.concat([{ time: 0, side: d.winner === 1 ? 1 : 0, kind: "attackStart", text: "probe" }]);
  }

  test("the height lie lands: redirected high, the low guard covers air", () => {
    const evs = feintExchange("stanceUp");
    expect(evs.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(false);
  });

  test("the side lie lands: redirected to the cut, the inside guard covers air", () => {
    const evs = feintExchange("cut");
    expect(evs.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(false);
  });

  test("without the redirect the same latched parry meets the thrust", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, null, "thrust");
    evs = evs.concat(runMs(d, 250 - TICK, "parry", null));
    evs = evs.concat(runMs(d, 1600));
    // A parried blade always deflects (only crossings bind): the logged
    // parried event is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });
});

describe("the defender's answer: the guard shift", () => {
  /** Player latches onto the AI thrust; AI redirects at `redirectAt` (abs ms); player shifts at `shiftAt`. */
  function answered(redirect: Intent, shiftIntent: Intent, redirectAt: number, shiftAt: number): DuelEvent[] {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, null, "thrust");
    evs = evs.concat(runMs(d, 250 - TICK, "parry", null));
    evs = evs.concat(runMs(d, redirectAt - 250));
    evs = evs.concat(runMs(d, TICK, null, redirect));
    evs = evs.concat(runMs(d, shiftAt - redirectAt - TICK));
    evs = evs.concat(runMs(d, TICK, shiftIntent, null));
    evs = evs.concat(runMs(d, 1600));
    return evs;
  }

  const t = WEAPONS.longsword.attacks.thrust;
  const riseEnd = t.windup;

  test("a height shift within the window meets the redirected blade", () => {
    const at = riseEnd + 20;
    const evs = answered("stanceUp", "stanceUp", at, at + PLAYER_REACTION_MS);
    // A parried blade always deflects (only crossings bind): the logged
    // parried event is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });

  test("a height shift too late is a guard that forms over a wound", () => {
    const at = riseEnd + 20;
    // The corrected line must be covered by redirect + guardShift deadline;
    // reacting 150ms late blows the 80ms margin.
    const evs = answered("stanceUp", "stanceUp", at, at + PLAYER_REACTION_MS + 150);
    expect(evs.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
  });

  test("a side retarget (horizontal arrow) answers the longsword's side redirect", () => {
    const at = riseEnd + 20;
    const evs = answered("cut", "sideShift", at, at + PLAYER_REACTION_MS);
    // A parried blade always deflects (only crossings bind): the logged
    // parried event is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });

  test("one shift AT A TIME: a second input mid-travel is refused; after completion, allowed", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    runMs(d, TICK, null, "thrust");
    runMs(d, 250 - TICK, "parry", null);
    runMs(d, TICK, "stanceUp", null); // shift 1: height, in flight
    const p = d.f[0].parry;
    if (p === null) throw new Error("no parry");
    expect(p.phase).toBe("shifting");
    const target = { ...p.targetLine };
    runMs(d, 2 * TICK, "sideShift", null); // mid-travel: refused
    expect(d.f[0].parry?.targetLine).toEqual(target);
    runMs(d, WEAPONS.longsword.guardShiftMs, null, null); // travel completes
    expect(d.f[0].parry?.phase).toBe("held");
    // The retired once-per-raise cap stays retired: another shift is legal.
    runMs(d, TICK, "stanceDown", null);
    expect(d.f[0].parry?.phase).toBe("shifting");
  });

  test("the old line holds while the shift travels", () => {
    // Attacker thrusts low-inside with no redirect; the defender, latched,
    // shifts height mid-windup for no reason. Mid-shift the blade arrives on
    // the OLD line - still met, because coverage moves only on completion.
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, null, "thrust");
    evs = evs.concat(runMs(d, 250 - TICK, "parry", null));
    const arrivalIsh = t.windup + t.beat + 80;
    evs = evs.concat(runMs(d, arrivalIsh - 250 - 3 * TICK));
    evs = evs.concat(runMs(d, TICK, "stanceUp", null)); // shift begins just before arrival
    evs = evs.concat(runMs(d, 900));
    // A parried blade always deflects (only crossings bind): the logged
    // parried event is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });
});

describe("the timing tension, exhaustively: when L is pressed decides everything", () => {
  const t = WEAPONS.longsword.attacks.thrust;
  const riseEnd = t.windup; // AI thrust's sold half opens
  const redirectAt = riseEnd + 20;

  /** AI thrust redirected to a cut at `redirectAt`; player presses L at `pressAt`. */
  function exchange(pressAt: number): { evs: DuelEvent[]; side: string | undefined } {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    let evs = runMs(d, TICK, null, "thrust");
    evs = evs.concat(runMs(d, redirectAt - TICK));
    evs = evs.concat(runMs(d, TICK, null, "cut")); // the lie: thrust -> cut
    evs = evs.concat(runMs(d, pressAt - redirectAt - TICK));
    evs = evs.concat(runMs(d, TICK, "parry", null));
    const side = d.f[0].parry?.targetLine.side;
    evs = evs.concat(runMs(d, 1600));
    return { evs, side };
  }

  test("pressed after the redirect, the parry infers the NEW line and meets it", () => {
    const { evs, side } = exchange(redirectAt + PLAYER_REACTION_MS);
    expect(side).toBe("outside"); // it saw the cut, not the sold thrust
    // A parried blade always deflects (only crossings bind): the logged
    // parried event is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });

  test("pressed very late, the parry reads the final line correctly and still dies forming", () => {
    // Deadline: the guard must form by redirect + redirectSideMs + the cut's
    // meetable half (950 into the attack). A press 400ms after the redirect
    // pays max(firmUp, sideChange) = 120 and forms at 980 - 30ms past the
    // deadline. Right read, wrong clock. (Under the old raise-from-nothing
    // rise the same death needed only a 300ms-late press; readiness bought
    // the defender a real hundred milliseconds here.)
    const { evs, side } = exchange(redirectAt + 400);
    expect(side).toBe("outside");
    expect(evs.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
  });

  test("the dummy answers the player's K-then-J: latch, read the lie, shift once", () => {
    // The player presents a thrust, the mode-1 dummy latches onto it, the
    // player redirects to a cut - and the dummy re-aims its guard's side
    // after a reaction, completing before the redirected blade's deadline.
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    const ai = createAiState(1);
    const pt = WEAPONS.longsword.attacks.thrust;
    const playerRiseEnd = pt.windup; // tell-free: 260
    const evs: DuelEvent[] = [];
    for (let i = 0; i * TICK < 2400; i++) {
      const ia: Intent | null =
        i === 0 ? "thrust" : Math.round((playerRiseEnd + 20) / TICK) === i ? "cut" : null;
      const ib = aiDecide(d, 1, ai, TICK);
      evs.push(...tickDuel(d, ia, ib));
    }
    // A parried blade always deflects (only crossings bind): the logged
    // parried event is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  });
});

describe("mode 3 feints reactively", () => {
  test("a latched guard shown early gets redirected; the same fight without the guard does not", () => {
    const play = (press: boolean): { redirected: boolean; evs: DuelEvent[] } => {
      const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
      d.f[0].x = 1000;
      d.f[1].x = 1230; // narrow for the rapier: it will attack
      // Seed 7 draws a quick reaction (~203ms), so the standing guard is
      // seen with room to spare inside the sold half. A slow draw (0x5eed
      // gives 356ms) can leave a sub-tick window against the rapier thrust
      // and legitimately never redirect - the jitter deciding whether a
      // bait works is the feature, but this test pins the mechanism, so it
      // picks a seed where the read happens.
      const ai = createAiState(7);
      const evs: DuelEvent[] = [];
      let redirected = false;
      for (let i = 0; i * TICK < 4000; i++) {
        const ib = aiDecide(d, 3, ai, TICK);
        // The player parries the instant the AI's attack shows.
        const oppAttacking = d.f[1].state.kind === "attack" && d.f[1].state.phase !== "recovery";
        const ia: Intent | null = press && oppAttacking && d.f[0].parry === null && d.f[0].parryRecoveryMs <= 0 ? "parry" : null;
        evs.push(...tickDuel(d, ia, ib));
        const s = d.f[1].state;
        if (s.kind === "attack" && s.redirected) redirected = true;
        if (d.over) break;
      }
      return { redirected, evs };
    };
    expect(play(true).redirected).toBe(true); // the early guard is bait
    expect(play(false).redirected).toBe(false); // nothing to deceive
  });

  test("deterministic: the same seed and script redirect on the same tick", () => {
    const run = (): string => {
      const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
      d.f[0].x = 1000;
      d.f[1].x = 1230;
      const ai = createAiState(7);
      const marks: number[] = [];
      for (let i = 0; i * TICK < 4000; i++) {
        const ib = aiDecide(d, 3, ai, TICK);
        const oppAttacking = d.f[1].state.kind === "attack" && d.f[1].state.phase !== "recovery";
        const ia: Intent | null = oppAttacking && d.f[0].parry === null && d.f[0].parryRecoveryMs <= 0 ? "parry" : null;
        tickDuel(d, ia, ib);
        const s = d.f[1].state;
        if (s.kind === "attack" && s.redirected) marks.push(i);
        if (d.over) break;
      }
      return marks.join(",");
    };
    expect(run()).toBe(run());
  });
});

describe("presentation stays honest", () => {
  test("a redirect logs a feint on its tick, cues nothing, and one outcome fires at the new strikeEnd", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    d.f[0].x = 1000;
    d.f[1].x = 1180;
    runMs(d, TICK, "thrust", null);
    const t = WEAPONS.longsword.attacks.thrust;
    runMs(d, t.windup + 20 - TICK);
    const redirectTick = runMs(d, TICK, "stanceUp", null);
    // The lie is visible by design: row 3 flips and the log records it -
    // only the audio stays silent (the feint kind is unmapped).
    const feints = redirectTick.filter((e) => e.kind === "feint");
    expect(feints.length).toBe(1);
    expect(feints[0].text).toContain("goes high");
    expect(d.log.some((e) => e.kind === "feint")).toBe(true);
    expect(redirectTick.filter((e) => !["step", "feint"].includes(e.kind))).toEqual([]);
    const rest = runMs(d, 2000);
    expect(rest.filter((e) => e.kind === "hit").length).toBe(1); // one outcome
    expect(rest.filter((e) => e.kind === "windup").length).toBe(0); // no second rise
  });

  test("the help panel cites the redirect and shift durations", () => {
    // renderHelpHtml is imported lazily to keep this file engine-first.
    return import("../src/ui/help").then(({ renderHelpHtml }) => {
      const html = renderHelpHtml();
      for (const w of ws) {
        expect(html).toContain(`${w.redirectHeightMs}ms`);
        expect(html).toContain(`${w.guardShiftMs}ms`);
      }
    });
  });
});
