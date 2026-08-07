/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SHEETS } from "../src/render/sheets";

function readPngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error(`not a PNG: ${path}`);
  }
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error(`no IHDR: ${path}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("sheet metadata matches the real PNG files", () => {
  for (const [name, meta] of Object.entries(SHEETS)) {
    test(`${name} (${meta.file})`, () => {
      const { width, height } = readPngSize(join(__dirname, "..", "public", "sprites", meta.file));
      expect(height).toBe(meta.frameH);
      expect(width).toBe(meta.frameW * meta.frames);
      expect(meta.feetY).toBeLessThanOrEqual(meta.frameH);
      expect(meta.originX).toBeLessThanOrEqual(meta.frameW);
      if (meta.feetYPerFrame) {
        expect(meta.feetYPerFrame).toHaveLength(meta.frames);
        for (const fy of meta.feetYPerFrame) expect(fy).toBeLessThanOrEqual(meta.frameH);
      }
    });
  }
});
