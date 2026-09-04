import { describe, expect, it } from "vitest";
import { gateSkill, giveOrder, NOT_ORDERS, normalizeOrder, orderGate } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { ordersHere } from "../src/sim/orders";
import { levelMinutes, SKILL_IDS } from "../src/sim/skills";
import { TASK_IDS, type IntentRequest, type SkillId } from "../src/sim/types";

const req = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string): IntentRequest =>
  ({ task, arg, until, deliver: "camp", where: "nearest" });

function setLevel(state: ReturnType<typeof newGame>["state"], skill: SkillId, l: number): void {
  state.skills[skill].xp = levelMinutes(l);
}

describe("the gate skill", () => {
  it("a task that trains a skill gates on it; haul gates on woodcraft; melt and thaw on building", () => {
    expect(gateSkill("chop")).toBe("woodcraft");
    expect(gateSkill("build", "snare")).toBe("hunting");
    expect(gateSkill("haul")).toBe("woodcraft");
    expect(gateSkill("melt")).toBe("building");
    expect(gateSkill("thaw")).toBe("building");
  });

  it("every task that can be ordered has a gate skill, the way every card has a policy branch", () => {
    for (const id of TASK_IDS) {
      if (NOT_ORDERS.includes(id)) continue;
      expect(gateSkill(id), id).not.toBeNull();
    }
  });

  it("the runner's own steps and the moves are not orders", () => {
    expect(NOT_ORDERS).toEqual(["walk", "travel", "wait", "rest", "sleep", "night"]);
  });
});

describe("the normalised kind", () => {
  it("a keep of something countable stays a keep; a grind is forever", () => {
    expect(normalizeOrder(req("split", { kind: "campHas", qty: 40 }), "keep")).toEqual({ req: req("split", { kind: "campHas", qty: 40 }), kind: "keep" });
    expect(normalizeOrder(req("chop", { kind: "once" }), "grind")).toEqual({ req: req("chop", { kind: "forever" }), kind: "grind" });
  });

  it("a keep or a camp-has of something uncountable is a once job, except keep it lit", () => {
    expect(normalizeOrder(req("build", { kind: "campHas", qty: 1 }, "cabin"), "keep")).toEqual({ req: req("build", { kind: "once" }, "cabin"), kind: "job" });
    expect(normalizeOrder(req("build", { kind: "campHas", qty: 1 }, "cabin"), "job")).toEqual({ req: req("build", { kind: "once" }, "cabin"), kind: "job" });
    expect(normalizeOrder(req("light", { kind: "campHas", qty: 1 }), "keep").kind).toBe("keep");
  });
});

describe("the gate", () => {
  it("a once job is open at level 1 in every skill", () => {
    const { state } = newGame(3);
    expect(orderGate(state, req("chop", { kind: "once" }), "job")).toEqual({ ok: true });
    expect(orderGate(state, req("fill", { kind: "once" }), "job")).toEqual({ ok: true });
    expect(orderGate(state, req("hunt", { kind: "once" }, "any"), "job")).toEqual({ ok: true });
  });

  it("jobs with a count or a target at 3, grinds at 5, keeps at 10, per skill", () => {
    const { state } = newGame(3);
    const times = req("chop", { kind: "times", n: 5 });
    const has = req("split", { kind: "campHas", qty: 40 });
    const grind = req("chop", { kind: "forever" });
    expect(orderGate(state, times, "job")).toEqual({ ok: false, why: "jobs at Woodcraft 3, you are 1", skill: "woodcraft", level: 1, at: 3 });
    setLevel(state, "woodcraft", 3);
    expect(orderGate(state, times, "job")).toEqual({ ok: true });
    expect(orderGate(state, has, "job")).toEqual({ ok: true });
    expect(orderGate(state, grind, "grind")).toEqual({ ok: false, why: "grinds at Woodcraft 5, you are 3", skill: "woodcraft", level: 3, at: 5 });
    expect(orderGate(state, has, "keep")).toEqual({ ok: false, why: "keeps at Woodcraft 10, you are 3", skill: "woodcraft", level: 3, at: 10 });
    setLevel(state, "woodcraft", 5);
    expect(orderGate(state, grind, "grind")).toEqual({ ok: true });
    setLevel(state, "woodcraft", 10);
    expect(orderGate(state, has, "keep")).toEqual({ ok: true });
    // another skill is still at 1
    expect(orderGate(state, req("fill", { kind: "campHas", qty: 2 }), "keep").ok).toBe(false);
  });

  it("the gate reads the kind after the fallback: build a cabin as a keep is a once job and open", () => {
    const { state } = newGame(3);
    expect(orderGate(state, req("build", { kind: "campHas", qty: 1 }, "cabin"), "keep")).toEqual({ ok: true });
  });

  it("keep it lit is a keep, gated on building", () => {
    const { state } = newGame(3);
    const g = orderGate(state, req("light", { kind: "campHas", qty: 1 }), "keep");
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.why).toBe("keeps at Building 10, you are 1");
  });

  it("every skill has the same three levels", () => {
    const { state } = newGame(3);
    for (const skill of SKILL_IDS) {
      setLevel(state, skill, 10);
    }
    for (const t of [req("berries", { kind: "campHas", qty: 2 }), req("fish", { kind: "campHas", qty: 1 }, "any"), req("craft", { kind: "campHas", qty: 4 }, "cordage"), req("hang", { kind: "campHas", qty: 10 })]) {
      expect(orderGate(state, t, "keep"), t.task).toEqual({ ok: true });
    }
  });
});

describe("giving an order", () => {
  it("a shut gate throws with the reason and adds nothing", () => {
    const { state, world } = newGame(3);
    expect(() => giveOrder(state, world, req("split", { kind: "campHas", qty: 40 }), "keep")).toThrow("keeps at Woodcraft 10, you are 1");
    expect(ordersHere(state, world)).toEqual([]);
  });

  it("an open gate adds the order at the rank given", () => {
    const { state, world } = newGame(3);
    giveOrder(state, world, req("sticks", { kind: "once" }), "job");
    setLevel(state, "woodcraft", 10);
    const o = giveOrder(state, world, req("split", { kind: "campHas", qty: 40 }), "keep", 0);
    expect(o.kind).toBe("keep");
    expect(ordersHere(state, world).map((x) => x.req.task)).toEqual(["split", "sticks"]);
  });
});
