import { describe, expect, test } from "vitest";
import { applyIntent, TICK } from "../src/combat/fighter";
import { MIN_GAP, createDuel, gapOf, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { Duel } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null) {
  const evs = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

function closeTo(d: Duel, gap: number) {
  // Teleport for test setup: keep fighter 1 in place, move fighter 0.
  d.f[0].x = d.f[1].x - gap;
}

describe("attack resolution", () => {
  test("hit: strike inside reach against an idle defender kills", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.rapier);
    closeTo(d, 80); // inside longsword reach 95
    const evs = runMs(d, 3000, "thrust", null);
    expect(evs.some((e) => e.kind === "hit" && e.side === 0)).toBe(true);
    expect(d.over).toBe(true);
    expect(d.winner).toBe(0);
  });

  test("whiff: void opens the distance, attacker recovery is extended, counter lands", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    // 70: inside rapier reach (115); after the void it is 125 (rapier whiffs);
    // one longsword advance brings it to 91, inside longsword reach (95).
    closeTo(d, 70);
    // Fighter 0 (rapier) thrusts; fighter 1 (longsword) voids immediately.
    let evs = runMs(d, TICK, "thrust", "void");
    const t = WEAPONS.rapier.attacks.thrust;
    // run until just past strikeEnd
    evs = evs.concat(runMs(d, t.windup + t.beat + t.strike + 2 * TICK));
    expect(evs.some((e) => e.kind === "whiff" && e.side === 0)).toBe(true);
    expect(d.over).toBe(false);
    // Nachreisen: longsword advances once and thrusts, starting right after its void ends.
    const evs2 = runMs(d, 60, null, "advance");
    const evs3 = runMs(d, 2000, null, "thrust");
    const all = evs.concat(evs2, evs3);
    expect(all.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
    expect(d.winner).toBe(1);
  });

  test("parried: attacker eats the penalty, defender counters (dui tempi)", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.longsword);
    closeTo(d, 90); // inside both reaches
    // Rapier thrusts; longsword parries just before the strike lands.
    const t = WEAPONS.rapier.attacks.thrust;
    let evs = runMs(d, TICK, "thrust", null);
    const landAt = t.windup + t.beat + t.strike;
    const parryAt = landAt - WEAPONS.longsword.parryWindow / 2;
    evs = evs.concat(runMs(d, parryAt - TICK));
    evs = evs.concat(runMs(d, TICK, null, "parry"));
    evs = evs.concat(runMs(d, landAt - parryAt + 2 * TICK));
    expect(evs.some((e) => e.kind === "parried" && e.side === 0)).toBe(true);
    // dui tempi: defender thrusts immediately after the parry resolves
    const evs2 = runMs(d, 2000, null, "thrust");
    expect(evs2.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
  });

  test("mutual strikeEnd on the same tick is a draw", () => {
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    closeTo(d, 80);
    // Symmetric no-tell attacks injected directly so both strikeEnds land
    // on the same tick (a tell-carrying "thrust" intent through tickDuel
    // would make side 1 strike 180ms later than side 0, and side 0's kill
    // would end the duel before side 1 lands).
    applyIntent(d.f[0], "thrust");
    applyIntent(d.f[1], "thrust");
    for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, null, null);
    // identical weapons, same-tick thrusts: both land
    expect(d.over).toBe(true);
    expect(d.winner).toBe("draw");
  });
});

describe("positions", () => {
  test("fighters never overlap closer than MIN_GAP", () => {
    const d = createDuel(WEAPONS.rapier, WEAPONS.rapier);
    for (let i = 0; i < 3000 / TICK; i++) tickDuel(d, "advance", "advance");
    expect(gapOf(d)).toBeGreaterThanOrEqual(MIN_GAP - 0.001);
  });
});
