/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SOUNDS } from "../src/audio/manifest";

describe("audio manifest matches the real files", () => {
  for (const [name, file] of Object.entries(SOUNDS)) {
    test(`${name} (${file})`, () => {
      const buf = readFileSync(join(__dirname, "..", "public", "audio", file));
      // Every Ogg page starts with the "OggS" capture pattern.
      expect(buf.subarray(0, 4).toString("latin1")).toBe("OggS");
    });
  }
});
