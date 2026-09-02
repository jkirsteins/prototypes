import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import {
  level, levelMinutes, MASTERY_KEYS, masteryKey, masteryLevel, masteryMinutes, newSkills,
  poolCapacity, SKILL_IDS, skillOf,
} from "../src/sim/skills";

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
