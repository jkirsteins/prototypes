import { describe, expect, it } from "vitest";
import { createInitialState, getVisibleItems, runCommand } from "./engine";
import type { Command, GameState } from "./types";

function play(state: GameState, command: Command): GameState {
  return runCommand(state, command).state;
}

describe("escape castle game engine", () => {
  it("escapes the coffin tutorial", () => {
    let state = createInitialState();

    expect(state.roomId).toBe("coffin");
    expect(getVisibleItems(state).map((item) => item.id)).toContain("coffin-lid");

    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    expect(getVisibleItems(state).map((item) => item.id)).toContain("loose-nail");

    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Look at", targetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    expect(state.inventory).toContain("brass-plaque");

    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });

    expect(state.roomId).toBe("bedroom");
  });

  it("escapes the bedroom and reaches the corridor", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });

    state = play(state, { verb: "Look at", targetId: "mirror" });
    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    expect(state.inventory).toContain("small-iron-key");

    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Look at", targetId: "wardrobe" });
    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    state = play(state, { verb: "Look at", targetId: "servant-note" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });

    expect(state.roomId).toBe("corridor");
  });

  it("opens the upstairs roof hatch and keeps the basement locked", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });

    state = play(state, { verb: "Open", targetId: "upstairs" });
    state = play(state, { verb: "Look at", targetId: "roof-hatch" });
    state = play(state, { verb: "Use", targetId: "moth-eaten-cloak", secondaryTargetId: "stained-glass" });
    state = play(state, { verb: "Turn", targetId: "moon-dial" });
    state = play(state, { verb: "Pull", targetId: "chain" });
    state = play(state, { verb: "Open", targetId: "roof-hatch" });

    expect(state.flags.roofHatchUnlocked).toBe(true);
    expect(state.log.at(-1)).toContain("cold roof air");

    state = play(state, { verb: "Open", targetId: "downstairs" });
    expect(state.log.at(-1)).toBe("You cannot reach that from here.");
  });

  it("allows entering the downstairs route from the corridor but not opening the basement", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    state = play(state, { verb: "Take", targetId: "loose-nail" });
    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
    state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });
    state = play(state, { verb: "Open", targetId: "downstairs" });

    expect(state.roomId).toBe("downstairs");

    state = play(state, { verb: "Look at", targetId: "keyhole" });
    state = play(state, { verb: "Open", targetId: "basement-door" });

    expect(state.roomId).toBe("downstairs");
    expect(state.log.at(-1)).toBe("The basement door is locked.");
  });
});
