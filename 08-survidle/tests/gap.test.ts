import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { intentOption } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { SKILL_NAMES } from "../src/sim/skills";
import { withProgression } from "../src/sim/tasks";
import { plain } from "../src/sim/voice";

/** Seed 17's start region holds reindeer (Hunting 6), fox (3) and pike (Fishing 3). */
function row(id: "hunt" | "fish", arg: string, level: number) {
  const { state, world } = newGame(17);
  setSkillLevel(state, id === "hunt" ? "hunting" : "fishing", level);
  const cal = calendar(state.minute, state.startDoy);
  return withProgression(state, world, intentOption(state, world, cal, id, arg, "nearest"));
}

describe("what a row under its level costs", () => {
  it("tells a hunter the odds and the danger, not only the number it wants", () => {
    const o = row("hunt", "reindeer", 1);
    expect(o.recommended?.under).toBe(true);
    expect(plain(o.recommended!.text)).toBe(`${SKILL_NAMES.hunting} 6, you are 1`);
    expect(plain(o.detail!)).toContain("the odds");
    expect(plain(o.detail!)).toContain("turns on you");
  });

  it("tells an angler the odds, and promises no injury that fishing has no rule for", () => {
    const o = row("fish", "pike", 1);
    expect(o.recommended?.under).toBe(true);
    expect(plain(o.recommended!.text)).toBe(`${SKILL_NAMES.fishing} 3, you are 1`);
    expect(plain(o.detail!)).toContain("the odds");
    expect(plain(o.detail!)).not.toContain("turns on you");
  });

  it("names the shortfall in words, and closes the gap as the level climbs", () => {
    // One level short of Hunting 6 halves the odds; four short is a sixteenth.
    expect(plain(row("hunt", "reindeer", 5).detail!)).toContain("half the odds");
    expect(plain(row("hunt", "reindeer", 2).detail!)).toContain("a sixteenth the odds");
  });

  it("says nothing extra once you are at the level", () => {
    const o = row("hunt", "reindeer", 6);
    expect(o.recommended?.under).toBe(false);
    expect(plain(o.recommended!.text)).toBe(`${SKILL_NAMES.hunting} 6`);
    expect(plain(o.detail ?? "")).not.toContain("the odds");
  });

  it("leaves a row with no recommendation alone", () => {
    // The hare wants no level at all, so nothing is promised and nothing warned.
    const o = row("hunt", "hare", 1);
    expect(o.recommended).toBeUndefined();
  });

  it("says nothing about odds for a hunt that names no species", () => {
    const o = row("hunt", "any", 1);
    expect(plain(o.detail ?? "")).not.toContain("the odds");
  });
});
