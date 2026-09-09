import { describe, expect, it } from "vitest";
import { createPortraitMotion } from "../src/ui/portrait-motion";

function sequence(values: number[]): () => number {
  let at = 0;
  return () => values[at++ % values.length];
}

function fixture(signature = "0:happy:idle:0", motion = "awake"): HTMLElement {
  const root = document.createElement("div");
  const expression = signature.split(":")[1];
  root.innerHTML = `<span class="portrait is-${expression} motion-${motion}" data-portrait-signature="${signature}">`
    + '<span data-portrait-frame="base"></span>'
    + '<span data-portrait-frame="blink"></span>'
    + '<span data-portrait-frame="flavor"></span>'
    + "</span>";
  return root;
}

function layer(root: ParentNode, name: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-portrait-frame="${name}"]`)!;
}

describe("ambient portrait motion", () => {
  it("blinks every one to five seconds for 100 to 180 milliseconds", () => {
    const root = fixture();
    const motion = createPortraitMotion(sequence([0.5, 0, 0.5]));
    motion.frame(root, 0, true);
    const start = motion.inspect().nextBlinkAt;
    expect(start).toBeGreaterThanOrEqual(1000);
    expect(start).toBeLessThanOrEqual(5000);
    motion.frame(root, start, true);
    expect(layer(root, "blink").style.opacity).toBe("1");
    expect(motion.inspect().blinkUntil - start).toBeGreaterThanOrEqual(100);
    expect(motion.inspect().blinkUntil - start).toBeLessThanOrEqual(180);
    const end = motion.inspect().blinkUntil;
    motion.frame(root, end, true);
    expect(layer(root, "blink").style.opacity).toBe("");
    expect(motion.inspect().nextBlinkAt).toBeGreaterThan(end);
  });

  it("clears and reschedules motion after inactivity or a signature change", () => {
    const root = fixture();
    const motion = createPortraitMotion(() => 0);
    motion.frame(root, 0, true);
    motion.frame(root, motion.inspect().nextBlinkAt, true);
    expect(layer(root, "blink").style.opacity).toBe("1");
    motion.frame(root, 1200, false);
    expect(layer(root, "blink").style.opacity).toBe("");
    motion.frame(root, 2000, true);
    expect(motion.inspect().nextBlinkAt).toBeGreaterThanOrEqual(3000);
    motion.frame(root, motion.inspect().nextBlinkAt, true);
    root.querySelector<HTMLElement>(".portrait")!.dataset.portraitSignature = "0:cold:work:0";
    motion.frame(root, 4000, true);
    expect(layer(root, "blink").style.opacity).toBe("");
  });

  it("moves aside occasionally and restricts focused flavor", () => {
    const root = fixture("0:focused:work:0", "limited");
    const motion = createPortraitMotion(() => 0);
    motion.frame(root, 0, true);
    expect(motion.inspect().nextFlavorAt).toBe(Number.POSITIVE_INFINITY);
    const glance = motion.inspect().nextGlanceAt;
    motion.frame(root, glance, true);
    expect(layer(root, "base").style.transform).toContain("translateX");
  });

  it("does not schedule for sleeping, dead, or reduced-motion portraits", () => {
    for (const root of [fixture("0:sleep:sleep:0", "none"), fixture("0:dead:idle:0", "none"), fixture()]) {
      const reduced = Boolean(root.querySelector(".motion-awake"));
      const motion = createPortraitMotion(() => 0.5, () => reduced);
      motion.frame(root, 0, true);
      expect(motion.inspect().nextBlinkAt).toBe(Number.POSITIVE_INFINITY);
    }
  });
});
