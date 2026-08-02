/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { AMBIENT, EVENT_SOUNDS, SOUNDS } from "../src/audio/manifest";

describe("audio manifest matches the real files", () => {
  for (const [name, meta] of Object.entries(SOUNDS)) {
    test(`${name} (${meta.file})`, () => {
      const buf = readFileSync(join(__dirname, "..", "public", "audio", meta.file));
      // Every Ogg page starts with the "OggS" capture pattern.
      expect(buf.subarray(0, 4).toString("latin1")).toBe("OggS");
    });
  }

  test("every event sound is sfx-category", () => {
    for (const names of Object.values(EVENT_SOUNDS)) {
      for (const n of names) expect(SOUNDS[n].category).toBe("sfx");
    }
  });

  test("the ambient bed is ambient-category", () => {
    expect(SOUNDS[AMBIENT].category).toBe("ambient");
  });
});
