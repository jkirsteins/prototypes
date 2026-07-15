import { describe, expect, it } from "vitest";
import { createInitialState, getVisibleItems, runCommand } from "./engine";
import type { Command, GameState } from "./types";

function play(state: GameState, command: Command): GameState {
  return runCommand(state, command).state;
}

function lastLog(state: GameState): string | undefined {
  return state.log[state.log.length - 1];
}

function escapeCoffin(state = createInitialState()): GameState {
  state = play(state, { verb: "Push", targetId: "coffin-lid" });
  state = play(state, { verb: "Look at", targetId: "velvet-lining" });
  state = play(state, { verb: "Take", targetId: "loose-nail" });
  state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });
  state = play(state, { verb: "Use", targetId: "brass-plaque", secondaryTargetId: "hinge" });
  return play(state, { verb: "Push", targetId: "coffin-lid" });
}

function reachCorridor(state = escapeCoffin()): GameState {
  state = play(state, { verb: "Pull", targetId: "bell-pull" });
  return play(state, { verb: "Open", targetId: "locked-door" });
}

function reachUpstairs(state = reachCorridor()): GameState {
  return play(state, { verb: "Open", targetId: "upstairs" });
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
    expect(lastLog(state)).toContain("cold roof air");

    state = play(state, { verb: "Open", targetId: "downstairs" });
    expect(lastLog(state)).toBe("You cannot reach that from here.");
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
    expect(lastLog(state)).toBe("The basement door is locked.");
  });

  it("does not unlock the roof hatch before revealing crescent moonlight", () => {
    let state = reachUpstairs();

    state = play(state, { verb: "Turn", targetId: "moon-dial" });
    state = play(state, { verb: "Pull", targetId: "chain" });

    expect(state.flags.roofHatchUnlocked).toBe(false);
    expect(lastLog(state)).toContain("moonlight");

    state = play(state, { verb: "Open", targetId: "roof-hatch" });

    expect(state.flags.roofHatchUnlocked).toBe(false);
    expect(lastLog(state)).toBe("The roof hatch is still locked by the moon mechanism.");
  });

  it("does not use portable items before they are in inventory", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });

    state = play(state, { verb: "Use", targetId: "loose-nail", secondaryTargetId: "brass-plaque" });

    expect(state.inventory).not.toContain("brass-plaque");
    expect(state.flags.plaqueRemoved).toBe(false);
    expect(lastLog(state)).toBe("You cannot reach that from here.");
  });
});
