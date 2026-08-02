import { expect, test } from "vitest";
import { formatEvent, lastLines } from "../src/combat/log";
import type { DuelEvent } from "../src/combat/engine";

const ev = (time: number, side: 0 | 1, text: string): DuelEvent =>
  ({ time, side, kind: "hit", text });

test("formats minutes, seconds, tenths and side tag", () => {
  expect(formatEvent(ev(12400, 0, "Rapier misses -> Nachreisen window open")))
    .toBe("0:12.4 [P1] Rapier misses -> Nachreisen window open");
  expect(formatEvent(ev(61000, 1, "Longsword kills"))).toBe("1:01.0 [P2] Longsword kills");
});

test("lastLines keeps only the tail", () => {
  const log = Array.from({ length: 12 }, (_, i) => ev(i * 1000, 0, `e${i}`));
  const lines = lastLines(log, 8);
  expect(lines).toHaveLength(8);
  expect(lines[7]).toContain("e11");
});
