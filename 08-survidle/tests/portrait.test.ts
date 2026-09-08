import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import type { GameState, TaskId } from "../src/sim/types";
import { liveFaceHtml, livePortraitState } from "../src/ui/portrait";

function doing(state: GameState, id: TaskId): void {
  state.task = { id, progress: 0, duration: 60, repeat: false };
}

describe("the live portrait state", () => {
  it("uses the gameplay priority without letting work hide a condition", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(livePortraitState(state, world, cal, 0).expression).toBe("happy");
    doing(state, "chop");
    expect(livePortraitState(state, world, cal, 0).expression).toBe("focused");
    state.player.warmth = 35;
    expect(livePortraitState(state, world, cal, 10).expression).toBe("cold");
    doing(state, "sleep");
    expect(livePortraitState(state, world, cal, 10).expression).toBe("sleep");
    state.dead = { cause: "froze", minute: state.minute };
    expect(livePortraitState(state, world, cal, 10).expression).toBe("dead");
  });

  it("reads hot, hurt, thirst, hunger, exhaustion and sleepiness directly", () => {
    const { state, world } = newGame(23);
    const cal = calendar(state.minute, state.startDoy);
    expect(livePortraitState(state, world, cal, 25).expression).toBe("hot");
    state.player.sick = 30;
    expect(livePortraitState(state, world, cal, 25).expression).toBe("hurt");
    state.player.sick = 0;
    state.player.injured = 30;
    expect(livePortraitState(state, world, cal, 25).expression).toBe("hurt");
    state.player.injured = 0;
    state.player.water = 0.5;
    expect(livePortraitState(state, world, cal, 10).expression).toBe("unhappy");
    state.player.water = 2;
    state.player.kcal = 0;
    expect(livePortraitState(state, world, cal, 10).expression).toBe("unhappy");
    state.player.kcal = 2_000;
    state.player.energy = 10;
    expect(livePortraitState(state, world, cal, 10).expression).toBe("tired");
    state.player.energy = 90;
    state.player.sleepDebt = 100;
    expect(livePortraitState(state, world, cal, 10).expression).toBe("tired");
  });

  it("lights only at a lit camp or with a lit torch", () => {
    const { state, world } = newGame(29);
    const cal = calendar(state.minute, state.startDoy);
    const camp = regionState(state, world, state.player.region);
    camp.fire.lit = true;
    expect(livePortraitState(state, world, cal, 10).firelit).toBe(true);
    state.player.x += 1;
    expect(livePortraitState(state, world, cal, 10).firelit).toBe(false);
    state.player.torch.lit = true;
    expect(livePortraitState(state, world, cal, 10).firelit).toBe(true);
  });

  it("renders stable keyed layers and a split raised brow for focused work", () => {
    const { state, world } = newGame(31);
    doing(state, "chop");
    const cal = calendar(state.minute, state.startDoy);
    const view = livePortraitState(state, world, cal, 0);
    const html = liveFaceHtml(state.survivors[0].person, 64, view);
    expect(html).toContain('data-portrait-signature="0:focused:work:0"');
    expect(html).toContain("is-focused");
    expect(html).toContain("focus-brow-");
    expect(html).toContain('data-portrait-frame="base"');
    expect(html).toContain('data-portrait-frame="focus-raised"');
    expect(html).toContain('data-portrait-frame="blink"');
    expect(html).toContain('data-portrait-frame="flavor"');
  });
});
