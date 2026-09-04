import { describe, expect, it } from "vitest";
import { gateSkill, giveOrder, GRIND_STAND_IN, NOT_ORDERS, normalizeOrder, orderGate, withinLadder } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { ordersHere } from "../src/sim/orders";
import { levelMinutes, RUNG_LINE, SKILL_IDS, train } from "../src/sim/skills";
import { TASK_IDS, type IntentRequest, type SkillId } from "../src/sim/types";
import { placeAtSpot } from "../src/sim/position";
import { startTask } from "../src/sim/tasks";
import { calendar } from "../src/sim/calendar";
import { Rng } from "../src/rng";

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

describe("the stand-in for a shut kind", () => {
  const keep = req("split", { kind: "campHas", qty: 40 });
  const grind = req("chop", { kind: "forever" });
  const times = req("chop", { kind: "times", n: 3 });
  const once = req("chop", { kind: "once" });

  it("at level 1 everything is a once job", () => {
    const { state } = newGame(3);
    expect(withinLadder(state, keep, "keep")).toEqual({ req: { ...keep, until: { kind: "once" } }, kind: "job" });
    expect(withinLadder(state, grind, "grind")).toEqual({ req: { ...grind, until: { kind: "once" } }, kind: "job" });
    expect(withinLadder(state, times, "job")).toEqual({ req: { ...times, until: { kind: "once" } }, kind: "job" });
    expect(withinLadder(state, once, "job")).toEqual({ req: once, kind: "job" });
  });

  it("at 3 a keep is a camp-has job to the same target and a grind is a five-times job", () => {
    const { state } = newGame(3);
    setLevel(state, "woodcraft", 3);
    expect(withinLadder(state, keep, "keep")).toEqual({ req: keep, kind: "job" });
    expect(withinLadder(state, grind, "grind")).toEqual({ req: { ...grind, until: { kind: "times", n: GRIND_STAND_IN } }, kind: "job" });
    expect(withinLadder(state, times, "job")).toEqual({ req: times, kind: "job" });
    expect(GRIND_STAND_IN).toBe(5);
  });

  it("at 5 a grind is itself and a keep is still a job; at 10 a keep is a keep", () => {
    const { state } = newGame(3);
    setLevel(state, "woodcraft", 5);
    expect(withinLadder(state, grind, "grind")).toEqual({ req: grind, kind: "grind" });
    expect(withinLadder(state, keep, "keep").kind).toBe("job");
    setLevel(state, "woodcraft", 10);
    expect(withinLadder(state, keep, "keep")).toEqual({ req: keep, kind: "keep" });
  });

  it("keep it lit below building 10 is light once", () => {
    const { state } = newGame(3);
    const lit = req("light", { kind: "campHas", qty: 1 });
    expect(withinLadder(state, lit, "keep")).toEqual({ req: { ...lit, until: { kind: "once" } }, kind: "job" });
    setLevel(state, "building", 3);
    expect(withinLadder(state, lit, "keep")).toEqual({ req: { ...lit, until: { kind: "once" } }, kind: "job" });
    setLevel(state, "building", 10);
    expect(withinLadder(state, lit, "keep")).toEqual({ req: lit, kind: "keep" });
  });

  it("the stand-in always passes the gate", () => {
    const { state } = newGame(3);
    for (const l of [1, 3, 5, 10]) {
      setLevel(state, "woodcraft", l);
      for (const [r, k] of [[keep, "keep"], [grind, "grind"], [times, "job"], [once, "job"]] as const) {
        const s = withinLadder(state, r, k);
        expect(orderGate(state, s.req, s.kind), `${k} at ${l}`).toEqual({ ok: true });
      }
    }
  });
});

describe("the rung log lines", () => {
  it("each rung is announced once as the level crosses it, after the level line", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, calendar(state.minute), "sticks", undefined, false, new Rng(1))).toBe(true);
    state.skills.woodcraft.xp = levelMinutes(3) - 1;
    train(state, world, 1);
    const texts = state.log.map((e) => e.text);
    expect(texts).toContain("Woodcraft 3.");
    expect(texts).toContain(RUNG_LINE.job("Woodcraft"));
    expect(texts.indexOf("Woodcraft 3.")).toBeLessThan(texts.indexOf(RUNG_LINE.job("Woodcraft")));
    train(state, world, 1);
    expect(state.log.filter((e) => e.text === RUNG_LINE.job("Woodcraft")).length).toBe(1);
  });

  it("a jump across two rungs announces both", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, calendar(state.minute), "sticks", undefined, false, new Rng(1))).toBe(true);
    state.skills.woodcraft.xp = levelMinutes(3) - 1;
    train(state, world, levelMinutes(5) - levelMinutes(3) + 1);
    const texts = state.log.map((e) => e.text);
    expect(texts).toContain(RUNG_LINE.job("Woodcraft"));
    expect(texts).toContain(RUNG_LINE.grind("Woodcraft"));
    expect(texts).not.toContain(RUNG_LINE.keep("Woodcraft"));
  });

  it("the lines name the kind and the skill", () => {
    expect(RUNG_LINE.job("Woodcraft")).toBe("You know woodcraft well enough to set a task and walk away: jobs with a count or a target from Woodcraft.");
    expect(RUNG_LINE.grind("Fishing")).toBe("Fishing is second nature now: grinds, work that never ends, from Fishing.");
    expect(RUNG_LINE.keep("Building")).toBe("You keep count of building without thinking: keeps from Building.");
  });
});
