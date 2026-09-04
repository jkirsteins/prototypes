import { describe, expect, it } from "vitest";
import { HORIZON_STAGES, runStage, setSkillLevel, setUpStage } from "../src/sim/horizon";
import { newGame } from "../src/sim/newgame";
import { ordersHere } from "../src/sim/orders";
import { REFERENCE_ORDERS } from "../src/sim/reference";
import { SKILL_IDS, skillLevel } from "../src/sim/skills";

const stage = (id: string) => HORIZON_STAGES.find((s) => s.id === id)!;

describe("the horizon stages", () => {
  it("three stages, each a skill profile with a band in game days", () => {
    expect(HORIZON_STAGES.map((s) => s.id)).toEqual(["manual", "grinds", "keeps"]);
    expect(stage("manual").levels).toEqual({});
    for (const s of SKILL_IDS) expect(stage("grinds").levels[s]).toBe(5);
    expect(stage("keeps").levels).toEqual({ woodcraft: 10, building: 10, foraging: 5, hunting: 5, fishing: 5, crafting: 5 });
    expect(stage("manual").band).toEqual([0, 2]);
    expect(stage("grinds").band).toEqual([1, 2]);
    expect(stage("keeps").band).toEqual([3, 5]);
  });

  it("setSkillLevel puts a skill exactly at a level", () => {
    const { state } = newGame(17);
    setSkillLevel(state, "fishing", 7);
    expect(skillLevel(state, "fishing")).toBe(7);
    setSkillLevel(state, "fishing", 1);
    expect(skillLevel(state, "fishing")).toBe(1);
  });

  it("the manual stage is every want as a once job on a stocked camp", () => {
    const { state, world } = setUpStage(17, stage("manual"));
    const list = ordersHere(state, world);
    expect(list.length).toBe(REFERENCE_ORDERS.length);
    for (const o of list) {
      expect(o.kind).toBe("job");
      expect(o.req.until.kind).toBe("once");
    }
    expect(state.player.tools.some((t) => t.id === "knife")).toBe(true);
  });

  it("the grinds stage has the chop grind, camp-has jobs for the keeps, and no keep", () => {
    const { state, world } = setUpStage(17, stage("grinds"));
    const list = ordersHere(state, world);
    expect(list.some((o) => o.kind === "keep")).toBe(false);
    expect(list.at(-1)).toMatchObject({ kind: "grind", req: { task: "chop" } });
    const fill = list.find((o) => o.req.task === "fill")!;
    expect(fill).toMatchObject({ kind: "job", req: { until: { kind: "campHas", qty: 2 } } });
  });

  it("the keeps stage keeps wood and fire and gives water as a job", () => {
    const { state, world } = setUpStage(17, stage("keeps"));
    const list = ordersHere(state, world);
    expect(list.find((o) => o.req.task === "split")!.kind).toBe("keep");
    expect(list.find((o) => o.req.task === "light")!.kind).toBe("keep");
    expect(list.find((o) => o.req.task === "fill")!.kind).toBe("job");
    expect(list.find((o) => o.req.task === "hunt")!.kind).toBe("job");
  });

  it("a manual camp dies before the six-day cap on seed 17, and inBand agrees with the band", () => {
    const r = runStage(17, stage("manual"), 6);
    expect(r.capped).toBe(false);
    expect(r.cause).not.toBeNull();
    expect(r.inBand).toBe(r.days >= 0 && r.days <= 2);
  });

  it("a capped run reads inBand off the cap, not just the lower bound", () => {
    const manual = runStage(17, stage("manual"), 0);
    expect(manual.capped).toBe(true);
    expect(manual.days).toBe(0);
    expect(manual.inBand).toBe(true);

    const keeps = runStage(17, stage("keeps"), 1);
    expect(keeps.capped).toBe(true);
    expect(keeps.days).toBe(1);
    expect(keeps.inBand).toBe(false);
  });
});
