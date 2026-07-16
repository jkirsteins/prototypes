import { describe, expect, it } from "vitest";
import { CoffinScene } from "./coffinScene";

function choose(scene: CoffinScene, text: string): void {
  const choice = scene.snapshot.choices.find((candidate) => candidate.text === text);
  expect(choice, text).toBeDefined();
  scene.choose(choice!.index);
}

describe("coffin ink scene", () => {
  it("sets a strength build after pushing the lid three times", () => {
    const scene = new CoffinScene();

    choose(scene, "Push the coffin lid.");
    choose(scene, "Push the coffin lid.");
    choose(scene, "Push the coffin lid.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("strength");
    expect(scene.snapshot.attributes.strength).toBe(2);
    expect(scene.snapshot.imageId).toBe("coffin-break");
  });

  it("sets a caution build after calling for help despite the warning memory", () => {
    const scene = new CoffinScene();

    choose(scene, "Call for help.");

    expect(scene.snapshot.discoveries.map((discovery) => discovery.id)).toContain("unsafe-call");
    expect(scene.snapshot.paragraphs.join(" ")).toContain("Maybe this is unsafe");

    choose(scene, "Call for help anyway.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("cautious");
    expect(scene.snapshot.attributes.caution).toBe(2);
  });

  it("sets an ingenuity build by finding a nail and breaking the hinge", () => {
    const scene = new CoffinScene();

    choose(scene, "Feel along the velvet lining.");
    choose(scene, "Unscrew the loose nail.");
    choose(scene, "Search for the hinge.");
    choose(scene, "Break the hinge with the nail.");

    expect(scene.snapshot.escaped).toBe(true);
    expect(scene.snapshot.build).toBe("ingenious");
    expect(scene.snapshot.attributes.ingenuity).toBe(2);
    expect(scene.snapshot.discoveries.map((discovery) => discovery.id)).toContain("loose-nail");
    expect(scene.snapshot.discoveries.map((discovery) => discovery.id)).toContain("hinge-weak-point");
  });
});
