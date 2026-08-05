import { describe, expect, it } from "vitest";
import { MODELS, pickModel } from "../src/character";

describe("pickModel", () => {
  it("defaults to the xbot", () => {
    expect(pickModel("")).toBe(MODELS.xbot);
  });

  it("selects a named model", () => {
    expect(pickModel("?model=knight")).toBe(MODELS.knight);
  });

  it("falls back to the default on unknown names", () => {
    expect(pickModel("?model=nope")).toBe(MODELS.xbot);
  });
});
