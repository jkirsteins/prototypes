import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { addItem, hasTool, qty, tool } from "../src/sim/inventory";
import { placeAtSpot } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import {
  craftSuccess, gap, injuryChance, level, levelMinutes, MASTERY_KEYS, masteryKey, masteryLevel,
  masteryMinutes, newSkills, poolCapacity, SKILL_IDS, skillOf, skillLevel, speedFactor, wearFactor,
} from "../src/sim/skills";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { huntOdds, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { workSpeed } from "../src/sim/player";
import { regionDensity } from "../src/sim/animals";

describe("skill curves", () => {
  it("skill level is hours squared: 1 at 0, 2 at 2 h, 10 at 162 h, capped at 50", () => {
    expect(level(0)).toBe(1);
    expect(level(119)).toBe(1);
    expect(level(120)).toBe(2);
    expect(level(9720)).toBe(10);
    expect(level(9719)).toBe(9);
    expect(level(1e9)).toBe(50);
    expect(levelMinutes(10)).toBe(9720);
  });

  it("mastery level is a gentler curve: 20 at 90.25 h, capped at 99", () => {
    expect(masteryLevel(0)).toBe(1);
    expect(masteryLevel(5415)).toBe(20);
    expect(masteryLevel(5414)).toBe(19);
    expect(masteryLevel(1e9)).toBe(99);
    expect(masteryMinutes(20)).toBe(5415);
  });

  it("a pool holds 100 hours per mastery key", () => {
    expect(poolCapacity("fishing")).toBe(6000);
    expect(poolCapacity("woodcraft")).toBe(6 * 6000);
    expect(MASTERY_KEYS.hunting).toEqual(["hunt:hare", "hunt:grouse", "hunt:deer", "hunt:elk", "snare"]);
    expect(MASTERY_KEYS.crafting).toContain("craft:hideBlanket");
    expect(MASTERY_KEYS.building).toContain("build:boughBed");
    expect(MASTERY_KEYS.building).not.toContain("build:snare");
  });
});

describe("what trains what", () => {
  it("maps every task to a skill and a mastery key, and walks to nothing", () => {
    const { state, world } = newGame(3);
    expect(skillOf("chop")).toBe("woodcraft");
    expect(skillOf("build", "snare")).toBe("hunting");
    expect(skillOf("build", "cabin")).toBe("building");
    expect(skillOf("cook")).toBe("building");
    expect(skillOf("walk")).toBeNull();
    expect(skillOf("sleep")).toBeNull();
    placeAtSpot(state, world, state.player.region, "forest");
    expect(masteryKey(state, world, "chop")).toMatch(/^chop:(spruce|pine|birch)$/);
    expect(masteryKey(state, world, "hunt", "elk")).toBe("hunt:elk");
    expect(masteryKey(state, world, "build", "snare")).toBe("snare");
    expect(masteryKey(state, world, "cook")).toBe("cook:rawMeat");
    expect(masteryKey(state, world, "walk", "spot:camp")).toBeNull();
  });

  it("a fresh run has every skill at zero, and an old save is filled the same way", () => {
    const { state } = newGame(3);
    for (const id of SKILL_IDS) expect(state.skills[id]).toEqual({ xp: 0, mastery: {}, pool: 0 });
    const raw = JSON.parse(serialize(state, 1));
    delete raw.state.skills;
    const file = deserialize(JSON.stringify(raw));
    expect(file!.state.skills).toEqual(newSkills());
  });
});

type G = ReturnType<typeof newGame>;
function run(g: G, minutes: number) {
  const rng = new Rng(1);
  for (let m = 0; m < minutes; m++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("training", () => {
  it("an hour of felling is an hour of Woodcraft, of that tree kind, and of the pool", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    startTask(state, world, cal, "chop");
    run(g, 30);
    expect(state.skills.woodcraft.xp).toBe(30);
    expect(state.skills.woodcraft.mastery[key]).toBe(30);
    expect(state.skills.woodcraft.pool).toBe(30);
    expect(state.skills.hunting.xp).toBe(0);
  });

  it("walking trains nothing", () => {
    const g = newGame(3);
    const { state, world } = g;
    startTask(state, world, cal, "walk", "spot:forest");
    run(g, 5);
    for (const id of SKILL_IDS) expect(state.skills[id].xp).toBe(0);
  });

  it("a felling set aside keeps the minutes it earned", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 20);
    stopTask(state, world);
    expect(state.skills.woodcraft.xp).toBe(20);
  });

  it("logs the level-up as the hours cross", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.skills.woodcraft.xp = 119;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 2);
    expect(skillLevel(state, "woodcraft")).toBe(2);
    expect(state.log.filter((e) => e.text === "Woodcraft 2.")).toHaveLength(1);
  });

  it("the pool stops at capacity", () => {
    const g = newGame(4);
    const { state, world } = g;
    state.skills.fishing.pool = 6000 - 1;
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.tools.push({ id: "fishingSpear", durability: 100 });
    startTask(state, world, cal, "fish");
    run(g, 5);
    expect(state.skills.fishing.pool).toBe(6000);
  });
});

