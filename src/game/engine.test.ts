import { describe, expect, it } from "vitest";
import { items } from "./content";
import { createInitialState, getVisibleItems, getVisibleRoomItems, runCommand } from "./engine";
import type { Command, GameState } from "./types";

function play(state: GameState, command: Command): GameState {
  return runCommand(state, command).state;
}

function lastLog(state: GameState): string | undefined {
  return state.log[state.log.length - 1];
}

function visibleItemIds(state: GameState): string[] {
  return getVisibleItems(state).map((item) => item.id);
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
  state = play(state, { verb: "Look at", targetId: "bed" });
  state = play(state, { verb: "Open", targetId: "loose-floorboard" });
  state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
  state = play(state, { verb: "Look at", targetId: "wardrobe" });
  state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
  state = play(state, { verb: "Look at", targetId: "servant-note" });
  state = play(state, { verb: "Pull", targetId: "bell-pull" });
  return play(state, { verb: "Open", targetId: "locked-door" });
}

function reachUpstairs(state = reachCorridor()): GameState {
  return play(state, { verb: "Open", targetId: "upstairs" });
}

describe("escape castle game engine", () => {
  it("defines a look description for every item", () => {
    for (const item of Object.values(items)) {
      expect(item.description.trim(), item.id).not.toBe("");
    }
  });

  it("escapes the coffin tutorial", () => {
    let state = createInitialState();

    expect(state.roomId).toBe("coffin");
    expect(getVisibleItems(state).map((item) => item.id)).toContain("coffin-lid");

    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    expect(getVisibleItems(state).map((item) => item.id)).not.toContain("loose-nail");
    expect(getVisibleItems(state).map((item) => item.id)).not.toContain("rosary-bead");

    state = play(state, { verb: "Look at", targetId: "velvet-lining" });
    expect(getVisibleItems(state).map((item) => item.id)).toContain("loose-nail");
    expect(getVisibleItems(state).map((item) => item.id)).toContain("rosary-bead");

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

  it("opens the upstairs roof hatch and reaches the prototype win state", () => {
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
    state = play(state, { verb: "Look at", targetId: "servant-note" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });

    state = play(state, { verb: "Open", targetId: "upstairs" });
    state = play(state, { verb: "Look at", targetId: "roof-hatch" });
    state = play(state, { verb: "Use", targetId: "moth-eaten-cloak", secondaryTargetId: "stained-glass" });
    state = play(state, { verb: "Turn", targetId: "moon-dial" });
    state = play(state, { verb: "Pull", targetId: "chain" });
    state = play(state, { verb: "Open", targetId: "roof-hatch" });

    expect(state.flags.roofHatchUnlocked).toBe(true);
    expect(state.flags.roofHatchOpen).toBe(true);
    expect(lastLog(state)).toContain("1-800-BUY-A-GAME");

    state = play(state, { verb: "Open", targetId: "roof-hatch" });
    expect(lastLog(state)).toContain("already open");
  });

  it("allows entering the downstairs route from the corridor but not opening the basement", () => {
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
    state = play(state, { verb: "Look at", targetId: "servant-note" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });
    state = play(state, { verb: "Open", targetId: "downstairs" });

    expect(state.roomId).toBe("downstairs");

    state = play(state, { verb: "Look at", targetId: "keyhole" });
    state = play(state, { verb: "Open", targetId: "basement-door" });

    expect(state.roomId).toBe("downstairs");
    expect(lastLog(state)).toBe("The basement door is locked.");
  });

  it("allows backtracking between unlocked rooms so required items remain recoverable", () => {
    let state = escapeCoffin();

    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Look at", targetId: "servant-note" });
    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });
    expect(state.roomId).toBe("corridor");

    state = play(state, { verb: "Open", targetId: "upstairs" });
    expect(state.roomId).toBe("upstairs");

    state = play(state, { verb: "Open", targetId: "branching-corridor" });
    expect(state.roomId).toBe("corridor");

    state = play(state, { verb: "Open", targetId: "guest-chamber" });
    expect(state.roomId).toBe("bedroom");

    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    expect(state.inventory).toContain("moth-eaten-cloak");

    state = play(state, { verb: "Open", targetId: "branching-corridor" });
    state = play(state, { verb: "Open", targetId: "downstairs" });
    expect(state.roomId).toBe("downstairs");

    state = play(state, { verb: "Open", targetId: "branching-corridor" });
    expect(state.roomId).toBe("corridor");
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

  it("keeps inventory items out of room-visible items", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });

    expect(getVisibleRoomItems(state).map((item) => item.id)).toContain("loose-nail");

    state = play(state, { verb: "Take", targetId: "loose-nail" });

    expect(state.inventory).toContain("loose-nail");
    expect(getVisibleRoomItems(state).map((item) => item.id)).not.toContain("loose-nail");
    expect(getVisibleItems(state).map((item) => item.id)).not.toContain("loose-nail");
  });

  it("does not replay one-shot discovery or pickup text after state changes", () => {
    let state = escapeCoffin();

    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    expect(state.inventory).toContain("small-iron-key");

    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    expect(lastLog(state)).toContain("already open");
    expect(lastLog(state)).toContain("empty");

    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    expect(lastLog(state)).toContain("already");

    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    state = play(state, { verb: "Take", targetId: "moth-eaten-cloak" });
    expect(lastLog(state)).toContain("already have");
  });

  it("uses typed flavor responses instead of the global fallback for visible commands", () => {
    let state = reachCorridor();
    state = play(state, { verb: "Open", targetId: "downstairs" });

    for (const item of getVisibleItems(state)) {
      for (const verb of ["Take", "Open", "Push", "Pull", "Turn"] as const) {
        const result = runCommand(state, { verb, targetId: item.id }).result;
        expect(result.message, `${verb} ${item.id}`).not.toBe("That does not seem useful right now.");
      }
    }
  });

  it("uses item descriptions for look actions without bespoke rules", () => {
    let state = createInitialState();
    state = play(state, { verb: "Push", targetId: "coffin-lid" });
    state = play(state, { verb: "Look at", targetId: "velvet-lining" });

    state = play(state, { verb: "Look at", targetId: "rosary-bead" });

    expect(lastLog(state)).toBe(items["rosary-bead"].description);
    expect(lastLog(state)).not.toBe("That does not seem useful right now.");
  });

  it("describes wardrobe contents only after using the key", () => {
    let state = escapeCoffin();

    state = play(state, { verb: "Look at", targetId: "wardrobe" });

    expect(state.flags.wardrobeOpen).toBe(false);
    expect(lastLog(state)).toContain("locked");
    expect(visibleItemIds(state)).not.toContain("moth-eaten-cloak");
    expect(visibleItemIds(state)).not.toContain("servant-note");

    state = play(state, { verb: "Look at", targetId: "bed" });
    state = play(state, { verb: "Open", targetId: "loose-floorboard" });
    state = play(state, { verb: "Use", targetId: "small-iron-key", secondaryTargetId: "wardrobe" });
    state = play(state, { verb: "Look at", targetId: "wardrobe" });

    expect(state.flags.wardrobeOpen).toBe(true);
    expect(lastLog(state)).toContain("moth-eaten cloak");
    expect(lastLog(state)).toContain("servant note");
    expect(visibleItemIds(state)).toContain("moth-eaten-cloak");
    expect(visibleItemIds(state)).toContain("servant-note");
  });

  it("does not release the bedroom latch before reading the servant note", () => {
    let state = escapeCoffin();

    state = play(state, { verb: "Pull", targetId: "bell-pull" });
    state = play(state, { verb: "Open", targetId: "locked-door" });

    expect(state.roomId).toBe("bedroom");
    expect(state.flags.doorUnlatched).toBe(false);
    expect(lastLog(state)).toBe("The locked door will not budge.");
  });
});
