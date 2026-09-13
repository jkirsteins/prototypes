import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { activateWildlife, stepWildlife } from "../src/sim/wildlife-agents";
import { siteCamp } from "./siting-helpers";

describe("fire and a torch hold a predator off", () => {
  it("will not attack from the survivor's cell through fire or a carried torch", () => {
    for (const light of ["fire", "torch"] as const) {
      const { state, world } = newGame(79);
      siteCamp(state, world);
      const st = regionState(state, world, state.player.region);
      st.pop.wolf = 4;
      activateWildlife(state, world, new Rng(1));
      const wolf = state.wildlife.subjects.find((s) => s.species === "wolf")!;
      state.wildlife.subjects = [wolf];
      wolf.active!.cell = cellOf(state, world);
      wolf.active!.hunger = 100;
      if (light === "fire") st.fire.lit = true;
      else state.player.torch.lit = true;
      state.minute = 16 * 60;

      stepWildlife(state, world, calendar(state.minute, state.startDoy), new Rng(3), 10, "detailed");
      expect(state.player.health, light).toBe(100);
      expect(state.log.some((entry) => entry.text.includes("Wolves out of the dark")), light).toBe(false);
    }
  });
});
