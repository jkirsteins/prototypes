import { describe, expect, test } from "vitest";
import { MOVE_EVENT_RATES, MOVE_EVENT_SOUNDS, SOUNDS } from "../src/audio/manifest";

describe("movement audio stays inside the shipped sample set", () => {
  test("every mapped pool names real samples; only footfall and touchdown sound", () => {
    expect(Object.keys(MOVE_EVENT_SOUNDS).sort()).toEqual(["footfall", "touchdown"]);
    for (const pool of Object.values(MOVE_EVENT_SOUNDS)) {
      for (const name of pool) expect(SOUNDS[name]).toBeDefined();
    }
    expect(MOVE_EVENT_RATES.touchdown).toBeLessThan(1); // the thud sits under the steps
  });
});
