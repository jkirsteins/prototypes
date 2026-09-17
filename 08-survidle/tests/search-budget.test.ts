import { afterEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import * as intent from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { doHtml } from "../src/ui/dopanel";
import { newUiState } from "../src/ui/render";

afterEach(() => vi.restoreAllMocks());

describe("search construction budget", () => {
  it("routes only concept members, not every action, for a dark concept search", () => {
    const { state, world } = newGame(21);
    const ui = { ...newUiState(), filter: "kw:dark" };
    const build = vi.spyOn(intent, "intentOption");
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), ui);
    expect(html).toContain("torch");
    expect(build.mock.calls.length).toBeLessThanOrEqual(2);
    expect(build.mock.calls.length).toBeGreaterThan(0);
  });

  it("does not construct routes for an unknown concept", () => {
    const { state, world } = newGame(21);
    const build = vi.spyOn(intent, "intentOption");
    const html = doHtml(state, world, calendar(state.minute, state.startDoy), { ...newUiState(), filter: "kw:nonexistent" });
    expect(html).toContain("nothing answers");
    expect(build.mock.calls).toHaveLength(0);
  });
});
