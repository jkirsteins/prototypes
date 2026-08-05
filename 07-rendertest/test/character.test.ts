import { describe, expect, it } from "vitest";
import { MODELS, pickModel } from "../src/character";

describe("pickModel", () => {
  it("defaults to the knight", () => {
    expect(pickModel("")).toBe(MODELS.knight);
  });

  it("selects a named model", () => {
    expect(pickModel("?model=xbot")).toBe(MODELS.xbot);
  });

  it("falls back to the default on unknown names", () => {
    expect(pickModel("?model=nope")).toBe(MODELS.knight);
  });
});
