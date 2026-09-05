import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { awaySeconds, catchUp, deserialize, serialize } from "../src/sim/save";
import { mountAwayDial } from "../src/ui/dial";
import { AWAY_HOURS_DEFAULT, AWAY_HOURS_MAX, GAME_MINUTES_PER_REAL_SECOND } from "../src/units";

describe("the away dial", () => {
  it("is eight hours on a new game and on a save without it, and caps at twenty-four", () => {
    const { state } = newGame(1);
    expect(AWAY_HOURS_DEFAULT).toBe(8);
    expect(AWAY_HOURS_MAX).toBe(24);
    expect(state.awayHours).toBe(8);
    const raw = JSON.parse(serialize(state));
    delete raw.state.awayHours;
    expect(deserialize(JSON.stringify(raw))!.state.awayHours).toBe(8);
  });

  it("awaySeconds is the dial in seconds", () => {
    const { state } = newGame(1);
    expect(awaySeconds(state)).toBe(8 * 3600);
    state.awayHours = 2;
    expect(awaySeconds(state)).toBe(7200);
  });

  it("the catch-up simulates at most the dial's hours, whatever the real time away", () => {
    const { state, world } = newGame(17);
    state.awayHours = 2;
    const from = state.minute;
    catchUp(state, world, 10 * 3600);
    expect(state.minute - from).toBe(2 * 3600 * GAME_MINUTES_PER_REAL_SECOND);
  });

  it("the dial reads the state, writes it on input, and labels the hours", () => {
    const root = document.createElement("div");
    root.innerHTML = `<input type="range" data-away="hours"><b data-away="label"></b>`;
    let hours = 8;
    mountAwayDial(root, () => hours, (h) => { hours = h; });
    const input = root.querySelector<HTMLInputElement>("[data-away=hours]")!;
    const label = root.querySelector<HTMLElement>("[data-away=label]")!;
    expect(input.value).toBe("8");
    expect(input.min).toBe("1");
    expect(input.max).toBe("24");
    expect(label.textContent).toBe("8 hours");
    input.value = "2";
    input.dispatchEvent(new Event("input"));
    expect(hours).toBe(2);
    expect(label.textContent).toBe("2 hours");
    input.value = "1";
    input.dispatchEvent(new Event("input"));
    expect(label.textContent).toBe("1 hour");
  });
});
