/**
 * The night's fire, in the body's own words and within its means.
 *
 * A fire step says why it is taken; a cold body lights only with dry wood
 * enough to keep a fire past the low mark and rests by the coals
 * otherwise; a sleep keeps the word it began with; a thirst the body can
 * answer wakes it.
 */
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { bodyStep, currentNeed, dryWoodForAFire } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { FIRE_LOW_KG } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { THIRSTY_L } from "../src/sim/water";
import { siteCamp } from "./siting-helpers";

function camp(seed = 3) {
  const { state, world } = newGame(seed);
  siteCamp(state, world);
  const st = regionState(state, world, state.player.region);
  placeAt(state, world, st.campCell!);
  siteFor(st, st.campCell!).structures.firePit = true;
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  const p = state.player;
  p.water = 3; p.kcal = 3000; p.energy = 80; p.sleepDebt = 0; p.warmth = 80;
  return { state, world, st, cal: () => calendar(state.minute, state.startDoy), rng: new Rng(1) };
}

describe("the cold need and the woodpile", () => {
  it("rests by the coals with too little dry wood, and lights to warm up with enough", () => {
    const { state, world, st, cal, rng } = camp();
    addItem(pile(state, st.campCell!), "firewood", 1.5);
    st.fire.embers = 120;
    expect(dryWoodForAFire(state, world, st.campCell!)).toBe(false);
    const step = bodyStep(state, world, cal(), rng, "cold");
    expect(step?.id).toBe("rest");
    expect(step?.step).toContain("no dry wood to keep a fire");
    addItem(pile(state, st.campCell!), "firewood", FIRE_LOW_KG);
    expect(dryWoodForAFire(state, world, st.campCell!)).toBe(true);
    const lit = bodyStep(state, world, cal(), rng, "cold");
    expect(lit?.id).toBe("light");
    expect(lit?.step).toBe("lighting the fire to warm up");
  });

  it("names the night's fire for what it is", () => {
    const { state, world, st, cal, rng } = camp();
    addItem(pile(state, st.campCell!), "firewood", 6);
    state.player.sleeping = { collapsed: false };
    expect(bodyStep(state, world, cal(), rng, "sleep")?.step).toBe("lighting the fire before bed");
  });
});

describe("the sleep", () => {
  it("keeps the word it began with past dawn, and a daytime nap is a doze", () => {
    const { state, world, st } = camp();
    addItem(pile(state, st.campCell!), "firewood", 6);
    addItem(pile(state, st.campCell!), "water", 10);
    state.player.sleepDebt = 85;
    while (calendar(state.minute, state.startDoy).hour < 22) state.minute++;
    const words = new Set<string>();
    for (let m = 0; m < 10 * 60; m++) {
      advance(state, world, 1);
      const it = state.intent;
      if (it && it.mode === "care" && state.task?.id === "sleep") words.add(it.step);
    }
    expect([...words]).toEqual(["sleeping"]);
    expect(calendar(state.minute, state.startDoy).hour).toBeGreaterThan(6.5);
  });

  it("is broken by a thirst the body can answer, and resumes after", () => {
    const { state, world, st, cal } = camp();
    addItem(pile(state, st.campCell!), "water", 10);
    state.player.sleeping = { collapsed: false };
    state.player.sleepDebt = 90;
    state.player.water = THIRSTY_L - 0.3;
    expect(currentNeed(state, world, cal())).toBe("thirsty");
    state.player.water = 3;
    expect(currentNeed(state, world, cal())).toBe("sleep");
  });
});
