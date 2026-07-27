import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });

  it("has a DOM", () => {
    document.body.innerHTML = "<div id='app'></div>";
    expect(document.querySelector("#app")).not.toBeNull();
  });
});
