import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPlate, POP_MS } from "../src/ui/plates";
import { snapshot } from "../src/vitals";
import type { Vitals } from "../src/vitals";
import { newRun, chooseOpening } from "../src/game";

function vitals(over: Partial<Vitals> = {}): Vitals {
  const state = newRun(4);
  chooseOpening(state, "shield");
  return { ...snapshot(state), ...over };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("plate", () => {
  it("labels each side", () => {
    expect(createPlate("convict").root.querySelector(".plate-name")?.textContent).toBe("HIM");
    expect(createPlate("player").root.querySelector(".plate-name")?.textContent).toBe("YOU");
    expect(createPlate("wife").root.querySelector(".plate-name")?.textContent).toBe("HER");
  });

  it("renders his willpower and vigor", () => {
    const plate = createPlate("convict");
    plate.update(vitals({ convictWill: 6, convictVigor: 3 }));
    expect(plate.root.querySelector("[data-stat='convict-will']")?.textContent).toBe("WILL 6");
    expect(plate.root.querySelector("[data-stat='convict-vigor']")?.textContent).toBe("VIG 3");
  });

  it("gives the wife a vigor only, since she has no willpower", () => {
    const plate = createPlate("wife");
    plate.update(vitals({ wifeVigor: 4 }));
    expect(plate.root.querySelector("[data-stat='wife-vigor']")?.textContent).toBe("VIG 4");
    expect(plate.root.querySelector("[data-stat='wife-will']")).toBeNull();
  });

  it("pops a stat that changed and clears the pop after POP_MS", () => {
    const plate = createPlate("player");
    plate.update(vitals({ playerVigor: 6 }));
    const stat = plate.root.querySelector("[data-stat='player-vigor']") as HTMLElement;
    expect(stat.classList.contains("pop")).toBe(false);
    plate.update(vitals({ playerVigor: 4 }));
    expect(stat.classList.contains("pop")).toBe(true);
    vi.advanceTimersByTime(POP_MS + 10);
    expect(stat.classList.contains("pop")).toBe(false);
  });

  it("does not pop a stat that held still", () => {
    const plate = createPlate("player");
    plate.update(vitals({ playerVigor: 6 }));
    plate.update(vitals({ playerVigor: 6 }));
    const stat = plate.root.querySelector("[data-stat='player-vigor']") as HTMLElement;
    expect(stat.classList.contains("pop")).toBe(false);
  });

  it("does not pop on the very first update", () => {
    const plate = createPlate("player");
    plate.update(vitals({ playerVigor: 4 }));
    const stat = plate.root.querySelector("[data-stat='player-vigor']") as HTMLElement;
    expect(stat.classList.contains("pop")).toBe(false);
  });

  it("writes his range, weapon and conditions on one line", () => {
    const plate = createPlate("convict");
    plate.update(vitals({ range: "near", weaponDown: false, offBalance: true, distracted: 2 }));
    const line = plate.root.querySelector("[data-line='convict']")?.textContent ?? "";
    expect(line).toContain("near");
    expect(line).toContain("knife up");
    expect(line).toContain("off-balance");
    expect(line).toContain("distracted (2)");
  });

  it("says he is down when incapacitated", () => {
    const plate = createPlate("convict");
    plate.update(vitals({ incapacitated: true }));
    expect(plate.root.querySelector("[data-line='convict']")?.textContent).toContain("down");
  });

  it("writes your room and your conditions on one line", () => {
    const plate = createPlate("player");
    plate.update(vitals({ zone: "bedroom", bound: true, toppled: true }));
    const line = plate.root.querySelector("[data-line='player']")?.textContent ?? "";
    expect(line).toContain("bedroom");
    expect(line).toContain("bound");
    expect(line).toContain("on the floor");
  });

  it("marks a plate as spent when its vigor hits zero", () => {
    const plate = createPlate("wife");
    plate.update(vitals({ wifeVigor: 0 }));
    expect(plate.root.classList.contains("spent")).toBe(true);
  });
});
