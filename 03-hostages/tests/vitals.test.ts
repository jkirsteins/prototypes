import { describe, it, expect } from "vitest";
import { snapshot, diff, lines } from "../src/vitals";
import { newRun, chooseOpening } from "../src/game";

function started() {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return state;
}

describe("snapshot", () => {
  it("captures every tracked field from the state", () => {
    const state = started();
    state.player.willpower = 5;
    state.convict.distracted = 2;
    state.secretsRemaining = ["secretSafe"];
    const v = snapshot(state);
    expect(v).toEqual({
      playerWill: 5,
      playerVigor: state.player.vigor,
      wifeVigor: state.wife.vigor,
      convictWill: state.convict.willpower,
      convictVigor: state.convict.vigor,
      distracted: 2,
      secretsLeft: 1,
      bound: state.player.bound,
      toppled: false,
      weaponDown: false,
      offBalance: false,
      incapacitated: false,
      zone: "livingRoom",
      range: state.scene.range,
    });
  });

  it("does not alias the state - later mutation leaves the snapshot alone", () => {
    const state = started();
    const v = snapshot(state);
    state.player.vigor -= 3;
    expect(v.playerVigor).toBe(state.player.vigor + 3);
  });
});

describe("diff", () => {
  it("is empty when nothing moved", () => {
    const state = started();
    expect(diff(snapshot(state), snapshot(state))).toEqual([]);
  });

  it("reports numeric changes with from and to", () => {
    const state = started();
    const before = snapshot(state);
    state.player.vigor -= 2;
    state.wife.vigor -= 1;
    const changes = diff(before, snapshot(state));
    expect(changes).toContainEqual({
      field: "playerVigor",
      from: before.playerVigor,
      to: before.playerVigor - 2,
    });
    expect(changes).toContainEqual({
      field: "wifeVigor",
      from: before.wifeVigor,
      to: before.wifeVigor - 1,
    });
  });

  it("reports boolean and enum changes", () => {
    const state = started();
    const before = snapshot(state);
    state.player.bound = !before.bound;
    state.scene.zone = "bedroom";
    const changes = diff(before, snapshot(state));
    expect(changes).toContainEqual({ field: "bound", from: before.bound, to: !before.bound });
    expect(changes).toContainEqual({ field: "zone", from: "livingRoom", to: "bedroom" });
  });

  it("returns changes in a stable declared order, not object key order", () => {
    const state = started();
    const before = snapshot(state);
    state.scene.range = before.range === "near" ? "away" : "near";
    state.player.vigor -= 1;
    state.convict.willpower -= 1;
    const fields = diff(before, snapshot(state)).map((c) => c.field);
    expect(fields).toEqual(["playerVigor", "convictWill", "range"]);
  });
});

describe("lines", () => {
  it("phrases numeric changes with an arrow", () => {
    expect(lines([{ field: "playerVigor", from: 6, to: 4 }])).toEqual(["Your vigor 6 -> 4"]);
    expect(lines([{ field: "wifeVigor", from: 4, to: 2 }])).toEqual(["Her vigor 4 -> 2"]);
    expect(lines([{ field: "convictVigor", from: 3, to: 0 }])).toEqual(["His vigor 3 -> 0"]);
  });

  it("phrases boolean changes as prose in both directions", () => {
    expect(lines([{ field: "bound", from: true, to: false }])).toEqual(["Your hands are free"]);
    expect(lines([{ field: "bound", from: false, to: true }])).toEqual(["You are bound"]);
    expect(lines([{ field: "incapacitated", from: false, to: true }])).toEqual(["He is down"]);
    expect(lines([{ field: "incapacitated", from: true, to: false }])).toEqual([
      "He is back on his feet",
    ]);
  });

  it("phrases distraction by its new value, and its loss as prose", () => {
    expect(lines([{ field: "distracted", from: 0, to: 2 }])).toEqual(["He is distracted (2)"]);
    expect(lines([{ field: "distracted", from: 1, to: 0 }])).toEqual(["He shakes it off"]);
  });

  it("phrases scene changes", () => {
    expect(lines([{ field: "zone", from: "livingRoom", to: "bedroom" }])).toEqual([
      "You are in the bedroom",
    ]);
    expect(lines([{ field: "range", from: "away", to: "near" }])).toEqual(["He is close"]);
  });

  it("contains no em dashes or unicode arrows", () => {
    const all = lines([
      { field: "playerVigor", from: 6, to: 4 },
      { field: "zone", from: "livingRoom", to: "bedroom" },
    ]).join(" ");
    expect(all).not.toMatch(/[—→←…•]/);
  });
});
