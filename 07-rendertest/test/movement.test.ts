import { describe, expect, it } from "vitest";
import { WALK_RANGE_M, WALK_SPEED_M_S, createMovement, updateMovement } from "../src/movement";

describe("movement", () => {
  it("starts at the origin, facing right, not moving", () => {
    const m = createMovement();
    expect(m.x).toBe(0);
    expect(m.facing).toBe(1);
    expect(m.moving).toBe(false);
  });

  it("moves right at walk speed while right is held", () => {
    const m = createMovement();
    updateMovement(m, { left: false, right: true }, 0.5);
    expect(m.x).toBeCloseTo(WALK_SPEED_M_S * 0.5);
    expect(m.facing).toBe(1);
    expect(m.moving).toBe(true);
  });

  it("moves left and flips facing while left is held", () => {
    const m = createMovement();
    updateMovement(m, { left: true, right: false }, 0.25);
    expect(m.x).toBeCloseTo(-WALK_SPEED_M_S * 0.25);
    expect(m.facing).toBe(-1);
    expect(m.moving).toBe(true);
  });

  it("keeps the last facing when keys release", () => {
    const m = createMovement();
    updateMovement(m, { left: true, right: false }, 0.1);
    updateMovement(m, { left: false, right: false }, 0.1);
    expect(m.facing).toBe(-1);
    expect(m.moving).toBe(false);
  });

  it("cancels out when both keys are held", () => {
    const m = createMovement();
    updateMovement(m, { left: true, right: true }, 0.5);
    expect(m.x).toBe(0);
    expect(m.moving).toBe(false);
    expect(m.facing).toBe(1);
  });

  it("clamps to the visible walk range on both sides", () => {
    const m = createMovement();
    updateMovement(m, { left: false, right: true }, 60);
    expect(m.x).toBe(WALK_RANGE_M);
    updateMovement(m, { left: true, right: false }, 120);
    expect(m.x).toBe(-WALK_RANGE_M);
  });
});