describe("effects", () => {
  it("Woodcraft 11 fells 10% faster than Woodcraft 1", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const slow = workSpeed(state, world);
    state.skills.woodcraft.xp = levelMinutes(11);
    expect(workSpeed(state, world)).toBeCloseTo(slow * 1.1, 6);
  });

  it("Hunting 11 has 10% better odds; Fishing reads its own skill", () => {
    const { state, world } = newGame(3);
    const d = regionDensity(state, world, state.player.region, "hare", cal);
    const base = huntOdds(state, world, cal, d, "hare");
    state.skills.hunting.xp = levelMinutes(11);
    expect(huntOdds(state, world, cal, d, "hare")).toBeCloseTo(base * 1.1, 6);
    const df = regionDensity(state, world, state.player.region, "fish", cal);
    const fish = huntOdds(state, world, cal, df, "fish");
    state.skills.fishing.xp = levelMinutes(11);
    expect(huntOdds(state, world, cal, df, "fish")).toBeCloseTo(fish * 1.1, 6);
  });

  it("Crafting 11 wears the needle 10% less", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(state.player.pack, "hide", 2);
    for (const g2 of state.player.clothing) g2.durability = 50;
    state.skills.crafting.xp = levelMinutes(11);
    startTask(state, world, cal, "repair");
    run(g, 400);
    expect(state.task).toBeNull();
    // Mending wears the needle by 2 at Crafting 1; 1.8 here.
    expect(tool(state.player, "needle")!.durability).toBeCloseTo(98.2, 6);
  });

  it("mastery adds a quarter percent per level on that action alone", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const key = masteryKey(state, world, "chop")!;
    state.skills.woodcraft.mastery[key] = masteryMinutes(41);
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.1, 6);
    expect(speedFactor(state, world, "sticks")).toBeCloseTo(1, 6);
  });

  it("pool checkpoints: 10% gives x1.05, 50% replaces it with x1.10, 25% halves wear, 95% ends it", () => {
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    const cap = poolCapacity("woodcraft");
    state.skills.woodcraft.pool = cap * 0.1;
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.05, 6);
    state.skills.woodcraft.pool = cap * 0.5;
    expect(speedFactor(state, world, "chop")).toBeCloseTo(1.1, 6);
    state.skills.woodcraft.pool = cap * 0.25;
    expect(wearFactor(state, world, "chop")).toBeCloseTo(0.5, 6);
    state.skills.woodcraft.pool = cap * 0.95;
    expect(wearFactor(state, world, "chop")).toBe(0);
  });
});

describe("soft gates", () => {
  it("elk at Hunting 1 is one try in 128 of the base odds", () => {
    const { state, world } = newGame(3);
    expect(gap(state, "hunt:elk")).toBe(7);
    const d = regionDensity(state, world, state.player.region, "elk", cal);
    state.skills.hunting.xp = levelMinutes(8);
    const atLevel = huntOdds(state, world, cal, d, "elk");
    state.skills.hunting.xp = 0;
    expect(huntOdds(state, world, cal, d, "elk")).toBeCloseTo((atLevel / 1.07) / 128, 9);
  });

  it("a cabin at Building 4 goes at 1 / 1.3^6 of the pace", () => {
    const { state, world } = newGame(3);
    state.skills.building.xp = levelMinutes(4);
    expect(speedFactor(state, world, "build", "cabin")).toBeCloseTo(1.03 / 1.3 ** 6, 6);
    state.skills.building.xp = levelMinutes(10);
    expect(speedFactor(state, world, "build", "cabin")).toBeCloseTo(1.09, 6);
  });
});

describe("backfire under level", () => {
  it("elk at Hunting 1 hurts you 85% of the time; deer at Hunting 2, 20%", () => {
    const { state } = newGame(3);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.85, 9);
    state.skills.hunting.xp = levelMinutes(2);
    expect(injuryChance(state, "deer")).toBeCloseTo(0.2, 9);
    state.skills.hunting.xp = levelMinutes(8);
    expect(injuryChance(state, "elk")).toBeCloseTo(0.15, 9);
    expect(injuryChance(state, "hare")).toBe(0);
  });

  it("a bow at Crafting 1 comes out one time in 16; a failure spoils half the materials", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(craftSuccess(state, "bow")).toBeCloseTo(1 / 16, 9);
    state.player.tools.push({ id: "knife", durability: 100 });
    addItem(state.player.pack, "log", 1);
    addItem(state.player.pack, "cordage", 3);
    startTask(state, world, cal, "craft", "bow");
    // Seed 1's first roll in run() is above 1/16, so this attempt fails.
    run(g, 400);
    expect(state.task).toBeNull();
    expect(hasTool(state.player, "bow")).toBe(false);
    expect(qty(state.player.pack, "log")).toBe(0);
    expect(qty(state.player.pack, "cordage")).toBe(2);
    expect(state.log.some((e) => e.text.startsWith("The bow is spoiled"))).toBe(true);
  });
});
