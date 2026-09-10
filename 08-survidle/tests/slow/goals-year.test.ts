const SEASON_KEYS = ["season:spring", "season:summer", "season:autumn", "season:winter"] as const;
/**
 * A full simulated year, the reference survivor's own machinery: real
 * minutes, real weather, real deaths and heirs where they fall. Cheap to
 * synthesize the four season deeds by hand (tests/goals.test.ts does, for
 * the ladder's own shape); the thing worth a slow test is that a lived-in
 * year actually earns them in the order they arrive, through however many
 * lives it takes. Real wall-clock time, so it sits behind `npm run
 * test:slow` rather than taxing every commit, the way tests/slow/lineage
 * .test.ts already does for the same reference machinery.
 */
import { describe, expect, it } from "vitest";
import { OPPORTUNITIES } from "../../src/sim/opportunities";
import { setSkillLevel } from "../../src/sim/horizon";
import { addItem, pile } from "../../src/sim/inventory";
import { beginAgain, land } from "../../src/sim/landing";
import { medianPerson } from "../../src/sim/person";
import { measure, setUpReference } from "../../src/sim/reference";
import { SKILL_IDS } from "../../src/sim/skills";
import { regionState } from "../../src/sim/regionstate";

describe("the seasonal tail over a real year", () => {
  it("clears all four seasons in arrival order, through however many lives it takes", () => {
    // Kitted and skilled, the same reference survivor the year gate uses: a
    // bare arrival kit dies too fast to ever be alive when a season turns.
    const ref = setUpReference(17, true);
    const { state, world } = ref;
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    addItem(camp, "driedMeat", 500);
    addItem(camp, "fat", 100);
    addItem(camp, "firewood", 5000);
    addItem(camp, "water", 500);
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    // This probe starts at the seasonal tail. The headless reference runner
    // has no goal modal to introduce authored lessons, and those lessons now
    // include deliberate field-weather activity that the order list cannot
    // stand in for. Their own focused tests exercise those outcomes.
    for (const goal of OPPORTUNITIES) {
      if (!(SEASON_KEYS as readonly string[]).includes(goal.key)) state.opportunities.completedAt[goal.key] = 0;
    }
    for (let life = 0; life < 6; life++) {
      measure(ref, 400);
      if (SEASON_KEYS.every((id) => state.opportunities.completedAt[id] !== undefined)) break;
      if (!state.dead) break;
      beginAgain(state, world);
      land(state, world, undefined, medianPerson(state.landing!.candidates[0].person.sex));
    }
    // The queue records every completion in the order recordOpportunityEvent reached it,
    // season and worked goal alike; filtering it for the four seasons is the
    // arrival order itself, not a reconstruction of it. Landed in spring, so
    // spring is already under way and is the last of the four to be earned,
    // a full year after the three that come round before it.
    const order = state.opportunities.notices.flatMap((notice) => notice.completed).filter((id) => (SEASON_KEYS as readonly string[]).includes(id));
    expect(order).toEqual(["season:summer", "season:autumn", "season:winter", "season:spring"]);
  }, 120000);
});
