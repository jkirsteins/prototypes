import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, freshTool, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { beginTask, check } from "../src/sim/tasks";

describe("hone", () => {
  it("needs a whetstone and refuses a sharp enough axe", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "hone").why).toBe("needs a whetstone");
    state.player.tools.push(freshTool("whetstone"));
    expect(check(state, world, cal, "hone").why).toBe("sharp enough");
    state.player.tools[0].durability = 69;
    expect(check(state, world, cal, "hone").ok).toBe(true);
    state.player.tools = [];
    expect(check(state, world, cal, "hone").why).toBe("no axe");
  });

  it("restores the edge in ten minutes and wears the whetstone one", () => {
    const { state, world } = newGame(17);
    state.player.tools[0].durability = 40;
    state.player.tools.push(freshTool("whetstone"));
    const cal = calendar(state.minute, state.startDoy);
    expect(beginTask(state, world, cal, "hone")).toBe(true);
    expect(state.task!.duration).toBe(10);
    advance(state, world, 10);
    expect(state.player.tools[0].durability).toBe(100);
    expect(state.player.tools[1].durability).toBe(99);
  });

  it("still sharpens on a stone for +30", () => {
    const { state, world } = newGame(17);
    state.player.tools[0].durability = 40;
    addItem(state.player.pack, "stone", 1);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "sharpen").label).toBe("Sharpen the axe on a stone");
    beginTask(state, world, cal, "sharpen");
    advance(state, world, 15);
    expect(state.player.tools[0].durability).toBe(70);
    expect(qty(state.player.pack, "stone")).toBe(0);
  });

  it("makes a whetstone from one stone in thirty minutes with no tool, taken up on the spot", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "stone", 1);
    const cal = calendar(state.minute, state.startDoy);
    const o = check(state, world, cal, "craft", "whetstone");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(30);
    beginTask(state, world, cal, "craft", "whetstone");
    advance(state, world, 30);
    expect(state.player.tools.some((t) => t.id === "whetstone")).toBe(true);
  });
});
