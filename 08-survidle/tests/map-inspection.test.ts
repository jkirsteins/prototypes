import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { mapBoardHtml } from "../src/ui/map";
import { board, boardText } from "./board";
import { newUiState } from "../src/ui/render";

describe("map inspection", () => {
  it("has no second visible map inspection readout", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    const html = mapBoardHtml(world, state, newUiState(), cal) + boardText(board(world, state, newUiState(), cal));
    expect(html).not.toContain("map-inspect");
    expect(html).not.toContain("Map: point at");
  });
});
