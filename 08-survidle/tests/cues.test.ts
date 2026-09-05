import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { type Cue, cue, setCueSink } from "../src/sim/cues";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { fallThrough, startTask, stepTask } from "../src/sim/tasks";

const cal = calendar(0);

describe("cues", () => {
  afterEach(() => setCueSink(null));

  it("reach the sink, and nothing happens without one", () => {
    const got: Cue[] = [];
    cue("arrow");
    setCueSink((c) => got.push(c));
    cue("arrow");
    cue("wolves");
    expect(got).toEqual(["arrow", "wolves"]);
    setCueSink(null);
    cue("arrow");
    expect(got).toHaveLength(2);
  });

  it("a felled tree, a lit fire and a fall through the ice each sound once", () => {
    const got: Cue[] = [];
    setCueSink((c) => got.push(c));
    const { state, world } = newGame(3);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(startTask(state, world, cal, "chop")).toBe(true);
    const rng = new Rng(1);
    for (let i = 0; i < 400 && state.task; i++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(got.filter((c) => c === "treeFalls")).toHaveLength(1);

    placeAtSpot(state, world, state.player.region, "camp");
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100, litres: 0, frozen: false });
    addItem(state.player.pack, "firewood", 5);
    expect(startTask(state, world, cal, "light")).toBe(true);
    for (let i = 0; i < 400 && state.task; i++) stepTask(state, world, calendar(state.minute), rng, 1);
    expect(got.filter((c) => c === "fireCatches")).toHaveLength(st.fire.lit ? 1 : 0);

    // A fall that is survived (rng seeded so the 60% drowning roll misses): find a seed whose first roll is above 0.6.
    let seed = 1;
    while (new Rng(seed).next() < 0.6) seed++;
    fallThrough(state, world, new Rng(seed), st.campCell);
    expect(got.filter((c) => c === "fallThrough")).toHaveLength(1);
  });
});
