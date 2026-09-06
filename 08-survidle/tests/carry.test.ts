import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { setSkillLevel } from "../src/sim/horizon";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { CARRY_SHARE, level, levelMinutes } from "../src/sim/skills";
import { skillsHtml } from "../src/ui/panels";
import { regionAt } from "../src/world/gen";

describe("the quarter carry", () => {
  it("a heir lands with a quarter of the ancestor's minutes in every skill, mastery and pool empty, the rung lines and the landing line logged", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "woodcraft", 12);
    setSkillLevel(state, "hunting", 5);
    state.skills.woodcraft.mastery["chop:spruce"] = 600;
    state.skills.woodcraft.pool = 600;
    advance(state, world, 60);
    die(state, "froze", regionAt(world, state.player.region).name);
    const ancestor = current(state);
    expect(ancestor.skills!.woodcraft).toBeGreaterThanOrEqual(levelMinutes(12));
    beginAgain(state, world);
    land(state, world);
    expect(CARRY_SHARE).toBe(0.25);
    expect(state.skills.woodcraft.xp).toBeCloseTo(ancestor.skills!.woodcraft! * CARRY_SHARE, 6);
    expect(state.skills.hunting.xp).toBeCloseTo(ancestor.skills!.hunting! * CARRY_SHARE, 6);
    expect(state.skills.woodcraft.carried).toBeCloseTo(state.skills.woodcraft.xp, 6);
    expect(state.skills.woodcraft.mastery).toEqual({});
    expect(state.skills.woodcraft.pool).toBe(0);
    // A quarter of level 12's 14,520 minutes is 3,630: level 6, so jobs and grinds from birth.
    expect(level(state.skills.woodcraft.xp)).toBe(6);
    const text = state.log.map((l) => l.text).join("\n");
    expect(text).toContain("a quarter of what");
    expect(text).toContain("Woodcraft 6");
    expect(text).toContain("jobs with a count or a target from Woodcraft");
    expect(text).toContain("grinds, work that never ends, from Woodcraft");
    expect(skillsHtml(state)).toContain("carried from");
  });

  it("a first survivor carries nothing", () => {
    const { state } = newGame(19);
    expect(state.skills.woodcraft.xp).toBe(0);
    expect(state.skills.woodcraft.carried).toBeUndefined();
  });
});
