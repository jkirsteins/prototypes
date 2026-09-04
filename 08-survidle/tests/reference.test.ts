import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { ordersHere } from "../src/sim/orders";
import { OPENING_TICK_MINUTES, passesGate, REFERENCE_ORDERS, REFERENCE_TARGET_DAY, ReferencePlayer, setUpReference, stepReference, weekLines } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { levelMinutes } from "../src/sim/skills";

describe("the reference player", () => {
  it("at level 1 the first tick gives every want as a once job, ranked as the list", () => {
    const { state, world, player } = setUpReference(17);
    expect(ordersHere(state, world)).toEqual([]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    list.forEach((o, i) => {
      expect(o.kind, `order ${i + 1}`).toBe("job");
      expect(o.req.until.kind, `order ${i + 1}`).toBe("once");
      expect(o.req.task, `order ${i + 1}`).toBe(REFERENCE_ORDERS[i].req.task);
    });
  });

  it("the knife, fire drill, fishing spear and bow are made once; the axe keep stays, for the spare", () => {
    for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) {
      const o = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === id)!;
      expect(o.kind, id).toBe("job");
      expect(o.req.until.kind, id).toBe("once");
    }
    const axe = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === "axe")!;
    expect(axe.kind).toBe("keep");
  });

  // Cordage needs bark (see RECIPES), so the want that feeds it is bark.
  it("a want whose stand-in dropped off is given again while unmet, and a finished true job is not", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "bark", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "craft", until: { kind: "once" }, arg: "cordage", deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    player.tick(state, world);
    expect(ordersHere(state, world).map((o) => o.req.task)).toEqual(["bark", "craft"]);
    // The stand-ins run to completion and drop off.
    stepReference({ state, world, player }, 6 * 60);
    // The bark keep is unmet while camp has under half of 10, so it is standing again; the cordage job finished and is not.
    const tasks = ordersHere(state, world).map((o) => o.req.task);
    expect(tasks.filter((t) => t === "craft")).toEqual([]);
    const st = regionState(state, world, state.player.region);
    const have = qty(pile(state, st.campCell), "bark");
    if (have < 5) expect(tasks).toContain("bark");
    else expect(tasks).not.toContain("bark");
  });

  it("a times want counts its stand-ins' units: given exactly twice at woodcraft 1, and once as itself at woodcraft 3", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "times", n: 2 }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    const seen = new Set<number>();
    for (let h = 0; h < 6; h++) {
      player.tick(state, world);
      for (const o of ordersHere(state, world)) if (o.req.task === "sticks") seen.add(o.id);
      advance(state, world, 60);
    }
    // Two once-job stand-ins, never a third: their units add up to the want's n:2.
    expect(seen.size).toBe(2);
    expect(ordersHere(state, world).some((o) => o.req.task === "sticks")).toBe(false);

    const at3 = newGame(17);
    at3.state.skills.woodcraft.xp = levelMinutes(3);
    const player3 = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "times", n: 2 }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    player3.tick(at3.state, at3.world);
    const first = ordersHere(at3.state, at3.world);
    expect(first.length).toBe(1);
    expect(first[0].kind).toBe("job");
    expect(first[0].req.until).toEqual({ kind: "times", n: 2 });
    for (let h = 0; h < 6; h++) {
      player3.tick(at3.state, at3.world);
      advance(at3.state, at3.world, 60);
    }
    expect(ordersHere(at3.state, at3.world).length).toBe(0);
  });

  it("a times want that reaches its rung mid-count keeps only its remainder, not a fresh n", () => {
    const { state, world } = newGame(17);
    const player = new ReferencePlayer([
      { req: { task: "sticks", until: { kind: "times", n: 3 }, deliver: "camp", where: "nearest" }, kind: "job" },
    ]);
    const seen = new Set<number>();
    for (let h = 0; h < 2; h++) {
      player.tick(state, world);
      for (const o of ordersHere(state, world)) if (o.req.task === "sticks") seen.add(o.id);
      advance(state, world, 60);
    }
    // Two once-job stand-ins complete before the skill reaches the rung.
    expect(seen.size).toBe(2);

    state.skills.woodcraft.xp = levelMinutes(3);
    player.tick(state, world);
    const standing = ordersHere(state, world).find((o) => o.req.task === "sticks")!;
    expect(standing.kind).toBe("job");
    expect(standing.req.until).toEqual({ kind: "times", n: 1 });
  });

  it("the stand-in follows the level: a keep given at woodcraft 10 is a keep, ranked where the want sits", () => {
    const { state, world } = newGame(17);
    state.skills.woodcraft.xp = levelMinutes(10);
    const player = new ReferencePlayer([
      { req: { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, kind: "keep" },
      { req: { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, kind: "keep" },
    ]);
    player.tick(state, world);
    const list = ordersHere(state, world);
    expect(list.map((o) => [o.req.task, o.kind])).toEqual([["fill", "job"], ["split", "keep"]]);
    expect(list[0].req.until.kind).toBe("once");
  });

  it("holds three days on seed 17 with the player ticking hourly, and has water at camp", () => {
    const ref = setUpReference(17);
    stepReference(ref, 3 * 1440);
    expect(ref.state.dead).toBeNull();
    const camp = pile(ref.state, regionState(ref.state, ref.world, ref.state.player.region).campCell);
    expect(qty(camp, "water") + qty(camp, "ice")).toBeGreaterThan(0);
    expect(calendar(ref.state.minute).day).toBe(4);
    expect(OPENING_TICK_MINUTES).toBe(60);
  });

  it("the gate passes a seed alive on day 21 and fails one that dies on day 20", () => {
    expect(passesGate(null, REFERENCE_TARGET_DAY)).toBe(true);
    expect(passesGate(22, REFERENCE_TARGET_DAY)).toBe(true);
    expect(passesGate(20, REFERENCE_TARGET_DAY)).toBe(false);
  });

  it("the gate's boundary is exact: a death on day 21 fails, a death on day 22 passes", () => {
    expect(passesGate(21, REFERENCE_TARGET_DAY)).toBe(false);
    expect(passesGate(22, REFERENCE_TARGET_DAY)).toBe(true);
  });

  it("a checkpoint carries the week before it, and weekLines reads it against the table", () => {
    const week = { days: 7, yield: { fish: 310, snare: 0, hunt: 0, berries: 0, kit: 0 }, eaten: 290, burn: { base: 1680, activity: 620, walk: 640, cold: 200, sick: 0 }, sleepMin: 504, workMin: 672 };
    const lines = weekLines(week, 115);
    expect(lines[0]).toContain("fish 310 (in band)");
    expect(lines[0]).toContain("kit 0");
    expect(lines[0]).toContain("vs April");
    expect(lines[1]).toContain("eaten/day 290");
    expect(lines[1]).toContain("net +20");
    expect(lines[2]).toContain("burn/day 3140 (in band)");
    expect(lines[2]).toContain("work 1260 (in band");
    expect(lines[2]).toContain("cold 200 (in band)");
    expect(lines[3]).toContain("sleep/day 8.4 h (in band)");
    expect(lines[3]).toContain("work/day 11.2 h");
    const none = weekLines({ ...week, days: 0 }, 115);
    expect(none[0]).toContain("no full day yet");
  });
});
