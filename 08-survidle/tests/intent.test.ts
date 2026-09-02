import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";
import { check } from "../src/sim/tasks";

const cal = calendar(0);

describe("the intent record", () => {
  it("a new game has no intent", () => {
    const { state } = newGame(3);
    expect(state.intent).toBeNull();
  });

  it("a save that still carries a plan loads with no plan and no intent", () => {
    const { state } = newGame(3);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.intent;
    raw.state.plan = { name: "Haul to camp", steps: [], loop: null, sourceCell: null };
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.intent).toBeNull();
    expect("plan" in file.state).toBe(false);
  });

  it("camping for the night is an option with the bed in its detail", () => {
    const { state, world } = newGame(3);
    const o = check(state, world, cal, "night");
    expect(o.label).toBe("Camp for the night");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain("on bare ground");
  });
});
