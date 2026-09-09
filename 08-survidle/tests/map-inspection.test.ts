import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";

describe("map inspection", () => {
  it("has no second visible map inspection readout", () => {
    const { state, world } = newGame(21);
    const html = mapHtml(world, state, newUiState(), calendar(state.minute, state.startDoy));
    expect(html).not.toContain("map-inspect");
    expect(html).not.toContain("Map: point at");
  });
});
