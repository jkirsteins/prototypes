import { describe, expect, it } from "vitest";
import { CoffinScene } from "./coffinScene";

const FICTION_BREAKING_TERMS = [
  "coffin",
  "tutorial",
  "build set",
  "clue found",
  "item gained",
  "memory gained",
  "deduction",
];

function choose(scene: CoffinScene, text: string): void {
  const choice = scene.snapshot.choices.find((candidate) => candidate.text === text);
  expect(choice, `choice available: ${text}`).toBeDefined();
  scene.choose(choice!.index);
  expectNoFictionBreak(scene);
}

function visibleText(scene: CoffinScene): string {
  const snapshot = scene.snapshot;
  return [...snapshot.paragraphs, ...snapshot.choices.map((choice) => choice.text)].join(" ");
}

function expectNoFictionBreak(scene: CoffinScene): void {
  const text = visibleText(scene).toLowerCase();
  for (const term of FICTION_BREAKING_TERMS) {
    expect(text, `player-visible text must not contain "${term}"`).not.toContain(term);
  }
}

describe("opening ink scene", () => {
  it("never breaks the fiction in the opening beat", () => {
    const scene = new CoffinScene();
    expectNoFictionBreak(scene);
  });

  it("sets a strength build after five persistent pushes", () => {
    const scene = new CoffinScene();

    choose(scene, "Push against the wood above you.");
    choose(scene, "Push against the wood above you.");

    choose(scene, "Push against the wood above you.");
    expect(scene.snapshot.paragraphs).toContain("It doesn't budge.");
    expect(scene.snapshot.escaped).toBe(false);

    choose(scene, "Push against the wood above you.");
    expect(scene.snapshot.paragraphs).toContain("It doesn't budge.");
    expect(scene.snapshot.escaped).toBe(false);

    choose(scene, "Push against the wood above you.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("strength");
    expect(scene.snapshot.attributes.strength).toBe(2);
    expect(scene.snapshot.imageId).toBe("coffin-break");
  });

  it("keeps the story going when calling out brings no answer", () => {
    const scene = new CoffinScene();

    choose(scene, "Call for help.");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("what might answer");

    choose(scene, "Call out anyway.");

    expect(scene.snapshot.escaped).toBe(false);
    expect(scene.snapshot.build).toBe("undetermined");
    expect(scene.snapshot.attributes.caution).toBe(-1);
    expect(scene.snapshot.choices.length).toBeGreaterThan(0);
  });

  it("sets an ingenuity build by finding the nail and forcing the hinge", () => {
    const scene = new CoffinScene();

    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");
    choose(scene, "Trace where the wood resists.");
    choose(scene, "Force the hinge with the nail.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("ingenious");
    expect(scene.snapshot.attributes.ingenuity).toBe(2);
  });

  it("keeps the escape unreachable until both nail and hinge are found", () => {
    const scene = new CoffinScene();

    expect(scene.snapshot.choices.map((choice) => choice.text)).not.toContain(
      "Force the hinge with the nail.",
    );

    choose(scene, "Feel along the velvet.");
    choose(scene, "Work the loose nail free.");

    expect(scene.snapshot.choices.map((choice) => choice.text)).not.toContain(
      "Force the hinge with the nail.",
    );
  });
});
