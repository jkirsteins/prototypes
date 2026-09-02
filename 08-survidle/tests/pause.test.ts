import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, herePile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { deserialize, serialize } from "../src/sim/save";
import { check, pausedList, startTask, stepTask, stopTask } from "../src/sim/tasks";
import { taskHtml } from "../src/ui/panels";
import { resetPanels, setPanel } from "../src/ui/render";

type G = ReturnType<typeof newGame>;
function run(g: G, minutes: number) {
  const rng = new Rng(1);
  for (let m = 0; m < minutes; m++) stepTask(g.state, g.world, calendar(g.state.minute), rng, 1);
}
const cal = calendar(0);

describe("tasks set aside", () => {
  it("a half-felled tree waits in its cell and is finished from the half", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 30);
    stopTask(state, world);
    expect(state.task).toBeNull();
    expect(Object.keys(state.paused)).toHaveLength(1);
    const again = check(state, world, cal, "chop");
    expect(again.resume).toBeCloseTo(0.5, 2);
    expect(again.duration).toBeCloseTo(30, 0);
    startTask(state, world, cal, "chop");
    expect(state.task!.progress).toBeCloseTo(30, 0);
    run(g, 31);
    expect(qty(herePile(state, world), "log")).toBe(4);
    expect(Object.keys(state.paused)).toHaveLength(0);
  });

  it("starting something else sets the current task aside instead of losing it", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 30);
    startTask(state, world, cal, "sticks");
    expect(state.task!.id).toBe("sticks");
    expect(check(state, world, cal, "chop").resume).toBeCloseTo(0.5, 2);
  });

  it("located work belongs to its cell; carried work travels", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    addItem(state.player.pack, "bark", 3);
    startTask(state, world, cal, "chop");
    run(g, 30);
    startTask(state, world, cal, "craft", "cordage");
    run(g, 10);
    stopTask(state, world);
    // Back at camp: the tree is not here, the half-twisted cordage is.
    placeAtSpot(state, world, state.player.region, "camp");
    expect(check(state, world, cal, "chop").resume).toBeUndefined();
    expect(check(state, world, cal, "craft", "cordage").resume).toBeCloseTo(0.5, 2);
    const list = pausedList(state, world, cal);
    const tree = list.find((x) => x.task.id === "chop")!;
    const cord = list.find((x) => x.task.id === "craft")!;
    expect(tree.here).toBe(false);
    expect(tree.option.why).toContain("the forest");
    expect(cord.here).toBe(true);
    expect(cord.option.ok).toBe(true);
  });

  it("rest and sleep keep nothing", () => {
    const g = newGame(3);
    const { state, world } = g;
    startTask(state, world, cal, "rest");
    run(g, 30);
    stopTask(state, world);
    expect(Object.keys(state.paused)).toHaveLength(0);
  });

  it("survives a save", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 15);
    stopTask(state, world);
    const back = deserialize(serialize(state))!;
    expect(Object.values(back.state.paused)[0].fraction).toBeCloseTo(0.25, 2);
  });
});

describe("set aside on screen", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="task"></div>`;
    resetPanels();
  });

  it("lists what is set aside with a resume button when it can be resumed here", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    startTask(state, world, cal, "chop");
    run(g, 30);
    stopTask(state, world);
    setPanel("task", taskHtml(state, world, cal));
    const el = document.querySelector("#task")!;
    expect(el.textContent).toContain("Set aside");
    expect(el.textContent).toContain("Fell a tree");
    expect(el.textContent).toContain("50%");
    expect(el.querySelector('[data-act="task"][data-id="chop"]')).not.toBeNull();
    placeAtSpot(state, world, state.player.region, "camp");
    setPanel("task", taskHtml(state, world, cal));
    expect(document.querySelector('#task [data-act="task"][data-id="chop"]')).toBeNull();
    expect(document.querySelector("#task")!.textContent).toContain("at the forest");
  });
});
