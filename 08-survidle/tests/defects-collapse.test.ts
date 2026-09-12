import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { SLEEP_AT } from "../src/sim/body";
import { calendar } from "../src/sim/calendar";
import { orderByHand } from "../src/sim/ladder";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { cellAt, regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

const DECEMBER = 342;
const MIDNIGHT = 16 * 60;

describe("the collapse", () => {
  it("blocks the work row, then lets the ranked self-care row rest", () => {
    testAtmosphere({ cloud: 1 });
    const { state, world } = newGame(17, DECEMBER);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const wood = regionAt(world, state.player.region).cells.find((c) => cellAt(world, c).terrain === "pine" || cellAt(world, c).terrain === "spruce");
    placeAt(state, world, wood ?? st.campCell!);
    state.minute = MIDNIGHT;
    const cal = calendar(MIDNIGHT, state.startDoy);

    orderByHand(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(state.intent?.mode).toBe("hand");
    state.player.energy = SLEEP_AT;
    advance(state, world, 1);
    expect(state.intent).toBeNull();
    expect(state.player.collapsed).toBe(true);
    advance(state, world, 1);
    expect(state.intent?.mode).toBe("care");
    // A walk home may stand between the collapse and the rest; what matters is
    // that the self-care row reaches the rest rather than walking for ever.
    for (let i = 0; i < 3000 && state.task?.id !== "rest"; i++) advance(state, world, 1);
    expect(state.task?.id).toBe("rest");
  });
});
